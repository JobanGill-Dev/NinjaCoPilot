// Content script auto-injected on matched pages. It does two things:
//  1) Listens for RUN_FILL_FLOW (triggered from the toolbar popup).
//  2) Watches the page and shows an in-page banner offering to fill the IP.
// Both paths run the same strategy flow. A guard prevents duplicate setup across
// re-injections (the popup path may re-inject an already-present script).
import { AppError, toAppErrorData } from '../core/errors';
import { rootLogger, type Logger } from '../core/logger';
import { sendToBackground } from '../core/messaging';
import { err } from '../core/result';
import { matchRule, type AzureGridStrategy, type FillRule } from '../features/publicIp/rules';
import { runFillFlow } from './flow/runFillFlow';
import { readGrid } from './gridReader';
import { popups, type PopupHandle } from './ui/popup';
import type { ContentRequest, ContentResponse } from '../shared/types/messages';

declare global {
  interface Window {
    __NINJA_COPILOT_CONTENT__?: boolean;
  }
}

const log = rootLogger.child('content');

// Blade detection is event-driven; these bound the small amount of DOM work.
const URL_HEARTBEAT_MS = 2000; // fallback for pushState navigations (href compare only)
const BLADE_POLL_MS = 800; // how often to look for the blade after a URL change
const BLADE_POLL_TIMEOUT_MS = 30000; // give up waiting for the blade after this
const EVALUATE_DEBOUNCE_MS = 300; // coalesce grid mutations before re-reading

/** True while the extension context is alive; never throws (torn-down contexts). */
function contextAlive(): boolean {
  try {
    return !!chrome.runtime?.id;
  } catch {
    return false;
  }
}

/** Handles the extension-icon path: popup -> background -> here. */
function registerMessageListener(): void {
  chrome.runtime.onMessage.addListener(
    (message: ContentRequest, _sender, sendResponse: (response: ContentResponse) => void) => {
      if (message?.type !== 'RUN_FILL_FLOW') return undefined;

      const rule = matchRule(location.href);
      if (!rule) {
        sendResponse(
          err(new AppError('NO_MATCHING_RULE', 'This page has no configured form to fill.', location.href).toData()),
        );
        return true;
      }

      log.info('RUN_FILL_FLOW received (from extension icon)');
      runFillFlow(rule, log)
        .then(sendResponse)
        .catch((cause) => sendResponse(err(toAppErrorData(cause, 'FILL_FAILED'))));
      return true; // async response
    },
  );
}

/**
 * Detects the Key Vault firewall blade and offers to add the public IP.
 *
 * Instead of polling the DOM continuously, it reacts to SPA navigation events
 * and only does DOM work when relevant: after a URL change it briefly waits for
 * the blade to render, then watches just the grid (scoped, debounced) so the
 * banner updates when the IP list changes — keeping idle cost near zero.
 */
class BannerController {
  private busy = false;
  private offerHandle: PopupHandle | null = null;
  private offerKey: string | null = null;
  private ipCache: { value: string; at: number } | null = null;
  private readonly dismissed = new Set<string>();
  private lastLogKey = '';

  private lastUrl = '';
  private urlTimer: ReturnType<typeof setInterval> | null = null;
  private bladeTimer: ReturnType<typeof setInterval> | null = null;
  private bladeDeadline = 0;
  private gridObserver: MutationObserver | null = null;
  private evaluateTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly log: Logger) {}

  start(): void {
    const onChange = (): void => this.onLocationChange();
    window.addEventListener('hashchange', onChange);
    window.addEventListener('popstate', onChange);
    // Cheap fallback for pushState navigations that don't touch the hash: a bare
    // string compare, no DOM access.
    this.urlTimer = setInterval(() => {
      if (!contextAlive()) return this.teardown();
      if (location.href !== this.lastUrl) this.onLocationChange();
    }, URL_HEARTBEAT_MS);
    this.onLocationChange();
  }

  private onLocationChange(): void {
    if (!contextAlive()) return this.teardown();
    this.lastUrl = location.href;
    this.stopBladePoll();
    this.disconnectGridObserver();

    const rule = matchRule(location.href);
    if (!rule || rule.strategy.kind !== 'azure-grid') {
      this.dismissOffer();
      return;
    }
    this.startBladePoll();
  }

  /** Briefly waits for the firewall blade's Add button to render, then settles. */
  private startBladePoll(): void {
    this.bladeDeadline = Date.now() + BLADE_POLL_TIMEOUT_MS;
    const tick = (): void => {
      if (!contextAlive()) return this.teardown();
      const rule = matchRule(location.href);
      if (!rule || rule.strategy.kind !== 'azure-grid') {
        this.stopBladePoll();
        this.dismissOffer();
        return;
      }
      if (document.querySelector(rule.strategy.addButtonSelector)) {
        this.stopBladePoll();
        this.attachGridObserver(rule.strategy);
        this.scheduleEvaluate();
      } else if (Date.now() >= this.bladeDeadline) {
        this.stopBladePoll();
        this.dismissOffer();
      }
    };
    this.bladeTimer = setInterval(tick, BLADE_POLL_MS);
    tick();
  }

  /** Observes only the grid area so evaluate() runs when the IP list changes. */
  private attachGridObserver(strategy: AzureGridStrategy): void {
    const target =
      document.querySelector(strategy.existingTableSelector) ??
      document.querySelector(strategy.addButtonSelector)?.parentElement ??
      document.body;
    this.gridObserver = new MutationObserver(() => this.scheduleEvaluate());
    this.gridObserver.observe(target, { childList: true, subtree: true, characterData: true });
  }

  private scheduleEvaluate(): void {
    if (this.evaluateTimer !== null) clearTimeout(this.evaluateTimer);
    this.evaluateTimer = setTimeout(() => {
      this.evaluateTimer = null;
      void this.evaluate();
    }, EVALUATE_DEBOUNCE_MS);
  }

  private async evaluate(): Promise<void> {
    if (this.busy || !contextAlive()) return;
    try {
      const rule = matchRule(location.href);
      if (!rule || rule.strategy.kind !== 'azure-grid') {
        this.dismissOffer();
        return;
      }
      const { existingTableSelector, addButtonSelector } = rule.strategy;
      if (!document.querySelector(addButtonSelector)) {
        this.dismissOffer();
        return;
      }

      const ip = await this.getIp();
      if (!ip) return;

      const value = (rule.transform ?? ((x: string) => x))(ip);
      const key = `${location.href}|${value}`;

      const snapshot = readGrid(existingTableSelector);
      if (snapshot.ips.includes(value)) {
        this.logOnce(`present:${key}`, `Public IP ${value} is already in the firewall list`);
        this.dismissOffer();
        return;
      }
      if (this.dismissed.has(key)) {
        this.dismissOffer();
        return;
      }
      // Already offering for this exact page+IP; leave the existing card as-is.
      if (this.offerKey === key && this.offerHandle) return;

      this.dismissOffer();
      this.logOnce(`offer:${key}`, `Offering to add public IP ${value}`);
      const handle = popups.show({
        message: 'Your public IP is not in this Key Vault firewall.',
        highlight: value,
        action: { label: 'Add my public IP', onClick: () => void this.onFill(rule, key, handle) },
        onClose: () => {
          this.dismissed.add(key);
          this.clearOfferRef(handle);
        },
      });
      this.offerHandle = handle;
      this.offerKey = key;
    } catch (cause) {
      if (!contextAlive()) return this.teardown();
      this.logOnce('evalfail', `Banner check failed: ${String(cause)}`);
    }
  }

  private async onFill(rule: FillRule, key: string, handle: PopupHandle): Promise<void> {
    this.busy = true;
    handle.setBusy('Adding your public IP…');
    try {
      const result = await runFillFlow(rule, this.log);
      if (result.ok) {
        const done = result.value.status === 'already-present';
        handle.setSuccess(done ? `${result.value.value} already added` : `Added ${result.value.value}`);
        this.dismissed.add(key);
        this.clearOfferRef(handle);
        setTimeout(() => handle.close(), 4000);
      } else {
        handle.setError(result.error.message);
      }
    } catch (cause) {
      this.log.error('Fill flow threw', cause);
      handle.setError('Could not reach the extension. Try reloading the page.');
    } finally {
      this.busy = false;
    }
  }

  private async getIp(): Promise<string | null> {
    if (this.ipCache && Date.now() - this.ipCache.at < 60000) return this.ipCache.value;
    try {
      const result = await sendToBackground({ type: 'GET_PUBLIC_IP' });
      if (!result.ok) {
        this.logOnce('ipfail', `Could not get public IP: ${result.error.message}`);
        return null;
      }
      this.ipCache = { value: result.value.ip, at: Date.now() };
      return result.value.ip;
    } catch (cause) {
      this.logOnce('ipfail', `Could not reach the background worker: ${String(cause)}`);
      return null;
    }
  }

  private stopBladePoll(): void {
    if (this.bladeTimer !== null) {
      clearInterval(this.bladeTimer);
      this.bladeTimer = null;
    }
  }

  private disconnectGridObserver(): void {
    if (this.gridObserver) {
      this.gridObserver.disconnect();
      this.gridObserver = null;
    }
  }

  private teardown(): void {
    if (this.urlTimer !== null) {
      clearInterval(this.urlTimer);
      this.urlTimer = null;
    }
    this.stopBladePoll();
    this.disconnectGridObserver();
    if (this.evaluateTimer !== null) {
      clearTimeout(this.evaluateTimer);
      this.evaluateTimer = null;
    }
    this.dismissOffer();
  }

  /** Programmatically removes the current offer popup (no user-dismiss). */
  private dismissOffer(): void {
    this.offerHandle?.close();
    this.offerHandle = null;
    this.offerKey = null;
  }

  /** Clears our reference if it still points at the given handle. */
  private clearOfferRef(handle: PopupHandle): void {
    if (this.offerHandle === handle) {
      this.offerHandle = null;
      this.offerKey = null;
    }
  }

  /** Logs a message only when the state key changes, to avoid spam. */
  private logOnce(key: string, message: string): void {
    if (this.lastLogKey === key) return;
    this.lastLogKey = key;
    this.log.info(message);
  }
}

if (!window.__NINJA_COPILOT_CONTENT__) {
  window.__NINJA_COPILOT_CONTENT__ = true;
  registerMessageListener();
  new BannerController(log).start();
  log.debug('Content script ready');
}

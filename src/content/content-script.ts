// Content script auto-injected on matched pages. It does two things:
//  1) Listens for RUN_FILL_FLOW (triggered from the toolbar popup).
//  2) Watches the page and shows an in-page banner offering to fill the IP.
// Both paths run the same strategy flow. A guard prevents duplicate setup across
// re-injections (the popup path may re-inject an already-present script).
import { AppError, toAppErrorData } from '../core/errors';
import { rootLogger, type Logger } from '../core/logger';
import { sendToBackground } from '../core/messaging';
import { err } from '../core/result';
import { matchRule, type FillRule } from '../features/publicIp/rules';
import { runFillFlow } from './flow/runFillFlow';
import { readGrid } from './gridReader';
import { PageBanner } from './ui/banner';
import type { ContentRequest, ContentResponse } from '../shared/types/messages';

declare global {
  interface Window {
    __NINJA_COPILOT_CONTENT__?: boolean;
  }
}

const log = rootLogger.child('content');

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
 * Polls the page while a rule matches and the target blade is ready, then shows
 * a banner offering to add the public IP (unless it is already present).
 */
class BannerController {
  private readonly banner = new PageBanner();
  private busy = false;
  private ipCache: { value: string; at: number } | null = null;
  private readonly dismissed = new Set<string>();
  private lastLogKey = '';
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly log: Logger) {}

  start(): void {
    void this.safeTick();
    this.timer = setInterval(() => void this.safeTick(), 1500);
  }

  /** Runs a tick, stopping cleanly if the extension context is gone and never throwing. */
  private async safeTick(): Promise<void> {
    // After an extension reload the old content script lingers with an
    // invalidated context; chrome.runtime.id becomes undefined. Stop polling.
    if (!chrome.runtime?.id) {
      if (this.timer !== null) {
        clearInterval(this.timer);
        this.timer = null;
      }
      return;
    }
    try {
      await this.tick();
    } catch (cause) {
      this.logOnce('tickfail', `Banner check failed: ${String(cause)}`);
    }
  }

  private async tick(): Promise<void> {
    if (this.busy) return;

    const rule = matchRule(location.href);
    if (!rule || rule.strategy.kind !== 'azure-grid') {
      this.banner.hide();
      return;
    }

    const { existingTableSelector, addButtonSelector } = rule.strategy;
    const addButton = document.querySelector(addButtonSelector);
    if (!addButton) {
      // Not on the Networking/Firewall blade yet; wait quietly.
      this.banner.hide();
      return;
    }

    const ip = await this.getIp();
    if (!ip) return;

    const value = (rule.transform ?? ((x: string) => x))(ip);
    const key = `${location.href}|${value}`;

    // The list container is absent when there are no existing entries.
    const snapshot = readGrid(existingTableSelector);
    if (snapshot.ips.includes(value)) {
      this.logOnce(`present:${key}`, `Public IP ${value} is already in the firewall list`);
      this.banner.hide();
      return;
    }
    if (this.dismissed.has(key)) {
      this.banner.hide();
      return;
    }

    this.logOnce(`offer:${key}`, `Offering to add public IP ${value}`);
    this.banner.show(value, {
      onFill: () => void this.onFill(rule, key),
      onClose: () => {
        this.dismissed.add(key);
        this.banner.hide();
      },
    });
  }

  private async onFill(rule: FillRule, key: string): Promise<void> {
    this.busy = true;
    this.banner.setBusy('Adding your public IP…');
    try {
      const result = await runFillFlow(rule, this.log);
      if (result.ok) {
        const done = result.value.status === 'already-present';
        this.banner.setSuccess(done ? `${result.value.value} already added` : `Added ${result.value.value}`);
        this.dismissed.add(key);
        setTimeout(() => this.banner.hide(), 4000);
      } else {
        this.banner.setError(result.error.message);
      }
    } catch (cause) {
      this.log.error('Fill flow threw', cause);
      this.banner.setError('Could not reach the extension. Try reloading the page.');
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

  /** Logs a message only when the state key changes, to avoid poll spam. */
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

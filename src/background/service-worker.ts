// Background service worker: the orchestrator. It resolves the public IP,
// matches the active tab against the fill rules, injects the content script on
// demand and relays the outcome back to the popup.
import { AppError, toAppErrorData } from '../core/errors';
import { getPublicIp } from '../core/ipService';
import { rootLogger } from '../core/logger';
import { sendToTab } from '../core/messaging';
import { err, ok, type Result } from '../core/result';
import { matchRule } from '../features/publicIp/rules';
import type {
  BackgroundRequest,
  BackgroundResponseMap,
  FillResult,
  PublicIpResult,
} from '../shared/types/messages';

const log = rootLogger.child('background');

chrome.runtime.onMessage.addListener((message: BackgroundRequest, _sender, sendResponse) => {
  handle(message)
    .then(sendResponse)
    .catch((cause) => {
      log.error('Unhandled handler error', cause);
      sendResponse(err(toAppErrorData(cause)));
    });
  return true; // async response
});

async function handle(message: BackgroundRequest): Promise<BackgroundResponseMap[BackgroundRequest['type']]> {
  switch (message.type) {
    case 'GET_PUBLIC_IP':
      return handleGetPublicIp();
    case 'FILL_ACTIVE_TAB':
      return handleFillActiveTab();
    default: {
      const exhaustive: never = message;
      return err(toAppErrorData(new AppError('UNKNOWN', `Unknown message: ${JSON.stringify(exhaustive)}`)));
    }
  }
}

async function handleGetPublicIp(): Promise<Result<PublicIpResult>> {
  const result = await getPublicIp();
  return result.ok ? ok({ ip: result.value.ip, cached: result.value.cached }) : result;
}

async function handleFillActiveTab(): Promise<Result<FillResult>> {
  const tab = await getActiveTab();
  if (!tab?.id) {
    return err(toAppErrorData(new AppError('NO_ACTIVE_TAB', 'No active tab was found.')));
  }

  const rule = matchRule(tab.url);
  if (!rule) {
    log.info('No rule matched for URL', tab.url);
    return err(
      toAppErrorData(
        new AppError('NO_MATCHING_RULE', 'This page has no configured form to fill.', tab.url),
      ),
    );
  }
  log.info('URL matched rule', { ruleId: rule.id, ruleName: rule.name, url: tab.url });

  // Ensure the content script is present (idempotent thanks to its guard), then
  // let it run the strategy flow and report the outcome.
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content/content-script.js'],
    });
  } catch (cause) {
    log.error('Content script injection failed', cause);
    return err(toAppErrorData(new AppError('INJECTION_FAILED', 'Could not access this page.', cause)));
  }

  const outcome = await sendToTab(tab.id, { type: 'RUN_FILL_FLOW' });
  if (!outcome.ok) return outcome;

  log.info('Flow complete', { rule: rule.id, status: outcome.value.status });
  return ok({
    status: outcome.value.status,
    ruleId: rule.id,
    ruleName: rule.name,
    value: outcome.value.value,
  });
}

async function getActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

// Resolves the public IP, then dispatches to the strategy-specific flow.
import { toAppErrorData } from '../../core/errors';
import type { Logger } from '../../core/logger';
import { sendToBackground } from '../../core/messaging';
import { err, type Result } from '../../core/result';
import type { FillRule } from '../../features/publicIp/rules';
import type { FlowOutcome } from '../../shared/types/messages';
import { runAzureFirewallFlow } from './azureFirewallFlow';
import { runSingleFieldFlow } from './singleFieldFlow';

export async function runFillFlow(rule: FillRule, log: Logger): Promise<Result<FlowOutcome>> {
  let ipResult;
  try {
    ipResult = await sendToBackground({ type: 'GET_PUBLIC_IP' });
  } catch (cause) {
    log.error('Could not reach the background worker', cause);
    return err(toAppErrorData(cause, 'MESSAGING_FAILED'));
  }
  if (!ipResult.ok) {
    log.error('Could not resolve public IP', ipResult.error);
    return ipResult;
  }

  const value = (rule.transform ?? ((ip: string) => ip))(ipResult.value.ip);
  log.info(`Running "${rule.strategy.kind}" flow for ${value}`);

  switch (rule.strategy.kind) {
    case 'azure-grid':
      return runAzureFirewallFlow(rule.strategy, value, log);
    case 'single-field':
      return runSingleFieldFlow(rule.strategy, value, log);
  }
}

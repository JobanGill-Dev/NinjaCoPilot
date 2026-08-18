// Typed message contracts exchanged between popup, background worker and content
// script. A discriminated union keeps every handler exhaustive and type-safe.
import type { Result } from '../../core/result';

/** Messages the popup sends to the background service worker. */
export type BackgroundRequest =
  | { type: 'GET_PUBLIC_IP' }
  | { type: 'FILL_ACTIVE_TAB' };

export interface PublicIpResult {
  ip: string;
  cached: boolean;
}

/** Whether the IP was newly added or was already present. */
export type FillStatus = 'filled' | 'already-present';

export interface FillResult {
  status: FillStatus;
  ruleId: string;
  ruleName: string;
  value: string;
}

/** Response map keyed by request type. */
export interface BackgroundResponseMap {
  GET_PUBLIC_IP: Result<PublicIpResult>;
  FILL_ACTIVE_TAB: Result<FillResult>;
}

/** Messages the background worker sends into an injected content script. */
export type ContentRequest = { type: 'RUN_FILL_FLOW' };

export interface FlowOutcome {
  status: FillStatus;
  value: string;
}

export type ContentResponse = Result<FlowOutcome>;

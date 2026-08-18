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

export interface FillResult {
  ruleId: string;
  ruleName: string;
  matchedSelector: string;
  value: string;
}

/** Response map keyed by request type. */
export interface BackgroundResponseMap {
  GET_PUBLIC_IP: Result<PublicIpResult>;
  FILL_ACTIVE_TAB: Result<FillResult>;
}

/** Messages the background worker sends into an injected content script. */
export type ContentRequest = {
  type: 'FILL_FIELD';
  payload: { selectors: string[]; value: string };
};

export interface FieldFillOutcome {
  matchedSelector: string;
  value: string;
}

export type ContentResponse = Result<FieldFillOutcome>;

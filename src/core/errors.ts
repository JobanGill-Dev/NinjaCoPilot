// Domain error types shared across all extension contexts.

export type ErrorCode =
  | 'IP_FETCH_FAILED'
  | 'IP_INVALID'
  | 'NO_ACTIVE_TAB'
  | 'NO_MATCHING_RULE'
  | 'INJECTION_FAILED'
  | 'FIELD_NOT_FOUND'
  | 'FILL_FAILED'
  | 'MESSAGING_FAILED'
  | 'UNKNOWN';

/** Serializable error shape passed across message boundaries. */
export interface AppErrorData {
  code: ErrorCode;
  message: string;
  details?: string;
}

export class AppError extends Error implements AppErrorData {
  readonly code: ErrorCode;
  readonly details?: string;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.details = details === undefined ? undefined : stringifyDetails(details);
  }

  toData(): AppErrorData {
    return { code: this.code, message: this.message, details: this.details };
  }
}

/** Normalizes any thrown value into serializable error data. */
export function toAppErrorData(value: unknown, fallbackCode: ErrorCode = 'UNKNOWN'): AppErrorData {
  if (value instanceof AppError) return value.toData();
  if (value instanceof Error) return { code: fallbackCode, message: value.message };
  return { code: fallbackCode, message: String(value) };
}

function stringifyDetails(details: unknown): string {
  if (typeof details === 'string') return details;
  try {
    return JSON.stringify(details);
  } catch {
    return String(details);
  }
}

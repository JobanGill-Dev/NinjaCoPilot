// A lightweight Result type so callers handle failures explicitly instead of
// relying on thrown exceptions crossing async / message boundaries.
import type { AppErrorData } from './errors';

export type Result<T> = { ok: true; value: T } | { ok: false; error: AppErrorData };

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function err(error: AppErrorData): Result<never> {
  return { ok: false, error };
}

export function isOk<T>(result: Result<T>): result is { ok: true; value: T } {
  return result.ok;
}

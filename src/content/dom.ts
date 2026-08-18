// Small DOM utilities for the content-script flows. Azure's SPA renders lazily,
// so we poll for elements rather than assuming they already exist.

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface WaitOptions {
  timeoutMs?: number;
  intervalMs?: number;
  root?: ParentNode;
  /** Also require the element to be enabled (not disabled / aria-disabled). */
  enabled?: boolean;
}

/** Resolves with the element once it appears (and is enabled, if requested). */
export async function waitForElement<T extends Element = Element>(
  selector: string,
  options: WaitOptions = {},
): Promise<T | null> {
  const { timeoutMs = 8000, intervalMs = 200, root = document, enabled = false } = options;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const el = root.querySelector<T>(selector);
    if (el && (!enabled || isEnabled(el))) return el;
    if (Date.now() >= deadline) return null;
    await sleep(intervalMs);
  }
}

/** True unless the element is disabled via the property or aria-disabled. */
export function isEnabled(element: Element): boolean {
  if ((element as HTMLButtonElement).disabled) return false;
  if (element.getAttribute('aria-disabled') === 'true') return false;
  return true;
}

export function clickElement(element: Element): void {
  (element as HTMLElement).click();
}

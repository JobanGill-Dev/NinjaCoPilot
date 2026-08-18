// Fills a value into an input element in a way that frameworks like React /
// Fluent UI (used by the Azure Portal) recognize. Setting `.value` directly
// bypasses React's synthetic event system, so we use the native setter and
// dispatch the events the framework listens for.

export interface FillFieldResult {
  matchedSelector: string;
}

/**
 * Attempts to fill the first matching field from the selector list.
 * Returns the selector that matched, or null if none were found.
 */
export function fillFirstMatch(selectors: string[], value: string): FillFieldResult | null {
  for (const selector of selectors) {
    const element = document.querySelector<HTMLElement>(selector);
    if (element && isFillable(element)) {
      setNativeValue(element, value);
      dispatchInputEvents(element);
      return { matchedSelector: selector };
    }
  }
  return null;
}

function isFillable(element: HTMLElement): element is HTMLInputElement | HTMLTextAreaElement {
  return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement;
}

function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  element.focus();
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  if (setter) {
    setter.call(element, value);
  } else {
    element.value = value;
  }
}

function dispatchInputEvents(element: HTMLElement): void {
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
}

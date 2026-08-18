// Locates and fills form fields in a way frameworks like React / Fluent UI
// (used by the Azure Portal) recognize. Setting `.value` directly bypasses
// React's synthetic event system, so we use the native setter and dispatch the
// events the framework listens for.

export interface FoundField {
  element: HTMLInputElement | HTMLTextAreaElement;
  selector: string;
  currentValue: string;
}

/** Searches the selectors in order and returns the first fillable field found. */
export function findField(selectors: string[]): FoundField | null {
  for (const selector of selectors) {
    const element = document.querySelector<HTMLElement>(selector);
    if (element && isFillable(element)) {
      return { element, selector, currentValue: element.value };
    }
  }
  return null;
}

/** Writes the value using the native setter and dispatches framework events. */
export function fillElement(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  element.focus();
  const prototype =
    element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  if (setter) setter.call(element, value);
  else element.value = value;

  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
}

export function isFillable(element: Element): element is HTMLInputElement | HTMLTextAreaElement {
  return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement;
}

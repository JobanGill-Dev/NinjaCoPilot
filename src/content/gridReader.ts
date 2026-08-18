// Reads existing IP entries from an Azure-style grid. It scans every element
// matching the selector (the grid may render multiple containers) and includes
// both text content and input values, since entries can be shown either way.
import { extractIps } from '../core/ipMatch';

export interface GridSnapshot {
  /** How many elements matched the selector (0 = wrong selector or empty list). */
  containers: number;
  /** Combined text + input values read from those elements. */
  text: string;
  /** Distinct IPv4 addresses parsed from the text (CIDR suffix stripped). */
  ips: string[];
}

export function readGrid(selector: string): GridSnapshot {
  const elements = Array.from(document.querySelectorAll<HTMLElement>(selector));

  const text = elements
    .map((el) => {
      const inputValues = Array.from(el.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea'))
        .map((input) => input.value)
        .join(' ');
      return `${el.textContent ?? ''} ${inputValues}`;
    })
    .join(' ');

  return { containers: elements.length, text, ips: [...new Set(extractIps(text))] };
}

// Configuration for the "fill public IP" feature. Each rule maps a URL pattern
// to a strategy describing how to place the IP on that page. Add new rules here
// to support additional sites/tools without touching the flow logic.

/** Fills a single input located by CSS selector (simple forms). */
export interface SingleFieldStrategy {
  kind: 'single-field';
  selectors: string[];
}

/**
 * Azure-style editable grid: check an existing-IP table, click an "add" button
 * to spawn a new row, fill it, then click an "apply" button to commit.
 */
export interface AzureGridStrategy {
  kind: 'azure-grid';
  /** Container holding the list of already-added IPs. */
  existingTableSelector: string;
  /** Button that adds a new client-IP row. */
  addButtonSelector: string;
  /** Button that commits the change. */
  applyButtonSelector: string;
  /** Candidate selectors for the freshly added, empty input row. */
  newFieldSelectors: string[];
}

export type FillStrategy = SingleFieldStrategy | AzureGridStrategy;

export interface FillRule {
  /** Stable identifier used in logs and messages. */
  id: string;
  /** Human-friendly name shown in the popup / banner. */
  name: string;
  /** Regex matched against the full tab URL (including hash for SPA routes). */
  urlPattern: RegExp;
  /** How to place the IP on the matched page. */
  strategy: FillStrategy;
  /** Optional transform applied to the IP before filling (e.g. append CIDR). */
  transform?: (ip: string) => string;
  description?: string;
}

export const FILL_RULES: FillRule[] = [
  {
    id: 'azure-kv-firewall',
    name: 'Azure Key Vault — Firewall',
    // Azure Portal is a SPA; Key Vault blades are addressed via the URL hash.
    // The DOM readiness check (table + add button) narrows this to the actual
    // Networking/Firewall blade, so the URL match can stay broad.
    urlPattern: /https:\/\/portal\.azure\.com\/.*(Microsoft\.KeyVault|KeyVault|keyvault)/i,
    strategy: {
      kind: 'azure-grid',
      existingTableSelector: '.fxc-gc-content',
      addButtonSelector: `[aria-label="Add your client IP address (e.g: '10.0.0.0')"]`,
      applyButtonSelector: `[title="Apply"]`,
      // The freshly added row's editable input.
      newFieldSelectors: [`[aria-label="IP address or CIDR"]`],
    },
    // Firewall entries accept a single IP; use "/32" if a CIDR is required.
    transform: (ip) => ip,
    description: 'Adds your public IP to the Key Vault firewall allow-list.',
  },
];

/** Returns the first rule whose pattern matches the given URL, if any. */
export function matchRule(url: string | undefined): FillRule | undefined {
  if (!url) return undefined;
  return FILL_RULES.find((rule) => rule.urlPattern.test(url));
}

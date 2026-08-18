// Configuration for the "fill public IP" feature. Each rule maps a URL pattern
// to the form field(s) that should receive the value. Add new rules here to
// support additional sites/tools without touching the core logic.

export interface FillRule {
  /** Stable identifier used in logs and messages. */
  id: string;
  /** Human-friendly name shown in the popup. */
  name: string;
  /** Regex matched against the full tab URL (including hash for SPA routes). */
  urlPattern: RegExp;
  /** Ordered CSS selectors; the first field found on the page is used. */
  selectors: string[];
  /** Optional transform applied to the IP before filling (e.g. append CIDR). */
  transform?: (ip: string) => string;
  description?: string;
}

export const FILL_RULES: FillRule[] = [
  {
    id: 'azure-kv-firewall',
    name: 'Azure Key Vault — Firewall',
    // Azure Portal is a SPA; the Key Vault networking blade is addressed via the
    // URL hash. Matches portal.azure.com pages referencing a Key Vault resource.
    urlPattern: /https:\/\/portal\.azure\.com\/.*(Microsoft\.KeyVault|KeyVault|keyvault).*(networking|firewall|Networking)?/i,
    // NOTE: Azure uses Fluent UI with dynamic markup. These selectors are best
    // guesses and should be verified/adjusted against the live blade.
    selectors: [
      'input[aria-label="Address range"]',
      'input[placeholder="IP address or CIDR, e.g. 168.63.129.16 or 168.63.129.0/24"]',
      'input[aria-label*="IP address" i]',
      'input[placeholder*="CIDR" i]',
    ],
    // Firewall entries accept a single IP; use "/32" if a CIDR is required.
    transform: (ip) => ip,
    description: 'Fills your public IP into the Key Vault firewall address field.',
  },
];

/** Returns the first rule whose pattern matches the given URL, if any. */
export function matchRule(url: string | undefined): FillRule | undefined {
  if (!url) return undefined;
  return FILL_RULES.find((rule) => rule.urlPattern.test(url));
}

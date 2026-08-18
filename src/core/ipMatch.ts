// Detects whether an exact IPv4 already appears in free text, ignoring any CIDR
// suffix. So "20.1.2.3/32" counts as a match for "20.1.2.3", while "120.1.2.3"
// or "20.1.2.33" do not (avoids substring false positives).
const IP_CIDR_TOKEN = /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(?:\/\d{1,2})?/g;

/** Returns all IPv4 addresses found in the text, with any CIDR suffix removed. */
export function extractIps(text: string): string[] {
  const tokens = text.match(IP_CIDR_TOKEN) ?? [];
  return tokens.map((token) => token.split('/')[0]);
}

export function textContainsIp(text: string, ip: string): boolean {
  return extractIps(text).includes(ip);
}

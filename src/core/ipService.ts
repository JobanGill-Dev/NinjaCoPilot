// Fetches the machine's public IPv4 address from one of several providers, with
// short-lived caching and validation. Only IPv4 is returned since that is what
// firewall allow-lists (e.g. Azure Key Vault) expect.
import { AppError } from './errors';
import { err, ok, type Result } from './result';
import { rootLogger } from './logger';

const log = rootLogger.child('ipService');

interface Provider {
  url: string;
  parse: (body: string) => string;
}

// Ordered by preference; each is tried until one returns a valid IPv4.
const PROVIDERS: Provider[] = [
  { url: 'https://api.ipify.org?format=json', parse: (b) => (JSON.parse(b) as { ip: string }).ip },
  { url: 'https://ipv4.icanhazip.com', parse: (b) => b.trim() },
];

const IPV4_REGEX =
  /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

const CACHE_TTL_MS = 60_000;
const FETCH_TIMEOUT_MS = 8_000;

let cache: { ip: string; at: number } | null = null;

export function isValidIpv4(value: string): boolean {
  return IPV4_REGEX.test(value);
}

/** Returns the public IPv4 address, using a short-lived in-memory cache. */
export async function getPublicIp(forceRefresh = false): Promise<Result<{ ip: string; cached: boolean }>> {
  if (!forceRefresh && cache && Date.now() - cache.at < CACHE_TTL_MS) {
    log.debug('Returning cached IP', cache.ip);
    return ok({ ip: cache.ip, cached: true });
  }

  const errors: string[] = [];

  for (const provider of PROVIDERS) {
    try {
      const ip = await fetchFrom(provider);
      if (!isValidIpv4(ip)) {
        errors.push(`${provider.url}: invalid response "${ip}"`);
        continue;
      }
      cache = { ip, at: Date.now() };
      log.info('Fetched public IP', { ip, provider: provider.url });
      return ok({ ip, cached: false });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      errors.push(`${provider.url}: ${message}`);
      log.warn('IP provider failed, trying next', { provider: provider.url, message });
    }
  }

  log.error('All IP providers failed', errors);
  return err(new AppError('IP_FETCH_FAILED', 'Could not determine your public IP address.', errors).toData());
}

async function fetchFrom(provider: Provider): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(provider.url, { signal: controller.signal, cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return provider.parse(await response.text());
  } finally {
    clearTimeout(timer);
  }
}

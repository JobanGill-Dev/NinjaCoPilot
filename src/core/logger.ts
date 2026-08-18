// Structured logger usable from every extension context (worker, content, popup).
// Warnings and errors are also persisted to a bounded ring buffer in
// chrome.storage.local so issues can be inspected after the fact.

export enum LogLevel {
  DEBUG = 10,
  INFO = 20,
  WARN = 30,
  ERROR = 40,
  SILENT = 100,
}

interface PersistedLog {
  ts: string;
  level: string;
  scope: string;
  message: string;
  meta?: unknown;
}

const STORAGE_KEY = 'ncp:logs';
const MAX_PERSISTED = 200;
const LEVEL_NAMES: Record<number, string> = {
  [LogLevel.DEBUG]: 'DEBUG',
  [LogLevel.INFO]: 'INFO',
  [LogLevel.WARN]: 'WARN',
  [LogLevel.ERROR]: 'ERROR',
};

// Flip to LogLevel.INFO or higher for production-quiet builds.
const MIN_LEVEL: LogLevel = LogLevel.DEBUG;

function hasStorage(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.storage?.local;
}

async function persist(entry: PersistedLog): Promise<void> {
  if (!hasStorage()) return;
  try {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    const logs: PersistedLog[] = Array.isArray(stored[STORAGE_KEY]) ? stored[STORAGE_KEY] : [];
    logs.push(entry);
    if (logs.length > MAX_PERSISTED) logs.splice(0, logs.length - MAX_PERSISTED);
    await chrome.storage.local.set({ [STORAGE_KEY]: logs });
  } catch {
    // Never let logging failures break the feature flow.
  }
}

export class Logger {
  constructor(private readonly scope: string, private readonly minLevel: LogLevel = MIN_LEVEL) {}

  child(scope: string): Logger {
    return new Logger(`${this.scope}:${scope}`, this.minLevel);
  }

  debug(message: string, meta?: unknown): void {
    this.log(LogLevel.DEBUG, message, meta);
  }

  info(message: string, meta?: unknown): void {
    this.log(LogLevel.INFO, message, meta);
  }

  warn(message: string, meta?: unknown): void {
    this.log(LogLevel.WARN, message, meta);
  }

  error(message: string, meta?: unknown): void {
    this.log(LogLevel.ERROR, message, meta);
  }

  private log(level: LogLevel, message: string, meta?: unknown): void {
    if (level < this.minLevel) return;

    const levelName = LEVEL_NAMES[level] ?? String(level);
    const prefix = `[NCP][${levelName}][${this.scope}]`;
    const args = meta === undefined ? [prefix, message] : [prefix, message, meta];

    if (level >= LogLevel.ERROR) console.error(...args);
    else if (level >= LogLevel.WARN) console.warn(...args);
    else if (level >= LogLevel.INFO) console.info(...args);
    else console.debug(...args);

    if (level >= LogLevel.WARN) {
      void persist({ ts: new Date().toISOString(), level: levelName, scope: this.scope, message, meta });
    }
  }
}

/** Reads the persisted warn/error log buffer (useful for a future debug view). */
export async function getPersistedLogs(): Promise<PersistedLog[]> {
  if (!hasStorage()) return [];
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  return Array.isArray(stored[STORAGE_KEY]) ? (stored[STORAGE_KEY] as PersistedLog[]) : [];
}

export const rootLogger = new Logger('root');

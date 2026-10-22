/** Default: refresh the shop catalog once an hour. */
export const DEFAULT_CATALOG_SYNC_INTERVAL_MS = 60 * 60 * 1000;
/** How often the in-process timer wakes up to check staleness. */
export const DEFAULT_CATALOG_SYNC_TICK_MS = 5 * 60 * 1000;
/** After a failed crawl, wait before retrying so we do not hammer iordani.com. */
export const DEFAULT_CATALOG_SYNC_RETRY_MS = 15 * 60 * 1000;
/** Let the process become healthy before the first scheduled attempt. */
export const DEFAULT_CATALOG_SYNC_STARTUP_DELAY_MS = 90 * 1000;

export function readIntervalMs(raw: string | undefined, fallback: number): number {
  if (!raw?.trim()) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 60_000) return fallback;
  return Math.floor(value);
}

export function catalogSyncEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const flag = env.CATALOG_SYNC_ENABLED?.trim().toLowerCase();
  if (flag === "0" || flag === "false" || flag === "off") return false;
  if (env.NEXT_PHASE === "phase-production-build") return false;
  return true;
}

export function shouldRunScheduledSync(input: {
  now: number;
  intervalMs: number;
  retryAfterFailureMs: number;
  running: boolean;
  lastSuccessAtMs: number | null;
  lastAttemptAtMs: number | null;
  lastAttemptFailed: boolean;
}): boolean {
  if (input.running) return false;
  if (input.lastAttemptFailed && input.lastAttemptAtMs !== null) {
    if (input.now - input.lastAttemptAtMs < input.retryAfterFailureMs) return false;
  }
  if (input.lastSuccessAtMs === null) return true;
  return input.now - input.lastSuccessAtMs >= input.intervalMs;
}

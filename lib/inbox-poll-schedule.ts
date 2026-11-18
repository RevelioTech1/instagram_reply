/** Default: pull new comments and reconcile shop replies every 7 minutes. */
export const DEFAULT_INBOX_POLL_INTERVAL_MS = 7 * 60 * 1000;
/** How often the in-process timer wakes up to check staleness. */
export const DEFAULT_INBOX_POLL_TICK_MS = 60 * 1000;
/** After a failed poll, wait before retrying so we do not hammer Graph. */
export const DEFAULT_INBOX_POLL_RETRY_MS = 5 * 60 * 1000;
/** Let the process become healthy before the first scheduled attempt. */
export const DEFAULT_INBOX_POLL_STARTUP_DELAY_MS = 60 * 1000;

const MIN_POLL_INTERVAL_MS = 5 * 60 * 1000;
const MIN_TICK_MS = 30 * 1000;

export function readInboxPollIntervalMs(raw: string | undefined, fallback: number): number {
  if (!raw?.trim()) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < MIN_POLL_INTERVAL_MS) return fallback;
  return Math.floor(value);
}

export function readInboxTickMs(raw: string | undefined, fallback: number): number {
  if (!raw?.trim()) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < MIN_TICK_MS) return fallback;
  return Math.floor(value);
}

export function inboxPollEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const flag = env.INBOX_POLL_ENABLED?.trim().toLowerCase();
  if (flag === "0" || flag === "false" || flag === "off") return false;
  if (env.NEXT_PHASE === "phase-production-build") return false;
  return true;
}

export function shouldRunScheduledInboxPoll(input: {
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

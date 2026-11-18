import { deleteOrphanPosts, getComment, getSecrets, listOpenComments } from "./db.ts";
import {
  DEFAULT_INBOX_POLL_INTERVAL_MS,
  DEFAULT_INBOX_POLL_RETRY_MS,
  DEFAULT_INBOX_POLL_STARTUP_DELAY_MS,
  DEFAULT_INBOX_POLL_TICK_MS,
  inboxPollEnabled,
  readInboxPollIntervalMs,
  readInboxTickMs,
  shouldRunScheduledInboxPoll,
} from "./inbox-poll-schedule.ts";
import { collectCommentsFromMedia, RECENT_MEDIA_LIMIT } from "./instagram.ts";
import { ingestComment, reconcileOpenShopReplies, syncShopAnsweredComment } from "./process.ts";

export type InboxPollResult = {
  ok: boolean;
  seen: number;
  unreplied: number;
  ingested: number;
  marked: number;
  reconciled: number;
  mediaScanned: number;
  mediaLimit: number;
  message: string;
};

export type InboxPollState = {
  running: boolean;
  error: string | null;
  finishedAt: string | null;
  lastSuccessAt: string | null;
  lastResult: InboxPollResult | null;
  trigger: "manual" | "schedule" | null;
  autoEnabled: boolean;
  intervalMs: number;
};

const state: InboxPollState = {
  running: false,
  error: null,
  finishedAt: null,
  lastSuccessAt: null,
  lastResult: null,
  trigger: null,
  autoEnabled: true,
  intervalMs: DEFAULT_INBOX_POLL_INTERVAL_MS,
};

let lastAttemptAtMs: number | null = null;
let lastAttemptFailed = false;
let lastSuccessAtMs: number | null = null;
let schedulerStarted = false;
let tickTimer: ReturnType<typeof setInterval> | null = null;
let startupTimer: ReturnType<typeof setTimeout> | null = null;
let activeRun: Promise<InboxPollResult> | null = null;

export function getInboxPollState(): InboxPollState {
  return {
    ...state,
    autoEnabled: inboxPollEnabled(),
    intervalMs: readInboxPollIntervalMs(process.env.INBOX_POLL_INTERVAL_MS, DEFAULT_INBOX_POLL_INTERVAL_MS),
  };
}

/**
 * Pull unreplied comments from the newest posts, mark comments that already
 * have a shop reply in the media payload, then re-check open drafts via
 * GET /{comment-id}/replies (covers answers posted from the Instagram UI).
 */
export async function runInboxPoll(): Promise<InboxPollResult> {
  if (activeRun) return activeRun;
  activeRun = executeInboxPoll().finally(() => {
    activeRun = null;
  });
  return activeRun;
}

async function executeInboxPoll(): Promise<InboxPollResult> {
  const secrets = getSecrets();
  if (!secrets.accessToken || !secrets.igUserId) {
    throw new Error("Сначала проверьте подключение: нужен токен и id аккаунта Instagram.");
  }

  const openIds = new Set(listOpenComments(2000).map((comment) => comment.id));
  const { unreplied, answered, mediaScanned } = await collectCommentsFromMedia({
    mediaLimit: RECENT_MEDIA_LIMIT,
    verifyReplyIds: openIds,
  });

  let marked = 0;
  const answeredIds = new Set<string>();
  for (const comment of answered) {
    answeredIds.add(comment.id);
    const result = await syncShopAnsweredComment({
      id: comment.id,
      mediaId: comment.mediaId,
      username: comment.username,
      userId: comment.userId,
      text: comment.text,
      createdAt: comment.timestamp,
      source: "poll",
      caption: comment.caption,
      permalink: comment.permalink,
      mediaUrl: comment.mediaUrl,
      shopReplyText: comment.shopReplyText,
      shopReplyId: comment.shopReplyId,
    });
    if (result.changed) marked += 1;
  }

  let ingested = 0;
  for (const comment of unreplied) {
    const before = getComment(comment.id);
    const saved = await ingestComment({
      id: comment.id,
      mediaId: comment.mediaId,
      username: comment.username,
      userId: comment.userId,
      text: comment.text,
      createdAt: comment.timestamp,
      source: "poll",
      caption: comment.caption,
      permalink: comment.permalink,
      mediaUrl: comment.mediaUrl,
    });
    if (saved && !before) ingested += 1;
  }

  // Covers open drafts whose posts fell outside the last-50 media window.
  const reconciled = await reconcileOpenShopReplies({ skipIds: answeredIds, limit: 2000 });
  marked += reconciled.marked;
  deleteOrphanPosts();

  return {
    ok: true,
    seen: unreplied.length + answered.length,
    unreplied: unreplied.length,
    ingested,
    marked,
    reconciled: reconciled.marked,
    mediaScanned,
    mediaLimit: RECENT_MEDIA_LIMIT,
    message: (() => {
      const extras: string[] = [];
      if (reconciled.marked) extras.push(`через /replies: ${reconciled.marked}`);
      if (reconciled.errors) extras.push(`ошибок сверки: ${reconciled.errors}`);
      return (
        `Просмотрели ${mediaScanned} из ${RECENT_MEDIA_LIMIT} постов: неотвеченных ${unreplied.length} (новых ${ingested}). ` +
        `С ответом магазина пометили «Ответили»: ${marked}` +
        (extras.length ? ` (${extras.join(", ")})` : "") +
        "."
      );
    })(),
  };
}

export function startInboxPoll(trigger: "manual" | "schedule" = "manual"): InboxPollState {
  if (state.running || activeRun) return getInboxPollState();
  state.running = true;
  state.error = null;
  state.finishedAt = null;
  state.trigger = trigger;
  lastAttemptAtMs = Date.now();
  lastAttemptFailed = false;
  void runInboxPoll()
    .then((result) => {
      state.lastResult = result;
      state.running = false;
      state.finishedAt = new Date().toISOString();
      state.lastSuccessAt = state.finishedAt;
      lastSuccessAtMs = Date.now();
      lastAttemptFailed = false;
      lastAttemptAtMs = Date.now();
    })
    .catch((error: unknown) => {
      state.error = error instanceof Error ? error.message : "Не удалось забрать комментарии.";
      state.running = false;
      state.finishedAt = new Date().toISOString();
      lastAttemptFailed = true;
      lastAttemptAtMs = Date.now();
    });
  return getInboxPollState();
}

export function startInboxPollScheduler(): void {
  if (schedulerStarted || !inboxPollEnabled()) return;
  schedulerStarted = true;
  const tickMs = readInboxTickMs(process.env.INBOX_POLL_TICK_MS, DEFAULT_INBOX_POLL_TICK_MS);
  const startupDelayMs = readInboxTickMs(
    process.env.INBOX_POLL_STARTUP_DELAY_MS,
    DEFAULT_INBOX_POLL_STARTUP_DELAY_MS,
  );
  const tick = () => {
    try {
      maybeStartScheduledInboxPoll();
    } catch {
      // Keep the timer alive even if a single check throws.
    }
  };
  startupTimer = setTimeout(() => {
    tick();
    tickTimer = setInterval(tick, tickMs);
    tickTimer.unref?.();
  }, startupDelayMs);
  startupTimer.unref?.();
}

export function maybeStartScheduledInboxPoll(now = Date.now()): InboxPollState {
  if (!inboxPollEnabled()) return getInboxPollState();
  const secrets = getSecrets();
  if (!secrets.accessToken || !secrets.igUserId) return getInboxPollState();
  const intervalMs = readInboxPollIntervalMs(
    process.env.INBOX_POLL_INTERVAL_MS,
    DEFAULT_INBOX_POLL_INTERVAL_MS,
  );
  const retryAfterFailureMs = readInboxPollIntervalMs(
    process.env.INBOX_POLL_RETRY_MS,
    DEFAULT_INBOX_POLL_RETRY_MS,
  );
  if (
    !shouldRunScheduledInboxPoll({
      now,
      intervalMs,
      retryAfterFailureMs,
      running: state.running,
      lastSuccessAtMs,
      lastAttemptAtMs,
      lastAttemptFailed,
    })
  ) {
    return getInboxPollState();
  }
  return startInboxPoll("schedule");
}

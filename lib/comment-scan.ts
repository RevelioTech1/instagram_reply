import { runInboxPoll } from "./inbox-poll.ts";

export type CommentScanState = {
  running: boolean;
  mediaScanned: number;
  unrepliedFound: number;
  ingested: number;
  /** Comments with a shop reply that were marked status=replied (kept in inbox). */
  markedAnswered: number;
  /** @deprecated kept for older clients; same as markedAnswered */
  removedAnswered: number;
  orphansRemoved: number;
  error: string | null;
  finishedAt: string | null;
};

const state: CommentScanState = {
  running: false,
  mediaScanned: 0,
  unrepliedFound: 0,
  ingested: 0,
  markedAnswered: 0,
  removedAnswered: 0,
  orphansRemoved: 0,
  error: null,
  finishedAt: null,
};

export function getCommentScanState(): CommentScanState {
  return { ...state };
}

/** Scan only the newest posts for unreplied comments (same limit as poll). */
export function startFullCommentScan(): CommentScanState {
  if (state.running) return getCommentScanState();
  state.running = true;
  state.mediaScanned = 0;
  state.unrepliedFound = 0;
  state.ingested = 0;
  state.markedAnswered = 0;
  state.removedAnswered = 0;
  state.orphansRemoved = 0;
  state.error = null;
  state.finishedAt = null;
  void runRecentCommentScan().catch((error: unknown) => {
    state.error = error instanceof Error ? error.message : "Не удалось просканировать комментарии";
    state.running = false;
    state.finishedAt = new Date().toISOString();
  });
  return getCommentScanState();
}

async function runRecentCommentScan(): Promise<void> {
  const result = await runInboxPoll();
  state.mediaScanned = result.mediaScanned;
  state.unrepliedFound = result.unreplied;
  state.ingested = result.ingested;
  state.markedAnswered = result.marked;
  state.removedAnswered = result.marked;
  state.orphansRemoved = 0;
  state.running = false;
  state.finishedAt = new Date().toISOString();
}

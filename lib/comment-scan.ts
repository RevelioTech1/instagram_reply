import { deleteOrphanPosts, getComment } from "./db.ts";
import { collectCommentsFromMedia, RECENT_MEDIA_LIMIT } from "./instagram.ts";
import { ingestComment, syncShopAnsweredComment } from "./process.ts";

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
  const { unreplied, answered } = await collectCommentsFromMedia({
    mediaLimit: RECENT_MEDIA_LIMIT,
    onMedia: ({ scanned }) => {
      state.mediaScanned = scanned;
    },
  });

  for (const comment of answered) {
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
    if (result.changed) {
      state.markedAnswered += 1;
      state.removedAnswered = state.markedAnswered;
    }
  }

  state.unrepliedFound = unreplied.length;
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
    if (saved && !before) state.ingested += 1;
  }

  state.orphansRemoved = deleteOrphanPosts();
  state.running = false;
  state.finishedAt = new Date().toISOString();
}

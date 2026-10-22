import { deleteComment, deleteOrphanPosts, getComment } from "./db.ts";
import { collectCommentsFromMedia } from "./instagram.ts";
import { ingestComment } from "./process.ts";

export type CommentScanState = {
  running: boolean;
  mediaScanned: number;
  unrepliedFound: number;
  ingested: number;
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
  removedAnswered: 0,
  orphansRemoved: 0,
  error: null,
  finishedAt: null,
};

export function getCommentScanState(): CommentScanState {
  return { ...state };
}

/** One-shot walk of all media: drop locally stored comments already answered on IG, ingest the rest. */
export function startFullCommentScan(): CommentScanState {
  if (state.running) return getCommentScanState();
  state.running = true;
  state.mediaScanned = 0;
  state.unrepliedFound = 0;
  state.ingested = 0;
  state.removedAnswered = 0;
  state.orphansRemoved = 0;
  state.error = null;
  state.finishedAt = null;
  void runFullCommentScan().catch((error: unknown) => {
    state.error = error instanceof Error ? error.message : "Не удалось просканировать комментарии";
    state.running = false;
    state.finishedAt = new Date().toISOString();
  });
  return getCommentScanState();
}

async function runFullCommentScan(): Promise<void> {
  const { unreplied, answered } = await collectCommentsFromMedia({
    mediaLimit: null,
    commentsPerMedia: 50,
    onMedia: ({ scanned }) => {
      state.mediaScanned = scanned;
    },
  });

  for (const comment of answered) {
    const existing = getComment(comment.id);
    if (!existing) continue;
    // Keep history that this panel already sent; drop everything answered outside.
    if (existing.delivery === "instagram" || existing.delivery === "local") continue;
    if (deleteComment(comment.id)) state.removedAnswered += 1;
  }

  state.unrepliedFound = unreplied.length;
  for (const comment of unreplied) {
    const before = getComment(comment.id);
    const saved = await ingestComment({
      id: comment.id,
      mediaId: comment.mediaId,
      username: comment.username,
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

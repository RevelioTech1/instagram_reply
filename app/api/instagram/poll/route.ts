import { deleteComment, deleteOrphanPosts, getComment } from "@/lib/db";
import { collectCommentsFromMedia, RECENT_MEDIA_LIMIT } from "@/lib/instagram";
import { ingestComment } from "@/lib/process";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  try {
    const { unreplied, answered } = await collectCommentsFromMedia({
      mediaLimit: RECENT_MEDIA_LIMIT,
    });
    let removed = 0;
    for (const comment of answered) {
      const existing = getComment(comment.id);
      if (!existing) continue;
      if (existing.delivery === "instagram" || existing.delivery === "local") continue;
      if (deleteComment(comment.id)) removed += 1;
    }
    let ingested = 0;
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
      if (saved && !before) ingested += 1;
    }
    deleteOrphanPosts();
    return Response.json({
      ok: true,
      seen: unreplied.length + answered.length,
      unreplied: unreplied.length,
      ingested,
      removed,
      mediaLimit: RECENT_MEDIA_LIMIT,
      message: `Из ${RECENT_MEDIA_LIMIT} последних постов: неотвеченных ${unreplied.length} (новых ${ingested}). Убрали уже отвеченных вне панели: ${removed}.`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось забрать комментарии.";
    return Response.json({ ok: false, message }, { status: 400 });
  }
}

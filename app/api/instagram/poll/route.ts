import { deleteOrphanPosts, getComment } from "@/lib/db";
import { collectCommentsFromMedia, RECENT_MEDIA_LIMIT } from "@/lib/instagram";
import { ingestComment, syncShopAnsweredComment } from "@/lib/process";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  try {
    const { unreplied, answered } = await collectCommentsFromMedia({
      mediaLimit: RECENT_MEDIA_LIMIT,
    });
    let marked = 0;
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
    deleteOrphanPosts();
    return Response.json({
      ok: true,
      seen: unreplied.length + answered.length,
      unreplied: unreplied.length,
      ingested,
      marked,
      mediaLimit: RECENT_MEDIA_LIMIT,
      message: `Из ${RECENT_MEDIA_LIMIT} последних постов: неотвеченных ${unreplied.length} (новых ${ingested}). С ответом магазина пометили «Ответили»: ${marked}.`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось забрать комментарии.";
    return Response.json({ ok: false, message }, { status: 400 });
  }
}

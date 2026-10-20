import { fetchRecentComments } from "@/lib/instagram";
import { ingestComment } from "@/lib/process";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  try {
    const remote = await fetchRecentComments();
    for (const comment of remote) {
      await ingestComment({
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
    }
    return Response.json({ ok: true, seen: remote.length, message: `Просмотрели ${remote.length} комментариев.` });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось забрать комментарии.";
    return Response.json({ ok: false, message }, { status: 400 });
  }
}

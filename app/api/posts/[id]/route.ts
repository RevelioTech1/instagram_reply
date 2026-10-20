import { listComments, replanComment, setPostManualCode } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = (await request.json()) as { manualCode?: string | null };
  const post = setPostManualCode(decodeURIComponent(id), body.manualCode?.trim() || null);
  if (!post) return Response.json({ error: "Пост не найден." }, { status: 404 });
  const open = listComments().filter(
    (comment) =>
      comment.mediaId === post.mediaId &&
      (comment.status === "draft" || comment.status === "needs_review" || comment.status === "failed"),
  );
  for (const comment of open) replanComment(comment.id);
  return Response.json({ post });
}

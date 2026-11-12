import { getComment, updateReplies } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;
  const comment = getComment(id);
  if (!comment) return Response.json({ error: "Комментарий не найден." }, { status: 404 });
  return Response.json({ comment });
}

export async function PATCH(request: Request, context: Context) {
  const { id } = await context.params;
  const body = (await request.json()) as {
    replyPublic?: string;
    replyPrivate?: string;
  };
  if (body.replyPublic == null || body.replyPrivate == null) {
    return Response.json({ error: "Нужны оба текста ответа." }, { status: 400 });
  }
  const comment = updateReplies(id, body.replyPublic, body.replyPrivate);
  if (!comment) return Response.json({ error: "Комментарий не найден." }, { status: 404 });
  return Response.json({ comment });
}

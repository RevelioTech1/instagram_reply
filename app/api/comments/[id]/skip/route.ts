import { skipComment } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const comment = skipComment(id);
  if (!comment) return Response.json({ error: "Комментарий не найден." }, { status: 404 });
  return Response.json({ comment });
}

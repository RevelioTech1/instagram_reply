import { ingestComment, simulatorId } from "@/lib/process";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json()) as { text?: string; caption?: string };
  const text = body.text?.trim() ?? "";
  if (!text) return Response.json({ error: "Напишите текст комментария." }, { status: 400 });
  const id = simulatorId();
  const comment = await ingestComment({
    id,
    mediaId: `sim-post-${id}`,
    username: "проверка",
    text,
    source: "simulator",
    caption: body.caption?.trim() ?? "",
  });
  return Response.json({ comment });
}

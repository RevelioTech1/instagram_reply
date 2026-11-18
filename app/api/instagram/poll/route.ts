import { runInboxPoll } from "@/lib/inbox-poll";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  try {
    const result = await runInboxPoll();
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось забрать комментарии.";
    return Response.json({ ok: false, message }, { status: 400 });
  }
}

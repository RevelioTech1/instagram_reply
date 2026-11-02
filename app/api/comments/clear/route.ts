import { clearInbox } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function POST() {
  const result = clearInbox();
  return Response.json({
    ok: true,
    ...result,
    message: `Очистили входящие: ${result.comments} комментариев, ${result.posts} постов. Теперь заберите неотвеченные заново.`,
  });
}

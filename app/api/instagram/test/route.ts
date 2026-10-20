import { testConnection } from "@/lib/instagram";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { accessToken?: string };
  try {
    const connection = await testConnection(body.accessToken);
    return Response.json({
      ok: true,
      ...connection,
      message: connection.savedPageToken
        ? `Нашли @${connection.username} на странице «${connection.pageName}» и сохранили токен Страницы.`
        : `Подключён @${connection.username}.`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось проверить токен.";
    return Response.json({ ok: false, message }, { status: 400 });
  }
}

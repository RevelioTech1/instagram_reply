import { getSecrets, saveSecrets } from "@/lib/db";
import { exchangeInstagramCode, exchangeLongLivedToken, expiryFromNow, settingsLocation } from "@/lib/ig-login";
import { graph } from "@/lib/instagram";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const incoming = new URL(request.url);
  const oauthError = incoming.searchParams.get("error_description") || incoming.searchParams.get("error");
  if (oauthError) {
    return Response.redirect(
      settingsLocation(request, { error: oauthError === "access_denied" ? "Вход в Instagram отменён." : oauthError }),
    );
  }

  const code = incoming.searchParams.get("code");
  const state = incoming.searchParams.get("state");
  const secrets = getSecrets();
  if (!code || !state || !secrets.oauthState || state !== secrets.oauthState) {
    return Response.redirect(
      settingsLocation(request, {
        error: "Сессия входа устарела. Нажмите «Войти через Instagram» ещё раз.",
      }),
    );
  }
  if (!secrets.igAppId || !secrets.igAppSecret || !secrets.oauthRedirect) {
    return Response.redirect(
      settingsLocation(request, { error: "Не хватает Instagram App ID или секрета. Сохраните их и войдите снова." }),
    );
  }

  try {
    const shortLived = await exchangeInstagramCode({
      appId: secrets.igAppId,
      appSecret: secrets.igAppSecret,
      redirectUri: secrets.oauthRedirect,
      code,
    });
    const longLived = await exchangeLongLivedToken(shortLived.accessToken, secrets.igAppSecret);
    const profile = await graph<{ user_id?: string; id?: string; username?: string }>("me", {
      token: longLived.accessToken,
      version: secrets.graphVersion || "v23.0",
      authMode: "instagram",
      query: { fields: "user_id,username" },
    });
    const igUserId = profile.user_id || profile.id || shortLived.userId;
    const username = profile.username || secrets.igUsername || "iordani925";
    if (!igUserId) throw new Error("Instagram не вернул id аккаунта.");
    saveSecrets({
      accessToken: longLived.accessToken,
      igUserId,
      igUsername: username,
      authMode: "instagram",
      tokenExpiresAt: expiryFromNow(longLived.expiresIn),
      oauthState: "",
      oauthRedirect: "",
    });
    return Response.redirect(settingsLocation(request, { connected: "1", user: username }));
  } catch (error) {
    saveSecrets({ oauthState: "", oauthRedirect: "" });
    const message = error instanceof Error ? error.message : "Не удалось войти в Instagram.";
    return Response.redirect(settingsLocation(request, { error: message }));
  }
}

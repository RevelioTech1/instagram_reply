import crypto from "node:crypto";
import { getSecrets, saveSecrets } from "@/lib/db";
import { callbackUri, instagramAuthorizeUrl, settingsLocation } from "@/lib/ig-login";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(request: Request) {
  const secrets = getSecrets();
  if (!secrets.igAppId || !secrets.igAppSecret) {
    return Response.redirect(
      settingsLocation(request, {
        error: "Сначала вставьте Instagram App ID и секрет приложения.",
      }),
    );
  }
  const redirectUri = callbackUri(request);
  const state = crypto.randomBytes(16).toString("hex");
  saveSecrets({ oauthState: state, oauthRedirect: redirectUri });
  return Response.redirect(instagramAuthorizeUrl({ appId: secrets.igAppId, redirectUri, state }));
}

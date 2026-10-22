export const IG_SCOPES = [
  "instagram_business_basic",
  "instagram_business_manage_comments",
  "instagram_business_manage_messages",
].join(",");

export function instagramAuthorizeUrl(input: {
  appId: string;
  redirectUri: string;
  state: string;
}): string {
  const url = new URL("https://www.instagram.com/oauth/authorize");
  url.searchParams.set("enable_fb_login", "0");
  url.searchParams.set("force_authentication", "1");
  url.searchParams.set("client_id", input.appId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", IG_SCOPES);
  url.searchParams.set("state", input.state);
  return url.toString();
}

/**
 * Drop the browser's current Instagram session first, then open OAuth.
 * Otherwise Instagram keeps offering the last account (e.g. revelioceo).
 */
export function instagramLoginRedirectUrl(input: {
  appId: string;
  redirectUri: string;
  state: string;
}): string {
  const authorize = instagramAuthorizeUrl(input);
  const logout = new URL("https://www.instagram.com/accounts/logout/");
  logout.searchParams.set("continue", authorize);
  return logout.toString();
}

export function parseTokenResponse(payload: unknown): { accessToken: string; userId: string } {
  const record = tokenRecord(payload);
  const token = record?.access_token;
  if (typeof token !== "string" || !token) {
    throw new Error(instagramErrorMessage(payload, 400));
  }
  const userId = record?.user_id;
  return { accessToken: token, userId: userId == null ? "" : String(userId) };
}

export function parseLongLivedToken(payload: unknown): { accessToken: string; expiresIn: number } {
  if (!payload || typeof payload !== "object") {
    throw new Error("Instagram не вернул долгий токен.");
  }
  const record = payload as { access_token?: unknown; expires_in?: unknown };
  if (typeof record.access_token !== "string" || !record.access_token) {
    throw new Error(instagramErrorMessage(payload, 400));
  }
  const expiresIn = Number(record.expires_in);
  return {
    accessToken: record.access_token,
    expiresIn: Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 5_184_000,
  };
}

export function instagramErrorMessage(payload: unknown, status: number): string {
  if (payload && typeof payload === "object") {
    const record = payload as {
      error?: { message?: string } | string;
      error_message?: string;
      error_description?: string;
    };
    if (typeof record.error === "string" && record.error_description) return record.error_description;
    if (record.error && typeof record.error === "object" && record.error.message) return record.error.message;
    if (record.error_message) return record.error_message;
    if (record.error_description) return record.error_description;
  }
  return `Instagram ответил ${status}`;
}

export function expiryFromNow(expiresInSeconds: number): string {
  return new Date(Date.now() + expiresInSeconds * 1000).toISOString();
}

type HeaderSource = { url: string; headers: { get(name: string): string | null } };

export function requestOrigin(request: HeaderSource): string {
  const forwardedHost = firstHeader(request.headers.get("x-forwarded-host"));
  const host = forwardedHost || firstHeader(request.headers.get("host"));
  const forwardedProto = firstHeader(request.headers.get("x-forwarded-proto"));
  const fallback = new URL(request.url);
  const proto = forwardedProto || fallback.protocol.replace(":", "") || "http";
  if (host && !host.startsWith("0.0.0.0")) return `${proto}://${host}`;
  return fallback.origin;
}

export function callbackUri(request: HeaderSource, publicOrigin = ""): string {
  const configured = publicOrigin.trim().replace(/\/$/, "");
  const origin = configured.startsWith("https://") ? configured : requestOrigin(request);
  return `${origin}/api/instagram/callback`;
}

export function settingsLocation(request: HeaderSource, params: Record<string, string>): string {
  const url = new URL("/settings", requestOrigin(request));
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value.slice(0, 300));
  return url.toString();
}

function firstHeader(value: string | null): string {
  return value?.split(",")[0]?.trim() ?? "";
}

function tokenRecord(payload: unknown): { access_token?: unknown; user_id?: unknown } | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as { data?: unknown; access_token?: unknown; user_id?: unknown };
  if (Array.isArray(record.data)) {
    const first = record.data[0];
    if (first && typeof first === "object") return first as { access_token?: unknown; user_id?: unknown };
  }
  return record;
}

export async function exchangeInstagramCode(input: {
  appId: string;
  appSecret: string;
  redirectUri: string;
  code: string;
}): Promise<{ accessToken: string; userId: string }> {
  const body = new URLSearchParams({
    client_id: input.appId,
    client_secret: input.appSecret,
    grant_type: "authorization_code",
    redirect_uri: input.redirectUri,
    code: input.code.replace(/#_$/, "").trim(),
  });
  const response = await fetch("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(instagramErrorMessage(payload, response.status));
  return parseTokenResponse(payload);
}

export async function exchangeLongLivedToken(
  shortToken: string,
  appSecret: string,
): Promise<{ accessToken: string; expiresIn: number }> {
  const url = new URL("https://graph.instagram.com/access_token");
  url.searchParams.set("grant_type", "ig_exchange_token");
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("access_token", shortToken);
  const response = await fetch(url);
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(instagramErrorMessage(payload, response.status));
  return parseLongLivedToken(payload);
}

import { getSecrets, saveSecrets } from "./db.ts";
import { expiryFromNow, instagramErrorMessage } from "./ig-login.ts";
import type { AuthMode } from "./types.ts";

type GraphError = { error?: { message?: string } };

export type RemoteComment = {
  id: string;
  text: string;
  username: string;
  timestamp?: string;
  mediaId: string;
  caption: string;
  permalink: string | null;
  mediaUrl: string | null;
};

export type ConnectionResult = {
  igUserId: string;
  username: string;
  pageName: string;
  savedPageToken: boolean;
};

export async function graph<T>(
  path: string,
  options: {
    token: string;
    version: string;
    method?: string;
    query?: Record<string, string>;
    body?: unknown;
    authMode?: AuthMode;
  },
): Promise<T> {
  const mode = options.authMode ?? getSecrets().authMode;
  const host = mode === "instagram" ? "https://graph.instagram.com" : "https://graph.facebook.com";
  const url = new URL(`${host}/${options.version}/${path.replace(/^\//, "")}`);
  url.searchParams.set("access_token", options.token);
  for (const [key, value] of Object.entries(options.query ?? {})) url.searchParams.set(key, value);
  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const payload = (await response.json()) as T & GraphError;
  if (!response.ok || payload.error) {
    throw new Error(instagramErrorMessage(payload, response.status));
  }
  return payload;
}

const TEN_DAYS_MS = 10 * 24 * 60 * 60 * 1000;

export async function refreshInstagramTokenIfNeeded(): Promise<void> {
  const secrets = getSecrets();
  if (secrets.authMode !== "instagram" || !secrets.accessToken || !secrets.tokenExpiresAt) return;
  const expires = Date.parse(secrets.tokenExpiresAt);
  if (!Number.isFinite(expires) || expires - Date.now() > TEN_DAYS_MS) return;
  const url = new URL("https://graph.instagram.com/refresh_access_token");
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", secrets.accessToken);
  const response = await fetch(url);
  const payload = (await response.json().catch(() => null)) as {
    access_token?: string;
    expires_in?: number;
  } | null;
  if (!response.ok || !payload?.access_token) {
    if (expires > Date.now()) return;
    throw new Error(instagramErrorMessage(payload, response.status));
  }
  saveSecrets({
    accessToken: payload.access_token,
    tokenExpiresAt: expiryFromNow(Number(payload.expires_in) || 5_184_000),
    authMode: "instagram",
  });
}

export async function revokeInstagramAccess(): Promise<void> {
  const secrets = getSecrets();
  if (secrets.authMode !== "instagram" || !secrets.accessToken) return;
  const version = secrets.graphVersion || "v23.0";
  const url = new URL(`https://graph.instagram.com/${version}/me/permissions`);
  url.searchParams.set("access_token", secrets.accessToken);
  await fetch(url, { method: "DELETE" }).catch(() => undefined);
}

export async function testConnection(token = getSecrets().accessToken): Promise<ConnectionResult> {
  const secrets = getSecrets();
  if (!token) throw new Error("Сначала войдите через Instagram в разделе «Подключение».");
  const version = secrets.graphVersion || "v23.0";
  if (secrets.authMode === "instagram") {
    await refreshInstagramTokenIfNeeded();
    const fresh = getSecrets();
    const activeToken = fresh.accessToken || token;
    const profile = await graph<{ user_id?: string; id?: string; username?: string }>("me", {
      token: activeToken,
      version,
      authMode: "instagram",
      query: { fields: "user_id,username" },
    });
    const igUserId = profile.user_id || profile.id || fresh.igUserId;
    const username = profile.username || fresh.igUsername || "iordani925";
    if (!igUserId) throw new Error("Instagram не вернул id аккаунта.");
    saveSecrets({ accessToken: activeToken, igUserId, igUsername: username, authMode: "instagram" });
    return { igUserId, username, pageName: "", savedPageToken: false };
  }
  const page = await graph<{
    id?: string;
    name?: string;
    instagram_business_account?: { id?: string; username?: string };
  }>("me", {
    token,
    version,
    query: { fields: "id,name,instagram_business_account{id,username}" },
  }).catch(() => null);

  if (page?.instagram_business_account?.id) {
    const username = page.instagram_business_account.username || secrets.igUsername;
    saveSecrets({
      accessToken: token,
      igUserId: page.instagram_business_account.id,
      igUsername: username,
      authMode: "facebook",
    });
    return {
      igUserId: page.instagram_business_account.id,
      username,
      pageName: page.name || "Страница",
      savedPageToken: false,
    };
  }

  const accounts = await graph<{
    data?: Array<{
      name?: string;
      access_token?: string;
      instagram_business_account?: { id?: string; username?: string };
    }>;
  }>("me/accounts", {
    token,
    version,
    query: { fields: "id,name,access_token,instagram_business_account{id,username}" },
  });
  const pages = accounts.data ?? [];
  const match =
    pages.find((item) => item.instagram_business_account?.username?.toLowerCase() === "iordani925") ??
    pages.find((item) => item.instagram_business_account?.id);
  if (!match?.instagram_business_account?.id || !match.access_token) {
    throw new Error("Этот токен не открыл профессиональный аккаунт Instagram. Войдите кнопкой «Войти через Instagram».");
  }
  saveSecrets({
    accessToken: match.access_token,
    igUserId: match.instagram_business_account.id,
    igUsername: match.instagram_business_account.username || "iordani925",
    authMode: "facebook",
  });
  return {
    igUserId: match.instagram_business_account.id,
    username: match.instagram_business_account.username || "iordani925",
    pageName: match.name || "Страница",
    savedPageToken: true,
  };
}

export async function fetchMedia(mediaId: string): Promise<{
  caption: string;
  permalink: string | null;
  mediaUrl: string | null;
} | null> {
  await refreshInstagramTokenIfNeeded();
  const secrets = getSecrets();
  if (!secrets.accessToken) return null;
  const media = await graph<{
    caption?: string;
    permalink?: string;
    media_url?: string;
    thumbnail_url?: string;
  }>(mediaId, {
    token: secrets.accessToken,
    version: secrets.graphVersion || "v23.0",
    query: { fields: "caption,permalink,media_url,thumbnail_url" },
  });
  return {
    caption: media.caption ?? "",
    permalink: media.permalink ?? null,
    mediaUrl: media.media_url ?? media.thumbnail_url ?? null,
  };
}

export async function fetchRecentComments(): Promise<RemoteComment[]> {
  await refreshInstagramTokenIfNeeded();
  const secrets = getSecrets();
  if (!secrets.accessToken || !secrets.igUserId) {
    throw new Error("Сначала проверьте подключение: нужен токен и id аккаунта Instagram.");
  }
  const payload = await graph<{
    data?: Array<{
      id: string;
      caption?: string;
      permalink?: string;
      media_url?: string;
      thumbnail_url?: string;
      comments?: { data?: Array<{ id: string; text?: string; username?: string; timestamp?: string }> };
    }>;
  }>(`${secrets.igUserId}/media`, {
    token: secrets.accessToken,
    version: secrets.graphVersion || "v23.0",
    query: {
      fields:
        "id,caption,permalink,media_url,thumbnail_url,timestamp,comments.limit(25){id,text,username,timestamp}",
      limit: "8",
    },
  });
  const comments: RemoteComment[] = [];
  for (const media of payload.data ?? []) {
    for (const comment of media.comments?.data ?? []) {
      if (!comment.text) continue;
      comments.push({
        id: comment.id,
        text: comment.text,
        username: comment.username || "instagram",
        timestamp: comment.timestamp,
        mediaId: media.id,
        caption: media.caption ?? "",
        permalink: media.permalink ?? null,
        mediaUrl: media.media_url ?? media.thumbnail_url ?? null,
      });
    }
  }
  return comments;
}

export async function publishPublicReply(commentId: string, message: string): Promise<string | null> {
  await refreshInstagramTokenIfNeeded();
  const secrets = getSecrets();
  const result = await graph<{ id?: string }>(`${commentId}/replies`, {
    token: secrets.accessToken,
    version: secrets.graphVersion || "v23.0",
    method: "POST",
    body: { message },
  });
  return result.id ?? null;
}

export async function publishPrivateReply(commentId: string, message: string): Promise<void> {
  await refreshInstagramTokenIfNeeded();
  const secrets = getSecrets();
  if (!secrets.igUserId) throw new Error("Не известен id аккаунта Instagram.");
  await graph(`${secrets.igUserId}/messages`, {
    token: secrets.accessToken,
    version: secrets.graphVersion || "v23.0",
    method: "POST",
    body: { recipient: { comment_id: commentId }, message: { text: message } },
  });
}

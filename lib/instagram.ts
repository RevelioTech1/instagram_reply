import { getSecrets, isOwnAccount, saveSecrets } from "./db.ts";
import { expiryFromNow, instagramErrorMessage } from "./ig-login.ts";
import { commentAuthor, hasBusinessReply, type IgCommentNode } from "./ig-replies.ts";
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

const COMMENT_FIELDS =
  "id,text,username,timestamp,from{id,username},replies.limit(50){id,text,username,from{id,username}}";

type MediaPageItem = {
  id: string;
  caption?: string;
  permalink?: string;
  media_url?: string;
  thumbnail_url?: string;
  comments?: {
    data?: IgCommentNode[];
    paging?: { cursors?: { after?: string }; next?: string };
  };
};

type Paged<T> = {
  data?: T[];
  paging?: { cursors?: { after?: string }; next?: string };
};

function ownIdentity() {
  const secrets = getSecrets();
  const names = ["iordani925", secrets.igUsername].filter(Boolean);
  const ids = [secrets.igUserId].filter(Boolean);
  return { names, ids, secrets };
}

export async function fetchRecentComments(): Promise<RemoteComment[]> {
  const { unreplied } = await collectCommentsFromMedia({ mediaLimit: 8, commentsPerMedia: 25 });
  return unreplied;
}

export type ScanCommentHit = RemoteComment & { answeredOutside: boolean };

/**
 * Walk Instagram media (optionally all pages) and split comments into unreplied vs
 * already answered publicly by the shop account.
 */
export async function collectCommentsFromMedia(options: {
  mediaLimit?: number | null;
  commentsPerMedia?: number;
  onMedia?: (info: { scanned: number; mediaId: string }) => void;
}): Promise<{ unreplied: RemoteComment[]; answered: RemoteComment[] }> {
  await refreshInstagramTokenIfNeeded();
  const { names, ids, secrets } = ownIdentity();
  if (!secrets.accessToken || !secrets.igUserId) {
    throw new Error("Сначала проверьте подключение: нужен токен и id аккаунта Instagram.");
  }
  const version = secrets.graphVersion || "v23.0";
  const token = secrets.accessToken;
  const unreplied: RemoteComment[] = [];
  const answered: RemoteComment[] = [];
  const commentsPerMedia = options.commentsPerMedia ?? 50;
  let after: string | undefined;
  let scanned = 0;
  let fetchedMedia = 0;
  const maxMedia = options.mediaLimit ?? null;

  while (maxMedia === null || fetchedMedia < maxMedia) {
    const pageSize = maxMedia === null ? 25 : Math.min(25, maxMedia - fetchedMedia);
    const page = await graph<Paged<MediaPageItem>>(`${secrets.igUserId}/media`, {
      token,
      version,
      authMode: secrets.authMode,
      query: {
        fields: `id,caption,permalink,media_url,thumbnail_url,timestamp,comments.limit(${commentsPerMedia}){${COMMENT_FIELDS}}`,
        limit: String(pageSize),
        ...(after ? { after } : {}),
      },
    });
    const items = page.data ?? [];
    if (!items.length) break;
    for (const media of items) {
      scanned += 1;
      fetchedMedia += 1;
      options.onMedia?.({ scanned, mediaId: media.id });
      const nodes = await listMediaComments(media, {
        token,
        version,
        authMode: secrets.authMode,
        pageSize: commentsPerMedia,
      });
      for (const comment of nodes) {
        if (!comment.text) continue;
        const author = commentAuthor(comment);
        if (isOwnAccount(author.username || "instagram")) continue;
        const remote: RemoteComment = {
          id: comment.id,
          text: comment.text,
          username: author.username || "instagram",
          timestamp: comment.timestamp,
          mediaId: media.id,
          caption: media.caption ?? "",
          permalink: media.permalink ?? null,
          mediaUrl: media.media_url ?? media.thumbnail_url ?? null,
        };
        if (hasBusinessReply(comment, names, ids)) answered.push(remote);
        else unreplied.push(remote);
      }
    }
    after = page.paging?.cursors?.after;
    if (!after || items.length < pageSize) break;
  }

  return { unreplied, answered };
}

async function listMediaComments(
  media: MediaPageItem,
  options: { token: string; version: string; authMode: AuthMode; pageSize: number },
): Promise<IgCommentNode[]> {
  const collected: IgCommentNode[] = [...(media.comments?.data ?? [])];
  let after = media.comments?.paging?.cursors?.after;
  while (after) {
    const page = await graph<Paged<IgCommentNode>>(`${media.id}/comments`, {
      token: options.token,
      version: options.version,
      authMode: options.authMode,
      query: {
        fields: COMMENT_FIELDS,
        limit: String(options.pageSize),
        after,
      },
    });
    collected.push(...(page.data ?? []));
    after = page.paging?.cursors?.after;
    if (!(page.data?.length ?? 0)) break;
  }
  for (const comment of collected) {
    await expandReplies(comment, options);
  }
  return collected;
}

async function expandReplies(
  comment: IgCommentNode,
  options: { token: string; version: string; authMode: AuthMode; pageSize: number },
): Promise<void> {
  if (!comment.replies) comment.replies = { data: [] };
  const data = comment.replies.data ?? [];
  comment.replies.data = data;
  let after = comment.replies.paging?.cursors?.after;
  while (after) {
    const page = await graph<Paged<IgCommentNode>>(`${comment.id}/replies`, {
      token: options.token,
      version: options.version,
      authMode: options.authMode,
      query: {
        fields: "id,text,username,from{id,username}",
        limit: String(options.pageSize),
        after,
      },
    });
    data.push(...(page.data ?? []));
    after = page.paging?.cursors?.after;
    if (!(page.data?.length ?? 0)) break;
  }
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

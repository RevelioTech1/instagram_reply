import { getSecrets, ownAccountIds, ownAccountNames, saveSecrets } from "./db.ts";
import { expiryFromNow, instagramErrorMessage } from "./ig-login.ts";
import {
  commentAuthor,
  findBusinessReply,
  isOwnAuthor,
  isTopLevelComment,
  type IgCommentNode,
} from "./ig-replies.ts";
import type { AuthMode } from "./types.ts";

type GraphError = { error?: { message?: string; code?: number; error_subcode?: number } };

export type RemoteComment = {
  id: string;
  text: string;
  username: string;
  userId?: string;
  timestamp?: string;
  mediaId: string;
  caption: string;
  permalink: string | null;
  mediaUrl: string | null;
  /** Public reply text from the shop account, when already answered in Instagram. */
  shopReplyText?: string | null;
  shopReplyId?: string | null;
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
    const base = instagramErrorMessage(payload, response.status);
    const code = payload.error?.code;
    const sub = payload.error?.error_subcode;
    const tagged =
      code != null || sub != null
        ? `[${[code, sub].filter((item) => item != null).join("/")}] ${base}`
        : base;
    throw new Error(tagged);
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

/** Newest posts to scan for inbox sync — raised to catch older viral posts with fresh comments. */
export const RECENT_MEDIA_LIMIT = 50;
/** Graph often returns ≤25 media per page; we page until RECENT_MEDIA_LIMIT. */
const MEDIA_PAGE_SIZE = 25;
/** Extra comment pages per post beyond the first embedded page (50 each). */
const MAX_COMMENT_PAGES_PER_MEDIA = 3;

const COMMENT_FIELDS =
  "id,text,username,timestamp,parent_id,from{id,username},replies.limit(50){id,text,username,from{id,username}}";

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
  return { names: ownAccountNames(), ids: ownAccountIds(), secrets };
}

export async function fetchRecentComments(): Promise<RemoteComment[]> {
  const { unreplied } = await collectCommentsFromMedia({ mediaLimit: RECENT_MEDIA_LIMIT });
  return unreplied;
}

export type ScanCommentHit = RemoteComment & { answeredOutside: boolean };

/**
 * Read the newest Instagram posts and split comments into unreplied vs already
 * answered publicly by the shop account (iordani925 / connected IG user).
 * Replies from other people do not count as answered — those stay unreplied.
 * Never walks the full feed.
 */
export async function collectCommentsFromMedia(options: {
  mediaLimit?: number;
  commentsPerMedia?: number;
  onMedia?: (info: { scanned: number; mediaId: string }) => void;
} = {}): Promise<{ unreplied: RemoteComment[]; answered: RemoteComment[]; mediaScanned: number }> {
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
  const maxMedia = Math.max(1, Math.min(options.mediaLimit ?? RECENT_MEDIA_LIMIT, RECENT_MEDIA_LIMIT));
  let scanned = 0;

  const mediaItems = await listRecentMedia({
    igUserId: secrets.igUserId,
    token,
    version,
    authMode: secrets.authMode,
    maxMedia,
    commentsPerMedia,
  });

  for (const media of mediaItems) {
    scanned += 1;
    options.onMedia?.({ scanned, mediaId: media.id });
    const nodes = await listMediaComments(media, {
      token,
      version,
      authMode: secrets.authMode,
      pageSize: commentsPerMedia,
    });
    for (const comment of nodes) {
      // Keep "+", "＋", etc. — only skip truly empty bodies.
      if (comment.text == null || !String(comment.text).trim()) continue;
      // /comments is top-level only; still skip nested replies if parent_id appears.
      if (!isTopLevelComment(comment)) continue;
      const author = commentAuthor(comment);
      if (isOwnAuthor(author, names, ids)) continue;
      const shopReply = findBusinessReply(comment, names, ids);
      const remote: RemoteComment = {
        id: comment.id,
        text: comment.text,
        username: author.username || "instagram",
        userId: author.id || undefined,
        timestamp: comment.timestamp,
        mediaId: media.id,
        caption: media.caption ?? "",
        permalink: media.permalink ?? null,
        mediaUrl: media.media_url ?? media.thumbnail_url ?? null,
        shopReplyText: shopReply?.text ?? null,
        shopReplyId: shopReply?.id ?? null,
      };
      if (shopReply) answered.push(remote);
      else unreplied.push(remote);
    }
  }

  return { unreplied, answered, mediaScanned: scanned };
}

async function listRecentMedia(options: {
  igUserId: string;
  token: string;
  version: string;
  authMode: AuthMode;
  maxMedia: number;
  commentsPerMedia: number;
}): Promise<MediaPageItem[]> {
  const collected: MediaPageItem[] = [];
  let after: string | undefined;
  while (collected.length < options.maxMedia) {
    const pageSize = Math.min(MEDIA_PAGE_SIZE, options.maxMedia - collected.length);
    const query: Record<string, string> = {
      fields: `id,caption,permalink,media_url,thumbnail_url,timestamp,comments.limit(${options.commentsPerMedia}){${COMMENT_FIELDS}}`,
      limit: String(pageSize),
    };
    if (after) query.after = after;
    const page = await graph<Paged<MediaPageItem>>(`${options.igUserId}/media`, {
      token: options.token,
      version: options.version,
      authMode: options.authMode,
      query,
    });
    const batch = page.data ?? [];
    collected.push(...batch);
    after = page.paging?.cursors?.after;
    if (!batch.length || !after) break;
  }
  return collected.slice(0, options.maxMedia);
}

async function listMediaComments(
  media: MediaPageItem,
  options: { token: string; version: string; authMode: AuthMode; pageSize: number },
): Promise<IgCommentNode[]> {
  const collected: IgCommentNode[] = [...(media.comments?.data ?? [])];
  let after = media.comments?.paging?.cursors?.after;
  let pages = 0;
  while (after && pages < MAX_COMMENT_PAGES_PER_MEDIA) {
    pages += 1;
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
  // Do not page /replies — that multiplies API calls and trips rate limits.
  // Brand replies usually appear in the first embedded replies.limit(50) page.
  return collected;
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

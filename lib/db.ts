import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { buildIndex, prepareProduct, type CatalogIndex } from "./catalog.ts";
import { mergeProductImages } from "./catalog-image.ts";
import type { CommentDTO, PostDTO, ProductDTO, SettingsDTO, StatsDTO } from "./dto.ts";
import { parsePriceSymbols } from "./intent.ts";
import { planComment } from "./plan.ts";
import { codeKey, normalize, tokens, translitKey } from "./text.ts";
import {
  DEFAULT_POLICY,
  DEFAULT_SECRETS,
  type IntentFlags,
  type Policy,
  type PreparedProduct,
  type PrimaryIntent,
  type RawProduct,
  type Secrets,
} from "./types.ts";
const require = createRequire(import.meta.url);
const { DatabaseSync: SqliteHandle } = require("node:sqlite") as typeof import("node:sqlite");
type SqliteHandle = InstanceType<typeof SqliteHandle>;

/** Bump when demo cleanup rules change. "0" = demos removed, never re-seeded. */
const DEMO_VERSION = "0";
/** Bump to wipe inbox once on deploy (old replies mixed into drafts). */
const INBOX_RESET_VERSION = "1";

type SqlRow = Record<string, unknown>;

const globalDb = globalThis as unknown as { __iordaniDb?: SqliteHandle };

function databasePath(): string {
  const dir = path.join(process.cwd(), "data");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "concierge.sqlite");
}

function db(): SqliteHandle {
  if (!globalDb.__iordaniDb) {
    const database = new SqliteHandle(databasePath());
    database.exec("pragma journal_mode = wal");
    migrate(database);
    importSnapshot(database);
    clearDemoContent(database);
    clearInboxOnce(database);
    globalDb.__iordaniDb = database;
  }
  return globalDb.__iordaniDb;
}

function migrate(database: SqliteHandle): void {
  database.exec(`
    create table if not exists products (
      url text primary key,
      sku_raw text not null,
      title text not null,
      price integer,
      image text,
      description text,
      availability text,
      props_json text not null,
      category text,
      category_slug text
    );
    create table if not exists posts (
      media_id text primary key,
      caption text not null default '',
      permalink text,
      media_url text,
      manual_code text,
      source text,
      created_at text not null
    );
    create table if not exists comments (
      id text primary key,
      media_id text not null,
      username text not null,
      text text not null,
      created_at text not null,
      source text not null,
      primary_intent text not null,
      flags_json text not null,
      status text not null,
      confidence real not null,
      reason text not null,
      product_urls_json text not null,
      reply_public text not null,
      reply_private text not null,
      reply_error text,
      delivery text not null default 'none',
      ig_reply_id text,
      replied_at text,
      manual_code text
    );
    create table if not exists settings (
      key text primary key,
      value text not null
    );
    create index if not exists comments_status on comments(status);
    create index if not exists comments_created on comments(created_at);
  `);
}

function setting(database: SqliteHandle, key: string): string | null {
  const row = database.prepare("select value from settings where key = ?").get(key) as SqlRow | undefined;
  return row ? String(row.value) : null;
}

function putSetting(database: SqliteHandle, key: string, value: string): void {
  database.prepare("insert into settings(key, value) values(?, ?) on conflict(key) do update set value = excluded.value").run(key, value);
}

function catalogFile(): string {
  return path.join(process.cwd(), "data", "catalog.json");
}

function importSnapshot(database: SqliteHandle): void {
  const file = catalogFile();
  if (!fs.existsSync(file)) return;
  const stat = fs.statSync(file);
  const stamp = `${stat.size}:${Math.round(stat.mtimeMs)}`;
  if (setting(database, "catalog_stamp") === stamp) return;
  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as RawProduct[];
  const insert = database.prepare(`
    insert into products(url, sku_raw, title, price, image, description, availability, props_json, category, category_slug)
    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  database.exec("begin");
  try {
    database.exec("delete from products");
    for (const item of raw) {
      if (!item.url || !item.title) continue;
      insert.run(
        item.url,
        item.skuRaw ?? item.title,
        item.title,
        item.price ?? null,
        item.image ?? null,
        item.description ?? "",
        item.availability ?? "unknown",
        JSON.stringify(item.props ?? {}),
        item.category ?? "",
        item.categorySlug ?? "",
      );
    }
    database.exec("commit");
  } catch (error) {
    database.exec("rollback");
    throw error;
  }
  putSetting(database, "catalog_stamp", stamp);
  invalidateCatalog();
}

/** Remove seeded demo posts/comments once; do not recreate them. */
function clearDemoContent(database: SqliteHandle): void {
  if (setting(database, "demo_version") === DEMO_VERSION) return;
  database.prepare("delete from comments where source = 'demo'").run();
  database.prepare("delete from posts where source = 'demo'").run();
  putSetting(database, "demo_version", DEMO_VERSION);
}

function clearInboxOnce(database: SqliteHandle): void {
  if (setting(database, "inbox_reset_version") === INBOX_RESET_VERSION) return;
  clearInboxTables(database);
  putSetting(database, "inbox_reset_version", INBOX_RESET_VERSION);
}

function clearInboxTables(database: SqliteHandle): { comments: number; posts: number } {
  const comments = database.prepare("delete from comments").run() as { changes?: number };
  const posts = database.prepare("delete from posts").run() as { changes?: number };
  return {
    comments: Number(comments.changes ?? 0),
    posts: Number(posts.changes ?? 0),
  };
}

/** Wipe all inbox comments and related posts so a fresh poll can refill them. */
export function clearInbox(): { comments: number; posts: number } {
  return clearInboxTables(db());
}

let catalogCache: CatalogIndex | null = null;

function invalidateCatalog(): void {
  catalogCache = null;
}

function readIndex(database: SqliteHandle): CatalogIndex {
  if (catalogCache) return catalogCache;
  const rows = database.prepare("select * from products").all() as SqlRow[];
  catalogCache = buildIndex(rows.map(rowToPrepared));
  return catalogCache;
}

export function getCatalogIndex(): CatalogIndex {
  return readIndex(db());
}

function rowToPrepared(row: SqlRow): PreparedProduct {
  const raw: RawProduct = {
    url: String(row.url),
    skuRaw: String(row.sku_raw),
    title: String(row.title),
    price: row.price == null ? null : Number(row.price),
    image: row.image == null ? null : String(row.image),
    description: String(row.description ?? ""),
    availability: String(row.availability ?? "unknown"),
    props: JSON.parse(String(row.props_json || "{}")) as Record<string, string>,
    category: String(row.category ?? ""),
    categorySlug: String(row.category_slug ?? ""),
  };
  return prepareProduct(raw);
}

export function toProductDTO(product: PreparedProduct): ProductDTO {
  return {
    url: product.url,
    code: product.code,
    title: product.title,
    name: product.name,
    kind: product.kind,
    price: product.price,
    image: product.image,
    category: product.category,
    categorySlug: product.categorySlug,
    metal: product.metal,
    size: product.size,
    weight: product.weight,
    width: product.width,
    coating: product.coating,
    collection: product.collection,
  };
}

function productsByUrls(urls: string[]): ProductDTO[] {
  const index = getCatalogIndex();
  return urls
    .map((url) => index.products.find((product) => product.url.replace(/\/+$/, "/") === url.replace(/\/+$/, "/")))
    .filter((product): product is PreparedProduct => Boolean(product))
    .map(toProductDTO);
}

function readPolicy(database: SqliteHandle): Policy {
  const raw = setting(database, "policy");
  if (!raw) return { ...DEFAULT_POLICY };
  return { ...DEFAULT_POLICY, ...(JSON.parse(raw) as Partial<Policy>) };
}

function readSecrets(database: SqliteHandle): Secrets {
  const raw = setting(database, "secrets");
  const secrets = { ...DEFAULT_SECRETS, ...(raw ? (JSON.parse(raw) as Partial<Secrets>) : {}) };
  if (!secrets.verifyToken) {
    secrets.verifyToken = crypto.randomBytes(18).toString("hex");
    putSetting(database, "secrets", JSON.stringify(secrets));
  }
  if (!secrets.igUsername) secrets.igUsername = "iordani925";
  return secrets;
}

export function getPolicy(): Policy {
  return readPolicy(db());
}

export function getSecrets(): Secrets {
  return readSecrets(db());
}

export function savePolicy(patch: Partial<Policy>): Policy {
  const next = { ...getPolicy(), ...patch };
  next.minConfidence = Math.min(0.99, Math.max(0.5, Number(next.minConfidence) || 0.82));
  next.phone = String(next.phone || DEFAULT_POLICY.phone).trim();
  next.siteLink = String(next.siteLink || DEFAULT_POLICY.siteLink).trim() || DEFAULT_POLICY.siteLink;
  next.address = String(next.address ?? "").trim();
  next.timetable = String(next.timetable || DEFAULT_POLICY.timetable).trim() || DEFAULT_POLICY.timetable;
  next.publicTemplate = String(next.publicTemplate || DEFAULT_POLICY.publicTemplate).trim() || DEFAULT_POLICY.publicTemplate;
  next.privateTemplate =
    String(next.privateTemplate || DEFAULT_POLICY.privateTemplate).trim() || DEFAULT_POLICY.privateTemplate;
  next.dmClosedTemplate =
    String(next.dmClosedTemplate || DEFAULT_POLICY.dmClosedTemplate).trim() || DEFAULT_POLICY.dmClosedTemplate;
  next.priceSymbols = parsePriceSymbols(
    Array.isArray(next.priceSymbols) ? next.priceSymbols.join("\n") : DEFAULT_POLICY.priceSymbols.join("\n"),
  );
  next.reactToPraise = Boolean(next.reactToPraise);
  next.praiseReplies = (Array.isArray(next.praiseReplies) ? next.praiseReplies : DEFAULT_POLICY.praiseReplies)
    .map((item) => String(item).trim())
    .filter(Boolean)
    .slice(0, 8);
  putSetting(db(), "policy", JSON.stringify(next));
  return next;
}

export function saveSecrets(patch: Partial<Secrets>): Secrets {
  const current = getSecrets();
  const next: Secrets = { ...current };
  if (patch.accessToken) next.accessToken = patch.accessToken.trim();
  if (patch.appSecret) next.appSecret = patch.appSecret.trim();
  if (patch.verifyToken) next.verifyToken = patch.verifyToken.trim();
  if (patch.igUserId) next.igUserId = patch.igUserId.trim();
  if (patch.igUsername) next.igUsername = patch.igUsername.replace(/^@/, "").trim();
  if (patch.graphVersion) next.graphVersion = patch.graphVersion.trim();
  if (patch.igAppSecret) next.igAppSecret = patch.igAppSecret.trim();
  if (patch.igAppId !== undefined) next.igAppId = patch.igAppId.trim();
  if (patch.authMode === "instagram" || patch.authMode === "facebook" || patch.authMode === "") {
    next.authMode = patch.authMode;
  }
  if (patch.tokenExpiresAt !== undefined) next.tokenExpiresAt = patch.tokenExpiresAt;
  if (patch.oauthState !== undefined) next.oauthState = patch.oauthState;
  if (patch.oauthRedirect !== undefined) next.oauthRedirect = patch.oauthRedirect;
  if (patch.publicOrigin !== undefined) next.publicOrigin = patch.publicOrigin.trim().replace(/\/$/, "");
  putSetting(db(), "secrets", JSON.stringify(next));
  return next;
}

export function disconnectInstagram(): Secrets {
  const next = getSecrets();
  next.accessToken = "";
  next.tokenExpiresAt = "";
  next.oauthState = "";
  next.oauthRedirect = "";
  next.authMode = "";
  putSetting(db(), "secrets", JSON.stringify(next));
  return next;
}

export function clearSecret(key: "accessToken" | "appSecret"): void {
  const next = getSecrets();
  next[key] = "";
  putSetting(db(), "secrets", JSON.stringify(next));
}

export function getCatalogSyncedAt(): string | null {
  return setting(db(), "catalog_synced_at");
}

export function getSettingsDTO(): SettingsDTO {
  const policy = getPolicy();
  const secrets = getSecrets();
  return {
    ...policy,
    hasAccessToken: Boolean(secrets.accessToken),
    accessTokenHint: hint(secrets.accessToken),
    hasAppSecret: Boolean(secrets.appSecret),
    verifyToken: secrets.verifyToken,
    igUserId: secrets.igUserId,
    igUsername: secrets.igUsername,
    graphVersion: secrets.graphVersion,
    authMode: secrets.authMode,
    igAppId: secrets.igAppId,
    hasIgAppSecret: Boolean(secrets.igAppSecret),
    tokenExpiresAt: secrets.tokenExpiresAt,
    publicOrigin: secrets.publicOrigin,
    catalogSyncedAt: getCatalogSyncedAt() ?? "",
  };
}

function hint(value: string): string {
  if (!value) return "";
  return `•••• ${value.slice(-4)}`;
}

export function getStats(): StatsDTO {
  const database = db();
  const count = (status?: string) => {
    const row = (
      status
        ? database.prepare("select count(*) as n from comments where status = ?").get(status)
        : database.prepare("select count(*) as n from comments").get()
    ) as SqlRow;
    return Number(row.n);
  };
  const products = database.prepare("select count(*) as n from products").get() as SqlRow;
  const secrets = getSecrets();
  return {
    products: Number(products.n),
    waiting: count("draft") + count("failed"),
    review: count("needs_review"),
    replied: count("replied"),
    skipped: count("skipped"),
    connected: Boolean(secrets.accessToken && secrets.igUserId),
    username: secrets.igUsername || "iordani925",
    autoReply: getPolicy().autoReply,
  };
}

export function listComments(status?: string | null): CommentDTO[] {
  const database = db();
  const rows = (
    status
      ? database.prepare("select * from comments where status = ? order by created_at desc").all(status)
      : database.prepare("select * from comments order by created_at desc").all()
  ) as SqlRow[];
  return rows.map(commentFromRow);
}

export function getComment(id: string): CommentDTO | null {
  const row = db().prepare("select * from comments where id = ?").get(id) as SqlRow | undefined;
  return row ? commentFromRow(row) : null;
}

export function deleteComment(id: string): boolean {
  const result = db().prepare("delete from comments where id = ?").run(id) as { changes?: number };
  return Number(result.changes ?? 0) > 0;
}

/** Drop posts that no longer have any stored comments. */
export function deleteOrphanPosts(): number {
  const result = db()
    .prepare("delete from posts where media_id not in (select distinct media_id from comments)")
    .run() as { changes?: number };
  return Number(result.changes ?? 0);
}

function commentFromRow(row: SqlRow): CommentDTO {
  const post = getPost(String(row.media_id));
  return {
    id: String(row.id),
    mediaId: String(row.media_id),
    username: String(row.username),
    text: String(row.text),
    createdAt: String(row.created_at),
    source: String(row.source),
    primaryIntent: String(row.primary_intent) as PrimaryIntent,
    flags: JSON.parse(String(row.flags_json)) as IntentFlags,
    status: String(row.status) as CommentDTO["status"],
    confidence: Number(row.confidence),
    reason: String(row.reason),
    products: productsByUrls(JSON.parse(String(row.product_urls_json)) as string[]),
    replyPublic: String(row.reply_public ?? ""),
    replyPrivate: String(row.reply_private ?? ""),
    replyError: row.reply_error == null ? null : String(row.reply_error),
    delivery: String(row.delivery ?? "none") as CommentDTO["delivery"],
    igReplyId: row.ig_reply_id == null ? null : String(row.ig_reply_id),
    repliedAt: row.replied_at == null ? null : String(row.replied_at),
    post: post ?? {
      mediaId: String(row.media_id),
      caption: "",
      permalink: null,
      mediaUrl: null,
      manualCode: null,
      source: "",
      createdAt: String(row.created_at),
      commentCount: 0,
    },
  };
}

export function getPost(mediaId: string): PostDTO | null {
  const row = db().prepare("select * from posts where media_id = ?").get(mediaId) as SqlRow | undefined;
  if (!row) return null;
  const count = db().prepare("select count(*) as n from comments where media_id = ?").get(mediaId) as SqlRow;
  return postFromRow(row, Number(count.n));
}

function postFromRow(row: SqlRow, commentCount: number): PostDTO {
  return {
    mediaId: String(row.media_id),
    caption: String(row.caption ?? ""),
    permalink: row.permalink == null ? null : String(row.permalink),
    mediaUrl: row.media_url == null ? null : String(row.media_url),
    manualCode: row.manual_code == null ? null : String(row.manual_code),
    source: String(row.source ?? ""),
    createdAt: String(row.created_at),
    commentCount,
  };
}

export function listPosts(): PostDTO[] {
  const rows = db().prepare("select * from posts order by created_at desc").all() as SqlRow[];
  return rows.map((row) => {
    const count = db().prepare("select count(*) as n from comments where media_id = ?").get(row.media_id) as SqlRow;
    return postFromRow(row, Number(count.n));
  });
}

export function ensurePost(input: {
  mediaId: string;
  caption?: string;
  permalink?: string | null;
  mediaUrl?: string | null;
  source: string;
  manualCode?: string | null;
}): PostDTO {
  const database = db();
  const existing = database.prepare("select * from posts where media_id = ?").get(input.mediaId) as SqlRow | undefined;
  if (!existing) {
    database
      .prepare(
        "insert into posts(media_id, caption, permalink, media_url, manual_code, source, created_at) values (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        input.mediaId,
        input.caption ?? "",
        input.permalink ?? null,
        input.mediaUrl ?? null,
        input.manualCode ?? null,
        input.source,
        new Date().toISOString(),
      );
  } else if (input.caption || input.permalink || input.mediaUrl) {
    database
      .prepare(
        "update posts set caption = coalesce(?, caption), permalink = coalesce(?, permalink), media_url = coalesce(?, media_url) where media_id = ?",
      )
      .run(input.caption ?? null, input.permalink ?? null, input.mediaUrl ?? null, input.mediaId);
  }
  return getPost(input.mediaId)!;
}

export function setPostManualCode(mediaId: string, manualCode: string | null): PostDTO | null {
  const database = db();
  database.prepare("update posts set manual_code = ? where media_id = ?").run(manualCode || null, mediaId);
  return getPost(mediaId);
}

export type StoredPlan = {
  id: string;
  mediaId: string;
  username: string;
  text: string;
  createdAt: string;
  source: string;
  manualCode?: string | null;
};

export function insertPlanned(input: StoredPlan & ReturnType<typeof planComment>): CommentDTO {
  db()
    .prepare(
      `insert into comments(
        id, media_id, username, text, created_at, source, primary_intent, flags_json, status,
        confidence, reason, product_urls_json, reply_public, reply_private, reply_error, delivery, manual_code
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, null, 'none', ?)`,
    )
    .run(
      input.id,
      input.mediaId,
      input.username,
      input.text,
      input.createdAt,
      input.source,
      input.primary,
      JSON.stringify(input.flags),
      input.status === "send" ? "draft" : input.status,
      input.confidence,
      input.reason,
      JSON.stringify(input.products.map((product) => product.url)),
      input.replyPublic,
      input.replyPrivate,
      input.manualCode ?? null,
    );
  return getComment(input.id)!;
}

export function saveCommentPlan(id: string, plan: ReturnType<typeof planComment>, status?: CommentDTO["status"]): void {
  db()
    .prepare(
      `update comments set primary_intent = ?, flags_json = ?, status = ?, confidence = ?, reason = ?,
        product_urls_json = ?, reply_public = ?, reply_private = ?, reply_error = null, delivery = 'none', replied_at = null
       where id = ?`,
    )
    .run(
      plan.primary,
      JSON.stringify(plan.flags),
      status ?? (plan.status === "send" ? "draft" : plan.status),
      plan.confidence,
      plan.reason,
      JSON.stringify(plan.products.map((product) => product.url)),
      plan.replyPublic,
      plan.replyPrivate,
      id,
    );
}

export function updateReplies(id: string, replyPublic: string, replyPrivate: string): CommentDTO | null {
  const current = getComment(id);
  if (!current) return null;
  const hasText = Boolean(replyPublic.trim() || replyPrivate.trim());
  // Manual reply on a bot-skipped reaction: move back into the waiting queue.
  if (current.status === "skipped" && hasText) {
    db()
      .prepare(
        "update comments set reply_public = ?, reply_private = ?, status = 'draft', reason = ? where id = ?",
      )
      .run(replyPublic, replyPrivate, "Ответ введён вручную после пропуска ботом.", id);
  } else {
    db().prepare("update comments set reply_public = ?, reply_private = ? where id = ?").run(replyPublic, replyPrivate, id);
  }
  return getComment(id);
}

export function markDelivery(
  id: string,
  patch: {
    status: CommentDTO["status"];
    delivery: CommentDTO["delivery"];
    replyError: string | null;
    igReplyId?: string | null;
    replyPublic?: string;
    reason?: string;
  },
): CommentDTO | null {
  const current = getComment(id);
  if (!current) return null;
  db()
    .prepare(
      `update comments set status = ?, delivery = ?, reply_error = ?, ig_reply_id = ?, replied_at = ?,
        reply_public = ?, reason = coalesce(?, reason) where id = ?`,
    )
    .run(
      patch.status,
      patch.delivery,
      patch.replyError,
      patch.igReplyId ?? null,
      patch.status === "replied" ? new Date().toISOString() : null,
      patch.replyPublic !== undefined ? patch.replyPublic : current.replyPublic,
      patch.reason ?? null,
      id,
    );
  return getComment(id);
}

export function skipComment(id: string): CommentDTO | null {
  db()
    .prepare("update comments set status = 'skipped', reply_error = null, reason = ? where id = ?")
    .run("Отметили, что отвечать не нужно.", id);
  return getComment(id);
}

export function replanComment(id: string, manualCode?: string | null): CommentDTO | null {
  const current = getComment(id);
  if (!current) return null;
  if (manualCode !== undefined) {
    db().prepare("update comments set manual_code = ? where id = ?").run(manualCode || null, id);
  }
  const row = db().prepare("select manual_code from comments where id = ?").get(id) as SqlRow;
  const plan = planComment({
    comment: current.text,
    caption: current.post.caption,
    manualCode: (row.manual_code as string | null) || current.post.manualCode,
    catalog: getCatalogIndex(),
    policy: getPolicy(),
  });
  saveCommentPlan(id, plan, plan.status === "skipped" ? "skipped" : plan.status === "needs_review" ? "needs_review" : "draft");
  return getComment(id);
}

export function replaceProducts(items: RawProduct[]): number {
  const database = db();
  const previousRows = database.prepare("select url, image from products").all() as SqlRow[];
  const previousByUrl = new Map(
    previousRows.map((row) => [String(row.url), row.image == null ? null : String(row.image)] as const),
  );
  const merged = mergeProductImages(items, previousByUrl);
  const insert = database.prepare(`
    insert into products(url, sku_raw, title, price, image, description, availability, props_json, category, category_slug)
    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  database.exec("begin");
  try {
    database.exec("delete from products");
    for (const item of merged) {
      insert.run(
        item.url,
        item.skuRaw,
        item.title,
        item.price,
        item.image,
        item.description,
        item.availability,
        JSON.stringify(item.props),
        item.category,
        item.categorySlug,
      );
    }
    database.exec("commit");
  } catch (error) {
    database.exec("rollback");
    throw error;
  }
  const file = catalogFile();
  fs.writeFileSync(file, JSON.stringify(merged));
  const stat = fs.statSync(file);
  putSetting(database, "catalog_stamp", `${stat.size}:${Math.round(stat.mtimeMs)}`);
  putSetting(database, "catalog_synced_at", new Date().toISOString());
  invalidateCatalog();
  return merged.length;
}

export function searchProducts(
  query: string,
  category: string | null,
  limit = 48,
  offset = 0,
): { products: ProductDTO[]; total: number } {
  const index = getCatalogIndex();
  const needle = normalize(query);
  const key = codeKey(query);
  const translit = translitKey(query);
  const words = tokens(query);
  let items = index.products;
  if (category) items = items.filter((product) => product.categorySlug === category);
  const ranked = !needle
    ? items
        .slice()
        .sort((a, b) => a.category.localeCompare(b.category, "ru") || a.title.localeCompare(b.title, "ru"))
    : items
        .map((product) => {
          let score = 0;
          if (product.codeKey === key || product.translitKey === translit) score += 120;
          else if (key.length >= 3 && (product.codeKey.includes(key) || product.translitKey.includes(translit))) {
            score += 50;
          }
          if (needle.length > 2 && product.searchText.includes(needle)) score += 25;
          if (words.length > 0 && words.every((word) => product.searchText.includes(word))) score += 15;
          return { product, score };
        })
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score || a.product.title.localeCompare(b.product.title, "ru"))
        .map((item) => item.product);
  const start = Math.max(0, offset);
  const pageSize = Math.max(1, limit);
  return {
    total: ranked.length,
    products: ranked.slice(start, start + pageSize).map(toProductDTO),
  };
}

export function listCategories(): Array<{ slug: string; name: string; count: number }> {
  const rows = db()
    .prepare(
      "select category_slug as slug, category as name, count(*) as count from products group by category_slug order by count desc",
    )
    .all() as SqlRow[];
  return rows.map((row) => ({ slug: String(row.slug), name: String(row.name), count: Number(row.count) }));
}

export function ownAccountNames(): string[] {
  const secrets = getSecrets();
  return ["iordani925", secrets.igUsername].map((name) => name.replace(/^@/, "")).filter(Boolean);
}

export function ownAccountIds(): string[] {
  const id = getSecrets().igUserId;
  return id ? [String(id)] : [];
}

export function isOwnAccount(username: string, userId?: string | null): boolean {
  const name = username.replace(/^@/, "").toLowerCase();
  const names = new Set(ownAccountNames().map((item) => item.toLowerCase()));
  if (name && names.has(name)) return true;
  if (userId && ownAccountIds().includes(String(userId))) return true;
  return false;
}

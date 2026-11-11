import crypto from "node:crypto";
import {
  ensurePost,
  getCatalogIndex,
  getComment,
  getPolicy,
  getSecrets,
  insertPlanned,
  isOwnAccount,
  markDelivery,
  type StoredPlan,
} from "./db.ts";
import { fetchMedia, publishPrivateReply, publishPublicReply } from "./instagram.ts";
import { planComment } from "./plan.ts";
import { buildDmClosedReply } from "./reply.ts";
import { isDmUnavailableError } from "./templates.ts";
import type { CommentDTO } from "./dto.ts";

export type IncomingComment = {
  id: string;
  mediaId: string;
  username: string;
  userId?: string | null;
  text: string;
  createdAt?: string;
  source: "webhook" | "poll" | "simulator" | "demo";
  caption?: string;
  permalink?: string | null;
  mediaUrl?: string | null;
};

export async function ingestComment(
  input: IncomingComment,
  options: { autoDeliver?: boolean } = {},
): Promise<CommentDTO | null> {
  const autoDeliver = options.autoDeliver !== false;
  const username = input.username.replace(/^@/, "") || "instagram";
  if (isOwnAccount(username, input.userId)) return null;
  const existing = getComment(input.id);
  if (existing) return existing;

  let caption = input.caption ?? "";
  let permalink = input.permalink ?? null;
  let mediaUrl = input.mediaUrl ?? null;
  if (!caption && input.source !== "simulator" && input.source !== "demo") {
    const media = await fetchMedia(input.mediaId).catch(() => null);
    if (media) {
      caption = media.caption;
      permalink = media.permalink;
      mediaUrl = media.mediaUrl;
    }
  }
  const post = ensurePost({
    mediaId: input.mediaId,
    caption,
    permalink,
    mediaUrl,
    source: input.source,
  });
  const plan = planComment({
    comment: input.text,
    caption: post.caption,
    manualCode: post.manualCode,
    catalog: getCatalogIndex(),
    policy: getPolicy(),
  });
  const stored: StoredPlan = {
    id: input.id,
    mediaId: input.mediaId,
    username,
    text: input.text.trim(),
    createdAt: input.createdAt ?? new Date().toISOString(),
    source: input.source,
  };
  try {
    insertPlanned({ ...stored, ...plan });
  } catch {
    return getComment(input.id);
  }
  if (autoDeliver && plan.status === "send") return deliverComment(input.id);
  return getComment(input.id);
}

/**
 * Keep comments already answered by the shop in Instagram: ingest if missing,
 * then mark status «Ответили» instead of deleting them from the inbox.
 */
export async function syncShopAnsweredComment(input: IncomingComment & {
  shopReplyText?: string | null;
  shopReplyId?: string | null;
}): Promise<{ comment: CommentDTO | null; changed: boolean }> {
  const before = getComment(input.id);
  if (before?.status === "replied" && (before.delivery === "instagram" || before.delivery === "local")) {
    return { comment: before, changed: false };
  }

  let comment = before;
  if (!comment) {
    comment = await ingestComment(input, { autoDeliver: false });
  }
  if (!comment) return { comment: null, changed: false };

  const replyPublic = (input.shopReplyText ?? "").trim() || comment.replyPublic;
  return {
    comment: markDelivery(comment.id, {
      status: "replied",
      delivery: "instagram",
      replyError: null,
      igReplyId: input.shopReplyId ?? comment.igReplyId,
      replyPublic: replyPublic || undefined,
      reason: "В Instagram уже есть публичный ответ от магазина.",
    }),
    changed: true,
  };
}

/**
 * Send Direct first (full answer with price + clickable link). Then post a short
 * public comment without price. If Direct is closed/unreachable, post the
 * dm-closed template under the comment instead.
 */
export async function deliverComment(id: string): Promise<CommentDTO | null> {
  const comment = getComment(id);
  if (!comment) return null;
  if (!comment.replyPublic && !comment.replyPrivate) {
    return markDelivery(id, {
      status: "failed",
      delivery: "none",
      replyError: "Нет текста ответа.",
    });
  }
  if (comment.source === "demo" || comment.source === "simulator" || !/^\d+$/.test(comment.id)) {
    return markDelivery(id, {
      status: "replied",
      delivery: "local",
      replyError: null,
      igReplyId: "local",
    });
  }
  const secrets = getSecrets();
  const policy = getPolicy();
  if (!secrets.accessToken) {
    return markDelivery(id, {
      status: "draft",
      delivery: "none",
      replyError: "Ответ готов. Добавьте токен Instagram в настройках, чтобы отправить его.",
    });
  }

  const errors: string[] = [];
  let publicId: string | null = null;
  let sent = false;
  let publicText = comment.replyPublic;
  let dmClosed = false;

  if (policy.privateReply && comment.replyPrivate.trim()) {
    try {
      await publishPrivateReply(comment.id, comment.replyPrivate);
      sent = true;
    } catch (error) {
      if (isDmUnavailableError(error)) {
        dmClosed = true;
        publicText = buildDmClosedReply({ products: comment.products, policy });
      } else {
        errors.push(`директ: ${readable(error)}`);
      }
    }
  }

  if (policy.publicReply) {
    const text = (dmClosed ? publicText : comment.replyPublic).trim();
    if (text) {
      try {
        publicId = await publishPublicReply(comment.id, text);
        sent = true;
      } catch (error) {
        errors.push(`комментарий: ${readable(error)}`);
      }
    }
  }

  if (!policy.publicReply && !policy.privateReply) {
    errors.push("в настройках выключены и комментарий, и директ");
  }

  return markDelivery(id, {
    status: sent ? "replied" : "failed",
    delivery: sent ? "instagram" : "none",
    replyError: errors.length
      ? errors.join("; ")
      : dmClosed
        ? "Директ недоступен — в комментарий ушёл текст про закрытый директ."
        : null,
    igReplyId: publicId,
    replyPublic: dmClosed ? publicText : undefined,
    reason: dmClosed ? "Директ закрыт: опубликовали запасной комментарий без цены." : undefined,
  });
}

export function simulatorId(): string {
  return `sim-${crypto.randomUUID()}`;
}

function readable(error: unknown): string {
  const message = error instanceof Error ? error.message : "неизвестная ошибка";
  if (/access token|OAuth/i.test(message)) return "токен отклонён";
  if (/permission/i.test(message)) return "у токена нет права отвечать на комментарии";
  if (isDmUnavailableError(error)) return "директ закрыт или человек не принимает сообщения";
  return message;
}

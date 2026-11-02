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

export async function ingestComment(input: IncomingComment): Promise<CommentDTO | null> {
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
  if (plan.status === "send") return deliverComment(input.id);
  return getComment(input.id);
}

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
  if (policy.publicReply && comment.replyPublic) {
    try {
      publicId = await publishPublicReply(comment.id, comment.replyPublic);
      sent = true;
    } catch (error) {
      errors.push(`комментарий: ${readable(error)}`);
    }
  }
  if (policy.privateReply && comment.replyPrivate) {
    try {
      await publishPrivateReply(comment.id, comment.replyPrivate);
      sent = true;
    } catch (error) {
      errors.push(`директ: ${readable(error)}`);
    }
  }
  if (!policy.publicReply && !policy.privateReply) {
    errors.push("в настройках выключены и комментарий, и директ");
  }
  return markDelivery(id, {
    status: sent ? "replied" : "failed",
    delivery: sent ? "instagram" : "none",
    replyError: errors.length ? errors.join("; ") : null,
    igReplyId: publicId,
  });
}

export function simulatorId(): string {
  return `sim-${crypto.randomUUID()}`;
}

function readable(error: unknown): string {
  const message = error instanceof Error ? error.message : "неизвестная ошибка";
  if (/access token|OAuth/i.test(message)) return "токен отклонён";
  if (/permission/i.test(message)) return "у токена нет права отвечать на комментарии";
  return message;
}

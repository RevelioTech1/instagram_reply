import type { IntentFlags, PrimaryIntent } from "./types.ts";

export type ProductDTO = {
  url: string;
  code: string;
  title: string;
  name: string;
  kind: string;
  price: number | null;
  image: string | null;
  category: string;
  categorySlug: string;
  metal: string;
  size: string;
  weight: string;
  width: string;
  coating: string;
  collection: string;
};

export type PostDTO = {
  mediaId: string;
  caption: string;
  permalink: string | null;
  mediaUrl: string | null;
  manualCode: string | null;
  source: string;
  createdAt: string;
  commentCount: number;
};

export type CommentDTO = {
  id: string;
  mediaId: string;
  username: string;
  text: string;
  createdAt: string;
  source: string;
  primaryIntent: PrimaryIntent;
  flags: IntentFlags;
  status: "skipped" | "draft" | "needs_review" | "replied" | "failed";
  confidence: number;
  reason: string;
  products: ProductDTO[];
  replyPublic: string;
  replyPrivate: string;
  replyError: string | null;
  delivery: "none" | "local" | "instagram";
  igReplyId: string | null;
  repliedAt: string | null;
  post: PostDTO;
};

export type SettingsDTO = {
  autoReply: boolean;
  publicReply: boolean;
  privateReply: boolean;
  minConfidence: number;
  includePrice: boolean;
  phone: string;
  priceSymbols: string[];
  reactToPraise: boolean;
  praiseReplies: string[];
  hasAccessToken: boolean;
  accessTokenHint: string;
  hasAppSecret: boolean;
  verifyToken: string;
  igUserId: string;
  igUsername: string;
  graphVersion: string;
  authMode: "" | "instagram" | "facebook";
  igAppId: string;
  hasIgAppSecret: boolean;
  tokenExpiresAt: string;
  publicOrigin: string;
};

export type StatsDTO = {
  products: number;
  waiting: number;
  review: number;
  replied: number;
  skipped: number;
  connected: boolean;
  username: string;
  autoReply: boolean;
};

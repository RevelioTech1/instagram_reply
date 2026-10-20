import type { CatalogIndex } from "./catalog.ts";
import { classifyIntent, isCommercial } from "./intent.ts";
import { matchComment } from "./match.ts";
import { buildReplies } from "./reply.ts";
import type { IntentFlags, Policy, PreparedProduct, PrimaryIntent } from "./types.ts";

export type Plan = {
  flags: IntentFlags;
  primary: PrimaryIntent;
  status: "skipped" | "draft" | "needs_review" | "send";
  confidence: number;
  reason: string;
  products: PreparedProduct[];
  context: PreparedProduct | null;
  replyPublic: string;
  replyPrivate: string;
};

export function planComment(options: {
  comment: string;
  caption: string;
  manualCode?: string | null;
  catalog: CatalogIndex;
  policy: Policy;
}): Plan {
  const { flags, primary } = classifyIntent(options.comment, options.policy.priceSymbols);
  if (primary === "none") {
    return {
      flags,
      primary,
      status: "skipped",
      confidence: 1,
      reason: "Это реакция без вопроса о цене, заказе или карточке.",
      products: [],
      context: null,
      replyPublic: "",
      replyPrivate: "",
    };
  }

  const match = matchComment({
    comment: options.comment,
    caption: options.caption,
    manualCode: options.manualCode,
    catalog: options.catalog,
  });
  const replies = buildReplies({
    flags,
    products: match.products,
    context: match.context,
    categorySlug: match.categorySlug,
    ambiguousLabel: match.ambiguousLabel,
    includePrice: options.policy.includePrice,
    phone: options.policy.phone,
  });
  const commercial = isCommercial(flags);
  let status: Plan["status"] = "draft";
  if (!commercial) status = "needs_review";
  else if (match.confidence < options.policy.minConfidence) status = "needs_review";
  else if (options.policy.autoReply) status = "send";

  return {
    flags,
    primary,
    status,
    confidence: match.confidence,
    reason: match.reason,
    products: match.products,
    context: match.context,
    replyPublic: replies.publicReply,
    replyPrivate: replies.privateReply,
  };
}

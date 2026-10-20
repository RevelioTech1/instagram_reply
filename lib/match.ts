import { lookupCode, type CatalogIndex } from "./catalog.ts";
import type { PreparedProduct } from "./types.ts";
import { categoryHint, extractCodes, normalize, tokens } from "./text.ts";

export type MatchResult = {
  products: PreparedProduct[];
  context: PreparedProduct | null;
  confidence: number;
  reason: string;
  categorySlug: string | null;
  ambiguousLabel: string | null;
};

export function matchComment(options: {
  comment: string;
  caption: string;
  manualCode?: string | null;
  catalog: CatalogIndex;
}): MatchResult {
  const commentCodes = resolveCodes(options.comment, options.catalog);
  const captionCodes = resolveCodes(options.caption, options.catalog);
  const manual = options.manualCode
    ? dedupe(lookupCode(options.catalog, options.manualCode))
    : [];
  const hint = categoryHint(options.comment);
  const text = `${options.caption}\n${options.comment}`;

  if (commentCodes.length > 0) {
    const narrowed = narrow(commentCodes, text, hint);
    return finish(narrowed, hint, "Артикул указан в комментарии.", null, 0.99);
  }

  if (manual.length > 0 && !conflicts(manual, hint)) {
    const narrowed = narrow(manual, text, hint);
    return finish(narrowed, hint, "Изделие привязано к посту вручную.", null, 0.97);
  }

  if (captionCodes.length > 0) {
    const filtered = hint ? captionCodes.filter((product) => product.categorySlug === hint) : captionCodes;
    if (filtered.length > 0) {
      const narrowed = narrow(filtered, text, hint);
      const context = narrowed.products[0] ?? null;
      return finish(
        narrowed,
        hint,
        filtered.length === captionCodes.length
          ? "Артикул найден в подписи поста."
          : "В комментарии назван другой тип изделия, он есть в подписи.",
        null,
        narrowed.products.length === 1 ? 0.93 : 0.88,
        context,
      );
    }
    const context = narrow(captionCodes, options.caption, null).products[0] ?? captionCodes[0] ?? null;
    const sameStory = hint
      ? fuzzy(options.catalog, text, hint, 1)
      : { products: [], ambiguousLabel: null, confidence: 0 };
    if (sameStory.products.length > 0) {
      return {
        products: sameStory.products,
        context,
        confidence: sameStory.products.length === 1 ? 0.84 : 0.8,
        reason: "В комментарии другой тип изделия. Нашлись близкие карточки в каталоге.",
        categorySlug: hint,
        ambiguousLabel: null,
      };
    }
    return {
      products: [],
      context,
      confidence: 0.86,
      reason: "В комментарии другой тип изделия, отдельной карточки в подписи нет.",
      categorySlug: hint,
      ambiguousLabel: null,
    };
  }

  const fuzzyResult = fuzzy(options.catalog, text, hint, 4);
  if (fuzzyResult.products.length === 1) {
    return {
      products: fuzzyResult.products,
      context: null,
      confidence: 0.86,
      reason: "Название из комментария или подписи совпало с карточкой.",
      categorySlug: hint,
      ambiguousLabel: null,
    };
  }
  if (fuzzyResult.products.length > 1) {
    return {
      products: fuzzyResult.products,
      context: null,
      confidence: 0.88,
      reason: "Название совпало с несколькими карточками.",
      categorySlug: hint,
      ambiguousLabel: null,
    };
  }
  return {
    products: [],
    context: null,
    confidence: 0.9,
    reason: fuzzyResult.ambiguousLabel
      ? "Такое название есть у многих изделий."
      : "В тексте нет артикула и точного названия.",
    categorySlug: hint,
    ambiguousLabel: fuzzyResult.ambiguousLabel,
  };
}

function resolveCodes(text: string, catalog: CatalogIndex): PreparedProduct[] {
  const found: PreparedProduct[] = [];
  for (const code of extractCodes(text)) {
    for (const product of lookupCode(catalog, code)) {
      if (!found.some((item) => item.url === product.url)) found.push(product);
    }
  }
  return found;
}

function conflicts(products: PreparedProduct[], hint: string | null): boolean {
  if (!hint || products.length === 0) return false;
  return products.every((product) => product.categorySlug !== hint);
}

function narrow(
  products: PreparedProduct[],
  text: string,
  hint: string | null,
): { products: PreparedProduct[]; listed: boolean } {
  const pool = hint ? products.filter((product) => product.categorySlug === hint) : products;
  const source = pool.length > 0 ? pool : products;
  if (source.length <= 1) return { products: source, listed: false };
  const ranked = source
    .map((product) => ({ product, score: nameScore(product, text) }))
    .sort((a, b) => b.score - a.score || a.product.code.localeCompare(b.product.code, "ru"));
  const best = ranked[0]?.score ?? 0;
  const second = ranked[1]?.score ?? 0;
  if (best >= 4 && best >= second + 2) return { products: [ranked[0].product], listed: false };
  const rankedProducts = ranked.map((item) => item.product);
  const rest = source.filter((product) => !rankedProducts.includes(product));
  return { products: [...rankedProducts, ...rest].slice(0, 4), listed: true };
}

function finish(
  narrowed: { products: PreparedProduct[] },
  hint: string | null,
  reason: string,
  ambiguousLabel: string | null,
  confidence: number,
  context: PreparedProduct | null = null,
): MatchResult {
  const products = narrowed.products.slice(0, 4);
  return {
    products,
    context: context ?? products[0] ?? null,
    confidence: products.length === 1 ? confidence : Math.min(confidence, 0.88),
    reason,
    categorySlug: hint,
    ambiguousLabel,
  };
}

function fuzzy(
  catalog: CatalogIndex,
  text: string,
  hint: string | null,
  tieLimit: number,
): { products: PreparedProduct[]; ambiguousLabel: string | null; confidence: number } {
  const pool = hint ? catalog.products.filter((product) => product.categorySlug === hint) : catalog.products;
  const ranked = pool
    .map((product) => ({ product, score: nameScore(product, text) }))
    .filter((item) => item.score >= 4)
    .sort((a, b) => b.score - a.score || a.product.title.localeCompare(b.product.title, "ru"));
  if (ranked.length === 0) return { products: [], ambiguousLabel: null, confidence: 0 };
  const best = ranked[0].score;
  const tied = ranked.filter((item) => item.score === best);
  if (tied.length > tieLimit) {
    return { products: [], ambiguousLabel: tied[0].product.name || tied[0].product.title, confidence: 0 };
  }
  if (tied.length === 1 && best >= (ranked[1]?.score ?? 0) + 2) {
    return { products: [tied[0].product], ambiguousLabel: null, confidence: 0.86 };
  }
  if (tied.length === 1 && ranked.length > 1 && best < (ranked[1]?.score ?? 0) + 2) {
    return { products: [], ambiguousLabel: null, confidence: 0 };
  }
  return { products: tied.map((item) => item.product), ambiguousLabel: null, confidence: 0.88 };
}

export function nameScore(product: PreparedProduct, text: string): number {
  const normalized = normalize(text);
  const words = new Set(tokens(text));
  let score = 0;
  let hits = 0;
  for (const token of product.nameTokens) {
    if (words.has(token)) {
      hits += 1;
      score += 2;
    }
  }
  if (product.nameNorm.length >= 4 && normalized.includes(product.nameNorm)) score += 5;
  const collection = normalize(product.collection);
  if (collection.length >= 4 && collection !== product.nameNorm && normalized.includes(collection)) {
    score += 3;
  }
  if (hits === 0 && score < 5) return 0;
  return score;
}

function dedupe(products: PreparedProduct[]): PreparedProduct[] {
  const seen = new Set<string>();
  return products.filter((product) => {
    if (seen.has(product.url)) return false;
    seen.add(product.url);
    return true;
  });
}

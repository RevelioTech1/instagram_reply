import { KIND_BY_SLUG, type PreparedProduct, type RawProduct } from "./types.ts";
import { codeKey, extractCodeFromSku, normalize, tokens, translitKey } from "./text.ts";

const LEADING =
  /^(деревянный крест|ионизатор|кольцо|серьги|подвеска|крест|браслет|цепь|гайтан|бусина|колье|брошь|ложка|сувенир)\s+/i;

export type CatalogIndex = {
  products: PreparedProduct[];
  byKey: Map<string, PreparedProduct[]>;
};

export function prepareProduct(raw: RawProduct): PreparedProduct {
  const code = extractCodeFromSku(raw.skuRaw);
  const name = distinctiveName(raw.title, code);
  const nameNorm = normalize(name);
  const collection = (raw.props["Коллекция"] ?? "").trim();
  const nameTokens = unique([
    ...tokens(name),
    ...tokens(collection).filter((token) => !tokens(name).includes(token)),
  ]);
  const description = raw.description
    .replace(/\.\.\.\s*читать далее/gi, "")
    .replace(/читать далее/gi, "")
    .trim();
  const kind = KIND_BY_SLUG[raw.categorySlug] || raw.props["Тип изделия"] || "Изделие";
  const product: PreparedProduct = {
    url: raw.url.replace(/\/+$/, "/"),
    code,
    codeKey: codeKey(code),
    translitKey: translitKey(code),
    skuRaw: raw.skuRaw,
    title: raw.title.trim(),
    name,
    nameNorm,
    nameTokens,
    price: raw.price && raw.price > 0 ? raw.price : null,
    image: raw.image,
    description,
    category: raw.category,
    categorySlug: raw.categorySlug,
    kind,
    availability: raw.availability || "unknown",
    props: raw.props,
    collection,
    metal: raw.props["Металл"] ?? "",
    size: raw.props["Размер"] ?? "",
    weight: raw.props["Средний вес"] ?? "",
    width: raw.props["Ширина"] ?? "",
    coating: raw.props["Покрытие"] ?? "",
    searchText: "",
  };
  product.searchText = normalize(
    [product.title, product.code, product.name, product.collection, product.category, product.metal].join(" "),
  );
  return product;
}

export function buildIndex(products: PreparedProduct[]): CatalogIndex {
  const byKey = new Map<string, PreparedProduct[]>();
  const add = (key: string, product: PreparedProduct) => {
    if (!key) return;
    const list = byKey.get(key);
    if (!list) {
      byKey.set(key, [product]);
      return;
    }
    if (!list.some((item) => item.url === product.url)) list.push(product);
  };
  for (const product of products) {
    add(product.codeKey, product);
    add(product.translitKey, product);
  }
  return { products, byKey };
}

export function lookupCode(index: CatalogIndex, rawCode: string): PreparedProduct[] {
  const direct = index.byKey.get(codeKey(rawCode)) ?? [];
  const translit = index.byKey.get(translitKey(rawCode)) ?? [];
  const merged = [...direct];
  for (const product of translit) {
    if (!merged.some((item) => item.url === product.url)) merged.push(product);
  }
  return merged;
}

function distinctiveName(title: string, code: string): string {
  let name = title.replace(LEADING, " ");
  if (code) {
    const escaped = code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    name = name.replace(new RegExp(escaped, "i"), " ");
  }
  return name.replace(/^[\s,.\-–—]+/, "").replace(/[\s,.\-–—]+$/, "").replace(/\s+/g, " ").trim();
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

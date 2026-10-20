import { formatMeasure, formatPrice, prettyName, sentence, clip } from "./format.ts";
import type { IntentFlags, PreparedProduct } from "./types.ts";
import { CATALOG_HOME, CATEGORY_URLS } from "./types.ts";

const PHONE_HOURS = "пн–пт, 9:00–18:00";

export function buildReplies(options: {
  flags: IntentFlags;
  products: PreparedProduct[];
  context: PreparedProduct | null;
  categorySlug: string | null;
  ambiguousLabel: string | null;
  includePrice: boolean;
  phone: string;
}): { publicReply: string; privateReply: string } {
  const showPrice = options.flags.price || options.includePrice;
  const publicReply = clip(compose({ ...options, showPrice, channel: "public" }));
  const privateReply = clip(compose({ ...options, showPrice, channel: "private" }));
  return { publicReply, privateReply };
}

function compose(options: {
  flags: IntentFlags;
  products: PreparedProduct[];
  context: PreparedProduct | null;
  categorySlug: string | null;
  ambiguousLabel: string | null;
  showPrice: boolean;
  phone: string;
  channel: "public" | "private";
}): string {
  if (!hasCommercialAsk(options.flags)) return handoff(options);
  if (options.products.length === 1) return single(options, options.products[0]);
  if (options.products.length > 1) return many(options);
  return missing(options);
}

function hasCommercialAsk(flags: IntentFlags): boolean {
  return (
    flags.price ||
    flags.details ||
    flags.availability ||
    flags.buy ||
    flags.shipping ||
    flags.size ||
    flags.wear
  );
}

function handoff(options: {
  products: PreparedProduct[];
  phone: string;
}): string {
  const product = options.products[0];
  if (product && options.products.length === 1) {
    return [
      `Здравствуйте! По изделию ${productLine(product, false)} лучше ответит мастерская: ${options.phone}, ${PHONE_HOURS}.`,
      `Карточка: ${product.url}`,
    ].join("\n");
  }
  return [
    `Здравствуйте! Чтобы ответить точно, лучше связаться с мастерской: ${options.phone}, ${PHONE_HOURS}.`,
    `Каталог: ${CATALOG_HOME}`,
  ].join("\n");
}

function single(
  options: {
    flags: IntentFlags;
    context: PreparedProduct | null;
    showPrice: boolean;
    phone: string;
    channel: "public" | "private";
  },
  product: PreparedProduct,
): string {
  const lines = [`Здравствуйте! ${productLine(product, options.showPrice)}.`];
  const facts = factLine(product, options.flags);
  if (facts) lines.push(facts);
  if (options.flags.size || options.flags.availability) {
    lines.push(
      "Точный размер выбирается в карточке. Если его нет на складе, изготовление занимает около 15 рабочих дней.",
    );
  }
  if (options.flags.wear) {
    lines.push("Такие изделия носят каждый день.");
  }
  if (options.flags.shipping) {
    lines.push(
      "Доставка СДЭК по России — до двери или в пункт выдачи. Срок и стоимость считаются при оформлении заказа.",
    );
  }
  lines.push(`Карточка: ${product.url}`);
  if (options.flags.shipping || options.flags.availability || options.channel === "private") {
    lines.push(`Телефон: ${options.phone}, ${PHONE_HOURS}.`);
  }
  return lines.join("\n");
}

function many(options: {
  flags: IntentFlags;
  products: PreparedProduct[];
  showPrice: boolean;
  phone: string;
  channel: "public" | "private";
}): string {
  const lines = ["Здравствуйте! В этой публикации несколько изделий:"];
  options.products.forEach((product, index) => {
    lines.push(`${index + 1}. ${productLine(product, options.showPrice || options.flags.price)}`);
    lines.push(product.url);
  });
  lines.push("Напишите артикул, если нужно разобрать одно из них.");
  if (options.flags.shipping) {
    lines.push("Доставка СДЭК по России, срок считается при оформлении.");
  }
  if (options.channel === "private") lines.push(`Телефон: ${options.phone}, ${PHONE_HOURS}.`);
  return lines.join("\n");
}

function missing(options: {
  flags: IntentFlags;
  context: PreparedProduct | null;
  categorySlug: string | null;
  ambiguousLabel: string | null;
  phone: string;
  channel: "public" | "private";
}): string {
  const lines: string[] = [];
  if (options.ambiguousLabel) {
    lines.push(
      `Здравствуйте! «${prettyName(options.ambiguousLabel)}» — так называются несколько разных изделий. Напишите артикул с фото, и я открою нужную карточку.`,
    );
  } else if (options.context && options.categorySlug && options.context.categorySlug !== options.categorySlug) {
    const catalog = CATEGORY_URLS[options.categorySlug] ?? CATALOG_HOME;
    lines.push(
      `Здравствуйте! В этой публикации ${productLine(options.context, false)}. Отдельной карточки того, о чём вы спросили, в подписи нет.`,
    );
    lines.push(`Смотрите раздел: ${catalog}`);
  } else if (options.flags.other) {
    lines.push(
      `Здравствуйте! Чтобы ответить точно, лучше связаться с мастерской: ${options.phone}, ${PHONE_HOURS}.`,
    );
  } else {
    lines.push(
      "Здравствуйте! Чтобы не перепутать изделие, напишите артикул с фото (например, Б-КО-338) или точное название.",
    );
  }
  lines.push(`Каталог: ${CATALOG_HOME}`);
  if (options.channel === "private" && !options.flags.other) {
    lines.push(`Телефон: ${options.phone}, ${PHONE_HOURS}.`);
  }
  return lines.join("\n");
}

function productLine(product: PreparedProduct, withPrice: boolean): string {
  const name = product.name ? `${product.kind} «${prettyName(product.name)}»` : product.title;
  const price = withPrice ? formatPrice(product.price) : null;
  const priced = price ? ` — ${price}` : "";
  return `${name}, арт. ${product.code}${priced}`;
}

function factLine(product: PreparedProduct, flags: IntentFlags): string {
  if (!flags.details && !flags.size && !flags.wear) return "";
  const bits: string[] = [];
  if (product.metal) bits.push(product.metal);
  if (product.coating && flags.details) bits.push(`покрытие ${product.coating.toLowerCase()}`);
  if ((flags.size || flags.details) && product.size) bits.push(`размерная группа «${product.size.toLowerCase()}»`);
  if ((flags.size || flags.details) && product.width) {
    const width = formatMeasure(product.width, "мм");
    if (width) bits.push(`ширина ${width}`);
  }
  if ((flags.size || flags.details) && product.weight) {
    const weight = formatMeasure(product.weight, "г");
    if (weight) bits.push(`средний вес ${weight}`);
  }
  return sentence(bits.join(", "));
}

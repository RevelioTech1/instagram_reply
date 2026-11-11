import { formatMeasure, prettyName, sentence, clip } from "./format.ts";
import {
  DEFAULT_DM_CLOSED_TEMPLATE,
  DEFAULT_PRIVATE_TEMPLATE,
  DEFAULT_PUBLIC_TEMPLATE,
  productTemplateVars,
  renderTemplate,
} from "./templates.ts";
import type { IntentFlags, Policy, PreparedProduct } from "./types.ts";
import { CATALOG_HOME, CATEGORY_URLS } from "./types.ts";

export type BuiltReplies = {
  publicReply: string;
  privateReply: string;
  dmClosedReply: string;
};

export function buildReplies(options: {
  flags: IntentFlags;
  products: PreparedProduct[];
  context: PreparedProduct | null;
  categorySlug: string | null;
  ambiguousLabel: string | null;
  policy: Policy;
}): BuiltReplies {
  const shop = shopFromPolicy(options.policy);
  const publicTemplate = options.policy.publicTemplate?.trim() || DEFAULT_PUBLIC_TEMPLATE;
  const privateTemplate = options.policy.privateTemplate?.trim() || DEFAULT_PRIVATE_TEMPLATE;
  const dmClosedTemplate = options.policy.dmClosedTemplate?.trim() || DEFAULT_DM_CLOSED_TEMPLATE;

  if (!hasCommercialAsk(options.flags)) {
    const handoff = handoffText(options);
    return {
      publicReply: clip(handoff.publicReply),
      privateReply: clip(handoff.privateReply),
      dmClosedReply: clip(renderTemplate(dmClosedTemplate, productTemplateVars(options.products[0], shop))),
    };
  }

  if (options.products.length === 1) {
    const product = options.products[0];
    const vars = productTemplateVars(product, shop);
    const privateBody = [
      renderTemplate(privateTemplate, vars),
      ...extraPrivateFacts(product, options.flags),
    ]
      .filter(Boolean)
      .join("\n");
    return {
      publicReply: clip(renderTemplate(publicTemplate, vars)),
      privateReply: clip(privateBody),
      dmClosedReply: clip(renderTemplate(dmClosedTemplate, vars)),
    };
  }

  if (options.products.length > 1) {
    return clipAll(many(options, shop, publicTemplate, privateTemplate, dmClosedTemplate));
  }

  return clipAll(missing(options, shop, dmClosedTemplate));
}

export function buildDmClosedReply(options: {
  products: Array<{ code?: string; url?: string; price?: number | null }>;
  policy: Policy;
}): string {
  const shop = shopFromPolicy(options.policy);
  const first = options.products[0];
  const product = first
    ? { code: first.code ?? "", url: first.url ?? "", price: first.price ?? null }
    : null;
  const template = options.policy.dmClosedTemplate?.trim() || DEFAULT_DM_CLOSED_TEMPLATE;
  return clip(renderTemplate(template, productTemplateVars(product, shop)));
}

function shopFromPolicy(policy: Policy) {
  return {
    siteLink: policy.siteLink?.trim() || CATALOG_HOME,
    address: policy.address?.trim() || "",
    timetable: policy.timetable?.trim() || "пн–пт, 9:00–18:00",
    phone: policy.phone?.trim() || "",
    includePrice: policy.includePrice,
  };
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

function handoffText(options: {
  products: PreparedProduct[];
  policy: Policy;
}): BuiltReplies {
  const shop = shopFromPolicy(options.policy);
  const product = options.products[0] ?? null;
  const vars = productTemplateVars(product, shop);
  if (product && options.products.length === 1) {
    return {
      publicReply: `Здравствуйте! По изделию арт. {{sku}} лучше ответит мастерская — напишите нам в директ или на сайте {{site_link}}.`.replace(
        /\{\{\s*([a-z_]+)\s*\}\}/gi,
        (_, key: string) => vars[key as keyof typeof vars] ?? "",
      ),
      privateReply: [
        `Здравствуйте! По изделию арт. ${product.code} лучше уточнить у мастерской.`,
        `Карточка: ${product.url}`,
        `Телефон: ${shop.phone}`,
        `Режим: ${shop.timetable}`,
        shop.address ? `Адрес: ${shop.address}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      dmClosedReply: renderTemplate(
        options.policy.dmClosedTemplate?.trim() || DEFAULT_DM_CLOSED_TEMPLATE,
        vars,
      ),
    };
  }
  return {
    publicReply: `Здравствуйте! Чтобы ответить точно, напишите нам в директ или посмотрите каталог: ${shop.siteLink}.`,
    privateReply: [
      "Здравствуйте! Чтобы ответить точно, напишите артикул или вопрос здесь.",
      `Телефон: ${shop.phone}`,
      `Режим: ${shop.timetable}`,
      shop.address ? `Адрес: ${shop.address}` : "",
      `Каталог: ${shop.siteLink}`,
    ]
      .filter(Boolean)
      .join("\n"),
    dmClosedReply: renderTemplate(
      options.policy.dmClosedTemplate?.trim() || DEFAULT_DM_CLOSED_TEMPLATE,
      vars,
    ),
  };
}

function many(
  options: {
    flags: IntentFlags;
    products: PreparedProduct[];
    policy: Policy;
  },
  shop: ReturnType<typeof shopFromPolicy>,
  publicTemplate: string,
  privateTemplate: string,
  dmClosedTemplate: string,
): BuiltReplies {
  const skus = options.products.map((product) => product.code).join(", ");
  const first = productTemplateVars(options.products[0], shop);
  const publicVars = { ...first, sku: skus };
  const privateLines = [
    "Здравствуйте! В этой публикации несколько изделий:",
    ...options.products.flatMap((product, index) => {
      const vars = productTemplateVars(product, shop);
      const block = renderTemplate(privateTemplate, vars);
      return [`${index + 1}.`, block];
    }),
    "Напишите артикул, если нужно разобрать одно из них.",
  ];
  if (options.flags.shipping) {
    privateLines.push("Доставка СДЭК по России, срок считается при оформлении.");
  }
  return {
    publicReply: renderTemplate(publicTemplate, publicVars),
    privateReply: privateLines.join("\n"),
    dmClosedReply: renderTemplate(dmClosedTemplate, publicVars),
  };
}

function missing(
  options: {
    flags: IntentFlags;
    context: PreparedProduct | null;
    categorySlug: string | null;
    ambiguousLabel: string | null;
    policy: Policy;
  },
  shop: ReturnType<typeof shopFromPolicy>,
  dmClosedTemplate: string,
): BuiltReplies {
  const vars = productTemplateVars(options.context, shop);
  let publicReply: string;
  let privateReply: string;
  if (options.ambiguousLabel) {
    publicReply = `Здравствуйте! «${prettyName(options.ambiguousLabel)}» — так называются несколько изделий. Напишите артикул с фото — пришлём карточку в директ. Каталог: ${shop.siteLink}.`;
    privateReply = [
      `Здравствуйте! «${prettyName(options.ambiguousLabel)}» — несколько разных изделий.`,
      "Напишите артикул с фото, и я открою нужную карточку.",
      `Каталог: ${shop.siteLink}`,
      `Телефон: ${shop.phone}`,
    ].join("\n");
  } else if (options.context && options.categorySlug && options.context.categorySlug !== options.categorySlug) {
    const catalog = CATEGORY_URLS[options.categorySlug] ?? shop.siteLink;
    publicReply = `Здравствуйте! В публикации арт. ${options.context.code}. Нужный раздел: ${catalog}.`;
    privateReply = [
      `Здравствуйте! В этой публикации ${options.context.kind} арт. ${options.context.code}.`,
      "Отдельной карточки того, о чём вы спросили, в подписи нет.",
      `Смотрите раздел: ${catalog}`,
      `Телефон: ${shop.phone}`,
    ].join("\n");
  } else if (options.flags.other) {
    publicReply = `Здравствуйте! Напишите нам в директ или позвоните ${shop.phone}. Сайт: ${shop.siteLink}.`;
    privateReply = [
      `Здравствуйте! Чтобы ответить точно, лучше связаться с мастерской: ${shop.phone}, ${shop.timetable}.`,
      shop.address ? `Адрес: ${shop.address}` : "",
      `Каталог: ${shop.siteLink}`,
    ]
      .filter(Boolean)
      .join("\n");
  } else {
    publicReply = `Здравствуйте! Напишите артикул с фото (например, Б-КО-338) — пришлём карточку в директ. Сайт: ${shop.siteLink}.`;
    privateReply = [
      "Здравствуйте! Чтобы не перепутать изделие, напишите артикул с фото (например, Б-КО-338) или точное название.",
      `Каталог: ${shop.siteLink}`,
      `Телефон: ${shop.phone}`,
    ].join("\n");
  }
  return {
    publicReply,
    privateReply,
    dmClosedReply: renderTemplate(dmClosedTemplate, { ...vars, sku: vars.sku || "—" }),
  };
}

function extraPrivateFacts(product: PreparedProduct, flags: IntentFlags): string[] {
  const lines: string[] = [];
  const facts = factLine(product, flags);
  if (facts) lines.push(facts);
  if (flags.size || flags.availability) {
    lines.push(
      "Точный размер выбирается в карточке. Если его нет на складе, изготовление занимает около 15 рабочих дней.",
    );
  }
  if (flags.wear) lines.push("Такие изделия носят каждый день.");
  if (flags.shipping) {
    lines.push(
      "Доставка СДЭК по России — до двери или в пункт выдачи. Срок и стоимость считаются при оформлении заказа.",
    );
  }
  return lines;
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

function clipAll(replies: BuiltReplies): BuiltReplies {
  return {
    publicReply: clip(replies.publicReply),
    privateReply: clip(replies.privateReply),
    dmClosedReply: clip(replies.dmClosedReply),
  };
}

export type Availability = "in_stock" | "out_of_stock" | "preorder" | "unknown";

export type RawProduct = {
  url: string;
  skuRaw: string;
  title: string;
  price: number | null;
  image: string | null;
  description: string;
  availability: Availability | string;
  props: Record<string, string>;
  category: string;
  categorySlug: string;
};

export type PreparedProduct = {
  url: string;
  code: string;
  codeKey: string;
  translitKey: string;
  skuRaw: string;
  title: string;
  name: string;
  nameNorm: string;
  nameTokens: string[];
  price: number | null;
  image: string | null;
  description: string;
  category: string;
  categorySlug: string;
  kind: string;
  availability: string;
  props: Record<string, string>;
  collection: string;
  metal: string;
  size: string;
  weight: string;
  width: string;
  coating: string;
  searchText: string;
};

export type IntentFlags = {
  price: boolean;
  details: boolean;
  availability: boolean;
  buy: boolean;
  shipping: boolean;
  size: boolean;
  wear: boolean;
  other: boolean;
};

export type PrimaryIntent =
  | "price"
  | "details"
  | "availability"
  | "buy"
  | "shipping"
  | "size"
  | "wear"
  | "other"
  | "none";

export type Policy = {
  autoReply: boolean;
  publicReply: boolean;
  privateReply: boolean;
  minConfidence: number;
  /** Price goes only into the Direct message, never into the public comment. */
  includePrice: boolean;
  phone: string;
  siteLink: string;
  address: string;
  timetable: string;
  /** Public comment template (no price). Supports {{sku}}, {{site_link}}, … */
  publicTemplate: string;
  /** Direct message template with price and clickable {{sku_link}}. */
  privateTemplate: string;
  /** Public comment when Direct is closed / unreachable. */
  dmClosedTemplate: string;
  priceSymbols: string[];
  reactToPraise: boolean;
  praiseReplies: string[];
};

export type AuthMode = "" | "instagram" | "facebook";

export type Secrets = {
  accessToken: string;
  appSecret: string;
  verifyToken: string;
  igUserId: string;
  igUsername: string;
  graphVersion: string;
  authMode: AuthMode;
  igAppId: string;
  igAppSecret: string;
  tokenExpiresAt: string;
  oauthState: string;
  oauthRedirect: string;
  publicOrigin: string;
};

export const DEFAULT_POLICY: Policy = {
  autoReply: false,
  publicReply: true,
  privateReply: true,
  minConfidence: 0.82,
  includePrice: true,
  phone: "8 800 222-32-13",
  siteLink: "https://iordani.com/",
  address: "",
  timetable: "пн–пт, 9:00–18:00",
  publicTemplate:
    "Здравствуйте! Артикул изделия {{sku}}. Подробности на сайте {{site_link}} (также ссылка в шапке профиля).",
  privateTemplate: [
    "Здравствуйте! Артикул {{sku}}, цена {{sku_price}}.",
    "Карточка: {{sku_link}}",
    "Телефон: {{phone_number}}",
    "Режим: {{timetable}}",
    "Адрес: {{address}}",
  ].join("\n"),
  dmClosedTemplate:
    "К сожалению, у вас закрыт директ. Артикул изделия {{sku}} вы можете посмотреть на нашем сайте {{site_link}}",
  priceSymbols: ["+", "➕", "＋", "хочу", "хочу такое", "беру", "куплю", "закажу"],
  reactToPraise: true,
  praiseReplies: [
    "Здравствуйте! Спасибо, очень приятно.",
    "Здравствуйте! Рады, что украшение откликнулось.",
    "Здравствуйте! Спасибо за тёплые слова.",
    "Здравствуйте! Нам очень приятно это слышать.",
  ],
};

export const DEFAULT_SECRETS: Secrets = {
  accessToken: "",
  appSecret: "",
  verifyToken: "",
  igUserId: "",
  igUsername: "iordani925",
  graphVersion: "v23.0",
  authMode: "",
  igAppId: "",
  igAppSecret: "",
  tokenExpiresAt: "",
  oauthState: "",
  oauthRedirect: "",
  publicOrigin: "",
};

export const CATALOG_HOME = "https://iordani.com/catalog/";

export const CATEGORY_URLS: Record<string, string> = {
  koltsa: "https://iordani.com/catalog/koltsa/",
  podveski: "https://iordani.com/catalog/podveski/",
  kresty: "https://iordani.com/catalog/kresty/",
  braslety: "https://iordani.com/catalog/braslety/",
  sergi: "https://iordani.com/catalog/sergi/",
  tsepi: "https://iordani.com/catalog/tsepi/",
  gaytany: "https://iordani.com/catalog/gaytany/",
  businy: "https://iordani.com/catalog/businy/",
  suvenir: "https://iordani.com/catalog/suvenir/",
  kole: "https://iordani.com/catalog/kole/",
  broshi: "https://iordani.com/catalog/broshi/",
  lozhki: "https://iordani.com/catalog/lozhki/",
  svetskiy_assortiment: "https://iordani.com/catalog/",
};

export const KIND_BY_SLUG: Record<string, string> = {
  koltsa: "Кольцо",
  podveski: "Подвеска",
  kresty: "Крест",
  braslety: "Браслет",
  sergi: "Серьги",
  tsepi: "Цепь",
  gaytany: "Гайтан",
  businy: "Бусина",
  suvenir: "Сувенир",
  kole: "Колье",
  broshi: "Брошь",
  lozhki: "Ложка",
  svetskiy_assortiment: "Изделие",
};

import { formatPrice } from "./format.ts";
import type { PreparedProduct } from "./types.ts";

export const TEMPLATE_VARIABLES = [
  { key: "sku", label: "артикул" },
  { key: "sku_price", label: "цена товара" },
  { key: "sku_link", label: "ссылка на товар" },
  { key: "site_link", label: "ссылка на сайт" },
  { key: "address", label: "наш адрес" },
  { key: "timetable", label: "расписание" },
  { key: "phone_number", label: "номер телефона" },
] as const;

export type TemplateVars = Record<(typeof TEMPLATE_VARIABLES)[number]["key"], string>;

export const DEFAULT_PUBLIC_TEMPLATE =
  "Здравствуйте! Артикул изделия {{sku}}. Подробности на сайте {{site_link}} (также ссылка в шапке профиля).";

export const DEFAULT_PRIVATE_TEMPLATE = [
  "Здравствуйте! Артикул {{sku}}, цена {{sku_price}}.",
  "Карточка: {{sku_link}}",
  "Телефон: {{phone_number}}",
  "Режим: {{timetable}}",
  "Адрес: {{address}}",
].join("\n");

export const DEFAULT_DM_CLOSED_TEMPLATE =
  "К сожалению, у вас закрыт директ. Артикул изделия {{sku}} вы можете посмотреть на нашем сайте {{site_link}}";

export function renderTemplate(template: string, vars: Partial<TemplateVars>): string {
  return template
    .replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, key: string) => {
      const value = vars[key as keyof TemplateVars];
      return value == null ? "" : String(value);
    })
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function productTemplateVars(
  product: Pick<PreparedProduct, "code" | "url" | "price"> | null | undefined,
  shop: {
    siteLink: string;
    address: string;
    timetable: string;
    phone: string;
    includePrice?: boolean;
  },
): TemplateVars {
  const includePrice = shop.includePrice !== false;
  const price = includePrice ? formatPrice(product?.price ?? null) : null;
  return {
    sku: product?.code ?? "",
    sku_price: price ?? "",
    sku_link: product?.url ?? "",
    site_link: shop.siteLink,
    address: shop.address,
    timetable: shop.timetable,
    phone_number: shop.phone,
  };
}

/** Meta / Instagram signals that the person cannot receive a private reply right now. */
export function isDmUnavailableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const lower = message.toLowerCase();
  if (/\b551\b/.test(message)) return true;
  if (/2534022|2018108|1545041/.test(message)) return true;
  return (
    /isn['’]?t receiving messages/i.test(message) ||
    /isn['’]?t available right now/i.test(message) ||
    /can['’]?t receive your messages/i.test(message) ||
    /cannot be reached/i.test(message) ||
    /requested user cannot be found/i.test(message) ||
    /закрыт директ|не принимает сообщения|недоступен для сообщений/i.test(lower)
  );
}

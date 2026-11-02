export function formatPrice(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  return `${new Intl.NumberFormat("ru-RU").format(value)} ₽`;
}

/** Comment timestamps from Instagram / ingest, shown in Moscow local time. */
export function formatCommentWhen(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatMeasure(raw: string, unit: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const numeric = Number(trimmed.replace(",", "."));
  if (!Number.isFinite(numeric)) return `${trimmed} ${unit}`;
  const text = numeric.toLocaleString("ru-RU", { maximumFractionDigits: 1 });
  return `${text} ${unit}`;
}

export function prettyName(name: string): string {
  return name.replace(/,/g, ", ").replace(/\s+/g, " ").trim();
}

export function sentence(value: string): string {
  const clean = value.replace(/\s+/g, " ").trim();
  if (!clean) return "";
  const headed = clean.charAt(0).toUpperCase() + clean.slice(1);
  return /[.!?…]$/.test(headed) ? headed : `${headed}.`;
}

export function clip(value: string, max = 1800): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trim()}…`;
}

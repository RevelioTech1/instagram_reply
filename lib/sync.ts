import { extractProductImage } from "./catalog-image.ts";
import {
  catalogSyncEnabled,
  DEFAULT_CATALOG_SYNC_INTERVAL_MS,
  DEFAULT_CATALOG_SYNC_RETRY_MS,
  DEFAULT_CATALOG_SYNC_STARTUP_DELAY_MS,
  DEFAULT_CATALOG_SYNC_TICK_MS,
  readIntervalMs,
  shouldRunScheduledSync,
} from "./catalog-schedule.ts";
import { getCatalogSyncedAt, replaceProducts } from "./db.ts";
import type { RawProduct } from "./types.ts";

const CATEGORIES: Record<string, string> = {
  podveski: "Подвески",
  koltsa: "Кольца",
  kresty: "Кресты",
  braslety: "Браслеты",
  sergi: "Серьги",
  tsepi: "Цепи",
  svetskiy_assortiment: "Светский ассортимент",
  gaytany: "Гайтаны",
  businy: "Бусины",
  suvenir: "Сувениры",
  kole: "Колье",
  broshi: "Броши",
  lozhki: "Ложки",
};

export type SyncState = {
  running: boolean;
  scanned: number;
  total: number;
  saved: number;
  error: string | null;
  finishedAt: string | null;
  lastSyncedAt: string | null;
  trigger: "manual" | "schedule" | null;
  autoEnabled: boolean;
  intervalMs: number;
};

const state: SyncState = {
  running: false,
  scanned: 0,
  total: 0,
  saved: 0,
  error: null,
  finishedAt: null,
  lastSyncedAt: null,
  trigger: null,
  autoEnabled: true,
  intervalMs: DEFAULT_CATALOG_SYNC_INTERVAL_MS,
};

let lastAttemptAtMs: number | null = null;
let lastAttemptFailed = false;
let schedulerStarted = false;
let tickTimer: ReturnType<typeof setInterval> | null = null;
let startupTimer: ReturnType<typeof setTimeout> | null = null;

export function getSyncState(): SyncState {
  return {
    ...state,
    lastSyncedAt: getCatalogSyncedAt(),
    autoEnabled: catalogSyncEnabled(),
    intervalMs: readIntervalMs(process.env.CATALOG_SYNC_INTERVAL_MS, DEFAULT_CATALOG_SYNC_INTERVAL_MS),
  };
}

export function startCatalogSync(trigger: "manual" | "schedule" = "manual"): SyncState {
  if (state.running) return getSyncState();
  state.running = true;
  state.scanned = 0;
  state.total = 0;
  state.saved = 0;
  state.error = null;
  state.finishedAt = null;
  state.trigger = trigger;
  lastAttemptAtMs = Date.now();
  lastAttemptFailed = false;
  void runSync().catch((error: unknown) => {
    state.error = error instanceof Error ? error.message : "Не удалось обновить каталог";
    state.running = false;
    state.finishedAt = new Date().toISOString();
    lastAttemptFailed = true;
    lastAttemptAtMs = Date.now();
  });
  return getSyncState();
}

export function startCatalogScheduler(): void {
  if (schedulerStarted || !catalogSyncEnabled()) return;
  schedulerStarted = true;
  const tickMs = readIntervalMs(process.env.CATALOG_SYNC_TICK_MS, DEFAULT_CATALOG_SYNC_TICK_MS);
  const startupDelayMs = readIntervalMs(
    process.env.CATALOG_SYNC_STARTUP_DELAY_MS,
    DEFAULT_CATALOG_SYNC_STARTUP_DELAY_MS,
  );
  const tick = () => {
    try {
      maybeStartScheduledSync();
    } catch {
      // Keep the timer alive even if a single check throws.
    }
  };
  startupTimer = setTimeout(() => {
    tick();
    tickTimer = setInterval(tick, tickMs);
    tickTimer.unref?.();
  }, startupDelayMs);
  startupTimer.unref?.();
}

export function maybeStartScheduledSync(now = Date.now()): SyncState {
  if (!catalogSyncEnabled()) return getSyncState();
  const intervalMs = readIntervalMs(process.env.CATALOG_SYNC_INTERVAL_MS, DEFAULT_CATALOG_SYNC_INTERVAL_MS);
  const retryAfterFailureMs = readIntervalMs(process.env.CATALOG_SYNC_RETRY_MS, DEFAULT_CATALOG_SYNC_RETRY_MS);
  const syncedAt = getCatalogSyncedAt();
  const lastSuccessAtMs = syncedAt ? Date.parse(syncedAt) : NaN;
  if (
    !shouldRunScheduledSync({
      now,
      intervalMs,
      retryAfterFailureMs,
      running: state.running,
      lastSuccessAtMs: Number.isFinite(lastSuccessAtMs) ? lastSuccessAtMs : null,
      lastAttemptAtMs,
      lastAttemptFailed,
    })
  ) {
    return getSyncState();
  }
  return startCatalogSync("schedule");
}

async function runSync(): Promise<void> {
  const urls = await productUrls();
  state.total = urls.length;
  const found: RawProduct[] = [];
  let cursor = 0;
  const workers = Array.from({ length: 6 }, async () => {
    while (cursor < urls.length) {
      const url = urls[cursor];
      cursor += 1;
      const product = await fetchProduct(url);
      state.scanned += 1;
      if (product) found.push(product);
    }
  });
  await Promise.all(workers);
  if (found.length < 100) {
    throw new Error(`С сайта пришло только ${found.length} карточек. Каталог не заменён.`);
  }
  state.saved = replaceProducts(found);
  state.running = false;
  state.finishedAt = new Date().toISOString();
  state.lastSyncedAt = getCatalogSyncedAt();
  lastAttemptFailed = false;
  lastAttemptAtMs = Date.now();
}

async function productUrls(): Promise<string[]> {
  const response = await fetch("https://iordani.com/sitemap-iblock-5.xml");
  if (!response.ok) throw new Error("Не открывается карта каталога iordani.com");
  const xml = await response.text();
  const urls: string[] = [];
  for (const match of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    const url = match[1].replace("http://", "https://");
    const parts = url.replace("https://iordani.com", "").split("/").filter(Boolean);
    if (parts[0] === "catalog" && parts.length >= 3) urls.push(url.endsWith("/") ? url : `${url}/`);
  }
  return urls;
}

async function fetchProduct(url: string): Promise<RawProduct | null> {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "IordaniCommentConcierge/1.0" },
      signal: AbortSignal.timeout(25000),
    });
    if (!response.ok) return null;
    const html = await response.text();
    const skuRaw = meta(html, "sku");
    if (!skuRaw) return null;
    const priceRaw = meta(html, "price");
    const availabilityHref = attr(html, "availability");
    const availability = availabilityHref.includes("OutOfStock")
      ? "out_of_stock"
      : availabilityHref.includes("PreOrder")
        ? "preorder"
        : availabilityHref.includes("InStock")
          ? "in_stock"
          : "unknown";
    const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const title = titleMatch ? strip(titleMatch[1]) : strip(meta(html, "name"));
    const descriptionMatch = html.match(/class="element-description">([\s\S]*?)<\/div>/i);
    const props: Record<string, string> = {};
    for (const block of html.matchAll(/class="element-props__item">\s*<span>([\s\S]*?)<\/span>([\s\S]*?)<\/div>/gi)) {
      const key = strip(block[1]);
      const value = strip(block[2]);
      if (key && value) props[key] = value;
    }
    const image = extractProductImage(html);
    const slug = url.replace("https://iordani.com", "").split("/").filter(Boolean)[1] ?? "";
    return {
      url: url.replace("http://", "https://"),
      skuRaw,
      title,
      price: /^\d+$/.test(priceRaw) ? Number(priceRaw) : null,
      image,
      description: strip(descriptionMatch?.[1] ?? "").slice(0, 700),
      availability,
      props,
      category: CATEGORIES[slug] ?? slug,
      categorySlug: slug,
    };
  } catch {
    return null;
  }
}

function meta(html: string, prop: string): string {
  const first = html.match(new RegExp(`<meta[^>]*itemprop="${prop}"[^>]*content="([^"]*)"`, "i"));
  if (first) return decode(first[1]);
  const second = html.match(new RegExp(`<meta[^>]*content="([^"]*)"[^>]*itemprop="${prop}"`, "i"));
  return second ? decode(second[1]) : "";
}

function attr(html: string, prop: string): string {
  const first = html.match(new RegExp(`itemprop="${prop}"[^>]*href="([^"]+)"`, "i"));
  if (first) return first[1];
  const second = html.match(new RegExp(`href="([^"]+)"[^>]*itemprop="${prop}"`, "i"));
  return second ? second[1] : "";
}

function strip(value: string): string {
  return decode(value.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function decode(value: string): string {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, "&");
}

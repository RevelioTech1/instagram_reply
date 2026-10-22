/** Pull the best product photo URL from an iordani.com product HTML page. */
export function extractProductImage(html: string): string | null {
  const candidates: string[] = [];
  for (const match of html.matchAll(/<meta[^>]*itemprop="image"[^>]*content="([^"]*)"/gi)) {
    candidates.push(match[1]);
  }
  for (const match of html.matchAll(/<meta[^>]*content="([^"]*)"[^>]*itemprop="image"/gi)) {
    candidates.push(match[1]);
  }
  for (const match of html.matchAll(
    /property="og:image"\s+content="([^"]*)"|content="([^"]*)"\s+property="og:image"/gi,
  )) {
    candidates.push(match[1] || match[2] || "");
  }
  for (const match of html.matchAll(
    /(?:src|data-src|data-lazy)="(\/upload\/iblock\/[^"]+\.(?:jpe?g|png|webp))"/gi,
  )) {
    candidates.push(match[1]);
  }
  for (const match of html.matchAll(/url\('(\/upload\/iblock\/[^']+\.(?:jpe?g|png|webp))'\)/gi)) {
    candidates.push(match[1]);
  }
  for (const candidate of candidates) {
    const absolute = absolutizeImage(candidate);
    if (absolute) return absolute;
  }
  return null;
}

export function absolutizeImage(value: string): string | null {
  const image = value.trim();
  if (!image || /nophoto\.png$/i.test(image)) return null;
  if (image.startsWith("//")) return `https:${image}`;
  if (image.startsWith("/")) return `https://iordani.com${image}`;
  if (/^https?:\/\//i.test(image)) return image;
  return null;
}

/** Keep the previous photo when a fresh crawl could not find one. */
export function mergeProductImages<T extends { url: string; image: string | null }>(
  items: T[],
  previousByUrl: Map<string, string | null>,
): T[] {
  return items.map((item) => {
    if (item.image) return item;
    const previous = previousByUrl.get(item.url);
    if (!previous) return item;
    return { ...item, image: previous };
  });
}

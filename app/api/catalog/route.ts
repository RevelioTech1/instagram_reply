import { listCategories, searchProducts } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_PAGE_SIZE = 24;
const MAX_PAGE_SIZE = 60;

export function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";
  const category = url.searchParams.get("category") || null;
  const page = Math.max(1, Number(url.searchParams.get("page") || "1") || 1);
  const requested = Number(url.searchParams.get("limit") || String(DEFAULT_PAGE_SIZE)) || DEFAULT_PAGE_SIZE;
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, requested));
  const offset = (page - 1) * limit;
  const { products, total } = searchProducts(q, category, limit, offset);
  const pageCount = Math.max(1, Math.ceil(total / limit));
  return Response.json({
    products,
    categories: listCategories(),
    total,
    page,
    pageSize: limit,
    pageCount,
  });
}

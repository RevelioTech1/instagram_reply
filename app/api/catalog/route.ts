import { listCategories, searchProducts } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";
  const category = url.searchParams.get("category") || null;
  const products = searchProducts(q, category, 60);
  return Response.json({ products, categories: listCategories(), total: products.length });
}

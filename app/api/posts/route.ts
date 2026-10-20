import { listPosts } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  return Response.json({ posts: listPosts() });
}

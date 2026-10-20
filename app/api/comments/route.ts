import { listComments } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(request: Request) {
  const status = new URL(request.url).searchParams.get("status");
  return Response.json({ comments: listComments(status) });
}

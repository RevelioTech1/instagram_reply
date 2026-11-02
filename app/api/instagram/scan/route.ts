import { getCommentScanState, startFullCommentScan } from "@/lib/comment-scan";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Kept for compatibility; same capped recent-posts scan as /api/instagram/poll. */
export function GET() {
  return Response.json(getCommentScanState());
}

export function POST() {
  return Response.json(startFullCommentScan());
}

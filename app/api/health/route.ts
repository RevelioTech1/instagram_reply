export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Unauthenticated liveness probe for Docker / reverse proxies. */
export function GET() {
  return Response.json({ ok: true });
}

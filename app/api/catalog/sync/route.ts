import { getSyncState, startCatalogSync } from "@/lib/sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  return Response.json(getSyncState());
}

export function POST() {
  return Response.json(startCatalogSync());
}

import { getSecrets, isOwnAccount } from "@/lib/db";
import { isTopLevelComment } from "@/lib/ig-replies";
import { ingestComment } from "@/lib/process";
import { webhookPostAllowed } from "@/lib/webhook-signature";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const secrets = getSecrets();
  if (mode === "subscribe" && token && token === secrets.verifyToken && challenge) {
    return new Response(challenge, { status: 200 });
  }
  return new Response("forbidden", { status: 403 });
}

type WebhookPayload = {
  entry?: Array<{
    changes?: Array<{
      field?: string;
      value?: {
        id?: string;
        text?: string;
        parent_id?: string;
        from?: { id?: string; username?: string };
        media?: { id?: string };
      };
    }>;
  }>;
};

export async function POST(request: Request) {
  const raw = await request.text();
  const secrets = getSecrets();
  const gate = webhookPostAllowed(raw, request.headers.get("x-hub-signature-256"), secrets.appSecret);
  if (!gate.ok) {
    return new Response(gate.body, { status: gate.status });
  }
  let payload: WebhookPayload;
  try {
    payload = JSON.parse(raw) as WebhookPayload;
  } catch {
    return new Response("bad json", { status: 400 });
  }
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "comments") continue;
      const value = change.value;
      if (!value?.id || !value.text || !value.media?.id) continue;
      // Replies to comments arrive with parent_id — inbox only needs top-level questions.
      if (!isTopLevelComment(value)) continue;
      const username = value.from?.username || value.from?.id || "instagram";
      if (isOwnAccount(username, value.from?.id)) continue;
      await ingestComment({
        id: value.id,
        mediaId: value.media.id,
        username,
        userId: value.from?.id,
        text: value.text,
        source: "webhook",
      });
    }
  }
  return new Response("ok", { status: 200 });
}

import crypto from "node:crypto";

/** Meta sends `X-Hub-Signature-256: sha256=<hex>`. */
export function validSignature(raw: string, header: string | null, secret: string): boolean {
  if (!header || !secret) return false;
  const expected = `sha256=${crypto.createHmac("sha256", secret).update(raw).digest("hex")}`;
  const left = Buffer.from(header);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

/**
 * Webhook POSTs must always be signed. Missing App Secret is a misconfiguration,
 * not a reason to skip verification.
 */
export function webhookPostAllowed(raw: string, signatureHeader: string | null, appSecret: string): {
  ok: boolean;
  status: number;
  body: string;
} {
  if (!appSecret.trim()) {
    return { ok: false, status: 403, body: "app secret not configured" };
  }
  if (!validSignature(raw, signatureHeader, appSecret)) {
    return { ok: false, status: 403, body: "invalid signature" };
  }
  return { ok: true, status: 200, body: "ok" };
}

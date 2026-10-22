import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { validSignature, webhookPostAllowed } from "./webhook-signature.ts";

function sign(raw: string, secret: string): string {
  return `sha256=${crypto.createHmac("sha256", secret).update(raw).digest("hex")}`;
}

test("validSignature accepts a correct Meta signature", () => {
  const raw = '{"object":"instagram"}';
  const secret = "test-app-secret";
  assert.equal(validSignature(raw, sign(raw, secret), secret), true);
});

test("validSignature rejects a missing or wrong signature", () => {
  const raw = '{"object":"instagram"}';
  const secret = "test-app-secret";
  assert.equal(validSignature(raw, null, secret), false);
  assert.equal(validSignature(raw, sign(raw, "other"), secret), false);
});

test("webhookPostAllowed rejects when App Secret is not configured", () => {
  const result = webhookPostAllowed("{}", "sha256=abc", "");
  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
  assert.match(result.body, /app secret/i);
});

test("webhookPostAllowed rejects unsigned bodies even with a secret", () => {
  const result = webhookPostAllowed("{}", null, "secret");
  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
  assert.match(result.body, /signature/i);
});

test("webhookPostAllowed accepts a correctly signed body", () => {
  const raw = '{"entry":[]}';
  const secret = "configured-secret";
  const result = webhookPostAllowed(raw, sign(raw, secret), secret);
  assert.equal(result.ok, true);
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  authorizePanelRequest,
  isPublicPath,
  parseBasicAuth,
  timingSafeEqualString,
} from "./panel-auth.ts";

test("isPublicPath keeps webhook and health open", () => {
  assert.equal(isPublicPath("/api/instagram/webhook"), true);
  assert.equal(isPublicPath("/api/health"), true);
  assert.equal(isPublicPath("/api/settings"), false);
  assert.equal(isPublicPath("/"), false);
});

test("parseBasicAuth decodes user and password", () => {
  const header = `Basic ${btoa("admin:s3cret")}`;
  assert.deepEqual(parseBasicAuth(header), { user: "admin", password: "s3cret" });
  assert.equal(parseBasicAuth(null), null);
});

test("timingSafeEqualString compares exact strings", () => {
  assert.equal(timingSafeEqualString("ab", "ab"), true);
  assert.equal(timingSafeEqualString("ab", "ac"), false);
  assert.equal(timingSafeEqualString("ab", "abc"), false);
});

test("authorizePanelRequest fails closed without PANEL_PASSWORD", () => {
  const previous = process.env.PANEL_PASSWORD;
  delete process.env.PANEL_PASSWORD;
  try {
    const result = authorizePanelRequest(`Basic ${btoa("admin:x")}`);
    assert.equal(result.ok, false);
    assert.equal(result.status, 503);
  } finally {
    if (previous === undefined) delete process.env.PANEL_PASSWORD;
    else process.env.PANEL_PASSWORD = previous;
  }
});

test("authorizePanelRequest accepts matching basic credentials", () => {
  const previousPassword = process.env.PANEL_PASSWORD;
  const previousUser = process.env.PANEL_USER;
  process.env.PANEL_PASSWORD = "panel-pass";
  process.env.PANEL_USER = "ops";
  try {
    const ok = authorizePanelRequest(`Basic ${btoa("ops:panel-pass")}`);
    assert.equal(ok.ok, true);
    const bad = authorizePanelRequest(`Basic ${btoa("ops:wrong")}`);
    assert.equal(bad.ok, false);
    assert.equal(bad.status, 401);
    assert.ok(bad.wwwAuthenticate);
  } finally {
    if (previousPassword === undefined) delete process.env.PANEL_PASSWORD;
    else process.env.PANEL_PASSWORD = previousPassword;
    if (previousUser === undefined) delete process.env.PANEL_USER;
    else process.env.PANEL_USER = previousUser;
  }
});

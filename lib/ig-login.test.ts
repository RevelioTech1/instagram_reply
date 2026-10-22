import assert from "node:assert/strict";
import test from "node:test";
import {
  callbackUri,
  instagramAuthorizeUrl,
  instagramLoginRedirectUrl,
  parseLongLivedToken,
  parseTokenResponse,
  requestOrigin,
} from "./ig-login.ts";

test("ссылка входа ведёт в Instagram и просит права на комментарии", () => {
  const url = new URL(
    instagramAuthorizeUrl({
      appId: "123",
      redirectUri: "http://localhost:4317/api/instagram/callback",
      state: "abc",
    }),
  );
  assert.equal(url.origin, "https://www.instagram.com");
  assert.equal(url.pathname, "/oauth/authorize");
  assert.equal(url.searchParams.get("enable_fb_login"), "0");
  assert.equal(url.searchParams.get("client_id"), "123");
  assert.equal(url.searchParams.get("redirect_uri"), "http://localhost:4317/api/instagram/callback");
  assert.equal(url.searchParams.get("state"), "abc");
  assert.match(url.searchParams.get("scope") ?? "", /instagram_business_manage_comments/);
  assert.match(url.searchParams.get("scope") ?? "", /instagram_business_manage_messages/);
});

test("перед OAuth сбрасывается текущая сессия Instagram", () => {
  const url = new URL(
    instagramLoginRedirectUrl({
      appId: "123",
      redirectUri: "https://insta.iordani.info/api/instagram/callback",
      state: "abc",
    }),
  );
  assert.equal(url.pathname, "/accounts/logout/");
  const next = new URL(url.searchParams.get("continue") ?? "");
  assert.equal(next.pathname, "/oauth/authorize");
  assert.equal(next.searchParams.get("force_authentication"), "1");
  assert.equal(next.searchParams.get("client_id"), "123");
});

test("короткий токен читается и из обёртки data, и из плоского ответа", () => {
  assert.deepEqual(
    parseTokenResponse({ data: [{ access_token: "short", user_id: 99, permissions: "instagram_business_basic" }] }),
    { accessToken: "short", userId: "99" },
  );
  assert.deepEqual(parseTokenResponse({ access_token: "flat", user_id: "7" }), {
    accessToken: "flat",
    userId: "7",
  });
});

test("вход отправляет сохранённый https-адрес, даже если панель открыта на localhost", () => {
  const uri = callbackUri(
    {
      url: "http://localhost:4317/api/instagram/login",
      headers: { get: (name) => (name === "host" ? "localhost:4317" : null) },
    },
    "https://panel.example.com/",
  );
  assert.equal(uri, "https://panel.example.com/api/instagram/callback");
});

test("адрес возврата берётся из браузера, а не из 0.0.0.0", () => {
  const origin = requestOrigin({
    url: "http://0.0.0.0:4317/api/instagram/login",
    headers: { get: (name) => (name === "host" ? "localhost:4317" : null) },
  });
  assert.equal(origin, "http://localhost:4317");
});

test("долгий токен запоминает срок", () => {
  assert.deepEqual(parseLongLivedToken({ access_token: "long", token_type: "bearer", expires_in: 5184000 }), {
    accessToken: "long",
    expiresIn: 5184000,
  });
});

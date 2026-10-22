import assert from "node:assert/strict";
import test from "node:test";
import { absolutizeImage, extractProductImage, mergeProductImages } from "./catalog-image.ts";

test("extractProductImage skips empty meta and uses iblock src", () => {
  const html = `
    <meta property="og:image" content="" />
    <meta itemprop="image" content="">
    <img src="/upload/iblock/abc/photo.JPG" alt="x" />
  `;
  assert.equal(extractProductImage(html), "https://iordani.com/upload/iblock/abc/photo.JPG");
});

test("extractProductImage prefers non-empty itemprop", () => {
  const html = `<meta itemprop="image" content="/upload/iblock/af5/ring.JPG">`;
  assert.equal(extractProductImage(html), "https://iordani.com/upload/iblock/af5/ring.JPG");
});

test("extractProductImage ignores nophoto placeholders", () => {
  const html = `<img src="/local/images/nophoto.png" /><meta itemprop="image" content="">`;
  assert.equal(extractProductImage(html), null);
});

test("absolutizeImage normalizes protocol-relative and absolute paths", () => {
  assert.equal(absolutizeImage("//cdn.example/a.jpg"), "https://cdn.example/a.jpg");
  assert.equal(absolutizeImage("/upload/x.JPG"), "https://iordani.com/upload/x.JPG");
  assert.equal(absolutizeImage(""), null);
});

test("mergeProductImages keeps previous photo when crawl returns null", () => {
  const merged = mergeProductImages(
    [
      { url: "https://iordani.com/a/", image: null },
      { url: "https://iordani.com/b/", image: "https://iordani.com/new.JPG" },
    ],
    new Map([
      ["https://iordani.com/a/", "https://iordani.com/old.JPG"],
      ["https://iordani.com/b/", "https://iordani.com/older.JPG"],
    ]),
  );
  assert.equal(merged[0].image, "https://iordani.com/old.JPG");
  assert.equal(merged[1].image, "https://iordani.com/new.JPG");
});

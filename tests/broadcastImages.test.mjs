import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_IMAGES, MAX_IMAGE_BYTES, parseImages, imageUrl, buildLineMessages, mailImageNote, imageIdFromRequest,
} from "../api/_lib/broadcastImages.js";

const jpeg = (bytes) => `data:image/jpeg;base64,${Buffer.alloc(bytes, 7).toString("base64")}`;
const is400 = (e) => e.status === 400;

test("parseImages: dataURL を mime とバイト列に直す。未指定は空", () => {
  assert.deepEqual(parseImages(undefined), []);
  assert.deepEqual(parseImages([]), []);
  const out = parseImages([jpeg(10), `data:image/png;base64,${Buffer.from("png!").toString("base64")}`]);
  assert.equal(out.length, 2);
  assert.equal(out[0].mime, "image/jpeg");
  assert.equal(out[0].buffer.length, 10);
  assert.equal(out[1].mime, "image/png");
  assert.equal(out[1].buffer.toString(), "png!");
});

test("parseImages: 枚数オーバー・画像以外・大きすぎ・配列以外は 400", () => {
  assert.throws(() => parseImages(Array.from({ length: MAX_IMAGES + 1 }, () => jpeg(4))), is400);
  assert.throws(() => parseImages(["data:application/pdf;base64,AAAA"]), is400);
  assert.throws(() => parseImages(["https://example.com/a.jpg"]), is400);
  assert.throws(() => parseImages(["data:image/jpeg;base64,"]), is400);
  assert.throws(() => parseImages([jpeg(MAX_IMAGE_BYTES + 1)]), is400);
  assert.throws(() => parseImages("data:image/jpeg;base64,AAAA"), is400);
  assert.equal(parseImages([jpeg(MAX_IMAGE_BYTES)]).length, 1, "上限ちょうどは通す");
});

test("imageUrl / buildLineMessages / mailImageNote", () => {
  assert.equal(imageUrl("https://example.jp/", "AbCdEf123456", "image/jpeg"), "https://example.jp/bc-img/AbCdEf123456.jpg");
  assert.equal(imageUrl("https://example.jp", "AbCdEf123456", "image/png"), "https://example.jp/bc-img/AbCdEf123456.png");
  assert.deepEqual(buildLineMessages("こんにちは"), [{ type: "text", text: "こんにちは" }]);
  assert.deepEqual(buildLineMessages("本文", ["https://x/1.jpg"]), [
    { type: "text", text: "本文" },
    { type: "image", originalContentUrl: "https://x/1.jpg", previewImageUrl: "https://x/1.jpg" },
  ]);
  assert.equal(mailImageNote([]), "");
  assert.equal(mailImageNote(["https://x/1.jpg", "https://x/2.jpg"]), "\n\n▼添付画像（2枚・タップで開きます）\nhttps://x/1.jpg\nhttps://x/2.jpg");
});

test("imageIdFromRequest: rewrite 後の query・?img=・/bc-img/ のどれからでも取り出し、不正なIDは空", () => {
  assert.equal(imageIdFromRequest({ query: { img: "AbCdEf1234567890.jpg" }, url: "/api/public-cohorts" }), "AbCdEf1234567890");
  assert.equal(imageIdFromRequest({ url: "/api/public-cohorts?img=AbCdEf1234567890" }), "AbCdEf1234567890");
  assert.equal(imageIdFromRequest({ url: "/bc-img/AbCdEf1234567890.png" }), "AbCdEf1234567890");
  assert.equal(imageIdFromRequest({ url: "/api/public-cohorts?img=../../etc/passwd" }), "");
  assert.equal(imageIdFromRequest({ url: "/api/public-cohorts?img=short" }), "");
  assert.equal(imageIdFromRequest({ url: "/api/public-cohorts" }), "");
});

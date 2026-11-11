import { test } from "node:test";
import assert from "node:assert/strict";
import { request } from "../src/google.js";

test("a signed-in call sends the access token", () => {
  assert.deepEqual(request("tok", "https://x/values"), { url: "https://x/values", headers: { Authorization: "Bearer tok", "Content-Type": "application/json" } });
});

test("a call without sign-in sends the API key instead, for sheets shared by link", () => {
  assert.deepEqual(request({ key: "k&1" }, "https://x/values"), { url: "https://x/values?key=k%261", headers: { "Content-Type": "application/json" } });
  assert.equal(request({ key: "k" }, "https://x/values:batchGet?ranges=a").url, "https://x/values:batchGet?ranges=a&key=k");
});

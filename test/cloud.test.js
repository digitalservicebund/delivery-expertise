import { test } from "node:test";
import assert from "node:assert/strict";
import { relevance, matches } from "../src/cloud.js";

const keys = ["frontend", "backend", "security"];

test("team signals outweigh discipline-wide demand", () => {
  const w = relevance(keys, {
    team: { demand: { frontend: 3 }, days: { backend: 40 }, rated: { security: 1 } },
    org: { frontend: 10, backend: 10, security: 30 },
  });
  assert.ok(w.frontend > w.security);
  assert.ok(w.backend > w.security);
});

test("weights are normalised to 0..1 with the strongest at 1", () => {
  const w = relevance(keys, { team: { demand: { frontend: 2 } }, org: {} });
  assert.equal(w.frontend, 1);
  assert.equal(w.backend, 0);
});

test("with no data at all every area weighs the same", () => {
  const w = relevance(keys, {});
  assert.deepEqual(new Set(Object.values(w)), new Set([0]));
});

test("search matches words in any order, case-insensitively", () => {
  assert.ok(matches("DevOps, CI/CD & Infrastructure", "infra ci"));
  assert.ok(matches("Data & AI", ""));
  assert.ok(!matches("Frontend", "back"));
});

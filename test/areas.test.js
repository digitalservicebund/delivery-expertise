import { test } from "node:test";
import assert from "node:assert/strict";
import { AREA_HEADER, seedAreaRows, readAreas, areaIssues, AREAS, AREA_NAMES, DEFAULT_BUCKETS, DEFAULT_BUCKET_AREAS, COP } from "../src/areas.js";

test("the areas tab is seeded from the built-in list, one row per area", () => {
  assert.deepEqual(AREA_HEADER, ["area", "default_bucket", "support", "operative", "conceptual", "strategic", "comprehensive"]);
  const rows = seedAreaRows();
  assert.equal(rows.length, AREA_NAMES.length);
  assert.deepEqual(rows.find((r) => r.area === "CI/CD"), {
    area: "CI/CD", default_bucket: "DevOps, CI/CD & Infrastructure", support: "platform",
    operative: AREAS.find(([n]) => n === "CI/CD")[2][0], conceptual: AREAS.find(([n]) => n === "CI/CD")[2][1],
    strategic: AREAS.find(([n]) => n === "CI/CD")[2][2], comprehensive: AREAS.find(([n]) => n === "CI/CD")[2][3],
  });
});

test("reading the seed gives back the built-in list, and an empty tab falls back to it", () => {
  for (const catalogue of [readAreas(seedAreaRows()), readAreas([])]) {
    assert.deepEqual([...catalogue.names].sort(), [...AREA_NAMES].sort());
    assert.deepEqual(catalogue.defaultBuckets, DEFAULT_BUCKETS);
    assert.deepEqual(catalogue.defaultBucketAreas, DEFAULT_BUCKET_AREAS);
    assert.deepEqual([...catalogue.areas].sort(), [...AREAS].sort());
  }
});

test("rows edited in the sheet are read as they are; unknown support counts as the community of practice", () => {
  const { areas, names, defaultBuckets } = readAreas([
    { area: "Rust", default_bucket: "Systems", support: "", operative: "Write Rust", conceptual: "", strategic: "", comprehensive: "" },
    { area: "Kubernetes", default_bucket: "Platform", support: "platform", operative: "a", conceptual: "b", strategic: "c", comprehensive: "d" },
    { area: "", default_bucket: "Ignored" },
  ]);
  assert.deepEqual(names, ["Rust", "Kubernetes"]);
  assert.deepEqual(defaultBuckets, ["Systems", "Platform"]);
  assert.equal(areas[0][1], COP);
  assert.equal(areas[1][1], "the platform team");
  // Missing examples stay empty: the survey falls back to generic ones.
  assert.deepEqual(areas[0][2], ["Write Rust", "", "", ""]);
});

test("the set-up warns about an areas tab that doesn't give exactly ten default buckets or leaves areas without one", () => {
  assert.deepEqual(areaIssues(seedAreaRows()), []);
  const issues = areaIssues([{ area: "Rust", default_bucket: "Systems" }, { area: "Go", default_bucket: "" }]);
  assert.deepEqual(issues, ["1 default bucket: exactly 10, please", "No default bucket: Go"]);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { AREA_HEADER, readAreas, areaIssues, areasAfterGrouping, COP } from "../src/areas.js";
import { AREA_ROWS } from "./fixtures/areas.js";

test("the areas tab has the area, its bucket, the support it can draw on and when it was grouped", () => {
  assert.deepEqual(AREA_HEADER, ["area", "bucket", "support", "grouped_at"]);
});

test("the areas tab gives the areas, their names, which bucket each is in and the buckets in order", () => {
  const { areas, names, buckets, bucketRows } = readAreas(AREA_ROWS);
  assert.equal(names.length, AREA_ROWS.length);
  assert.equal(buckets.length, 10);
  assert.equal(buckets[0], "Discovery & Inception");
  assert.deepEqual(bucketRows.filter((r) => r.bucket === "Frontend").map((r) => r.area), ["Frontend development", "Design systems"]);
  assert.deepEqual(areas.find(([n]) => n === "CI/CD"), ["CI/CD", "the platform team"]);
});

test("an empty tab gives nothing: the sheet is the only source", () => {
  assert.deepEqual(readAreas([]), { areas: [], names: [], buckets: [], bucketRows: [] });
});

test("rows edited in the sheet are read as they are; unknown support counts as the community of practice", () => {
  const { areas, names, buckets, bucketRows } = readAreas([
    { area: "Rust", bucket: "Systems", support: "", grouped_at: "2026-11-01" },
    { area: "Kubernetes", bucket: "Platform", support: "platform" },
    { area: "Go", bucket: "" },
    { area: "", bucket: "Ignored" },
  ]);
  assert.deepEqual(names, ["Rust", "Kubernetes", "Go"]);
  assert.deepEqual(buckets, ["Systems", "Platform"]);
  // An area in no bucket yet is on the list, but in no bucket.
  assert.deepEqual(bucketRows, [
    { area: "Rust", bucket: "Systems", generated_at: "2026-11-01" },
    { area: "Kubernetes", bucket: "Platform", generated_at: "" },
  ]);
  assert.equal(areas[0][1], COP);
  assert.equal(areas[1][1], "the platform team");
});

test("the set-up warns about an empty areas tab, not exactly ten buckets, areas in none, and buckets missing from the buckets tab", () => {
  const listed = [...new Set(AREA_ROWS.map((r) => r.bucket))].map((bucket) => ({ bucket }));
  assert.deepEqual(areaIssues(AREA_ROWS, listed), []);
  assert.deepEqual(areaIssues([], []), ["No areas yet: fill in the tab"]);
  const issues = areaIssues([{ area: "Rust", bucket: "Systems" }, { area: "Go", bucket: "" }], [{ bucket: "Web" }]);
  assert.deepEqual(issues, [
    "1 bucket: exactly 10, please",
    "In no bucket: Go",
    "Not on the buckets tab: Systems. Add it there, with its examples",
    "On the buckets tab but no area is in it: Web",
  ]);
});

test("applying a grouping sets each area's bucket and adds new areas, keeping every other column", () => {
  const rows = [
    { area: "React", bucket: "Frontend", support: "cop", grouped_at: "old", notes: "keep me" },
    { area: "Go", bucket: "Backend", support: "platform", grouped_at: "old", notes: "" },
    { area: "Cobol", bucket: "Legacy", support: "cop", grouped_at: "old", notes: "not in the grouping" },
  ];
  const groups = [{ name: "Web", areas: ["React", "Vue"] }, { name: "Services", areas: ["Go"] }];
  assert.deepEqual(areasAfterGrouping(rows, groups, "T"), [
    { area: "React", bucket: "Web", support: "cop", grouped_at: "T", notes: "keep me" },
    { area: "Go", bucket: "Services", support: "platform", grouped_at: "T", notes: "" },
    // Left alone: the grouping never drops an area, so this only happens when it was edited in meanwhile.
    { area: "Cobol", bucket: "Legacy", support: "cop", grouped_at: "old", notes: "not in the grouping" },
    { area: "Vue", bucket: "Web", support: "cop", grouped_at: "T", notes: "" },
  ]);
});

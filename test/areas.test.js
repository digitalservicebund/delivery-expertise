import { test } from "node:test";
import assert from "node:assert/strict";
import { AREA_HEADER, readAreas, areaIssues, areasAfterGrouping, canonicalArea, canonicalDemand, likelyDuplicates, COP } from "../src/areas.js";
import { AREA_ROWS } from "./fixtures/areas.js";

test("the areas tab has the area, its bucket, the support it can draw on and when it was grouped", () => {
  assert.deepEqual(AREA_HEADER, ["area", "bucket", "support", "grouped_at", "same_as", "family", "description"]);
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
  assert.deepEqual(readAreas([]), { areas: [], names: [], buckets: [], bucketRows: [], aliases: new Map(), aliasesOf: new Map(), familyOf: new Map() });
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
    { area: "React", bucket: "Web", support: "cop", grouped_at: "T", notes: "keep me", same_as: "", family: "", description: "" },
    { area: "Go", bucket: "Services", support: "platform", grouped_at: "T", notes: "", same_as: "", family: "", description: "" },
    // Left alone: the grouping never drops an area, so this only happens when it was edited in meanwhile.
    { area: "Cobol", bucket: "Legacy", support: "cop", grouped_at: "old", notes: "not in the grouping", same_as: "", family: "", description: "" },
    { area: "Vue", bucket: "Web", support: "cop", grouped_at: "T", notes: "", same_as: "", family: "", description: "" },
  ]);
});

test("an area can be another name for one on the list: same_as points to it, and it drops out of the list", () => {
  const { names, bucketRows, aliases, aliasesOf } = readAreas([
    { area: "Frontend development", bucket: "Web" },
    { area: "front-end", bucket: "Web", same_as: "Frontend development" },
    { area: "BundID", same_as: "BundID integration" },
    { area: "BundID integration", bucket: "Identity" },
    // Pointing at nothing on the list: kept as an area of its own.
    { area: "Vue", bucket: "Web", same_as: "Nonexistent" },
  ]);
  assert.deepEqual(names, ["Frontend development", "BundID integration", "Vue"]);
  assert.deepEqual(bucketRows.map((r) => r.area), ["Frontend development", "BundID integration", "Vue"]);
  assert.equal(aliases.get("front-end"), "Frontend development");
  assert.equal(aliases.get("bundid"), "BundID integration");
  assert.deepEqual(aliasesOf.get("BundID integration"), ["BundID"]);
});

test("answers naming another name count for the area it stands for, once", () => {
  const { aliases } = readAreas([{ area: "Frontend development", bucket: "Web" }, { area: "front-end", same_as: "Frontend development" }]);
  assert.equal(canonicalArea(" Front-End ", aliases), "Frontend development");
  assert.equal(canonicalArea("Rust", aliases), "Rust");
  const rows = canonicalDemand([
    { expertise: "Web", areas: "front-end; Frontend development; CSS", critical: "front-end" },
    { expertise: "front-end", areas: "" },
  ], aliases);
  assert.deepEqual(rows, [
    { expertise: "Web", areas: "Frontend development; CSS", critical: "Frontend development" },
    { expertise: "Frontend development", areas: "" },
  ]);
});

test("an area's family places it: with no bucket, it goes where most of its family is", () => {
  const { familyOf, bucketRows } = readAreas([
    { area: "React", bucket: "Web", family: "Web frontend" },
    { area: "TypeScript", bucket: "Web", family: "Web frontend" },
    { area: "Vue", bucket: "", family: "Web frontend" },
    { area: "Kotlin", bucket: "", family: "JVM" },
  ]);
  assert.equal(familyOf.get("Vue"), "Web frontend");
  assert.deepEqual(bucketRows.find((r) => r.area === "Vue"), { area: "Vue", bucket: "Web", generated_at: "", inferred: true });
  // No family-mate in a bucket: still in none.
  assert.equal(bucketRows.find((r) => r.area === "Kotlin"), undefined);
});

test("likely duplicates ignore case, punctuation and words like development or integration", () => {
  assert.deepEqual(likelyDuplicates(["Frontend development", "front-end", "Front End", "BundID", "BundID integration", "Rust"]), [
    ["Frontend development", "front-end"],
    ["Frontend development", "Front End"],
    ["BundID", "BundID integration"],
  ]);
});

test("applying a grouping also writes other names and families, without blanking families it doesn't name", () => {
  const rows = [
    { area: "Frontend development", bucket: "Web", support: "cop", grouped_at: "", same_as: "", family: "Web frontend" },
    { area: "front-end", bucket: "Web", support: "cop", grouped_at: "", same_as: "", family: "" },
    { area: "Go", bucket: "Backend", support: "cop", grouped_at: "", same_as: "", family: "Go" },
  ];
  const groups = [{ name: "Web", areas: ["Frontend development", "React"] }, { name: "Services", areas: ["Go"] }];
  const out = areasAfterGrouping(rows, groups, "T", { same: new Map([["front-end", "Frontend development"], ["frontend", "Frontend development"]]), families: new Map([["React", "Web frontend"]]) });
  assert.deepEqual(out.map((r) => [r.area, r.bucket, r.same_as, r.family]), [
    ["Frontend development", "Web", "", "Web frontend"],
    ["front-end", "Web", "Frontend development", ""],
    ["Go", "Services", "", "Go"],
    ["React", "Web", "", "Web frontend"],
    ["frontend", "Web", "Frontend development", ""],
  ]);
});

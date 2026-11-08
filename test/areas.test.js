import { test } from "node:test";
import assert from "node:assert/strict";
import { AREA_HEADER, readAreas, areaIssues, areasMissingFrom, COP } from "../src/areas.js";
import { AREA_ROWS } from "./fixtures/areas.js";

test("the areas tab has the area, its default bucket, support and one example per working method", () => {
  assert.deepEqual(AREA_HEADER, ["area", "default_bucket", "support", "operative", "conceptual", "strategic", "comprehensive"]);
});

test("the areas tab gives the areas, their names, the default buckets in order and the areas each covers", () => {
  const { areas, names, defaultBuckets, defaultBucketAreas } = readAreas(AREA_ROWS);
  assert.equal(names.length, AREA_ROWS.length);
  assert.equal(defaultBuckets.length, 10);
  assert.equal(defaultBuckets[0], "Discovery & Inception");
  assert.deepEqual(defaultBucketAreas.Frontend, ["Frontend development", "Design systems"]);
  assert.deepEqual(areas.find(([n]) => n === "CI/CD"), ["CI/CD", "the platform team", ["Do CI/CD", "Plan CI/CD", "Lead CI/CD", "Shape CI/CD"]]);
});

test("an empty tab gives nothing: the sheet is the only source", () => {
  assert.deepEqual(readAreas([]), { areas: [], names: [], defaultBuckets: [], defaultBucketAreas: {} });
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

test("the set-up warns about an empty areas tab, or one without exactly ten default buckets or with areas lacking one", () => {
  assert.deepEqual(areaIssues(AREA_ROWS), []);
  assert.deepEqual(areaIssues([]), ["No areas yet: fill in the tab"]);
  const issues = areaIssues([{ area: "Rust", default_bucket: "Systems" }, { area: "Go", default_bucket: "" }]);
  assert.deepEqual(issues, ["1 default bucket: exactly 10, please", "No default bucket: Go"]);
});

test("areas in the buckets but not in the areas tab are added to it, with the default bucket of their bucket-mates", () => {
  const buckets = [{ area: "Search", bucket: "Data" }, { area: "Elasticsearch", bucket: "Data" }, { area: "Kubernetes", bucket: "Platform" }, { area: "Kubernetes", bucket: "Platform" }];
  assert.deepEqual(areasMissingFrom(AREA_ROWS, buckets), [
    { area: "Elasticsearch", default_bucket: "Data & AI", support: "cop", operative: "", conceptual: "", strategic: "", comprehensive: "" },
    // No bucket-mate on the list: left for the discipline head to fill in.
    { area: "Kubernetes", default_bucket: "", support: "cop", operative: "", conceptual: "", strategic: "", comprehensive: "" },
  ]);
  assert.deepEqual(areasMissingFrom(AREA_ROWS, []), []);
});

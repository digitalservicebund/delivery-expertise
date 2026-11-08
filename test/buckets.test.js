import { test } from "node:test";
import assert from "node:assert/strict";
import { compareBuckets, bucketPrompt, parseBuckets, readBuckets, bucketRows, areasToGroup, pending, topAreas, inBuckets, BUCKET_HEADER } from "../src/buckets.js";
import { liveLayout } from "../src/sheets.js";

test("the areas to group are the standard ones, every surveyed area and every grouped one, without domain expertise", () => {
  const demand = [{ expertise: "Frontend" }, { expertise: "Rust" }, { expertise: "Domain expertise", domain: "Tax" }, { expertise: " " }];
  const current = [{ area: "Old area", bucket: "Backend" }];
  assert.deepEqual(areasToGroup(demand, current, ["Frontend", "Backend"]), ["Backend", "Frontend", "Old area", "Rust"]);
});

test("the buckets tab reads back as named groups in tab order", () => {
  const rows = [
    { area: "Backend", bucket: "Backend", generated_at: "2026-11-01T10:00:00Z" },
    { area: "Frontend", bucket: "Web", generated_at: "2026-11-01T10:00:00Z" },
    { area: "APIs", bucket: "Backend", generated_at: "2026-11-01T10:00:00Z" },
    { area: "", bucket: "Ignored" },
  ];
  assert.deepEqual(readBuckets(rows), {
    groups: [{ name: "Backend", areas: ["APIs", "Backend"] }, { name: "Web", areas: ["Frontend"] }],
    generatedAt: "2026-11-01T10:00:00Z",
  });
  assert.deepEqual(readBuckets([]), { groups: [], generatedAt: "" });
});

test("the IC form and supply ask about the buckets, or the standard areas until there are any", () => {
  assert.deepEqual(topAreas([{ area: "CSS", bucket: "Web" }, { area: "Go", bucket: "Backend" }, { area: "JS", bucket: "Web" }], ["Frontend"]), ["Web", "Backend"]);
  assert.deepEqual(topAreas([], ["Frontend"]), ["Frontend"]);
});

test("the discipline sheet gets a buckets tab, and the aggregate sheet imports it for everyone", () => {
  const layout = liveLayout({ discipline: "D" });
  assert.deepEqual(layout.discipline.buckets, { header: BUCKET_HEADER });
  assert.equal(layout.aggregate.buckets.formula, '=QUERY(IMPORTRANGE("D", "buckets!A:C"), "select Col1, Col2, Col3 where Col1 is not null", 1)');
});

test("demand and planned adjustments are counted per bucket, so they meet supply, which is per bucket", () => {
  const rows = [{ area: "React", bucket: "Web" }, { area: "Frontend", bucket: "Web" }];
  const demand = [
    { expertise: "React", method: "operative", people: "2" },
    { expertise: "Rust", method: "operative", people: "1" },
    { expertise: "Domain expertise", domain: "Tax", method: "conceptual", people: "1" },
  ];
  const plan = [{ kind: "adjust", subject: "Frontend", value: "1" }, { kind: "tech-lead", subject: "Frontend", method: "strategic" }];
  const out = inBuckets({ demand, plan }, rows);
  assert.deepEqual(out.demand.map((r) => r.expertise), ["Web", "Rust", "Domain expertise"]);
  assert.equal(out.demand[0].people, "2");
  assert.deepEqual(out.plan.map((r) => r.subject), ["Web", "Frontend"]);
  // No buckets yet: everything stays per area, like the standard areas the IC form asks about then.
  assert.deepEqual(inBuckets({ demand, plan }, []), { demand, plan });
});

test("buckets are written one row per area, stamped", () => {
  assert.deepEqual(BUCKET_HEADER, ["area", "bucket", "generated_at"]);
  assert.deepEqual(bucketRows([{ name: "Web", areas: ["Frontend", "CSS"] }], "T"), [
    { area: "CSS", bucket: "Web", generated_at: "T" },
    { area: "Frontend", bucket: "Web", generated_at: "T" },
  ]);
});

test("admins are prompted for ungrouped areas and after a quarter", () => {
  const current = [{ area: "Backend", bucket: "Backend", generated_at: "2026-10-01T00:00:00Z" }];
  assert.deepEqual(pending(current, ["Backend", "Rust"], new Date("2026-11-01")), { ungrouped: ["Rust"], stale: false, empty: false });
  assert.equal(pending(current, ["Backend"], new Date("2027-01-15")).stale, true);
  assert.deepEqual(pending([], ["Backend"], new Date("2026-11-01")), { ungrouped: ["Backend"], stale: false, empty: true });
});

test("an unchanged grouping keeps every name and reports nothing", () => {
  const current = [{ name: "Web", areas: ["CSS", "Frontend"] }];
  const result = compareBuckets(current, [{ name: "Frontend", areas: ["CSS", "Frontend"] }]);
  assert.deepEqual(result.buckets, [{ name: "Web", previous: "Web", areas: ["CSS", "Frontend"] }]);
  assert.equal(result.unchanged, true);
  assert.deepEqual([result.moves, result.added, result.renamed, result.created, result.removed], [[], [], [], [], []]);
});

test("new areas, moves, renames, splits and merges are reported against the current buckets", () => {
  const current = [
    { name: "Backend", areas: ["APIs", "Backend", "Databases"] },
    { name: "Web", areas: ["CSS", "Frontend"] },
    { name: "Ops", areas: ["CI", "Kubernetes"] },
    { name: "Infra", areas: ["Terraform"] },
  ];
  const proposed = [
    { name: "Databases", areas: ["APIs", "Databases"] }, // most of Backend, but without the Backend area: renamed
    { name: "Rust", areas: ["Backend", "Rust"] }, // split off Backend
    { name: "Frontend", areas: ["CSS", "Frontend"] }, // Web, named by hand, keeps its name
    { name: "CI", areas: ["CI", "Kubernetes", "Terraform"] }, // Ops absorbs Infra
  ];
  const result = compareBuckets(current, proposed);
  assert.equal(result.unchanged, false);
  assert.deepEqual(result.buckets.map((b) => [b.name, b.previous]), [["Databases", "Backend"], ["Rust", null], ["Web", "Web"], ["Ops", "Ops"]]);
  assert.deepEqual(result.added, [{ area: "Rust", to: "Rust" }]);
  assert.deepEqual(result.moves, [
    { area: "Backend", from: "Backend", to: "Rust" },
    { area: "Terraform", from: "Infra", to: "Ops" },
  ]);
  assert.deepEqual(result.renamed, [{ from: "Backend", to: "Databases" }]);
  assert.deepEqual(result.created, [{ name: "Rust", splitFrom: "Backend" }]);
  assert.deepEqual(result.removed, [{ name: "Infra", mergedInto: "Ops" }]);
});

test("the prompt for Gemini lists every area once, the current buckets, and the answer format", () => {
  const text = bucketPrompt(["CSS", "Frontend", "Rust"], [{ name: "Web", areas: ["CSS", "Frontend"] }]);
  assert.match(text, /at most 10 buckets/);
  assert.match(text, /^- Rust$/m);
  assert.match(text, /^Web: CSS, Frontend$/m);
  assert.match(text, /area \| bucket/);
  assert.doesNotMatch(bucketPrompt(["Rust"], []), /Current buckets/);
});

test("Gemini's answer is read leniently, but every area must be in exactly one of at most 10 buckets", () => {
  const answer = "Here you go:\n```\narea | bucket\n| CSS | Web |\n**Frontend** | Web\nrust | Systems\n```";
  assert.deepEqual(parseBuckets(answer, ["CSS", "Frontend", "Rust"]), {
    groups: [{ name: "Systems", areas: ["Rust"] }, { name: "Web", areas: ["CSS", "Frontend"] }],
    errors: [],
  });
  const bad = parseBuckets("CSS | Web\nCSS | Other\nGo | Web", ["CSS", "Frontend"]);
  assert.deepEqual(bad.errors, ["CSS is in more than one bucket: Web, Other", "Not one of the areas: Go", "Missing: Frontend"]);
  const many = Array.from({ length: 11 }, (_, i) => `A${i}`);
  assert.deepEqual(parseBuckets(many.map((a) => `${a} | ${a}`).join("\n"), many).errors, ["11 buckets: at most 10, please"]);
});

test("with no current buckets every proposed one is new", () => {
  const result = compareBuckets([], [{ name: "Web", areas: ["Frontend"] }]);
  assert.deepEqual(result.buckets, [{ name: "Web", previous: null, areas: ["Frontend"] }]);
  assert.deepEqual(result.added, [{ area: "Frontend", to: "Web" }]);
  assert.deepEqual(result.created, [{ name: "Web", splitFrom: null }]);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { compareBuckets, bucketPrompt, parseBuckets, readBuckets, bucketRows, areasToGroup, pending, topAreas, inBuckets, BUCKET_HEADER, HISTORY_HEADER, nextHistory, aliasesOf, renamedTo, inferHistory, effectiveBuckets, suggestBuckets, demandAreas, surveySections } from "../src/buckets.js";
import { liveLayout } from "../src/sheets.js";
import { AREA_NAMES, DEFAULT_BUCKETS, DEFAULT_BUCKET_AREAS, RETIRED_DEFAULT_AREAS, AREA_HEADER } from "../src/areas.js";

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
  assert.deepEqual(layout.discipline["bucket-history"], { header: HISTORY_HEADER });
  assert.match(layout.aggregate["bucket-history"].formula, /IMPORTRANGE\("D", "bucket-history!A:C"\)/);
  assert.deepEqual(layout.discipline.areas, { header: AREA_HEADER });
  assert.match(layout.aggregate.areas.formula, /IMPORTRANGE\("D", "areas!A:G"\)/);
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

test("prototype ratings and activity are per area, so they are mapped to buckets too, when given", () => {
  const rows = [{ area: "React", bucket: "Web" }];
  const out = inBuckets({ demand: [], plan: [], assessments: [{ expertise: "React", level: 4 }], activity: [{ expertise: "React" }] }, rows);
  assert.deepEqual([out.assessments[0].expertise, out.activity[0].expertise], ["Web", "Web"]);
  assert.deepEqual(Object.keys(inBuckets({ demand: [], plan: [] }, rows)), ["demand", "plan"]);
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
  assert.match(text, /exactly 10 buckets/);
  assert.match(text, /^- Rust$/m);
  assert.match(text, /^Web: CSS, Frontend$/m);
  assert.match(text, /area \| bucket/);
  assert.doesNotMatch(bucketPrompt(["Rust"], []), /Current buckets/);
});

test("Gemini's answer is read leniently, but every area must be in exactly one of exactly 10 buckets", () => {
  const answer = "Here you go:\n```\narea | bucket\n| CSS | Web |\n**Frontend** | Web\nrust | Systems\n```";
  assert.deepEqual(parseBuckets(answer, ["CSS", "Frontend", "Rust"], 2), {
    groups: [{ name: "Systems", areas: ["Rust"] }, { name: "Web", areas: ["CSS", "Frontend"] }],
    errors: [],
  });
  const bad = parseBuckets("CSS | Web\nCSS | Other\nGo | Web", ["CSS", "Frontend"], 1);
  assert.deepEqual(bad.errors, ["CSS is in more than one bucket: Web, Other", "Not one of the areas: Go", "Missing: Frontend"]);
  const many = Array.from({ length: 11 }, (_, i) => `A${i}`);
  assert.deepEqual(parseBuckets(many.map((a) => `${a} | ${a}`).join("\n"), many).errors, ["11 buckets: exactly 10, please"]);
  assert.deepEqual(parseBuckets(many.map((a, i) => `${a} | B${i % 9}`).join("\n"), many).errors, ["9 buckets: exactly 10, please"]);
  // Fewer than ten areas: one bucket each.
  assert.deepEqual(parseBuckets("A | X\nB | X", ["A", "B"]).errors, ["1 bucket: exactly 2, please"]);
});

test("with no current buckets every proposed one is new", () => {
  const result = compareBuckets([], [{ name: "Web", areas: ["Frontend"] }]);
  assert.deepEqual(result.buckets, [{ name: "Web", previous: null, areas: ["Frontend"] }]);
  assert.deepEqual(result.added, [{ area: "Frontend", to: "Web" }]);
  assert.deepEqual(result.created, [{ name: "Web", splitFrom: null }]);
});

test("applying a regrouping records where each old bucket went, so older answers follow it", () => {
  const current = [
    { name: "Backend", areas: ["APIs", "Backend", "Databases"] },
    { name: "Web", areas: ["CSS", "Frontend"] },
    { name: "Ops", areas: ["CI", "Kubernetes"] },
    { name: "Infra", areas: ["Terraform"] },
  ];
  const result = compareBuckets(current, [
    { name: "Databases", areas: ["APIs", "Databases"] },
    { name: "Rust", areas: ["Backend", "Rust"] },
    { name: "Frontend", areas: ["CSS", "Frontend"] },
    { name: "CI", areas: ["CI", "Kubernetes", "Terraform"] },
  ]);
  assert.deepEqual(HISTORY_HEADER, ["bucket", "now", "changed_at"]);
  // Backend was renamed Databases; Infra merged into Ops. Web and Ops kept their names.
  assert.deepEqual(nextHistory([], result, "T1"), [
    { bucket: "Backend", now: "Databases", changed_at: "T1" },
    { bucket: "Infra", now: "Ops", changed_at: "T1" },
  ]);
});

test("history follows chains of changes and forgets names that are buckets again", () => {
  const before = [{ bucket: "Infra", now: "Ops", changed_at: "T1" }, { bucket: "Web", now: "Frontend", changed_at: "T1" }];
  // Now Ops is merged into Platform, and Web, a new area, is a bucket of its own again.
  const result = compareBuckets(
    [{ name: "Ops", areas: ["CI"] }, { name: "Platform", areas: ["Helm", "Kubernetes"] }, { name: "Frontend", areas: ["CSS"] }],
    [{ name: "Kubernetes", areas: ["CI", "Helm", "Kubernetes"] }, { name: "CSS", areas: ["CSS"] }, { name: "Web", areas: ["Web"] }],
  );
  assert.deepEqual(result.buckets.map((b) => b.name), ["Platform", "Frontend", "Web"]);
  assert.deepEqual(nextHistory(before, result, "T2"), [
    { bucket: "Infra", now: "Platform", changed_at: "T1" },
    { bucket: "Ops", now: "Platform", changed_at: "T2" },
  ]);
});

test("old bucket names become aliases of the bucket they went to", () => {
  const history = [{ bucket: "Infra", now: "Platform" }, { bucket: "Ops", now: "Platform" }, { bucket: "", now: "X" }];
  assert.deepEqual(aliasesOf(history), { Platform: ["Infra", "Ops"] });
  assert.deepEqual([...renamedTo(history)], [["Infra", "Platform"], ["Ops", "Platform"]]);
});

test("rows naming an old bucket are counted under the bucket it went to", () => {
  const out = inBuckets({ demand: [], plan: [{ kind: "adjust", subject: "Infra" }] }, [{ area: "Terraform", bucket: "Platform" }], [{ bucket: "Infra", now: "Platform" }]);
  assert.equal(out.plan[0].subject, "Platform");
});

test("former buckets are found in the IC responses' columns and mapped retroactively by their areas", () => {
  const headers = ["Timestamp", "Email address", "Expertise [Web]", "Expertise [Data & AI]", "Expertise [Kubernetes]", "Expertise [Old]", "Expertise [Infra]", "Anything to add?"];
  const buckets = [
    { area: "Frontend development", bucket: "Web" }, { area: "Kubernetes", bucket: "Platform" },
    { area: "Data engineering", bucket: "Data" }, { area: "AI engineering", bucket: "Data" }, { area: "Search", bucket: "Web" },
  ];
  const history = [{ bucket: "Infra", now: "Platform", changed_at: "T1" }];
  const defaults = { "Data & AI": ["Data engineering", "Data analysis", "Search", "Machine learning", "AI engineering"] };
  const { rows, unresolved } = inferHistory(headers, buckets, history, defaults, "T2");
  // Web is a current bucket and Infra is known: neither is inferred again.
  assert.deepEqual(rows, [
    { bucket: "Data & AI", now: "Data", changed_at: "T2" },
    { bucket: "Kubernetes", now: "Platform", changed_at: "T2" },
  ]);
  assert.deepEqual(unresolved, ["Old"]);
  // Without buckets the form still asks about the defaults: nothing to map.
  assert.deepEqual(inferHistory(headers, [], [], defaults, "T2"), { rows: [], unresolved: [] });
});

test("every default bucket's areas are suggested areas", () => {
  assert.deepEqual(Object.keys(DEFAULT_BUCKET_AREAS), DEFAULT_BUCKETS);
  for (const areas of Object.values(DEFAULT_BUCKET_AREAS)) for (const a of areas) assert.ok(AREA_NAMES.includes(a), a);
});

test("every suggested area is in exactly one default bucket", () => {
  const all = Object.values(DEFAULT_BUCKET_AREAS).flat();
  assert.deepEqual([...all].sort(), [...AREA_NAMES].sort());
  for (const areas of Object.values(RETIRED_DEFAULT_AREAS)) for (const a of areas) assert.ok(AREA_NAMES.includes(a), a);
});

test("until a grouping is applied, the default buckets and their areas are the buckets", () => {
  const rows = effectiveBuckets([]);
  assert.deepEqual([...new Set(rows.map((r) => r.bucket))], DEFAULT_BUCKETS);
  assert.ok(rows.some((r) => r.area === "On-call & incident response" && r.bucket === "Software lifecycle"));
  const applied = [{ area: "React", bucket: "Web" }];
  assert.equal(effectiveBuckets(applied), applied);
});

test("rows already naming a current bucket keep it, even when an area of that name sits elsewhere", () => {
  const rows = [{ area: "Backend development", bucket: "Backend" }, { area: "Backend", bucket: "Platform" }, { area: "Kubernetes", bucket: "Platform" }];
  const out = inBuckets({ demand: [{ expertise: "Backend" }, { expertise: "Kubernetes" }] }, rows);
  assert.deepEqual(out.demand.map((r) => r.expertise), ["Backend", "Platform"]);
});

test("a write-in is matched to buckets by name: an exact area first, else buckets sharing words with it", () => {
  const rows = effectiveBuckets([]);
  assert.deepEqual(suggestBuckets("search", rows), ["Data & AI"]);
  assert.deepEqual(suggestBuckets("React frontend", rows).slice(0, 1), ["Frontend"]);
  assert.equal(suggestBuckets("Kubernetes operations", rows)[0], "Software lifecycle");
  assert.deepEqual(suggestBuckets("Rust", rows), []);
});

test("a demand row's areas: the areas column, or the expertise itself in rows from before buckets", () => {
  assert.deepEqual(demandAreas({ expertise: "Frontend", areas: "React; Design systems" }), ["React", "Design systems"]);
  assert.deepEqual(demandAreas({ expertise: "Kubernetes", areas: "" }), ["Kubernetes"]);
  assert.deepEqual(demandAreas({ expertise: "Domain expertise", domain: "Tax" }), []);
});

test("picked areas become one survey section per bucket, in picking order", () => {
  assert.deepEqual(surveySections([
    { name: "React", bucket: "Frontend" }, { name: "Postgres", bucket: "Backend" }, { name: "Design systems", bucket: "Frontend" }, { name: "Rust", bucket: null },
  ]), [
    { bucket: "Frontend", areas: ["React", "Design systems"], grouped: true },
    { bucket: "Backend", areas: ["Postgres"], grouped: true },
    { bucket: "Rust", areas: ["Rust"], grouped: false },
  ]);
});

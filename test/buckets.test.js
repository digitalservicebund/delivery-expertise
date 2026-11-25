import { test } from "node:test";
import assert from "node:assert/strict";
import { compareBuckets, bucketPrompt, parseBuckets, readBuckets, areasToGroup, pending, bucketNames, inBuckets, BUCKET_HEADER, HISTORY_HEADER, nextHistory, aliasesOf, renamedTo, inferHistory, suggestBuckets, demandAreas, areaDemand, areaCritical, bucketGaps, OTHER, surveySections, splitFamilies, fixPrompt, typeDemand, readExamples, bucketsWithoutExamples, bucketRowsAfter } from "../src/buckets.js";
import { liveLayout } from "../src/sheets.js";
import { AREA_HEADER } from "../src/areas.js";
import { CATALOGUE } from "./fixtures/areas.js";

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

test("the IC form and supply ask about the buckets tab's buckets in its order, then any other bucket an area is in", () => {
  const areaBuckets = [{ area: "CSS", bucket: "Web" }, { area: "Go", bucket: "Backend" }, { area: "JS", bucket: "Web" }, { area: "Rust", bucket: "Systems" }];
  assert.deepEqual(bucketNames([{ bucket: "Backend" }, { bucket: "Web" }, { bucket: "" }], areaBuckets), ["Backend", "Web", "Systems"]);
  assert.deepEqual(bucketNames([], areaBuckets), ["Web", "Backend", "Systems"]);
});

test("the discipline sheet gets a buckets tab listing the buckets with their examples, and the aggregate sheet imports it for everyone", () => {
  const layout = liveLayout({ discipline: "D" });
  assert.deepEqual(layout.discipline.buckets, { header: BUCKET_HEADER });
  assert.deepEqual(layout.discipline["bucket-history"], { header: HISTORY_HEADER });
  assert.match(layout.aggregate["bucket-history"].formula, /IMPORTRANGE\("D", "bucket-history!A:C"\)/);
  assert.deepEqual(layout.discipline.areas, { header: AREA_HEADER });
  assert.match(layout.aggregate.areas.formula, /IMPORTRANGE\("D", "areas!A:G"\)/);
  assert.ok(!("bucket-examples" in layout.discipline) && !("bucket-examples" in layout.aggregate));
  assert.equal(layout.aggregate.buckets.formula, '=QUERY(IMPORTRANGE("D", "buckets!A:F"), "select Col1, Col2, Col3, Col4, Col5, Col6 where Col1 is not null", 1)');
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

test("admins are prompted for ungrouped areas and after a quarter", () => {
  const current = [{ area: "Backend", bucket: "Backend", generated_at: "2026-10-01T00:00:00Z" }];
  assert.deepEqual(pending(current, ["Backend", "Rust"], new Date("2026-11-01")), { ungrouped: ["Rust"], stale: false, empty: false });
  assert.equal(pending(current, ["Backend"], new Date("2027-01-15")).stale, true);
  assert.deepEqual(pending([], ["Backend"], new Date("2026-11-01")), { ungrouped: ["Backend"], stale: false, empty: true });
});

test("an unchanged grouping keeps every name and reports nothing", () => {
  const current = [{ name: "Web", areas: ["CSS", "Frontend"] }];
  const result = compareBuckets(current, [{ name: "Web", areas: ["CSS", "Frontend"] }]);
  assert.deepEqual(result.buckets, [{ name: "Web", previous: "Web", areas: ["CSS", "Frontend"] }]);
  assert.equal(result.unchanged, true);
  assert.deepEqual([result.moves, result.added, result.renamed, result.created, result.removed], [[], [], [], [], []]);
});

test("Gemini's names are the buckets' names: a new name for the same areas is a rename", () => {
  const result = compareBuckets([{ name: "Web", areas: ["CSS", "Frontend"] }], [{ name: "Frontend", areas: ["CSS", "Frontend"] }]);
  assert.deepEqual(result.buckets, [{ name: "Frontend", previous: "Web", areas: ["CSS", "Frontend"] }]);
  assert.deepEqual(result.renamed, [{ from: "Web", to: "Frontend" }]);
  assert.equal(result.unchanged, false);
});

test("new areas, moves, renames, splits and merges are reported against the current buckets", () => {
  const current = [
    { name: "Backend", areas: ["APIs", "Backend", "Databases"] },
    { name: "Web", areas: ["CSS", "Frontend"] },
    { name: "Ops", areas: ["CI", "Kubernetes"] },
    { name: "Infra", areas: ["Terraform"] },
  ];
  const proposed = [
    { name: "Databases", areas: ["APIs", "Databases"] }, // most of Backend, under a new name: renamed
    { name: "Rust", areas: ["Backend", "Rust"] }, // split off Backend
    { name: "Web", areas: ["CSS", "Frontend"] }, // kept as it was
    { name: "Ops", areas: ["CI", "Kubernetes", "Terraform"] }, // Ops absorbs Infra
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
  assert.match(text, /exactly 3 buckets/);
  assert.match(text, /^- Rust$/m);
  assert.match(text, /^Web: CSS, Frontend$/m);
  assert.match(text, /area \| bucket/);
  assert.doesNotMatch(bucketPrompt(["Rust"], []), /Current buckets/);
});

test("Gemini's answer is read leniently, but every area must be in exactly one of exactly 10 buckets", () => {
  const answer = "Here you go:\n```\narea | bucket\n| CSS | Web |\n**Frontend** | Web\nrust | Systems\n```\nWeb | a | b | c | d\nSystems | e | f | g | h";
  const { same, families, ...parsed } = parseBuckets(answer, ["CSS", "Frontend", "Rust"], 2);
  assert.equal(same.size + families.size, 0);
  assert.deepEqual(parsed, {
    groups: [{ name: "Systems", areas: ["Rust"] }, { name: "Web", areas: ["CSS", "Frontend"] }],
    errors: [],
  });
  const grouping = (r) => r.errors;
  const bad = parseBuckets("CSS | Web\nCSS | Other\nGo | Web", ["CSS", "Frontend"], 1);
  assert.deepEqual(grouping(bad), ["CSS is in more than one bucket: Web, Other", "Not one of the areas: Go", "Missing: Frontend"]);
  const many = Array.from({ length: 11 }, (_, i) => `A${i}`);
  assert.deepEqual(grouping(parseBuckets(many.map((a) => `${a} | ${a}`).join("\n"), many)), ["11 buckets: exactly 10, please"]);
  assert.deepEqual(grouping(parseBuckets(many.map((a, i) => `${a} | B${i % 9}`).join("\n"), many)), ["9 buckets: exactly 10, please"]);
  // Fewer than ten areas: one bucket each.
  assert.deepEqual(grouping(parseBuckets("A | X\nB | X", ["A", "B"])), ["1 bucket: exactly 2, please"]);
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
    { name: "Web", areas: ["CSS", "Frontend"] },
    { name: "Ops", areas: ["CI", "Kubernetes", "Terraform"] },
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
    [{ name: "Platform", areas: ["CI", "Helm", "Kubernetes"] }, { name: "Frontend", areas: ["CSS"] }, { name: "Web", areas: ["Web"] }],
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


test("rows already naming a current bucket keep it, even when an area of that name sits elsewhere", () => {
  const rows = [{ area: "Backend development", bucket: "Backend" }, { area: "Backend", bucket: "Platform" }, { area: "Kubernetes", bucket: "Platform" }];
  const out = inBuckets({ demand: [{ expertise: "Backend" }, { expertise: "Kubernetes" }] }, rows);
  assert.deepEqual(out.demand.map((r) => r.expertise), ["Backend", "Platform"]);
});

test("a write-in is matched to buckets by name: an exact area first, else buckets sharing words with it", () => {
  const rows = CATALOGUE.bucketRows;
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

test("examples per working method belong to buckets, read from the buckets tab", () => {
  assert.deepEqual(BUCKET_HEADER, ["bucket", "operative", "conceptual", "strategic", "comprehensive", "description"]);
  const examples = readExamples([{ bucket: "Web", operative: "a", conceptual: "b", strategic: "c", comprehensive: "d" }, { bucket: "", operative: "x" }]);
  assert.deepEqual([...examples], [["Web", ["a", "b", "c", "d"]]]);
  assert.deepEqual(bucketsWithoutExamples(["Web", "Data"], [{ bucket: "Web", operative: "a", conceptual: "b", strategic: "c", comprehensive: "" }]), ["Web", "Data"]);
});

test("regrouping no longer asks for level descriptions: the descriptions workflow keeps them", () => {
  assert.doesNotMatch(bucketPrompt(["Rust"], []), /operative/);
  // A stray examples line is ignored, never an error.
  assert.deepEqual(parseBuckets("CSS | Web\nWeb | a | b | c | d", ["CSS"], 1).errors, []);
});

test("a regrouped bucket keeps its row from the bucket it came from, renamed or not; a new one starts blank", () => {
  const proposed = [{ name: "Web", areas: ["CSS"] }, { name: "Systems", areas: ["Rust"] }, { name: "Data", areas: ["SQL"] }];
  const result = compareBuckets([{ name: "Web", areas: ["CSS"] }, { name: "Native", areas: ["Rust"] }], proposed);
  const list = [
    { bucket: "Web", operative: "a", conceptual: "b", strategic: "c", comprehensive: "d", description: "Builds web pages." },
    { bucket: "Native", operative: "e", conceptual: "f", strategic: "g", comprehensive: "h", description: "Old." },
  ];
  assert.deepEqual(bucketRowsAfter(result, list), [
    list[0],
    { ...list[1], bucket: "Systems" },
    { bucket: "Data", operative: "", conceptual: "", strategic: "", comprehensive: "", description: "" },
  ]);
});

test("demand per area is the latest quarter's people, split evenly across the areas a row names", () => {
  const demand = [
    { quarter: "2026-Q3", expertise: "Security", areas: "Security", people: "5" },
    { quarter: "2026-Q4", expertise: "Security", areas: "Security; Compliance", people: "3" },
    { quarter: "2026-Q4", expertise: "Security", areas: "Security; Compliance", people: "1" },
    { quarter: "2026-Q4", expertise: "Rust", people: "2" },
    { quarter: "2026-Q4", expertise: "Web", areas: "CSS", people: "platform" },
    { quarter: "2026-Q4", expertise: "Domain expertise", domain: "Tax", people: "3" },
  ];
  assert.deepEqual(areaDemand(demand), new Map([["Security", 2], ["Compliance", 2], ["Rust", 2]]));
  assert.deepEqual(areaDemand([]), new Map());
});

test("the prompt sizes buckets by demand when there is any", () => {
  const text = bucketPrompt(["Mobile", "Security"], [], new Map([["Security", 3]]));
  assert.match(text, /^- Security \(100%\)$/m);
  assert.match(text, /^- Mobile \(0%\)$/m);
  assert.match(text, /share of demand/);
  assert.doesNotMatch(bucketPrompt(["Mobile"], []), /share of demand|%/);
});

test("critical gaps per bucket: teams answering critical coverage last quarter, following renamed buckets", () => {
  const demand = [
    { quarter: "2026-Q3", team: "A", expertise: "Web", coverage: "critical" },
    { quarter: "2026-Q4", team: "A", expertise: "Web", method: "operative", coverage: "critical" },
    { quarter: "2026-Q4", team: "A", expertise: "Web", method: "conceptual", coverage: "critical" },
    { quarter: "2026-Q4", team: "B", expertise: "Frontend", coverage: "critical" },
    { quarter: "2026-Q4", team: "C", expertise: "Backend", coverage: "under" },
    { quarter: "2026-Q4", team: "C", expertise: "Domain expertise", domain: "Tax", coverage: "critical" },
  ];
  const history = [{ bucket: "Frontend", now: "Web" }];
  assert.deepEqual(bucketGaps(demand, history), new Map([["Web", 2]]));
  assert.deepEqual(bucketGaps([], []), new Map());
});

test("the prompt marks critically understaffed current buckets, to rename or break up only when the areas call for it", () => {
  const current = [{ name: "Web", areas: ["CSS"] }, { name: "Backend", areas: ["Go"] }];
  const text = bucketPrompt(["CSS", "Go"], current, new Map(), new Map(), new Map([["Web", 2]]));
  assert.match(text, /^Web \(critically understaffed for 2 teams\): CSS$/m);
  assert.match(text, /^Backend: Go$/m);
  assert.match(text, /critically understaffed/);
  assert.match(text, /still change/i);
  assert.doesNotMatch(bucketPrompt(["CSS", "Go"], current), /understaffed/);
});

test("critical areas are the latest quarter's, counted once per team however many rows flag them", () => {
  const demand = [
    { quarter: "2026-Q3", team: "A", areas: "Rust", critical: "Rust" },
    { quarter: "2026-Q4", team: "A", areas: "Security; Compliance", method: "operative", critical: "Security" },
    { quarter: "2026-Q4", team: "A", areas: "Security; Compliance", method: "strategic", critical: "Security" },
    { quarter: "2026-Q4", team: "B", areas: "Security; Compliance", critical: " Security ; Compliance" },
    { quarter: "2026-Q4", team: "C", areas: "CSS", critical: "" },
  ];
  assert.deepEqual(areaCritical(demand), new Map([["Security", 2], ["Compliance", 1]]));
  assert.deepEqual(areaCritical([]), new Map());
});

test("the prompt names the teams an area is critical for, and asks to keep such areas easy to find", () => {
  const text = bucketPrompt(["Mobile", "Security"], [], new Map([["Security", 3]]), new Map([["Security", 2]]));
  assert.match(text, /^- Security \(100%, critical for 2 teams\)$/m);
  assert.match(text, /^- Mobile \(0%\)$/m);
  assert.match(text, /critical/i);
  // Without demand, critical areas are still named.
  assert.match(bucketPrompt(["Mobile", "Security"], [], new Map(), new Map([["Security", 1]])), /^- Security \(critical for 1 team\)$/m);
  assert.doesNotMatch(bucketPrompt(["Mobile"], []), /critical/i);
});

test("survey answers follow their areas: a moved area takes its row to the bucket now holding most of them", () => {
  const rows = [{ area: "Security", bucket: "Security" }, { area: "Compliance", bucket: "Compliance" }, { area: "Audits", bucket: "Compliance" }, { area: "Foo", bucket: "Web" }];
  const demand = [
    // Was "Security & compliance": two of its three areas are now in Compliance.
    { expertise: "Security & compliance", areas: "Security; Compliance; Audits", people: "3" },
    // Saved under a bucket that still exists, but its only area has since moved.
    { expertise: "Security", areas: "Audits", people: "1" },
    // A tie stays with the bucket it was saved under.
    { expertise: "Security", areas: "Security; Compliance", people: "2" },
    // An unplaced write-in, grouped since.
    { expertise: "Foo", areas: "Foo", people: "1" },
    // Areas in no bucket: falls back to the stored name.
    { expertise: "Web", areas: "Unknown", people: "1" },
  ];
  const out = inBuckets({ demand }, rows);
  assert.deepEqual(out.demand.map((r) => r.expertise), ["Compliance", "Compliance", "Security", "Web", "Web"]);
  assert.deepEqual(out.demand.map((r) => r.people), ["3", "1", "2", "1", "1"]);
});

test("the prompt pins the bucket count: names first, numbered, then a count check", () => {
  const areas = Array.from({ length: 12 }, (_, i) => `A${i}`);
  const text = bucketPrompt(areas, []);
  assert.match(text, /numbered 1 to 10/);
  assert.match(text, /count them: exactly 10/i);
  // Fewer areas than buckets: one bucket each, and the prompt says so.
  assert.match(bucketPrompt(["A", "B"], []), /exactly 2 buckets/);
});

test("the numbered list of bucket names in an answer is ignored when it is read", () => {
  const answer = "1. Web\n2. Systems\n\nCSS | Web\nRust | Systems\nWeb | a | b | c | d\nSystems | e | f | g | h";
  assert.deepEqual(parseBuckets(answer, ["CSS", "Rust"], 2).errors, []);
});

test("a wrong answer gets a follow-up for the same Gemini chat, naming the buckets to merge or split", () => {
  const groups = Array.from({ length: 12 }, (_, i) => ({ name: `B${i}`, areas: [`A${i}`] }));
  const text = fixPrompt(["12 buckets: exactly 10, please"], groups, 10);
  assert.match(text, /You used 12 buckets: B0, B1/);
  assert.match(text, /Merge/);
  assert.match(text, /exactly 10 buckets/);
  assert.match(fixPrompt(["9 buckets: exactly 10, please"], groups.slice(0, 9), 10), /Split/);
  assert.match(fixPrompt(["Missing: X"], groups.slice(0, 10), 10), /^- Missing: X$/m);
});

test("for the discipline view, write-ins in no bucket are counted together under one Other bucket", () => {
  const rows = [{ area: "CSS", bucket: "Web" }];
  const demand = [
    { expertise: "Rust", areas: "Rust", people: "1" },
    { expertise: "Elm", areas: "Elm", people: "2" },
    { expertise: "Web", areas: "CSS", people: "1" },
    { expertise: "Domain expertise", domain: "Tax", people: "1" },
  ];
  const named = (o) => inBuckets({ demand }, rows, [], o).demand.map((r) => r.expertise);
  assert.deepEqual(named({ other: true }), [OTHER, OTHER, "Web", "Domain expertise"]);
  // The survey keeps each write-in on its own, so its section shows last time's answers.
  assert.deepEqual(named(), ["Rust", "Elm", "Web", "Domain expertise"]);
  // Before any buckets, every area stands on its own.
  assert.deepEqual(inBuckets({ demand }, [], [], { other: true }).demand, demand);
});

test("a write-in is placed by family too: words matching a family suggest the bucket most of it is in", () => {
  const rows = [{ area: "React", bucket: "Web" }, { area: "TypeScript", bucket: "Web" }, { area: "Kotlin", bucket: "Backend" }];
  const familyOf = new Map([["React", "Web frontend"], ["TypeScript", "Web frontend"], ["Kotlin", "JVM"]]);
  assert.deepEqual(suggestBuckets("Frontend testing", rows, familyOf), ["Web"]);
  assert.deepEqual(suggestBuckets("JVM tuning", rows, familyOf), ["Backend"]);
  assert.deepEqual(suggestBuckets("JVM tuning", rows), []);
});

test("the prompt asks Gemini to keep families together, name other names for the same area, and give families", () => {
  const familyOf = new Map([["React", "Web frontend"], ["TypeScript", "Web frontend"]]);
  const text = bucketPrompt(["React", "TypeScript", "front-end", "Frontend development"], [], new Map(), new Map(), new Map(),
    { familyOf, duplicates: [["Frontend development", "front-end"]] });
  assert.match(text, /^Web frontend: React, TypeScript$/m);
  assert.match(text, /same bucket/);
  assert.match(text, /^Frontend development ~ front-end$/m);
  assert.match(text, /^same \| other name \| area$/m);
  assert.match(text, /^family \| area \| family$/m);
  assert.doesNotMatch(bucketPrompt(["React"], []), /^Families/m);
});

test("the answer gives other names and families back; another name needs no bucket of its own", () => {
  const answer = [
    "Frontend development | Web", "React | Web", "Go | Backend",
    "same | front-end | Frontend development",
    "family | React | Web frontend", "family | Frontend development | Web frontend", "family | Go | Go",
    "Web | a | b | c | d", "Backend | e | f | g | h",
  ].join("\n");
  const { groups, errors, same, families } = parseBuckets(answer, ["Frontend development", "front-end", "React", "Go"], 2);
  assert.deepEqual(errors, []);
  assert.deepEqual(groups, [{ name: "Backend", areas: ["Go"] }, { name: "Web", areas: ["Frontend development", "React"] }]);
  assert.deepEqual([...same], [["front-end", "Frontend development"]]);
  assert.equal(families.get("React"), "Web frontend");
  // Another name for something that isn't an area, or for another name, can't be used.
  const bad = parseBuckets("A | X\nsame | B | Nope\nsame | C | B\nX | a | b | c | d", ["A", "B", "C"], 1);
  assert.deepEqual(bad.errors, ["Other name for something that isn't an area: B → Nope", "Other name for another other name: C → B", "Missing: B"]);
});

test("families split across buckets are listed, for the preview", () => {
  const groups = [{ name: "Web", areas: ["React", "Vue"] }, { name: "Backend", areas: ["TypeScript", "Go"] }];
  const familyOf = new Map([["React", "Web frontend"], ["Vue", "Web frontend"], ["TypeScript", "Web frontend"], ["Go", "Go"]]);
  assert.deepEqual(splitFamilies(groups, familyOf), [{ family: "Web frontend", buckets: ["Backend", "Web"] }]);
});

test("project types are weighted by the people asked for in the latest round, split across a row's chosen types", () => {
  const demand = [
    { quarter: "2026-Q3", people: "9", project_types: "Umsetzung" },
    { quarter: "2026-Q4", people: "2", project_types: "Discovery; Regelungsbegleitung" },
    { quarter: "2026-Q4", people: "3", project_types: " Discovery " },
    { quarter: "2026-Q4", people: "4", project_types: "" },
  ];
  assert.deepEqual(typeDemand(demand), new Map([["Discovery", 4], ["Regelungsbegleitung", 1]]));
  assert.deepEqual(typeDemand([]), new Map());
});

test("the prompt keeps buckets distinct, and offers project types as names for buckets that mainly serve them", () => {
  const plain = bucketPrompt(["React", "Frontend development"], []);
  assert.match(plain, /subset/i);
  assert.doesNotMatch(plain, /Project types/);
  const types = [{ name: "Discovery", english: "", areas: ["Prototyping"] }, { name: "Umsetzungsberatung", english: "Implementation consulting", areas: [] }];
  const text = bucketPrompt(["Prototyping"], [], new Map(), new Map(), new Map(), { projectTypes: types, typeDemand: new Map([["Discovery", 3], ["Umsetzungsberatung", 1]]) });
  assert.match(text, /^Project types/m);
  assert.match(text, /^- Discovery \(75%\): Prototyping$/m);
  assert.match(text, /^- Umsetzungsberatung \(Implementation consulting, 25%\)$/m);
  assert.match(text, /official term/i);
  assert.match(text, /English translation/i);
});

test("the prompt keeps families narrow and forbids handing a current bucket's name to another bucket", () => {
  const text = bucketPrompt(["CSS", "Rust"], [{ name: "Web", areas: ["CSS"] }]);
  assert.match(text, /shadow bucket/i);
  assert.match(text, /family of one/i);
  assert.match(text, /never give a current bucket's name to a different bucket/i);
});

test("with project types, the prompt asks for a sixth part: the areas each type pre-fills", () => {
  assert.match(bucketPrompt(["CSS"], []), /four parts/);
  const types = [{ name: "Discovery", english: "", areas: ["CSS"] }];
  const text = bucketPrompt(["CSS"], [], new Map(), new Map(), new Map(), { projectTypes: types });
  assert.match(text, /five parts/);
  assert.match(text, /^type \| project type \| area; area$/m);
  // Type lines are no area lines, even with no areas.
  const answer = "CSS | Web\nWeb | a | b | c | d\ntype | Discovery | CSS\ntype | Others |";
  assert.deepEqual(parseBuckets(answer, ["CSS"], 1).errors, []);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { formRows, readFormRows, prefillUrl, FORM_HEADER, levelOf, ratingsToProfile, followBuckets } from "../src/prefill.js";
import { WHOSE, GRID } from "../src/icform.js";

// The IC form as the Forms API returns it after Set up IC form, trimmed to what matters.
const items = [
  { title: WHOSE, questionItem: { question: { questionId: "1a2b3c4d" } } },
  { title: "Your colleague's email", questionItem: { question: { questionId: "00000010" } } },
  { title: GRID, questionGroupItem: { questions: [
    { questionId: "0000000f", rowQuestion: { title: "Frontend" } },
    { questionId: "7fffffff", rowQuestion: { title: "Data & AI" } },
  ] } },
];
const uri = "https://docs.google.com/forms/d/e/PUBLISHED/viewform";

test("the form tab holds the form's link and an entry ID per question the page fills, nothing else", () => {
  assert.deepEqual(FORM_HEADER, ["role", "name", "entry"]);
  assert.deepEqual(formRows(items, uri), [
    { role: "url", name: "", entry: uri },
    { role: "whose", name: WHOSE, entry: String(0x1a2b3c4d) },
    { role: "area", name: "Frontend", entry: "15" },
    { role: "area", name: "Data & AI", entry: String(0x7fffffff) },
  ]);
});

test("the pre-filled link answers Myself and each rated area, and leaves the rest blank", () => {
  const form = readFormRows(formRows(items, uri));
  assert.equal(form.url, uri);
  const link = new URL(prefillUrl(form, { Frontend: "Conceptual", "Data & AI": "", Unknown: "Strategic" }));
  assert.equal(link.origin + link.pathname, uri);
  assert.equal(link.searchParams.get("usp"), "pp_url");
  assert.equal(link.searchParams.get(`entry.${0x1a2b3c4d}`), "Myself");
  assert.equal(link.searchParams.get("entry.15"), "Conceptual");
  assert.equal(link.searchParams.has(`entry.${0x7fffffff}`), false);
  assert.equal([...link.searchParams.keys()].length, 3);
});

test("without a form tab there is no link", () => {
  assert.equal(readFormRows([]).url, "");
  assert.equal(prefillUrl(readFormRows([]), { Frontend: "Operative" }), "");
});

test("the page's ratings become a profile on the model's level scale, Not my area left out", () => {
  assert.deepEqual([levelOf("Learning"), levelOf("Operative"), levelOf("Comprehensive"), levelOf("Not my area")], [2, 3, 6, 0]);
  assert.deepEqual(ratingsToProfile({ Frontend: "Strategic", Backend: "Not my area", Search: "" }), [
    { expertise: "Frontend", level: 5, self: 5 },
  ]);
});

test("saved answers for former buckets move to the bucket they went to, the highest winning on a merge", () => {
  const history = [{ bucket: "Infra", now: "Platform" }, { bucket: "Ops", now: "Platform" }, { bucket: "Web", now: "Frontend" }];
  const saved = { Infra: "Operative", Ops: "Strategic", Web: "Conceptual", Frontend: "Learning", Gone: "Comprehensive" };
  assert.deepEqual(followBuckets(saved, ["Platform", "Frontend", "Data"], history), { Platform: "Strategic", Frontend: "Learning", Data: "" });
});

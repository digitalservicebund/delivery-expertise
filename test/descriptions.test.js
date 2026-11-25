import { test } from "node:test";
import assert from "node:assert/strict";
import { descriptionPrompt, parseDescriptions, withDescriptions, withLevels, descriptionChanges, descriptionItems } from "../src/descriptions.js";

const items = {
  buckets: [{ name: "Web", areas: ["CSS"], description: "Builds web pages.", levels: ["Build pages", "", "", ""] }],
  areas: [{ name: "CSS", bucket: "Web", family: "Styling", description: "" }],
  types: [{ name: "Umsetzung", english: "Implementation", areas: ["CSS"], description: "" }],
};
const levels = ["Build pages", "Plan a journey", "Set standards", "Shape government web"];

test("the items to describe come from the three tabs; other names for an area are left out", () => {
  const got = descriptionItems({
    bucketList: [{ bucket: "Web", operative: "a", conceptual: "b", strategic: "c", comprehensive: "d", description: "Builds web pages." }],
    areaRows: [{ area: "CSS", bucket: "Web", family: "Styling", description: "Styles." }, { area: "css3", same_as: "CSS" }],
    typeRows: [{ project_type: "Umsetzung", areas: "CSS", english_translation: "Implementation", description: "" }],
  });
  assert.deepEqual(got.buckets, [{ name: "Web", areas: ["CSS"], description: "Builds web pages.", levels: ["a", "b", "c", "d"] }]);
  assert.deepEqual(got.areas, [{ name: "CSS", bucket: "Web", family: "Styling", description: "Styles." }]);
  assert.deepEqual(got.types.map((t) => t.name), ["Umsetzung"]);
});

test("the descriptions prompt lists every item with its current description, and each bucket's level descriptions", () => {
  const text = descriptionPrompt(items);
  assert.match(text, /^- Web \(areas: CSS\): Builds web pages\.$/m);
  assert.match(text, /^ {2}operative: Build pages \| conceptual: \(none yet\) \| strategic: \(none yet\) \| comprehensive: \(none yet\)$/m);
  assert.match(text, /^- CSS \(bucket: Web, family: Styling\): \(none yet\)$/m);
  assert.match(text, /^- Umsetzung \(Implementation; areas: CSS\): \(none yet\)$/m);
  assert.match(text, /^bucket \| name \| description \| operative \| conceptual \| strategic \| comprehensive$/m);
  assert.match(text, /^area \| name \| description$/m);
  assert.match(text, /English/);
});

test("Gemini's descriptions are read per kind, leniently; unknown names and incomplete bucket lines are errors", () => {
  const answer = [
    "Sure:", "bucket | name | description | operative | conceptual | strategic | comprehensive",
    `**bucket | web | Builds and styles web pages. | ${levels.join(" | ")}**`,
    "| area | CSS | Styles pages | so they look right. |", "type | Nope | x", "area | Cobol | y",
  ].join("\n");
  const parsed = parseDescriptions(answer, items);
  assert.deepEqual([...parsed.bucket], [["Web", "Builds and styles web pages."]]);
  assert.deepEqual([...parsed.levels], [["Web", levels]]);
  assert.deepEqual([...parsed.area], [["CSS", "Styles pages | so they look right."]]);
  assert.deepEqual(parsed.errors, ["Not one of the project types: Nope", "Not one of the areas: Cobol"]);
  assert.deepEqual(parsed.missing, ["Umsetzung"]);
  assert.deepEqual(parseDescriptions("bucket | Web | Builds. | a | b", items).errors, ["Web needs a description and four level descriptions"]);
});

test("descriptions and levels are written to their rows by name, other rows and columns kept; changes list only real ones", () => {
  const rows = [{ bucket: "Web", operative: "a", description: "Old." }, { bucket: "Data", operative: "b", description: "Kept." }];
  assert.deepEqual(withDescriptions(rows, "bucket", new Map([["Web", "New."]])), [{ bucket: "Web", operative: "a", description: "New." }, rows[1]]);
  assert.deepEqual(withLevels(rows, new Map([["Web", levels]]))[0], {
    bucket: "Web", operative: levels[0], conceptual: levels[1], strategic: levels[2], comprehensive: levels[3], description: "Old.",
  });
  const parsed = { bucket: new Map([["Web", "Builds web pages."]]), levels: new Map([["Web", levels]]), area: new Map([["CSS", "Styles pages."]]), type: new Map() };
  assert.deepEqual(descriptionChanges(items, parsed), [
    { kind: "levels", name: "Web", from: "Build pages", to: levels.join(" · ") },
    { kind: "area", name: "CSS", from: "", to: "Styles pages." },
  ]);
});

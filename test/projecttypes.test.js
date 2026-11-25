import { test } from "node:test";
import assert from "node:assert/strict";
import { PROJECT_TYPE_HEADER, PROJECT_TYPE_SEED, MAX_PROJECT_TYPES, readProjectTypes, typesByArea, projectTypeIssues, dummyProjectTypes, parseTypeAreas, typesAfterGrouping, typeAreaChanges } from "../src/projecttypes.js";

test("Gemini's project-type lines give each type's areas, matched case-insensitively; unknown names are errors", () => {
  const types = [{ name: "Discovery", areas: ["Prototyping"] }, { name: "Others", areas: [] }, { name: "Umsetzung", areas: ["CSS"] }];
  const answer = "type | project type | area; area\n**type | discovery | prototyping; user research**\n| type | Others | |\ntype | Nope | CSS\ntype | Umsetzung | CSS; Cobol";
  const { areasOf, errors } = parseTypeAreas(answer, types, ["Prototyping", "User research", "CSS"]);
  assert.deepEqual([...areasOf], [["Discovery", ["Prototyping", "User research"]], ["Others", []], ["Umsetzung", ["CSS"]]]);
  assert.deepEqual(errors, ["Not one of the project types: Nope", "Umsetzung names areas that aren't on the list: Cobol"]);
});

test("applying keeps every other column, and a type Gemini left out keeps its areas", () => {
  const rows = [
    { project_type: "Discovery", areas: "Prototyping", english_translation: "", description: "Finds out." },
    { project_type: "Umsetzung", areas: "CSS", english_translation: "Implementation", description: "" },
    { project_type: "Discovery", areas: "CSS", english_translation: "", description: "" },
  ];
  assert.deepEqual(typesAfterGrouping(rows, new Map([["Discovery", ["Prototyping", "User research"]]])), [
    { project_type: "Discovery", areas: "Prototyping; User research", english_translation: "", description: "Finds out." },
    rows[1],
    { project_type: "Discovery", areas: "", english_translation: "", description: "" },
  ]);
  assert.deepEqual(typeAreaChanges(readProjectTypes(rows), new Map([["Discovery", ["Prototyping", "User research"]], ["Umsetzung", ["CSS"]]])), [
    { type: "Discovery", added: ["User research"], dropped: ["CSS"] },
  ]);
});

test("the project-types tab has a type, its areas, an optional English translation and an optional description", () => {
  assert.deepEqual(PROJECT_TYPE_HEADER, ["project_type", "areas", "english_translation", "description"]);
  assert.equal(PROJECT_TYPE_SEED.length, 12);
  assert.ok(PROJECT_TYPE_SEED.every((r) => r.areas === ""));
});

test("types keep the tab's order; areas split on semicolons, commas or new lines, blanks and repeats dropped", () => {
  const types = readProjectTypes([
    { project_type: "Discovery", areas: "User research; Prototyping;" },
    { project_type: "", areas: "Ignored" },
    { project_type: "Implementation", areas: "Frontend development\nBackend development" },
    { project_type: "Discovery", areas: "Prototyping, Service design" },
  ]);
  assert.deepEqual(types, [
    { name: "Discovery", areas: ["User research", "Prototyping", "Service design"], english: "", description: "" },
    { name: "Implementation", areas: ["Frontend development", "Backend development"], english: "", description: "" },
  ]);
});

test("a type's description is the first one given, to explain what the type means", () => {
  const types = readProjectTypes([
    { project_type: "Discovery", areas: "Prototyping", description: "" },
    { project_type: "Discovery", areas: "", description: " Explore a problem before building " },
    { project_type: "Discovery", areas: "", description: "Ignored" },
  ]);
  assert.equal(types[0].description, "Explore a problem before building");
});

test("a type's English translation is the first one given, apart from its description", () => {
  const [type] = readProjectTypes([
    { project_type: "Regelungsbegleitung", areas: "", english_translation: "", description: "Supporting a law" },
    { project_type: "Regelungsbegleitung", areas: "", english_translation: " Regulatory support " },
  ]);
  assert.equal(type.english, "Regulatory support");
  assert.equal(type.description, "Supporting a law");
});

test("a lead can choose up to five project types", () => {
  assert.equal(MAX_PROJECT_TYPES, 5);
});

test("the prototype keeps a blank type's translation and description when it guesses its areas", () => {
  const [discovery] = dummyProjectTypes([{ project_type: "Discovery", areas: "", english_translation: "Discovery", description: "Explore first" }], ["Prototyping"]);
  assert.deepEqual(discovery, { project_type: "Discovery", areas: "Prototyping", english_translation: "Discovery", description: "Explore first" });
});

test("an area under several chosen types names each, in the order they were chosen", () => {
  const types = [
    { name: "Discovery", areas: ["User research", "Prototyping"] },
    { name: "Product development", areas: ["prototyping", "Frontend development"] },
    { name: "Other", areas: ["Rust"] },
  ];
  const byArea = typesByArea(types, ["Product development", "Discovery"]);
  assert.deepEqual(byArea.get("prototyping"), ["Product development", "Discovery"]);
  assert.deepEqual(byArea.get("user research"), ["Discovery"]);
  assert.equal(byArea.get("rust"), undefined);
});

test("the prototype guesses areas for blank types, from the area list only, and keeps filled-in ones", () => {
  const seeded = dummyProjectTypes([], ["Technical discovery", "prototyping"]);
  assert.equal(seeded.length, 12);
  assert.deepEqual(seeded.find((r) => r.project_type === "Regelungsbegleitung").english_translation, "Regulatory support");
  assert.equal(seeded.find((r) => r.project_type === "Discovery").areas, "Technical discovery; Prototyping");
  assert.equal(seeded.find((r) => r.project_type === "Others").areas, "");
  const kept = dummyProjectTypes([{ project_type: "Discovery", areas: "Search" }, { project_type: "Befähigung", areas: "" }], ["Open source"]);
  assert.deepEqual(kept, [{ project_type: "Discovery", areas: "Search" }, { project_type: "Befähigung", areas: "Open source", english_translation: "", description: "" }]);
});

test("set-up reports an empty tab, types without areas and areas not on the list", () => {
  assert.deepEqual(projectTypeIssues([], ["A"]), ["No project types yet: fill in the tab"]);
  assert.deepEqual(projectTypeIssues([{ project_type: "X", areas: "" }, { project_type: "Y", areas: "a; B" }], ["A"]), [
    "No areas for: X",
    "Not on the areas tab, so never suggested: B",
  ]);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { PROJECT_TYPE_HEADER, PROJECT_TYPE_SEED, readProjectTypes, typesByArea, projectTypeIssues, dummyProjectTypes } from "../src/projecttypes.js";

test("the project-types tab has a type and its areas", () => {
  assert.deepEqual(PROJECT_TYPE_HEADER, ["project_type", "areas"]);
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
    { name: "Discovery", areas: ["User research", "Prototyping", "Service design"] },
    { name: "Implementation", areas: ["Frontend development", "Backend development"] },
  ]);
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
  assert.equal(seeded.find((r) => r.project_type === "Discovery").areas, "Technical discovery; Prototyping");
  assert.equal(seeded.find((r) => r.project_type === "Other").areas, "");
  const kept = dummyProjectTypes([{ project_type: "Discovery", areas: "Search" }, { project_type: "Enablement", areas: "" }], ["Open source"]);
  assert.deepEqual(kept, [{ project_type: "Discovery", areas: "Search" }, { project_type: "Enablement", areas: "Open source" }]);
});

test("set-up reports an empty tab, types without areas and areas not on the list", () => {
  assert.deepEqual(projectTypeIssues([], ["A"]), ["No project types yet: fill in the tab"]);
  assert.deepEqual(projectTypeIssues([{ project_type: "X", areas: "" }, { project_type: "Y", areas: "a; B" }], ["A"]), [
    "No areas for: X",
    "Not on the areas tab, so never suggested: B",
  ]);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv } from "../src/csv.js";
import { generateDummyData } from "../src/dummy.js";
import { STAFFING_HEADER } from "../src/teams.js";
import { readAreas } from "../src/areas.js";
import { CATALOGUE } from "./fixtures/areas.js";

// A snapshot as ds-staffing exports it: byte-order mark, semicolons, several roles in one quoted field.
const line = (email, first, level, engagement, team, department, status) =>
  [email, first, "Doe", "Senior", level, "1", "Internal", "Project", "", engagement, team, department, '"Tech Lead;Expert"', "100", status].join(";");
const snapshot = "﻿" + [
  STAFFING_HEADER.join(";"),
  line("ada@ds.de", "Ada", "5", "Alpha", "Search", "Engineering", "Active"),
  line("bob@ds.de", "Bob", "4", "Alpha", "Search", "Engineering", "Active"),
  line("cy@ds.de", "Cy", "3", "Alpha", "Intake", "Engineering / Platform", "Active"),
  line("dee@ds.de", "Dee", "6", "Beta", "Core", "Engineering", "Active"),
  line("eve@ds.de", "Eve", "4", "Beta", "Core", "Design", "Active"),
  line("fay@ds.de", "Fay", "4", "Beta", "Core", "Engineering", "Proposed"),
].join("\r\n") + "\r\n";

test("dummy data comes from active engineers in the snapshot, without their names or emails", () => {
  const tabs = generateDummyData(parseCsv(snapshot, ";"), CATALOGUE);
  assert.deepEqual(Object.keys(tabs).sort(), ["discipline-plan", "expertise-assessments", "historical-activity", "project-demand", "staffing"]);
  const latest = tabs.staffing.filter((r) => r.quarter === "2026-Q4");
  assert.equal(latest.length, 4); // design and proposed staffing left out
  assert.ok(latest.every((r) => /^R\d{3}$/.test(r.person)));
  const all = JSON.stringify(tabs);
  for (const secret of ["@ds.de", "Ada", "Doe", "Eve"]) assert.ok(!all.includes(secret), secret);
});

test("someone on several teams is one person, in the team with their largest assignment", () => {
  const split = snapshot.replace(line("ada@ds.de", "Ada", "5", "Alpha", "Search", "Engineering", "Active"), [
    line("ada@ds.de", "Ada", "5", "Alpha", "Search", "Engineering", "Active").replace(";100;", ";30;"),
    line("ada@ds.de", "Ada", "5", "Beta", "Core", "Engineering", "Active").replace(";100;", ";70;"),
  ].join("\r\n"));
  const latest = generateDummyData(parseCsv(split, ";"), CATALOGUE).staffing.filter((r) => r.quarter === "2026-Q4");
  assert.equal(latest.length, 4);
  assert.equal(latest.filter((r) => r.level === 5).length, 1);
});

test("the same snapshot always gives the same dummy data", () => {
  assert.deepEqual(generateDummyData(parseCsv(snapshot, ";"), CATALOGUE), generateDummyData(parseCsv(snapshot, ";"), CATALOGUE));
});

test("a snapshot without active engineers is refused", () => {
  assert.throws(() => generateDummyData([], CATALOGUE), /no active Engineering rows/);
  assert.throws(() => generateDummyData(parseCsv(snapshot, ";"), readAreas([])), /areas tab is empty/);
});

test("teams also answer for areas they added themselves, with what they need there, so there is something to group", () => {
  const tabs = generateDummyData(parseCsv(snapshot, ";"), CATALOGUE);
  const custom = tabs["project-demand"].filter((r) => !CATALOGUE.names.includes(r.expertise) && r.expertise !== "Domain expertise");
  assert.ok(new Set(custom.map((r) => r.expertise)).size >= 3, "several added areas");
  assert.ok(custom.every((r) => r.specifics), "added areas say what they need");
  // People on those teams rate themselves in them too, so a grouping changes supply as well as demand.
  const rated = new Set(tabs["expertise-assessments"].map((r) => r.expertise));
  assert.ok(custom.some((r) => rated.has(r.expertise)));
});

test("the dummy data uses the area list from the discipline sheet when there is one", () => {
  const catalogue = readAreas([
    { area: "Backend development", default_bucket: "Build", support: "cop" },
    { area: "Frontend development", default_bucket: "Build", support: "cop" },
    { area: "Rust", default_bucket: "Systems", support: "" },
  ]);
  const suggested = generateDummyData(parseCsv(snapshot, ";"), catalogue)["project-demand"].map((r) => r.expertise).filter((e) => CATALOGUE.names.includes(e) || e === "Rust");
  assert.ok(suggested.length > 0);
  assert.ok(suggested.every((e) => catalogue.names.includes(e)), "only areas in the sheet's list");
});

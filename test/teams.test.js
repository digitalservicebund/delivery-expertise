import { test } from "node:test";
import assert from "node:assert/strict";
import { teamName, teamsOf, projectsByTeam, teamsFormula, STAFFING_HEADER } from "../src/teams.js";

test("several roles in one staffing field are split", () => {
  const rows = [{ project: "Alpha", team: "Search", email: "a@ds.de", role: "Tech Lead;Product Lead" }];
  assert.deepEqual(teamsOf(rows, "a@ds.de"), [{ team: "Alpha / Search", roles: ["Tech Lead", "Product Lead"] }]);
});

test("the teams list imports active people with a role from the staffing snapshot, by column name", () => {
  const f = teamsFormula("D");
  const col = (name) => `Col${STAFFING_HEADER.indexOf(name) + 1}`;
  assert.ok(f.startsWith(`=QUERY(IMPORTRANGE("D", "staffing!A:O")`));
  assert.ok(f.includes(`select ${col("Engagement")}, ${col("Team")}, ${col("Email")}, ${col("Roles in Team")}`));
  assert.ok(f.includes(`where ${col("Roles in Team")} <> '' and ${col("Status")} = 'Active'`));
  assert.ok(f.includes(`label ${col("Engagement")} 'project', ${col("Team")} 'team', ${col("Email")} 'email', ${col("Roles in Team")} 'role'`));
});

const rows = [
  { project: "Alpha", team: "Search", email: "a@ds.de", role: "Tech lead" },
  { project: "Alpha", team: "Search", email: "b@ds.de", role: "Engineer" },
  { project: "Alpha", team: "Intake", email: "A@DS.de", role: "Project lead" },
  { project: "Beta", team: "", email: "c@ds.de", role: "Tech lead" },
];

test("a team is named like the staffing data: project, then team if the project has several", () => {
  assert.equal(teamName(rows[0]), "Alpha / Search");
  assert.equal(teamName(rows[3]), "Beta");
});

test("a person's teams, with their roles, matching the email case-insensitively", () => {
  assert.deepEqual(teamsOf(rows, "a@ds.de"), [
    { team: "Alpha / Intake", roles: ["Project lead"] },
    { team: "Alpha / Search", roles: ["Tech lead"] },
  ]);
  assert.deepEqual(teamsOf(rows, "nobody@ds.de"), []);
  assert.deepEqual(teamsOf(rows, ""), []);
});

test("each team's project, for looking up its domain", () => {
  assert.equal(projectsByTeam(rows).get("Alpha / Intake"), "Alpha");
});

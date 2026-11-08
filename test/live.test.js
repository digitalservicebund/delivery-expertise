import { test } from "node:test";
import assert from "node:assert/strict";
import { staffingFromSnapshot, assessmentsFromSupply, DISCIPLINE_WIDE, quarterOf } from "../src/live.js";
import { supplyAsOf } from "../src/model.js";

const person = (email, o = {}) => ({
  Email: email, Level: "4", "Engagement Type": "Project", Engagement: "Alpha", Team: "Search", Department: "Engineering",
  "Roles in Team": "", "% Assignment in Team": "100", Status: "Active", ...o,
});

test("the snapshot becomes one engineer per row, in their main team, without names or emails", () => {
  const rows = staffingFromSnapshot([
    person("a@ds.de", { "Roles in Team": "Tech Lead;Product Lead", "% Assignment in Team": "60" }),
    person("a@ds.de", { Team: "Intake", "% Assignment in Team": "40" }),
    person("b@ds.de", { Department: "Engineering / Platform", Level: "6" }),
    person("c@ds.de", { Department: "Design" }),
    person("d@ds.de", { Status: "Proposed" }),
  ], "2027-Q1");
  assert.deepEqual(rows, [
    { quarter: "2027-Q1", person: "P001", project: "Alpha", team: "Alpha / Search", level: "4", role: "tech-lead", people_lead: "", engagement_lead: "" },
    { quarter: "2027-Q1", person: "P002", project: "Alpha", team: "Alpha / Search", level: "6", role: "engineer", people_lead: "", engagement_lead: "" },
  ]);
  assert.ok(!JSON.stringify(rows).includes("@"));
});

test("a tech lead in the project leadership team of their engagement is its engagement lead", () => {
  const rows = staffingFromSnapshot([
    person("a@ds.de", { "Roles in Team": "Tech Lead", "% Assignment in Team": "70" }),
    person("a@ds.de", { Team: "Intake", "Roles in Team": "Project Leadership Team", "% Assignment in Team": "30" }),
    person("b@ds.de", { "Roles in Team": "Project Leadership Team" }),
  ], "2027-Q1");
  assert.deepEqual(rows.map((r) => [r.person, r.role, r.engagement_lead]), [["P001", "tech-lead", "yes"], ["P002", "engineer", ""]]);
});

test("supply counts become anonymous self-ratings of the whole discipline; blanks count as nobody", () => {
  const rows = assessmentsFromSupply([
    { area: "Frontend", Learning: "", Operative: "2", Conceptual: "1", Strategic: "", Comprehensive: "" },
    { area: "Backend", Learning: "1", Operative: "", Conceptual: "", Strategic: "", Comprehensive: "" },
  ], "2027-Q1");
  assert.deepEqual(rows.map((r) => [r.respondent, r.expertise, r.level, r.team, r.assessor]), [
    ["S1", "Frontend", 3, DISCIPLINE_WIDE, "self"],
    ["S2", "Frontend", 3, DISCIPLINE_WIDE, "self"],
    ["S3", "Frontend", 4, DISCIPLINE_WIDE, "self"],
    ["S1", "Backend", 2, DISCIPLINE_WIDE, "self"],
  ]);
});

test("ratings carrying their own team count even though nobody on the staffing list gave them", () => {
  const { levels } = supplyAsOf(assessmentsFromSupply([{ area: "Frontend", Operative: "1" }], "2027-Q1"), "2027-Q1", () => undefined);
  assert.deepEqual(levels.map((l) => [l.team, l.expertise, l.level]), [[DISCIPLINE_WIDE, "Frontend", 3]]);
});

test("the quarter of a date", () => {
  assert.equal(quarterOf(new Date("2027-05-02")), "2027-Q2");
});

test("domain rows of the supply counts become domain expertise ratings", () => {
  const rows = assessmentsFromSupply([{ area: "Domain expertise: Legislation", Conceptual: "1" }], "2027-Q1");
  assert.deepEqual(rows.map((r) => [r.expertise, r.domain, r.level]), [["Domain expertise", "Legislation", 4]]);
});

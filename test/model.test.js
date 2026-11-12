import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, toCsv } from "../src/csv.js";
import { buildModel, status, change, supplyAsOf, assessedCoverage, assessedScore, projectStatus, peopleStatus, rowStatus, worstCoverage, combinedAnswer, TECH_LEAD, PEOPLE_LEAD, DOMAIN, reconciledStatus } from "../src/model.js";

test("csv round-trips quoted fields", () => {
  const rows = [{ a: 'x, "y"', b: "1" }];
  assert.deepEqual(parseCsv(toCsv(rows)), rows);
});

const level = (o) => ({ demand: 1, gap: 0, unlocated: 0, overqualified: 0, people: 2, spare: 1, ...o });

test("status: located gaps are confirmed, reported-only gaps provisional, the rest from ratings", () => {
  assert.equal(status(level({ demand: 0 })).status, "none");
  assert.deepEqual(status(level({ gap: 0.5 })), { status: "short", provisional: false });
  assert.equal(status(level({ demand: 4, gap: 0.25 })).status, "covered"); // immaterial gap
  assert.deepEqual(status(level({ unlocated: 0.25 })), { status: "short", provisional: true });
  assert.deepEqual(status(level({ overqualified: 1 })), { status: "overqualified", provisional: true }); // ratings only
  assert.deepEqual(status(level({ share: ["T"] })), { status: "surplus", provisional: true }); // project only
  assert.equal(status(level({ gap: 1, share: ["U"] })).status, "short"); // gaps outrank buffer
  assert.equal(status(level({ people: 1, spare: 0 })).status, "fragile");
  assert.equal(status(level({ people: 3, spare: 2 })).status, "surplus");
  assert.equal(status(level({})).status, "covered");
});

test("one-person cover is provisional while unrated engineers could add a second", () => {
  assert.equal(status(level({ people: 1, spare: 0 }), 1).provisional, true);
  assert.equal(status(level({ people: 1, spare: 0 }), 0.5).provisional, false);
});

test("a row's colour follows from its coverage and the people needed", () => {
  const table = ["critical", "under", "adequate", "over"].map((c) => [1, 2, 3, 5].map((p) => rowStatus(c, p)));
  assert.deepEqual(table, [
    ["short", "short", "short", "short"],
    ["strained", "strained", "fragile", "fragile"],
    ["fragile", "covered", "covered", "covered"],
    ["surplus", "surplus", "surplus", "surplus"],
  ]);
});

test("a colour needs a quarter of the demand behind it, so one team cannot colour a project", () => {
  assert.equal(projectStatus({ demand: 5, teams: [{ demand: 1, status: "short" }, { demand: 4, status: "covered" }] }), "covered");
  assert.equal(projectStatus({ demand: 5, teams: [{ demand: 2, status: "short" }, { demand: 3, status: "surplus" }] }), "short");
  assert.equal(projectStatus({ demand: 4, teams: [{ demand: 1, status: "fragile" }, { demand: 3, status: "covered" }] }), "fragile");
  assert.equal(projectStatus({ demand: 4, teams: [{ demand: 1, status: "strained" }, { demand: 3, status: "covered" }] }), "strained");
  assert.equal(projectStatus({ demand: 4, teams: [{ demand: 1, status: "surplus" }, { demand: 3, status: "covered" }] }), "surplus");
});

test("right half fades when unrated teams with a real share of demand report something else", () => {
  const rated = { demand: 2, gap: 0, fromAbove: 0, spare: 1, people: 3 };
  const fresh = { demand: 2, status: "surplus", fresh: true };
  assert.equal(peopleStatus({ demand: 4, rated: { ...rated, demand: 3 }, teams: [{ ...fresh, demand: 3 }, { demand: 1, status: "short", fresh: false }] }), null);
  assert.equal(peopleStatus({ demand: 4, rated: { ...rated, demand: 3 }, teams: [{ ...fresh, demand: 3 }, { demand: 1, status: "surplus", fresh: false }] }), "surplus");
  assert.equal(peopleStatus({ demand: 4, rated: { ...rated, demand: 3 }, teams: [{ ...fresh, demand: 3 }, { demand: 1, status: "strained", fresh: false }] }), null);
  assert.equal(peopleStatus({ demand: 4, rated, teams: [fresh, { demand: 2, status: "surplus", fresh: false }] }), null); // too little rated
});

test("rows place the gap, and their colour weighs it", () => {
  const m = buildModel({
    demand: [ask("operative", "1", "adequate"), ask("conceptual", "1", "under")],
    assessments: ["a", "b"].map((p) => rate(p, "lead", 3)),
    activity: [],
    staffing: staff(["a", "b"]),
  });
  const [operative, conceptual] = m.expertise[0].current.levels;
  assert.deepEqual([operative.project, operative.ratings], ["fragile", "surplus"]); // adequate, but one person
  assert.deepEqual([conceptual.project, conceptual.gap, conceptual.urgency], ["strained", 1, 2]);
});

test("a row marked under that ratings can't confirm stays provisional, with a note", () => {
  const m = buildModel({
    demand: [ask("operative", "1", "under")],
    assessments: ["a"].map((p) => rate(p, "lead", 3)),
    activity: [],
    staffing: staff(["a"]),
  });
  const operative = m.expertise[0].current.levels[0];
  assert.deepEqual([operative.unlocated, operative.provisional], [0.5, true]);
  assert.match(m.expertise[0].current.notes.find((n) => n.level === 3).text, /reports a gap here, but its ratings show the people needed/);
});

test("change marks new demand and missing data", () => {
  assert.equal(change(2, 3), 0.5);
  assert.equal(change(0, 1), Infinity);
  assert.equal(change(0, 0), null);
});

const row = (o) => ({ quarter: "2026-Q1", team: "T", expertise: "X", ...o });
const rate = (respondent, assessor, lvl, o) => row({ respondent, assessor, level: lvl, ...o });
// A project survey answer: one grid row, people needed and coverage.
const ask = (method, people, coverage = "adequate", o) => row({ method, people, coverage, ...o });
const empty = { assessments: [], activity: [], staffing: [] };

test("score weights lead above peers above self, normalised over available sources", () => {
  assert.equal(assessedScore({ self: 6, peers: [5], lead: 4 }), (6 * 1 + 5 * 2 + 4 * 3) / 6);
  assert.equal(assessedScore({ self: 6, peers: [4, 4, 4, 4] }), (6 + 4 * 2) / 3); // many peers weigh as one source
  assert.equal(assessedScore({ lead: 4 }), 4); // a lead rating needs no self-assessment
});

test("peers given before the latest self-assessment are ignored", () => {
  const { levels } = supplyAsOf([
    rate("b", "self", 3), rate("b", "peer", 6), rate("b", "self", 4, { quarter: "2026-Q2" }),
  ], "2026-Q2", () => "T");
  assert.equal(levels[0].level, 4);
  assert.equal(levels[0].asOf, "2026-Q2");
});

test("ratings: seniors step down only after their own level, never up", () => {
  const c = assessedCoverage({ 3: 0, 4: 1, 5: 0, 6: 1 }, [6, 5]);
  assert.equal(c[6].gap, 0);
  assert.equal(c[5].spare, 1);
  assert.equal(c[4].fromAbove, 1);
  assert.equal(assessedCoverage({ 3: 0, 4: 0, 5: 0, 6: 1 }, [5])[6].gap, 1);
});

// Staffing rows: who is on which team in a quarter.
const staff = (people, t = "T", quarter = "2026-Q1") => people.map((person) => ({ quarter, person, team: t, project: t }));

test("fresh ratings locate and size a gap the lead reports", () => {
  const m = buildModel({
    demand: [ask("conceptual", "3", "critical")],
    assessments: [rate("a", "lead", 4), rate("b", "lead", 4)],
    activity: [],
    staffing: staff(["a", "b", "c"]),
  });
  const conceptual = m.expertise[0].current.levels[1];
  assert.deepEqual([conceptual.gap, conceptual.status, conceptual.provisional, conceptual.urgency], [1, "short", false, 3]);
});

test("with out-of-date ratings a reported gap stays visible, provisional and unlocated", () => {
  const quarters = ["2026-Q1", "2026-Q2", "2026-Q3"].map((quarter) => ask("conceptual", "3", "critical", { quarter }));
  const m = buildModel({ demand: quarters, assessments: [rate("a", "lead", 4), rate("b", "lead", 4)], activity: [], staffing: staff(["a", "b", "c"]) });
  const conceptual = m.expertise[0].current.levels[1];
  assert.deepEqual([conceptual.gap, conceptual.unlocated, conceptual.status, conceptual.provisional], [0, 0.5, "short", true]);
});

test("flags a team reporting enough people when its fresh ratings show a gap", () => {
  const m = buildModel({ demand: [ask("strategic", "3")], assessments: [rate("a", "lead", 5)], activity: [], staffing: staff(["a"]) });
  assert.match(m.expertise[0].current.notes[0].text, /1 team reports adequate cover/);
  assert.notEqual(m.expertise[0].current.levels[2].status, "short"); // the lead's answer stands
});

test("with no filter, teams with more than they need lend to the rest of the organisation", () => {
  const m = buildModel({ demand: [ask("operative", "1", "critical"), ask("operative", "1", "over", { team: "U" })], ...empty });
  assert.deepEqual(m.expertise[0].actions[0].teams, ["U"]);
});

test("flags a team reporting adequate cover when its ratings show people to spare", () => {
  const m = buildModel({ demand: [ask("operative", "1", "adequate")], assessments: ["a", "b"].map((p) => rate(p, "lead", 3)), activity: [], staffing: staff(["a", "b"]) });
  assert.match(m.expertise[0].current.notes[0].text, /adequate cover, but their ratings show people to spare/);
});

test("only rows marked over at the same working method become rotation donors", () => {
  const m = buildModel({
    demand: [
      ask("operative", "1", "critical"),
      ask("operative", "1", "over", { team: "U" }),
      ask("conceptual", "1", "over", { team: "V" }),
    ],
    ...empty,
  }, (t) => t === "T");
  assert.deepEqual(m.expertise[0].actions[0].teams, ["U"]);
});

test("scope filters demand and supply", () => {
  const m = buildModel({
    demand: [ask("operative", "1"), ask("operative", "3", "adequate", { team: "U" })],
    assessments: [rate("a", "self", 3), rate("b", "self", 3)],
    activity: [],
    staffing: [...staff(["a"]), ...staff(["b"], "U")],
  }, (t) => t === "U");
  assert.equal(m.expertise[0].current.total, 3);
  assert.equal(m.expertise[0].current.levels[0].people, 1);
  assert.equal(m.headcount, 1);
});

test("expertise is ranked by gap weighted by the row's colour", () => {
  const m = buildModel({
    demand: [ask("operative", "1", "under", { expertise: "A" }), ask("operative", "1", "critical", { expertise: "B" }), ask("operative", "1", "adequate", { expertise: "C" })],
    ...empty,
  });
  assert.deepEqual(m.expertise.map((e) => [e.name, e.urgency]), [["B", 1.5], ["A", 1], ["C", 0]]);
});

test("compares against activity from the last completed quarter", () => {
  const m = buildModel({
    demand: [ask("conceptual", "3"), ask("conceptual", "3", "adequate", { quarter: "2026-Q2" })],
    assessments: [],
    activity: [row({ method: "conceptual", person_days: 21 })],
    staffing: [],
  });
  const now = m.expertise[0].current;
  assert.equal(now.activityQuarter, "2026-Q1");
  assert.equal(now.levels[1].activity, 0.5);
  assert.match(now.notes[0].text, /recorded last quarter/);
});

test("ratings follow the person to their current team", () => {
  const m = buildModel({
    demand: ["2026-Q1", "2026-Q2"].map((quarter) => ask("operative", "1", "adequate", { quarter, team: "U" })),
    assessments: [rate("a", "lead", 3)], // rated by T's lead in Q1
    activity: [],
    staffing: [...staff(["a"], "T"), ...staff(["a"], "U", "2026-Q2")],
  }, (t) => t === "U");
  assert.equal(m.expertise[0].current.levels[0].people, 1);
  assert.equal(m.expertise[0].history[0].levels[0].people, 0);
  assert.deepEqual(m.movement, { since: "2026-Q1", joined: 1, left: 0 });
});

test("support is a flag on the team's own demand, not a replacement for it", () => {
  const m = buildModel({ demand: [ask("operative", "2", "adequate", { support: "platform" }), ask("operative", "1", "adequate", { team: "U", support: "cop" })], ...empty });
  const operative = m.expertise[0].current.levels[0];
  assert.equal(operative.demand, 3);
  assert.deepEqual(operative.support.sort(), ["cop", "platform"]);
});

test("tech leadership demand is derived from staffing roles", () => {
  const staffing = [...staff(["a"], "T").map((r) => ({ ...r, role: "tech-lead" })), ...staff(["b"], "U")];
  const m = buildModel({ demand: [ask("operative", "1"), ask("operative", "1", "adequate", { team: "U" })], assessments: [], activity: [], staffing });
  const lead = m.expertise.find((e) => e.name === TECH_LEAD).current.levels[1];
  assert.equal(lead.demand, 2); // one conceptual tech lead per small team
  assert.deepEqual(lead.teams.map((t) => t.coverage), ["adequate", "under"]); // U has no tech lead
});

test("tech lead method follows team size, and multi-team engagements also need a comprehensive engagement lead", () => {
  const person = (id, project, team, o = {}) => ({ quarter: "2026-Q1", person: id, project, team: `${project} / ${team}`, ...o });
  const staffing = [
    person("a1", "P", "A", { role: "tech-lead" }), person("a2", "P", "A"), person("a3", "P", "A"), person("a4", "P", "A"),
    person("b1", "P", "B", { role: "tech-lead" }), person("b2", "P", "B"),
    person("c1", "Q", "C", { role: "tech-lead" }), person("c2", "Q", "C"), person("c3", "Q", "C"),
  ];
  const demand = ["P / A", "P / B", "Q / C"].map((team) => ask("operative", "1", "adequate", { team }));
  const leadAt = (m, level) => m.expertise.find((e) => e.name === TECH_LEAD).current.levels.find((l) => l.level === level);
  const m = buildModel({ demand, assessments: [], activity: [], staffing });
  assert.deepEqual(leadAt(m, 4).teams.map((t) => t.team).sort(), ["P / B", "Q / C"]); // up to 3 people: conceptual
  assert.deepEqual(leadAt(m, 5).teams.map((t) => t.team), ["P / A"]); // 4 and more: strategic
  // P has two teams: one comprehensive engagement lead on top, uncovered without a tech lead in its leadership team.
  assert.deepEqual(leadAt(m, 6).teams.map((t) => [t.team, t.coverage]), [["P / Engagement", "under"]]);

  staffing[0].engagement_lead = "yes";
  const covered = buildModel({ demand, assessments: [], activity: [], staffing });
  assert.deepEqual(leadAt(covered, 6).teams.map((t) => t.coverage), ["adequate"]);
  // The engagement lead belongs to the engagement: a project filter shows it, a team filter doesn't.
  const teamOnly = buildModel({ demand, assessments: [], activity: [], staffing }, (t) => t === "P / A");
  assert.equal(leadAt(teamOnly, 6).demand, 0);
});

test("a tech lead at the level needed is well covered; one below it only covered but fragile", () => {
  const person = (id, team, o = {}) => ({ quarter: "2026-Q1", person: id, project: "P", team: `P / ${team}`, ...o });
  const staffing = [
    person("a1", "A", { role: "tech-lead", level: "5", engagement_lead: "yes" }), person("a2", "A"), person("a3", "A"), person("a4", "A"),
    person("b1", "B", { role: "tech-lead", level: "4" }), person("b2", "B"),
    person("c1", "C", { role: "tech-lead", level: "" }),
  ];
  const demand = ["P / A", "P / B", "P / C"].map((team) => ask("operative", "1", "adequate", { team }));
  const lead = buildModel({ demand, assessments: [], activity: [], staffing }).expertise.find((e) => e.name === TECH_LEAD).current;
  const status = (level) => lead.levels.find((l) => l.level === level).teams.map((t) => [t.team, t.status]);
  assert.deepEqual(status(4).sort(), [["P / B", "covered"], ["P / C", "covered"]]); // level 4 meets conceptual; no level known: trusted
  assert.deepEqual(status(5), [["P / A", "covered"]]);
  assert.deepEqual(status(6), [["P / Engagement", "fragile"]]); // the engagement lead is level 5, comprehensive needs 6
  assert.ok(!lead.notes.some((n) => n.text.includes("P / Engagement")));
});

test("the discipline plan adds and removes demand, only without a filter", () => {
  const plan = [
    { quarter: "2026-Q1", kind: "adjust", subject: "X", method: "operative", value: -1, reason: "Winding down" },
    { quarter: "2026-Q1", kind: "adjust", subject: "New", method: "strategic", value: 1, reason: "Business development" },
  ];
  const data = { demand: [ask("operative", "3")], assessments: [], activity: [], staffing: [...staff(["a"]), ...staff(["b"], "U")], plan };
  const all = buildModel(data);
  assert.equal(all.expertise.find((e) => e.name === "X").current.levels[0].demand, 2);
  const fresh = all.expertise.find((e) => e.name === "New");
  assert.deepEqual([fresh.role, fresh.current.levels[2].project, fresh.current.levels[2].ratings], [false, null, "short"]);
  assert.equal(buildModel(data, (t) => t === "T").expertise.find((e) => e.name === "X").current.levels[0].demand, 3);
});

test("people leadership demand follows headcount and the discipline head's ratios", () => {
  const staffing = ["a", "b", "c", "d", "e", "f", "g"].map((person) => ({ quarter: "2026-Q1", person, team: "T", project: "T", level: 3, people_lead: "g" }));
  staffing[6].level = 5;
  const plan = [{ quarter: "2026-Q1", kind: "people-lead", subject: 3, method: "conceptual", value: 3 }];
  const m = buildModel({ demand: [ask("operative", "1")], assessments: [], activity: [], staffing, plan });
  const conceptual = m.expertise.find((e) => e.name === PEOPLE_LEAD).current.levels[1];
  assert.equal(conceptual.demand, 2); // six level 3 reports at three per lead
  assert.equal(conceptual.ratings, "short"); // one strategic lead covers one conceptual slot from above
});

test("domain expertise is matched per domain and charted as one item", () => {
  const m = buildModel({
    demand: [
      ask("conceptual", "1", "under", { expertise: "Domain expertise", domain: "Legislation" }),
      ask("conceptual", "1", "adequate", { team: "U", expertise: "Domain expertise", domain: "Welfare" }),
    ],
    // Two welfare experts on the legal team: plenty of domain expertise, but not the right domain.
    assessments: ["a", "b"].map((p) => rate(p, "lead", 4, { expertise: "Domain expertise", domain: "Welfare" })),
    activity: [],
    staffing: [...staff(["a", "b"]), ...staff(["c"], "U")],
  });
  const domain = m.expertise.find((e) => e.name === DOMAIN);
  assert.deepEqual(m.expertise.map((e) => e.name), [DOMAIN]);
  assert.deepEqual(domain.domains.map((d) => d.name), ["Legislation", "Welfare"]);
  const legal = domain.domains[0].current.levels[1];
  assert.deepEqual([legal.ratings, legal.gap], ["short", 1]); // welfare experts don't cover the legal gap
  assert.equal(domain.current.levels[1].demand, 2);
});

test("reconciled status: project as baseline, ratings where no project answered and for over-coverage", () => {
  const l = (project, ratings, o) => ({ project, ratings, projectFaded: false, ...o });
  assert.equal(reconciledStatus(l("strained", "covered")), "strained"); // ratings never clear a gap
  assert.equal(reconciledStatus(l("covered", "short")), "covered"); // nor invent one
  assert.equal(reconciledStatus(l("covered", "surplus")), "surplus"); // over-coverage bleeds over
  assert.equal(reconciledStatus(l(null, "short")), "short"); // no project answer
});

test("rows that land in one bucket take the worst coverage among them, whatever their order", () => {
  assert.equal(worstCoverage([{ coverage: "adequate" }, { coverage: "" }, { coverage: "critical" }, { coverage: "under" }]), "critical");
  assert.equal(worstCoverage([{ coverage: "over" }, { coverage: "adequate" }]), "adequate");
  assert.equal(worstCoverage([{}]), null);
});

test("several earlier answers for one working method combine into one the survey can show", () => {
  const rows = [{ people: "2", coverage: "adequate", support: "" }, { people: "2", coverage: "under", support: "cop" }];
  // 4 people isn't an option: rounded up to the next one, so the team isn't shown asking for less than before.
  assert.deepEqual(combinedAnswer(rows), { people: "5", coverage: "under", support: "cop" });
  assert.deepEqual(combinedAnswer([{ people: "3", coverage: "", support: "" }, { people: "5" }]), { people: "5", coverage: null, support: "" });
  assert.deepEqual(combinedAnswer([{ people: "1", coverage: "over" }]), { people: "1", coverage: "over", support: "" });
});

test("a team's coverage at a level is its worst answer there, not the first row's", () => {
  // Two sections that now fall in one bucket: their people add up, and the critical one isn't hidden.
  const m = buildModel({ ...empty, demand: [ask("operative", "1", "adequate"), ask("operative", "2", "critical")] });
  const [team] = m.expertise[0].current.levels[0].teams;
  assert.deepEqual([team.demand, team.coverage, team.status], [3, "critical", "short"]);
});

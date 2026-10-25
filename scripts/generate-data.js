// Generates dummy data for the three input tabs from the anonymised staffing in teams.csv.
// Deterministic (seeded) so regenerating produces identical files.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { parseCsv, toCsv } from "../src/csv.js";
import { assessedCoverage, PEOPLE, TECH_LEAD, BOOKABLE_DAYS_PER_QUARTER } from "../src/model.js";

const QUARTERS = ["2026-Q1", "2026-Q2", "2026-Q3", "2026-Q4"];
const COMPLETED = QUARTERS.slice(0, -1); // activity is only recorded for finished quarters

// prevalence: chance an engineer holds this as a personal focus area.
// trend: per-quarter demand multiplier, so changes have a story to tell.
// The ten areas of the project survey. Figures merge the earlier, finer areas they replaced:
// Backend takes API & Integration; Frontend takes Performance and Mobile; Architecture takes Legacy Modernisation;
// DevOps takes Infrastructure, Observability and Developer Experience; Security takes Identity & Access;
// Data & AI takes Data, AI Engineering and Search.
const EXPERTISE = {
  "Discovery & Inception": { prevalence: 0.12, trend: 1.0 },
  Backend: { prevalence: 0.6, trend: 1.0 },
  Frontend: { prevalence: 0.5, trend: 0.98 },
  Architecture: { prevalence: 0.28, trend: 0.98 },
  Security: { prevalence: 0.14, trend: 1.12 },
  "DevOps, CI/CD & Infrastructure": { prevalence: 0.5, trend: 1.03 },
  "Quality & Documentation": { prevalence: 0.35, trend: 1.0 },
  "Data & AI": { prevalence: 0.3, trend: 1.12 },
  "Compliance & Privacy": { prevalence: 0.07, trend: 1.05 },
  Accessibility: { prevalence: 0.35, trend: 0.75 },
};

// Every matching rule contributes, in order; a team works with at most five areas.
const AFFINITY = [
  [/agentic|ai\b/i, ["Data & AI", "Backend", "Compliance & Privacy"]],
  [/platform/i, ["DevOps, CI/CD & Infrastructure", "Security"]],
  [/rast|zov|kompla|justiz|kommunikation|postfach/i, ["Backend", "Security"]],
  [/migration/i, ["Architecture", "Data & AI"]],
  [/ausgaben|data/i, ["Data & AI", "Frontend"]],
  [/neuris.*(portal|recht)/i, ["Data & AI", "Frontend"]],
  [/portal|dachmarke|rechner|servicestandard|machen|termin/i, ["Frontend", "Accessibility"]],
  [/geburt|anfrage|teilhabe|work-and-stay|elterngeld/i, ["Compliance & Privacy", "Security", "Frontend"]],
  [/discovery|konzept|exploration/i, ["Discovery & Inception"]],
  [/discovery|konzept|exploration|legistik|regelung|stabsstelle/i, ["Architecture"]],
  [/valid/i, ["Quality & Documentation"]],
  [/./, ["Backend", "Frontend", "Quality & Documentation"]],
];
const affinity = (name) => [...new Set(AFFINITY.filter(([re]) => re.test(name)).flatMap(([, xs]) => xs))].slice(0, 5);

const rng = (() => {
  let a = 20260101;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
})();
const pick = (xs) => xs[Math.floor(rng() * xs.length)];
const clampLevel = (l) => Math.min(6, Math.max(3, l));

// Domain expertise: each project works in one policy domain, from a list the discipline head maintains.
const DOMAINS = [
  [/NeuRIS|Legistik|Regelungsbegleitung/i, "Legislation"],
  [/RAST|ZOV|Justiz-Termin/i, "Justice and courts"],
  [/Geburt|Elterngeld|Teilhabe|Antidiskriminierung/i, "Family and welfare"],
  [/Work-and-Stay|Ausgabensteuerung/i, "Migration and labour"],
];
const domainOf = (project) => DOMAINS.find(([re]) => re.test(project))?.[1] ?? "";
// Internally a domain is the expertise key "Domain:<name>"; written out as the expertise "Domain expertise" plus a domain.
const keyed = (key) => (key.startsWith("Domain:") ? { expertise: "Domain expertise", domain: key.slice(7) } : { expertise: key, domain: "" });

const staffing = parseCsv(readFileSync(new URL("../teams.csv", import.meta.url), "utf8"));

const teams = new Map();
staffing.forEach((row, i) => {
  const name = `${row.Engagement} / ${row.Team}`;
  if (!teams.has(name)) {
    const expertise = affinity(name);
    const domain = domainOf(row.Engagement);
    // A team's domain counts as one of its areas of expertise, right after its primary one.
    if (domain) expertise.splice(1, 0, `Domain:${domain}`);
    teams.set(name, { name, project: row.Engagement, domain, demands: row["Engagement Type"] !== "Internal", expertise, people: [] });
  }
  teams.get(name).people.push({ id: `R${String(i + 1).padStart(3, "0")}`, level: Number(row.Level) });
});

// Roles. Each project team's most senior engineer is its tech lead. People leads are the most senior engineers
// across the discipline, about one per six engineers; each engineer is assigned a lead, ideally on another team.
for (const team of teams.values()) {
  if (team.demands) [...team.people].sort((a, b) => b.level - a.level)[0].role = "tech-lead";
}
{
  const everyone = [...teams.values()].flatMap((t) => t.people.map((p) => Object.assign(p, { home: t.name })));
  const leads = [...everyone].sort((a, b) => b.level - a.level || a.id.localeCompare(b.id)).slice(0, Math.ceil(everyone.length / 6));
  everyone.forEach((p, i) => {
    const others = leads.filter((l) => l !== p && l.home !== p.home);
    p.peopleLead = (others.length ? others : leads.filter((l) => l !== p))[i % (others.length || leads.length - 1)].id;
  });
}

// Each engineer has a personal profile: 2-5 focus areas at varied levels plus a few basic ratings.
// Self-assessments trickle in over the year (some never), peers verify later, some people re-assess.
const ALL_EXPERTISE = Object.keys(EXPERTISE);
const weightedPick = (options) => {
  const total = options.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  return options.find(([, w]) => (r -= w) < 0)[0];
};
const clampRating = (l) => Math.min(6, Math.max(1, l));

function profile(person, team) {
  const focusCount = weightedPick([[2, 1], [3, 3], [4, 3], [5, 1]]);
  const focus = [];
  // Usually one or two of the team's core areas, the rest from personal interest.
  for (const e of team.expertise.slice(0, 1 + Math.floor(rng() * 2))) if (rng() < 0.8) focus.push(e);
  while (focus.length < focusCount) {
    const e = weightedPick(ALL_EXPERTISE.filter((x) => !focus.includes(x)).map((x) => [x, EXPERTISE[x].prevalence]));
    focus.push(e);
  }
  const skills = new Map();
  focus.forEach((e, i) => {
    const spike = rng() < 0.15 ? 1 : 0; // occasional specialist above their career level
    skills.set(e, clampRating(person.level + spike - Math.floor(i / 2) - Math.round(rng() * 1.2)));
  });
  for (const e of ALL_EXPERTISE) if (!skills.has(e) && rng() < 0.3) skills.set(e, clampRating(1 + Math.round(rng())));
  // Deep domain knowledge takes time: only some of a team know its domain close to their own level.
  if (team.domain) skills.set(`Domain:${team.domain}`, clampRating(person.level - (rng() < 0.5 ? Math.round(rng()) : 2 + Math.round(rng()))));
  if (rng() < 0.25) {
    const other = pick(DOMAINS.map(([, d]) => d).filter((d) => d !== team.domain));
    skills.set(`Domain:${other}`, clampRating(person.level - 2));
  }
  if (person.role === "tech-lead") skills.set(TECH_LEAD, clampRating(person.level));
  else if (person.level >= 4 && rng() < 0.4) skills.set(TECH_LEAD, clampRating(person.level - 1));
  return skills;
}

// Everyone has a true skill profile, whether or not they have self-assessed yet.
for (const team of teams.values()) for (const person of team.people) person.skills = profile(person, team);

// Team mobility: teams.csv is the current staffing. Working backwards, some people were on another team
// in earlier quarters, so each quarter has its own staffing and ratings follow the person, not the team.
const MOVE_PER_QUARTER = 0.12;
const allPeople = [...teams.values()].flatMap((t) => t.people);
const teamNames = [...teams.keys()];
for (const team of teams.values()) {
  for (const person of team.people) {
    person.teamAt = Array(QUARTERS.length).fill(team.name);
    for (let qi = QUARTERS.length - 2; qi >= 0; qi--) {
      const next = person.teamAt[qi + 1];
      person.teamAt[qi] = rng() < MOVE_PER_QUARTER ? pick(teamNames.filter((t) => t !== next)) : next;
    }
  }
}
const membersAt = (team, qi) => allPeople.filter((p) => p.teamAt[qi] === team.name);

// What a lead sees on their own team: coverage per row, critical, under, adequate or over. Critical when the
// team's primary areas are badly short. Leads lean optimistic about gaps and protective of people they could spare,
// so some gaps go unreported and some over-coverage is kept quiet.
function leadCoverage(team, expertise, lines, rank, qi) {
  const demand = { 3: 0, 4: 0, 5: 0, 6: 0 };
  for (const { level, people } of lines) demand[level] += PEOPLE[people];
  const truth = assessedCoverage(demand, membersAt(team, qi).map((p) => p.skills.get(expertise) ?? 0));
  const coverage = {};
  for (const { level } of lines) {
    const t = truth[level];
    if (t.gap >= 0.5) {
      const badly = t.gap >= demand[level] / 2 && rank === 0;
      coverage[level] = rng() < 0.2 ? "adequate" : badly && rng() < 0.6 ? "critical" : "under";
    } else coverage[level] = t.spare >= 1 ? (rng() < 0.5 ? "adequate" : "over") : "adequate";
  }
  return coverage;
}

// The project survey asks, per expertise, how many people the team needs working in each way this quarter.
const METHODS = ["operative", "conceptual", "strategic", "comprehensive"]; // levels 3-6
// Support a team can also draw on, in addition to its own people: the platform team, the legal and IT security
// team, or the community of practice. Written as a key per row where the team ticked it.
const SUPPORT = { "DevOps, CI/CD & Infrastructure": "platform", "Compliance & Privacy": "legal" };
const supportFor = (expertise) => (expertise.startsWith("Domain:") ? null : SUPPORT[expertise] ?? "cop");
// Headcount answers are whole people; a need too small to count as a person is left out.
const peopleAnswer = (x) => (x < 0.4 ? null : x < 1.5 ? "1" : x < 2.5 ? "2" : x < 4 ? "3" : "5");

const demandRows = [];
const activityRows = [];
for (const team of teams.values()) {
  if (!team.demands) continue;
  const size = team.people.length;
  const meanLevel = Math.round(team.people.reduce((s, p) => s + p.level, 0) / size);
  for (const [rank, expertise] of team.expertise.entries()) {
    // Mostly one way of working, sometimes with one person needed a step more senior.
    const base = { level: clampLevel(meanLevel - (rank > 0 ? 1 : 0)), people: Math.max(rank < 1 ? 1 : 0, size / (rank + 2)) };
    const lines = [base];
    // Already at the top level there is no step more senior, so no second line.
    if (rng() < 0.25 && base.level < 6) lines.push({ level: base.level + 1, people: 1 });
    for (const line of lines) line.support = supportFor(expertise) && rng() < 0.3 ? supportFor(expertise) : "";
    for (const [qi, quarter] of QUARTERS.entries()) {
      const trend = (EXPERTISE[expertise]?.trend ?? 1) ** qi;
      const answered = lines
        .map((line) => ({ level: line.level, support: line.support, people: peopleAnswer(line.people * trend * (0.85 + rng() * 0.3)) }))
        .filter((a) => a.people);
      if (!answered.length) continue;
      const coverage = leadCoverage(team, expertise, answered, rank, qi);
      for (const { level, people, support } of answered) {
        const line = { level };
        demandRows.push({ quarter, team: team.name, ...keyed(expertise), method: METHODS[level - 3], people, coverage: coverage[level], support });
        if (COMPLETED.includes(quarter)) {
          // Leads tend to overstate need for Architecture; activity reveals it.
          const realism = expertise === "Architecture" ? 0.4 : 0.7 + rng() * 0.6;
          activityRows.push({
            quarter,
            team: team.name,
            ...keyed(expertise),
            method: METHODS[(rng() < 0.25 ? clampLevel(line.level - 1) : line.level) - 3],
            person_days: Math.round(PEOPLE[people] * BOOKABLE_DAYS_PER_QUARTER * realism),
          });
        }
      }
    }
  }
}

const assessmentRows = [];
{
  for (const person of allPeople) {
    const firstQuarter = weightedPick([[0, 10], [1, 15], [2, 20], [3, 20], [null, 35]]);
    if (firstQuarter === null) continue; // not yet assessed
    let skills = person.skills;
    const reassessAt = rng() < 0.3 ? firstQuarter + 2 : null;
    for (const [qi, quarter] of QUARTERS.entries()) {
      if (qi !== firstQuarter && qi !== reassessAt) continue;
      if (qi === reassessAt) skills = new Map([...skills].map(([e, l]) => [e, rng() < 0.25 ? clampRating(l + 1) : l]));
      for (const [expertise, level] of skills) {
        assessmentRows.push({ quarter, respondent: person.id, ...keyed(expertise), assessor: "self", level });
        if (level < 3) continue; // peers only verify ratings that count as delivery capability
        const peerCount = weightedPick([[0, 2], [1, 3], [2, 3], [3, 2]]);
        for (let p = 0; p < peerCount; p++) {
          const peerQuarter = QUARTERS[Math.min(QUARTERS.length - 1, qi + Math.floor(rng() * 2))];
          const peerLevel = clampRating(level + weightedPick([[-1, 3], [0, 6], [1, 1]]));
          assessmentRows.push({ quarter: peerQuarter, respondent: person.id, ...keyed(expertise), assessor: "peer", level: peerLevel });
        }
      }
    }
  }
}
// Leads rate the people on their project teams in the areas the team works in, starting at different
// quarters (some not yet). Leads are close to the work: mostly accurate, occasionally conservative.
for (const team of teams.values()) {
  if (!team.demands) continue;
  const start = weightedPick([[1, 4], [2, 3], [3, 2], [null, 1]]);
  if (start === null) continue;
  const rounds = [start, ...(rng() < 0.5 && start + 2 < QUARTERS.length ? [start + 2] : [])];
  for (const qi of rounds) {
    const quarter = QUARTERS[qi];
    for (const person of membersAt(team, qi)) {
      for (const expertise of team.expertise) {
        const level = person.skills.get(expertise);
        if (!level) continue;
        assessmentRows.push({ quarter, respondent: person.id, ...keyed(expertise), assessor: "lead", level: clampRating(level + weightedPick([[-1, 2], [0, 7], [1, 1]])) });
      }
    }
  }
}
// A few teams reporting buffer this quarter have no ratings at all yet, so their over-supply is known
// only from the project survey. These are the examples of buffer reported solely by leads.
const UNRATED_BUFFER_TEAMS = 3;
const reportingBuffer = [...new Set(demandRows.filter((r) => r.quarter === QUARTERS.at(-1) && r.coverage === "over").map((r) => r.team))];
const unratedTeams = new Set(reportingBuffer.sort().slice(0, UNRATED_BUFFER_TEAMS));
const unrated = new Set(allPeople.filter((p) => unratedTeams.has(p.teamAt.at(-1))).map((p) => p.id));
for (let i = assessmentRows.length - 1; i >= 0; i--) if (unrated.has(assessmentRows[i].respondent)) assessmentRows.splice(i, 1);

// Hand-added ratings from this quarter: people who rated themselves in further domains, plus two newly
// verified areas. Kept as fixed rows so regenerating does not lose them.
const HAND_ADDED = [
  ["R047", "Domain expertise", "Justice and courts", "self", 4],
  ["R047", "Domain expertise", "Migration and labour", "self", 4],
  ["R008", "Domain expertise", "Family and welfare", "self", 5],
  ["R008", "Domain expertise", "Migration and labour", "self", 3],
  ["R008", "Domain expertise", "Justice and courts", "self", 3],
  ["R015", "Domain expertise", "Legislation", "self", 4],
  ["R015", "Domain expertise", "Family and welfare", "self", 3],
  ["R015", "Domain expertise", "Migration and labour", "self", 3],
  ["R056", "Domain expertise", "Justice and courts", "self", 5],
  ["R015", "Domain expertise", "Legislation", "peer", 3],
  ["R008", "Domain expertise", "Family and welfare", "peer", 3],
  ["R047", "Frontend", "", "self", 5],
  ["R047", "Frontend", "", "peer", 4],
  ["R015", "Backend", "", "self", 4],
  ["R015", "Backend", "", "peer", 3],
];
for (const [respondent, expertise, domain, assessor, level] of HAND_ADDED) {
  assessmentRows.push({ quarter: QUARTERS.at(-1), respondent, expertise, domain, assessor, level });
}

// Staffing per quarter, by pseudonymous person ID: the roster the tool uses to place ratings in teams.
const staffingRows = QUARTERS.flatMap((quarter, qi) =>
  allPeople.map((p) => ({
    quarter,
    person: p.id,
    project: teams.get(p.teamAt[qi]).project,
    team: p.teamAt[qi],
    level: p.level,
    role: p.role === "tech-lead" && p.teamAt[qi] === p.home ? "tech-lead" : "engineer",
    people_lead: p.peopleLead,
  })));

// The discipline head's quarterly plan, layered on top of the project survey.
const planRows = [
  ...[...new Set([...teams.values()].filter((t) => t.domain).map((t) => `${t.project}|${t.domain}`))].map((pair) => {
    const [project, domain] = pair.split("|");
    return { quarter: QUARTERS.at(-1), kind: "domain", subject: project, method: "", value: domain, reason: "" };
  }),
  // Strategic adjustments: headcount added to or taken from what projects report.
  ...["2026-Q3", "2026-Q4"].flatMap((quarter) => [
    { quarter, kind: "adjust", subject: "Data & AI", method: "conceptual", value: 2, reason: "Business development" },
    { quarter, kind: "adjust", subject: "Security", method: "strategic", value: 1, reason: "Building a capability" },
    { quarter, kind: "adjust", subject: "Security", method: "conceptual", value: 1, reason: "Building a capability" },
    { quarter, kind: "adjust", subject: "Architecture", method: "strategic", value: -1, reason: "Winding down" },
  ]),
  { quarter: "2026-Q4", kind: "adjust", subject: "Security", method: "strategic", value: 1, reason: "Expected project" },
  // Tech lead targets for teams whose need differs from the default for their size.
  ...QUARTERS.flatMap((quarter) => [
    { quarter, kind: "tech-lead", subject: "Rechtsinformationsportal (NeuRIS) / Core", method: "comprehensive", value: 1, reason: "" },
    { quarter, kind: "tech-lead", subject: "Digitale Rechtsantragsstelle (RAST) / Platform", method: "strategic", value: 1, reason: "" },
  ]),
  // People leadership: how many reports at each level one people lead carries, and the working method needed.
  ...QUARTERS.flatMap((quarter) => [
    { quarter, kind: "people-lead", subject: 3, method: "conceptual", value: 7, reason: "" },
    { quarter, kind: "people-lead", subject: 4, method: "conceptual", value: 6, reason: "" },
    { quarter, kind: "people-lead", subject: 5, method: "strategic", value: 5, reason: "" },
    { quarter, kind: "people-lead", subject: 6, method: "comprehensive", value: 4, reason: "" },
  ]),
];
assessmentRows.sort((a, b) => a.quarter.localeCompare(b.quarter));

const out = new URL("../data/", import.meta.url);
mkdirSync(out, { recursive: true });
writeFileSync(new URL("project-demand.csv", out), toCsv(demandRows));
writeFileSync(new URL("expertise-assessments.csv", out), toCsv(assessmentRows));
writeFileSync(new URL("historical-activity.csv", out), toCsv(activityRows));
writeFileSync(new URL("staffing.csv", out), toCsv(staffingRows));
writeFileSync(new URL("discipline-plan.csv", out), toCsv(planRows));
console.log(`demand: ${demandRows.length}, assessments: ${assessmentRows.length}, activity: ${activityRows.length}, staffing: ${staffingRows.length}`);

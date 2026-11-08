// Generates the prototype's dummy data from a staffing snapshot: the ds-staffing export, as pasted into the
// discipline sheet. Only the team structure and levels are used: no names or emails reach the output, where
// people are R001, R002, … Runs in the browser (the portal) and in Node (scripts/generate-data.js).
// Deterministic (seeded) so regenerating from the same snapshot produces identical data.
import { assessedCoverage, PEOPLE, TECH_LEAD, BOOKABLE_DAYS_PER_QUARTER } from "./model.js";
import { SUPPORT_KEY } from "./areas.js";

const QUARTERS = ["2026-Q1", "2026-Q2", "2026-Q3", "2026-Q4"];
const COMPLETED = QUARTERS.slice(0, -1); // activity is only recorded for finished quarters

// prevalence: chance an engineer holds this as a personal focus area.
// trend: per-quarter demand multiplier, so changes have a story to tell.
// The project survey's suggested areas (src/areas.js).
const EXPERTISE = {
  "Technical discovery": { prevalence: 0.1, trend: 1.0 },
  Prototyping: { prevalence: 0.08, trend: 1.0 },
  "Frontend development": { prevalence: 0.45, trend: 0.98 },
  "Design systems": { prevalence: 0.15, trend: 0.98 },
  "Backend development": { prevalence: 0.55, trend: 1.0 },
  "APIs & integration": { prevalence: 0.3, trend: 1.02 },
  "Software architecture": { prevalence: 0.25, trend: 0.98 },
  "Legacy modernisation": { prevalence: 0.1, trend: 1.0 },
  "Application security": { prevalence: 0.12, trend: 1.12 },
  "Identity & access": { prevalence: 0.08, trend: 1.1 },
  "IT security compliance": { prevalence: 0.05, trend: 1.08 },
  "CI/CD": { prevalence: 0.35, trend: 1.03 },
  "Cloud infrastructure": { prevalence: 0.25, trend: 1.03 },
  "Containers & orchestration": { prevalence: 0.2, trend: 1.05 },
  Observability: { prevalence: 0.15, trend: 1.03 },
  "Developer experience": { prevalence: 0.1, trend: 1.0 },
  "Test automation": { prevalence: 0.3, trend: 1.0 },
  Performance: { prevalence: 0.12, trend: 1.0 },
  "Technical documentation": { prevalence: 0.15, trend: 1.0 },
  "Data engineering": { prevalence: 0.2, trend: 1.05 },
  "Data analysis": { prevalence: 0.12, trend: 1.02 },
  Search: { prevalence: 0.06, trend: 1.0 },
  "Machine learning": { prevalence: 0.06, trend: 1.08 },
  "AI engineering": { prevalence: 0.15, trend: 1.18 },
  "Data protection": { prevalence: 0.07, trend: 1.05 },
  Accessibility: { prevalence: 0.3, trend: 0.75 },
  Mobile: { prevalence: 0.05, trend: 0.95 },
  "Open source": { prevalence: 0.06, trend: 1.02 },
  "Feature development": { prevalence: 0.5, trend: 1.0 },
  Operations: { prevalence: 0.2, trend: 1.02 },
  Maintenance: { prevalence: 0.3, trend: 1.04 },
  Support: { prevalence: 0.15, trend: 1.0 },
  "On-call & incident response": { prevalence: 0.12, trend: 1.05 },
  "Release management": { prevalence: 0.1, trend: 1.0 },
};

// Every matching rule contributes, in order; a team works with at most five areas.
const AFFINITY = [
  [/agentic|ai\b/i, ["AI engineering", "Backend development", "Data protection"]],
  [/platform/i, ["CI/CD", "Cloud infrastructure", "Operations", "On-call & incident response", "Application security"]],
  [/rast|zov|kompla|justiz|kommunikation|postfach/i, ["Backend development", "APIs & integration", "Application security"]],
  [/migration/i, ["Legacy modernisation", "Data engineering"]],
  [/ausgaben|data/i, ["Data engineering", "Data analysis", "Frontend development"]],
  [/neuris.*(portal|recht)/i, ["Search", "AI engineering", "Frontend development"]],
  [/portal|dachmarke|rechner|servicestandard|machen|termin/i, ["Frontend development", "Accessibility", "Design systems"]],
  [/geburt|anfrage|teilhabe|work-and-stay|elterngeld/i, ["Data protection", "Identity & access", "Frontend development"]],
  [/discovery|konzept|exploration/i, ["Technical discovery", "Prototyping"]],
  [/discovery|konzept|exploration|legistik|regelung|stabsstelle/i, ["Software architecture"]],
  [/valid/i, ["Test automation"]],
  [/./, ["Feature development", "Backend development", "Frontend development", "Maintenance", "Test automation"]],
];

// Areas teams add themselves in the survey, beyond the suggested ones, with what they need there. Each project team
// adds a few at random, so the prototype has many free-text areas to group into buckets, in German and English.
const ADDED_AREAS = [
  ["Kubernetes", "Cluster operations on STACKIT"], ["Terraform", "Infrastructure as code for new environments"],
  ["OpenTelemetry", "Tracing across services"], ["Postgres", "Query tuning and migrations"],
  ["React", "Component library migration"], ["Vue", "Nuxt 4 upgrade"], ["Kotlin", "Spring Boot services"],
  ["Rust", "Parser performance"], ["OpenAPI", "Contract-first API design"], ["Keycloak", "Single sign-on for ministry staff"],
  ["Barrierefreiheit", "BITV 2.0 audit fixes"], ["Datenschutz", "DSFA and data retention"], ["UX research", "Usability tests with citizens"],
  ["Penetration testing", "Preparing for the BSI audit"], ["LLM evaluation", "Evaluating answers against legal sources"],
  ["Prompt engineering", "Retrieval prompts for case workers"], ["Domain-driven design", "Splitting the monolith along domains"],
  ["Legacy migration", "Replacing a mainframe interface"], ["XÖV standards", "XJustiz message formats"],
  ["E-Akte", "Integration with the federal e-file"], ["Elasticsearch", "Full-text search over legislation"],
  ["Mobile apps", "Native wrapper for the citizen app"], ["Testautomatisierung", "Playwright end-to-end suite"],
  ["Technical writing", "Developer documentation for partners"], ["FinOps", "Cloud cost reporting"],
  ["Event streaming", "Kafka between agencies"], ["EUPL", "Publishing code under the EUPL"],
  ["Grafana", "Dashboards for the operations team"], ["GraphQL", "API for the portal front end"], ["Python", "Data pipelines and notebooks"],
];
const affinity = (name) =>[...new Set(AFFINITY.filter(([re]) => re.test(name)).flatMap(([, xs]) => xs))].slice(0, 5);

// Reseeded on every run, so each run gives the same data for the same snapshot.
const seeded = () => {
  let a = 20260101;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
let rng = seeded();
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

// rows: the snapshot's rows (Engagement Type, Level, Engagement, Team, Department, Status; other columns ignored).
// Returns the dummy data's tabs: name -> rows.
// catalogue: the area list (readAreas of the discipline sheet's areas tab). Areas it
// has that the tables above don't know get a modest prevalence and no trend.
export function generateDummyData(rows, catalogue) {
  if (!catalogue.names.length) throw new Error("The discipline sheet's areas tab is empty: fill it in first.");
  const known = new Set(catalogue.names);
  const prevalence = (area) => EXPERTISE[area]?.prevalence ?? 0.08;
  rng = seeded();
  // Only the engineering discipline counts, sub-departments included ("Engineering / Platform"). Anyone else in
  // the export, such as design or product, holds no position here.
  const isEngineering = (department) => /^Engineering(\s*\/|$)/.test(department.trim());
    // Active people only: the snapshot can also hold proposed or shortlisted staffing.
    const active = rows.filter((r) => isEngineering(r.Department ?? "") && (r.Status ?? "Active") === "Active");
    // The export has a row per person and team: everyone counts once, in the team with their largest
    // assignment, as in live mode. Rows without an email (older exports) are taken as they are.
    const main = new Map();
    for (const r of active.filter((r) => r.Email)) {
      const best = main.get(r.Email);
      if (!best || Number(r["% Assignment in Team"]) > Number(best["% Assignment in Team"])) main.set(r.Email, r);
    }
    const staffing = active.filter((r) => !r.Email || main.get(r.Email) === r);
    if (!staffing.length) throw new Error("The staffing snapshot has no active Engineering rows: check its Department and Status columns.");

  const teams = new Map();
  staffing.forEach((row, i) => {
    const name = `${row.Engagement} / ${row.Team}`;
    if (!teams.has(name)) {
      const expertise = affinity(name).filter((e) => known.has(e));
      const domain = domainOf(row.Engagement);
      // A team's domain counts as one of its areas of expertise, right after its primary one.
      if (domain) expertise.splice(1, 0, `Domain:${domain}`);
      const demands = row["Engagement Type"] !== "Internal";
      // Added areas come last: a team's own additions are rarely its main need.
      const added = new Set();
      if (demands) for (let n = 2 + Math.floor(rng() * 3); added.size < n; ) added.add(pick(ADDED_AREAS)[0]);
      teams.set(name, { name, project: row.Engagement, domain, demands, expertise: [...expertise, ...added], added, people: [] });
    }
    teams.get(name).people.push({ id: `R${String(i + 1).padStart(3, "0")}`, level: Number(row.Level) });
  });

  // Roles. Each project team's most senior engineer is its tech lead. People leads are the most senior engineers
  // across the discipline, about one per six engineers; each engineer is assigned a lead, ideally on another team.
  for (const team of teams.values()) {
    if (team.demands) [...team.people].sort((a, b) => b.level - a.level)[0].role = "tech-lead";
  }
  // Engagements with several teams also need an engagement lead: their most senior tech lead. Every third such
  // engagement goes without, so the prototype shows the gap too.
  [...Map.groupBy([...teams.values()].filter((t) => t.demands), (t) => t.project)]
    .filter(([, ts]) => ts.length > 1)
    .forEach(([, ts], i) => {
      if (i % 3 === 2) return;
      const leads = ts.flatMap((t) => t.people.filter((p) => p.role === "tech-lead"));
      leads.sort((a, b) => b.level - a.level)[0].engagementLead = true;
    });
  {
    const everyone = [...teams.values()].flatMap((t) => t.people.map((p) => Object.assign(p, { home: t.name })));
    const leads = [...everyone].sort((a, b) => b.level - a.level || a.id.localeCompare(b.id)).slice(0, Math.ceil(everyone.length / 6));
    everyone.forEach((p, i) => {
      const others = leads.filter((l) => l !== p && l.home !== p.home);
      const pool = others.length ? others : leads.filter((l) => l !== p);
      // In a very small snapshot the only people lead has nobody to report to.
      p.peopleLead = pool.length ? pool[i % pool.length].id : "";
    });
  }

  // Each engineer has a personal profile: 2-5 focus areas at varied levels plus a few basic ratings.
  // Self-assessments trickle in over the year (some never), peers verify later, some people re-assess.
  const ALL_EXPERTISE = catalogue.names;
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
    // A short area list may run out before the count does.
    for (let pool = ALL_EXPERTISE.filter((x) => !focus.includes(x)); focus.length < focusCount && pool.length; pool = pool.filter((x) => !focus.includes(x))) {
      const e = weightedPick(pool.map((x) => [x, prevalence(x)]));
      focus.push(e);
    }
    const skills = new Map();
    focus.forEach((e, i) => {
      const spike = rng() < 0.15 ? 1 : 0; // occasional specialist above their career level
      skills.set(e, clampRating(person.level + spike - Math.floor(i / 2) - Math.round(rng() * 1.2)));
    });
    for (const e of ALL_EXPERTISE) if (!skills.has(e) && rng() < 0.3) skills.set(e, clampRating(1 + Math.round(rng())));
    // Most of a team know the areas it added, a little below their own level.
    for (const e of team.added) if (rng() < 0.6) skills.set(e, clampRating(person.level - Math.round(rng() * 2)));
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

  // Team mobility: the snapshot is the current staffing. Working backwards, some people were on another team
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
  const SUPPORT = Object.fromEntries(catalogue.areas.map(([name, support]) => [name, SUPPORT_KEY[support]]));
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
      // A team's primary area, and any it typed in itself, need at least one person.
      const base = { level: clampLevel(meanLevel - (rank > 0 ? 1 : 0)), people: Math.max(rank < 1 || team.added.has(expertise) ? 1 : 0, size / (rank + 2)) };
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
          const specifics = ADDED_AREAS.find(([area]) => area === expertise)?.[1] ?? "";
          demandRows.push({ quarter, team: team.name, ...keyed(expertise), method: METHODS[level - 3], people, coverage: coverage[level], support, specifics });
          if (COMPLETED.includes(quarter)) {
            // Leads tend to overstate need for software architecture; activity reveals it.
            const realism = expertise === "Software architecture" ? 0.4 : 0.7 + rng() * 0.6;
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
    ["R047", "Frontend development", "", "self", 5],
    ["R047", "Frontend development", "", "peer", 4],
    ["R015", "Backend development", "", "self", 4],
    ["R015", "Backend development", "", "peer", 3],
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
      engagement_lead: p.engagementLead && p.teamAt[qi] === p.home ? "yes" : "",
    })));

  // The discipline head's quarterly plan, layered on top of the project survey.
  const planRows = [
    ...[...new Set([...teams.values()].filter((t) => t.domain).map((t) => `${t.project}|${t.domain}`))].map((pair) => {
      const [project, domain] = pair.split("|");
      return { quarter: QUARTERS.at(-1), kind: "domain", subject: project, method: "", value: domain, reason: "" };
    }),
    // Strategic adjustments: headcount added to or taken from what projects report.
    ...["2026-Q3", "2026-Q4"].flatMap((quarter) => [
      { quarter, kind: "adjust", subject: "AI engineering", method: "conceptual", value: 2, reason: "Business development" },
      { quarter, kind: "adjust", subject: "Application security", method: "strategic", value: 1, reason: "Building a capability" },
      { quarter, kind: "adjust", subject: "Application security", method: "conceptual", value: 1, reason: "Building a capability" },
      { quarter, kind: "adjust", subject: "Software architecture", method: "strategic", value: -1, reason: "Winding down" },
    ]),
    { quarter: "2026-Q4", kind: "adjust", subject: "Application security", method: "strategic", value: 1, reason: "Expected project" },
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
  return {
    "project-demand": demandRows,
    "expertise-assessments": assessmentRows,
    "historical-activity": activityRows,
    staffing: staffingRows,
    "discipline-plan": planRows,
  };
}

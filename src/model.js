// Pure functions turning the input tabs into per-expertise demand/supply summaries.
// Everything is aggregated to organisation, project or team level.
//
// The project survey asks one grid per expertise: for each working method, how many people the team needs
// (1, 2, 3 or 5) and how well it is covered on the team today (critical, under, adequate, over). Each row's colour
// follows from those two answers. Individual ratings (self, peer, lead) arrive irregularly; when a team's are fresh
// enough they size its gaps. Activity verifies. Disagreements between the sources are surfaced.

export const LEVELS = [3, 4, 5, 6];
// Leads describe demand by working method, taken from the level structure; internally each maps to a level.
export const METHODS = { operative: 3, conceptual: 4, strategic: 5, comprehensive: 6 };
export const METHOD_NAME = { 3: "Operative", 4: "Conceptual", 5: "Strategic", 6: "Comprehensive" };
// Leads answer in whole headcount on a Fibonacci scale, so every answer is an exact number of people.
export const PEOPLE = { 1: 1, 2: 2, 3: 3, 5: 5 };
// Row coverage answers, and the colour of one team's row from coverage and people needed:
//   critical  always red
//   under     orange when 1 or 2 people are needed (a large share missing), yellow when 3 or 5 (one short of several)
//   adequate  yellow when 1 person is needed (no redundancy), green otherwise
//   over      always blue
export const COVERAGE = ["critical", "under", "adequate", "over"];
export function rowStatus(coverage, people) {
  if (coverage === "critical") return "short";
  if (coverage === "under") return people <= 2 ? "strained" : "fragile";
  if (coverage === "adequate") return people <= 1 ? "fragile" : "covered";
  if (coverage === "over") return "surplus";
  return null;
}
// How much a row's gap weighs in urgency, by its colour.
const WEIGHT = { short: 3, strained: 2, fragile: 1 };
export const ASSESSOR_WEIGHT = { self: 1, peer: 2, lead: 3 };

// Roles that are charted like expertise, with demand derived rather than surveyed.
export const TECH_LEAD = "Tech leadership";
export const PEOPLE_LEAD = "People leadership";
// Domain expertise is one expertise qualified by a policy domain. Matching happens per domain (a welfare expert
// never covers a legal gap); domains are charted on their own radial chart, one spoke per domain.
export const DOMAIN = "Domain expertise";
const DOMAIN_KEY = `${DOMAIN}: `;
const keyedByDomain = (r) => (r.domain ? { ...r, expertise: DOMAIN_KEY + r.domain } : r);

// Ratings older than this many quarters (counting the current one) are out of date.
const FRESH_QUARTERS = 2;
// Share of a team that needs up-to-date ratings before those ratings can locate its gaps.
const FRESH_SHARE = 0.6;
// A gap a lead reports but ratings can't locate counts as half a person, spread over what the team asked for.
const UNLOCATED_GAP = 0.5;
// A person has 60 working days a quarter, of which on average 70% is booked to project work.
export const WORKING_DAYS_PER_QUARTER = 60;
export const UTILISATION = 0.7;
export const BOOKABLE_DAYS_PER_QUARTER = WORKING_DAYS_PER_QUARTER * UTILISATION;

const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const round = (x) => Math.round(x * 100) / 100;
const groupBy = (rows, key) => rows.reduce((m, r) => m.set(key(r), [...(m.get(key(r)) ?? []), r]), new Map());
const atLevel = (rows, level) => rows.filter((r) => r.level === level);
const zeros = () => Object.fromEntries(LEVELS.map((l) => [l, 0]));
const demandByLevel = (rows) => Object.fromEntries(LEVELS.map((l) => [l, round(sum(atLevel(rows, l).map((r) => r.quantity)))]));

// Weighted mean of the available ratings, normalised over whichever sources exist: lead above peers above self.
// Peers are averaged first, so their weight does not grow with the number of reviews.
export function assessedScore({ self, peers = [], lead }) {
  const sources = [
    [self, ASSESSOR_WEIGHT.self],
    [peers.length ? sum(peers) / peers.length : undefined, ASSESSOR_WEIGHT.peer],
    [lead, ASSESSOR_WEIGHT.lead],
  ].filter(([score]) => score !== undefined);
  return sum(sources.map(([score, w]) => score * w)) / sum(sources.map(([, w]) => w));
}

// Ratings as known at the end of `quarter`, per person and expertise: latest self-assessment, peer reviews
// given since, and the lead's latest rating. `asOf` is the most recent rating that went into the score.
// Ratings belong to the person; `teamOf` places them in the team they are staffed on that quarter, and
// people not on the staffing list (left, or not yet joined) are left out.
export function supplyAsOf(assessments, quarter, teamOf) {
  const byPerson = groupBy(assessments.filter((r) => r.quarter <= quarter), (r) => `${r.respondent}|${r.expertise}`);
  const latest = (rows, assessor) => rows.filter((r) => r.assessor === assessor).sort((a, b) => a.quarter.localeCompare(b.quarter)).at(-1);
  const levels = [];
  const respondents = new Map();
  for (const rows of byPerson.values()) {
    const self = latest(rows, "self"), lead = latest(rows, "lead");
    const peers = rows.filter((r) => r.assessor === "peer" && (!self || r.quarter >= self.quarter));
    if (!self && !lead && !peers.length) continue;
    const { respondent, expertise } = self ?? lead ?? peers[0];
    const team = teamOf(respondent);
    if (!team) continue;
    const asOf = [self, lead, ...peers].filter(Boolean).map((r) => r.quarter).sort().at(-1);
    const score = assessedScore({ self: self && Number(self.level), peers: peers.map((p) => Number(p.level)), lead: lead && Number(lead.level) });
    // Matching works on whole levels; the score rounds to the nearest one.
    levels.push({ respondent, team, expertise, score, level: Math.round(score), asOf, self: self ? Number(self.level) : null });
    const known = respondents.get(respondent);
    if (!known || known.asOf < asOf) respondents.set(respondent, { team, asOf });
  }
  return { levels, respondents };
}

// Rating-based matching by exact level. Engineers cover their own level first; leftovers may step down
// to lower-level work (over-qualified), never up. `spare` counts engineers unused at their own level.
export function assessedCoverage(demand, supplyLevels) {
  const result = {};
  let available = 0;
  for (const level of [...LEVELS].reverse()) {
    const people = supplyLevels.filter((l) => l === level).length;
    const own = Math.min(people, demand[level]);
    const fromAbove = Math.min(available, demand[level] - own);
    available += people - own - fromAbove;
    result[level] = { people, fromAbove: round(fromAbove), gap: round(demand[level] - own - fromAbove), spare: round(people - own) };
  }
  return result;
}

// A gap counts as a shortage once it is material: half a person, or a quarter of the demand.
const material = (gap, demand) => gap >= 0.5 || gap >= demand / 4;

// Status of one demanded working method. Solid when projects and up-to-date ratings agree, provisional
// (pale) when only one side says so. Gaps outrank over-supply; project-reported over-supply outranks
// over-supply that only ratings show.
export function status(l, expected = 0) {
  const { demand, gap, unlocated, share = [], confirmed = false, overqualified, people, spare } = l;
  if (demand === 0) return { status: "none", provisional: false };
  // The most severe gap row sets the colour of a gap: red, orange or yellow.
  const severity = l.severity ?? 3;
  const gapStatus = severity >= 3 ? "short" : severity >= 2 ? "strained" : "fragile";
  if (gap > 0 && material(gap, demand)) return { status: gapStatus, provisional: false };
  if (unlocated > 0) return { status: gapStatus, provisional: true };
  if (share.length) return { status: "surplus", provisional: !confirmed };
  if (overqualified > 0) return { status: "overqualified", provisional: true };
  if (people === 1) return { status: "fragile", provisional: expected >= 1 };
  if (people >= 2 * demand && spare >= 2) return { status: "surplus", provisional: true };
  return { status: "covered", provisional: false };
}

// The two halves of each ring. Left: what projects report. Right: what up-to-date people ratings show.
// When several teams are combined, a signal colours a half only once teams holding this share of the demand
// for that working method agree on it, so one team cannot colour a whole project.
const SIGNAL_SHARE = 0.25;
// teams: per team asking for this working method, its demand, its row's colour and whether its ratings are fresh.
const demandWith = (teams, test) => sum(teams.filter(test).map((t) => t.demand));
// The project's colour for a working method: each team's row weighted by its headcount, taking the most severe
// colour that holds at least a quarter of the demand, severe rows counting towards milder ones.
export function projectStatus({ demand, teams = [] }) {
  if (demand === 0) return "none";
  if (!demandWith(teams, (t) => t.status)) return null; // no project answered
  const holds = (...statuses) => demandWith(teams, (t) => statuses.includes(t.status)) >= SIGNAL_SHARE * demand;
  if (holds("short")) return "short";
  if (holds("short", "strained")) return "strained";
  if (holds("short", "strained", "fragile")) return "fragile";
  if (holds("surplus")) return "surplus";
  return "covered";
}

// Kept for the reconciled status: leads place their own gaps now, so nothing is placed elsewhere.
export function projectFaded() {
  return false;
}

// Null (drawn faded) when too little of the demand has fresh ratings, or when teams without them hold a
// signal share of the demand and report something the ratings don't show.
export function peopleStatus({ demand, rated, teams = [] }) {
  if (demand === 0) return "none";
  if (!rated || rated.demand < FRESH_SHARE * demand) return null;
  let shown = "covered";
  if (rated.gap > 0 && rated.gap >= 0.5 * rated.demand && rated.gap >= 0.5) shown = "short";
  else if (rated.gap > 0 && material(rated.gap, rated.demand)) shown = "strained";
  else if (rated.fromAbove > 0) shown = "overqualified";
  else if (rated.spare >= 1) shown = "surplus";
  else if (rated.people === 1) shown = "fragile";
  const agrees = (t) => t.status === shown || (["fragile", "covered"].includes(t.status) && ["fragile", "covered"].includes(shown));
  const contradicted = demandWith(teams, (t) => !t.fresh && t.status && !agrees(t)) >= SIGNAL_SHARE * demand;
  return contradicted ? null : shown;
}

// One reconciled status per level, for audiences who need an answer rather than the two sources side by side.
// The project's answer is the baseline. Ratings speak where no project answered, where ratings place a reported
// gap in another working method, and where they show over-coverage (seniors on junior work, or people to spare)
// that the project reports as covered. Ratings never clear or invent a gap.
export function reconciledStatus(l) {
  if (l.project === null || l.projectFaded) return l.ratings ?? l.project ?? "none";
  if (l.project === "covered" && ["overqualified", "surplus"].includes(l.ratings)) return l.ratings;
  return l.project;
}

// Status from ratings across the whole scope, for demand no project answers for.
export function capacityStatus({ demand, people, gap, fromAbove, spare }) {
  if (demand === 0) return "none";
  if (gap > 0 && gap >= 0.5 * demand && gap >= 0.5) return "short";
  if (gap > 0 && material(gap, demand)) return "strained";
  if (fromAbove > 0) return "overqualified";
  if (spare >= 1) return "surplus";
  if (people === 1) return "fragile";
  return "covered";
}

// Relative change; Infinity marks demand that did not exist the quarter before.
export function change(previous, current) {
  if (previous > 0) return (current - previous) / previous;
  return current > 0 ? Infinity : null;
}

// Where a team's answers and its up-to-date ratings tell different stories.
const teamCount = (n) => (n === 1 ? "1 team reports" : `${n} teams report`);
const NOTE = {
  hiddenGap: (n) => `${teamCount(n)} adequate cover, but their ratings show a gap. Someone may be stretching, or ratings are conservative.`,
  unexplainedOver: (n) => `${teamCount(n)} more people than needed, but their ratings show nobody to spare.`,
  hiddenOver: (n) => `${teamCount(n)} adequate cover, but their ratings show people to spare or working below their level.`,
};

// Combine each team's rows with its ratings, when fresh. Rows marked critical or under place the team's gaps,
// weighted by the row's colour; fresh ratings size them where they can, otherwise they count as half a person and
// show provisional. Rows marked "over" make the team a rotation donor there.
function readTeams(demandRows, ratingsOf, isFresh) {
  const gap = zeros(), unlocated = zeros(), overqualified = zeros(), severity = zeros(), urgency = zeros();
  const share = Object.fromEntries(LEVELS.map((l) => [l, []]));
  const confirmed = Object.fromEntries(LEVELS.map((l) => [l, false]));
  const reportedGap = Object.fromEntries(LEVELS.map((l) => [l, false]));
  const teamsAt = Object.fromEntries(LEVELS.map((l) => [l, []]));
  const rated = Object.fromEntries(LEVELS.map((l) => [l, { demand: 0, gap: 0, fromAbove: 0, spare: 0, people: 0 }]));
  const notes = [], levelNotes = [];
  for (const [team, rows] of groupBy(demandRows, (r) => r.team)) {
    const demand = demandByLevel(rows);
    const rowAt = Object.fromEntries(LEVELS.map((l) => [l, atLevel(rows, l).find((r) => r.coverage)?.coverage ?? null]));
    const fresh = isFresh(team);
    const cover = fresh ? assessedCoverage(demand, ratingsOf(team)) : null;
    for (const l of LEVELS.filter((l) => demand[l])) {
      const colour = rowStatus(rowAt[l], demand[l]);
      teamsAt[l].push({ team, demand: demand[l], coverage: rowAt[l], status: colour, fresh });
      if (rowAt[l] === "over") {
        share[l].push(team);
        if (cover && cover[l].spare > 0) confirmed[l] = true;
      }
      if (cover) {
        rated[l].demand += demand[l];
        for (const k of ["gap", "fromAbove", "spare", "people"]) rated[l][k] += cover[l][k];
        overqualified[l] += cover[l].fromAbove; // seen only in ratings
      }
      if (["critical", "under"].includes(rowAt[l])) {
        const weight = WEIGHT[colour];
        reportedGap[l] = true;
        if (cover && cover[l].gap > 0) {
          gap[l] += cover[l].gap;
          urgency[l] += weight * cover[l].gap;
        } else {
          unlocated[l] += UNLOCATED_GAP;
          urgency[l] += weight * UNLOCATED_GAP;
          if (cover) levelNotes.push({ level: l, text: `${team} reports a gap here, but its ratings show the people needed. They may be busy elsewhere, or ratings are generous.` });
        }
        severity[l] = Math.max(severity[l], weight);
      }
    }
    const gapRow = (l) => ["critical", "under"].includes(rowAt[l]);
    if (cover && LEVELS.some((l) => demand[l] && !gapRow(l) && cover[l].gap > 0)) notes.push({ kind: "hiddenGap", team });
    const overRows = LEVELS.filter((l) => demand[l] && rowAt[l] === "over");
    if (cover && overRows.length && overRows.every((l) => cover[l].spare === 0)) notes.push({ kind: "unexplainedOver", team });
    if (cover && LEVELS.some((l) => demand[l] && rowAt[l] === "adequate" && (cover[l].spare >= 1 || cover[l].fromAbove > 0))) notes.push({ kind: "hiddenOver", team });
  }
  const r = (o) => Object.fromEntries(LEVELS.map((l) => [l, round(o[l])]));
  return { gap: r(gap), unlocated: r(unlocated), overqualified: r(overqualified), severity, urgency: r(urgency), share, confirmed, reportedGap, rated, teamsAt, notes, levelNotes };
}

// The statuses of one level: combined, project half and people half.
function classify(l, expected) {
  Object.assign(l, status(l, expected));
  l.project = l.projectDemand ? projectStatus({ ...l, demand: l.projectDemand }) : l.demand ? null : "none";
  l.projectFaded = projectFaded(l);
  if (l.project === null) {
    // Nobody on a project answered for this demand: ratings across the scope speak for all of it.
    l.ratings = capacityStatus({ demand: l.demand, ...l.capacity });
    l.capacityGap = l.capacity.gap;
    Object.assign(l, { status: l.ratings, provisional: false });
  } else {
    l.ratings = peopleStatus({ ...l, demand: l.projectDemand });
    // Planned demand on top of what projects report shows on the ratings half once the scope can't cover it.
    if (l.planned > 0 && l.ratings && !["short", "strained"].includes(l.ratings) && material(l.capacity.gap, l.demand)) l.ratings = "strained";
  }
  return l;
}

// Add up one level across domains. Each domain was matched on its own, so its gaps, spare people and team
// answers can be summed without one domain's people covering another's demand.
const SUMMED = ["demand", "projectDemand", "planned", "gap", "unlocated", "overqualified", "urgency", "people", "spare"];
function combineLevel(parts, expected) {
  const l = { level: parts[0].level };
  for (const k of SUMMED) l[k] = round(sum(parts.map((p) => p[k])));
  l.activity = parts.every((p) => p.activity === null) ? null : round(sum(parts.map((p) => p.activity ?? 0)));
  l.severity = Math.max(...parts.map((p) => p.severity));
  l.confirmed = parts.some((p) => p.confirmed);
  for (const k of ["share", "teams"]) l[k] = parts.flatMap((p) => p[k]);
  l.support = [...new Set(parts.flatMap((p) => p.support))];
  l.rated = Object.fromEntries(["demand", "gap", "fromAbove", "spare", "people"].map((k) => [k, sum(parts.map((p) => p.rated[k]))]));
  l.capacity = Object.fromEntries(["people", "gap", "fromAbove", "spare"].map((k) => [k, sum(parts.map((p) => p.capacity[k]))]));
  return classify(l, expected(l));
}

function combineDomains(items, quarters) {
  const domainOf = (item) => item.name.slice(DOMAIN_KEY.length);
  const history = quarters.map((quarter, qi) => {
    const hs = items.map((item) => item.history[qi]);
    const { rated, unrated } = hs[0];
    const expected = (l) => (rated ? (l.people / rated) * unrated : unrated);
    const levels = LEVELS.map((_, li) => combineLevel(hs.map((h) => h.levels[li]), expected));
    const total = round(sum(levels.map((l) => l.demand)));
    return {
      quarter,
      activityQuarter: hs[0].activityQuarter,
      rated,
      unrated,
      total,
      weightedLevel: total ? sum(levels.map((l) => l.level * l.demand)) / total : null,
      levels,
      notes: hs.flatMap((h, i) => h.notes.map((n) => ({ ...n, text: `${domainOf(items[i])}: ${n.text}` }))),
      sharing: hs.some((h) => h.sharing),
    };
  });
  return {
    name: DOMAIN,
    role: false,
    domains: items.map((item) => ({ ...item, name: domainOf(item) })),
    plan: items.flatMap((item) => item.plan),
    urgency: round(sum(items.map((item) => item.urgency))),
    current: history.at(-1),
    history,
    actions: items.flatMap((item) => item.actions.map((a) => ({ ...a, text: `${domainOf(item)}: ${a.text}` }))),
  };
}

// planned: per level, headcount the discipline head adds (positive) or takes away (negative).
function summariseQuarter({ demandRows, planned = {}, ratings, ratingsOf, isFresh, activityRows, rated, unrated }) {
  const fromProjects = demandByLevel(demandRows);
  const byLevel = Object.fromEntries(LEVELS.map((l) => [l, round(Math.max(0, fromProjects[l] + (planned[l] ?? 0)))]));
  const total = round(sum(Object.values(byLevel)));
  const capacity = assessedCoverage(byLevel, ratings);
  const teams = readTeams(demandRows, ratingsOf, isFresh);
  const notes = [
    ...[...Map.groupBy(teams.notes, (n) => n.kind)].map(([kind, ns]) => ({ level: null, text: NOTE[kind](ns.length), teams: ns.map((n) => n.team) })),
    ...teams.levelNotes,
  ];
  const levels = LEVELS.map((level) => {
    const l = {
      level,
      demand: byLevel[level],
      projectDemand: fromProjects[level],
      planned: planned[level] ?? 0,
      // Support teams in scope expect to draw on here: platform, legal (legal and IT security) or cop (community of practice).
      support: [...new Set(atLevel(demandRows, level).map((r) => r.support).filter(Boolean))],
      gap: teams.gap[level],
      unlocated: teams.unlocated[level],
      overqualified: teams.overqualified[level],
      share: teams.share[level],
      confirmed: teams.confirmed[level],
      reportedGap: teams.reportedGap[level],
      rated: teams.rated[level],
      teams: teams.teamsAt[level],
      severity: teams.severity[level],
      urgency: teams.urgency[level],
      activity: activityRows ? round(sum(atLevel(activityRows, level).map((r) => Number(r.person_days))) / BOOKABLE_DAYS_PER_QUARTER) : null,
      people: capacity[level].people,
      spare: capacity[level].spare,
    };
    const expected = rated ? (l.people / rated) * unrated : unrated;
    l.capacity = capacity[level];
    classify(l, expected);
    const covered = round(l.demand - l.gap - l.unlocated);
    if (l.activity !== null && covered > 0 && l.activity < covered / 2) {
      notes.push({ level, text: `${covered} people's worth of work is reported covered, but only ${l.activity} was recorded last quarter.` });
    }
    return l;
  });
  return {
    total,
    // Horizontal position: the mean working method, weighted by people needed.
    weightedLevel: total ? sum(LEVELS.map((l) => l * byLevel[l])) / total : null,
    levels,
    notes,
    sharing: demandRows.some((r) => r.coverage === "over"),
  };
}

// data: { demand, assessments, activity, staffing, plan }.
//   staffing  one row per engineer and quarter: person, project, team, and optionally level, role, people_lead
//   plan      the discipline head's survey: strategic adjustments, tech lead targets, people leadership ratios
// inScope(team) restricts everything except rotation donors. The discipline-wide parts of the plan (strategic
// adjustments and people leadership) belong to no team and only show without a filter.
export function buildModel({ demand: answers, assessments, activity: logged, staffing, plan = [] }, inScope = () => true) {
  const translated = answers.map((r) => ({ ...keyedByDomain(r), level: METHODS[r.method], quantity: PEOPLE[r.people] }));
  const activity = logged.map((r) => ({ ...keyedByDomain(r), level: METHODS[r.method] }));
  assessments = assessments.map(keyedByDomain);
  const quarters = [...new Set(answers.map((r) => r.quarter))].sort();
  const current = quarters.at(-1);
  const scoped = (rows) => rows.filter((r) => inScope(r.team));
  // Staffing for a quarter: its own rows, or the most recent earlier staffing if none were recorded.
  const staffedQuarters = [...new Set(staffing.map((r) => r.quarter))].sort();
  const rosterAt = (q) => {
    const at = staffedQuarters.filter((s) => s <= q).at(-1) ?? staffedQuarters[0];
    return staffing.filter((r) => r.quarter === at);
  };
  const roster = rosterAt(current);
  const unfiltered = !roster.some((r) => !inScope(r.team));
  const planOf = (q, kind) => plan.filter((r) => r.quarter === q && r.kind === kind);

  // Tech leadership: one per project team, needed at the working method the discipline head sets for the team,
  // or by default conceptual for teams of up to four and strategic for larger ones. Covered when the staffing
  // shows a tech lead on the team. Only derived when the staffing export carries roles.
  const techLeads = !staffing.some((r) => r.role) ? [] : quarters.flatMap((q) => {
    const staffed = rosterAt(q);
    const targets = new Map(planOf(q, "tech-lead").map((r) => [r.subject, r.method]));
    return [...new Set(translated.filter((r) => r.quarter === q).map((r) => r.team))].map((team) => {
      const members = staffed.filter((r) => r.team === team);
      const method = targets.get(team) ?? (members.length <= 4 ? "conceptual" : "strategic");
      const led = members.some((r) => r.role === "tech-lead");
      return { quarter: q, team, expertise: TECH_LEAD, method, people: "1", level: METHODS[method], quantity: 1, coverage: led ? "adequate" : "under" };
    });
  });
  const demand = [...translated, ...techLeads];
  const headcount = scoped(roster).length;
  const of = (rows, q, e) => rows.filter((r) => r.quarter === q && r.expertise === e);
  const activityQuarters = [...new Set(activity.map((r) => r.quarter))].sort();

  const byQuarter = new Map(quarters.map((q, i) => {
    const staffed = rosterAt(q);
    const teamOf = new Map(staffed.map((r) => [r.person, r.team]));
    const teamSize = Map.groupBy(staffed, (r) => r.team);
    const supply = supplyAsOf(assessments, q, (person) => teamOf.get(person));
    const freshFrom = quarters[Math.max(0, i - FRESH_QUARTERS + 1)];
    const freshPeople = [...supply.respondents.values()].filter((p) => p.asOf >= freshFrom);
    const freshIn = Map.groupBy(freshPeople, (p) => p.team);
    const isFresh = (team) => (freshIn.get(team)?.length ?? 0) >= FRESH_SHARE * (teamSize.get(team)?.length ?? Infinity);
    const rated = freshPeople.filter((p) => inScope(p.team)).length;
    const inScopeNow = staffed.filter((r) => inScope(r.team)).length;
    return [q, { supply, isFresh, rated, headcount: inScopeNow, activityQuarter: activityQuarters.filter((a) => a < q).at(-1) ?? null }];
  }));

  // Rotation donors outside the scope: teams marking that working method "over" in this expertise, then teams
  // without project demand, such as the bench, whose up-to-date ratings show someone at the working method.
  const donorsFor = (name) => {
    const { supply, isFresh } = byQuarter.get(current);
    // With no filter everything is in scope, so any team can lend to the rest of the organisation.
    const lender = roster.some((r) => !inScope(r.team)) ? (team) => !inScope(team) : () => true;
    const answersNow = of(demand, current, name).filter((r) => lender(r.team));
    const over = (level) => [...new Set(answersNow.filter((r) => r.coverage === "over" && r.level === level).map((r) => r.team))];
    const demanding = new Set(demand.filter((r) => r.quarter === current).map((r) => r.team));
    const idle = supply.levels.filter((s) => s.expertise === name && lender(s.team) && !demanding.has(s.team) && isFresh(s.team));
    return (level) => [...over(level), ...new Set(idle.filter((s) => s.level === level).map((s) => s.team))];
  };

  // Strategic adjustments from the discipline head, per expertise and level; only without a filter.
  const plannedFor = (q, name) => {
    const planned = {};
    if (unfiltered) for (const r of planOf(q, "adjust").filter((r) => r.subject === name)) planned[METHODS[r.method]] = (planned[METHODS[r.method]] ?? 0) + Number(r.value);
    return planned;
  };
  // People leadership: reports at each level divided by the discipline head's ratio, at the working method set
  // for their leads. Supply is the people leads in the staffing, by level. Discipline-wide, so only without a filter.
  const peopleLeadership = (q) => {
    const staffed = rosterAt(q);
    const planned = {};
    for (const r of planOf(q, "people-lead")) {
      const reports = staffed.filter((p) => Number(p.level) === Number(r.subject)).length;
      planned[METHODS[r.method]] = (planned[METHODS[r.method]] ?? 0) + Math.ceil((reports / Number(r.value)) * 4) / 4;
    }
    const leads = new Set(staffed.map((p) => p.people_lead).filter(Boolean));
    const levels = staffed.filter((p) => leads.has(p.person)).map((p) => Math.min(6, Math.max(3, Number(p.level))));
    return { planned, levels };
  };
  const names = new Set(scoped(demand).map((r) => r.expertise));
  if (unfiltered) {
    for (const r of plan.filter((r) => r.kind === "adjust" && Number(r.value) > 0)) names.add(r.subject);
    if (plan.some((r) => r.kind === "people-lead")) names.add(PEOPLE_LEAD);
  }
  const expertise = [...names].sort().map((name) => {
    const history = quarters.map((q) => {
      const { supply, isFresh, rated, headcount: staffedThen, activityQuarter } = byQuarter.get(q);
      const ratings = supply.levels.filter((s) => s.expertise === name);
      const leadership = name === PEOPLE_LEAD ? peopleLeadership(q) : null;
      return {
        quarter: q,
        activityQuarter,
        rated,
        unrated: Math.max(0, staffedThen - rated),
        ...summariseQuarter({
          demandRows: scoped(of(demand, q, name)),
          planned: leadership?.planned ?? plannedFor(q, name),
          ratings: leadership?.levels ?? scoped(ratings).map((s) => s.level),
          ratingsOf: (team) => ratings.filter((s) => s.team === team).map((s) => s.level),
          isFresh,
          activityRows: activityQuarter ? scoped(of(activity, activityQuarter, name)) : null,
          rated,
          unrated: Math.max(0, staffedThen - rated),
        }),
      };
    });
    const now = history.at(-1);
    return {
      name,
      // The discipline head's adjustments this quarter, for the drill-down.
      plan: unfiltered ? planOf(current, "adjust").filter((r) => r.subject === name) : [],
      // Roles with their own responsibilities, charted alongside expertise but not one: drawn with a dashed outline.
      role: name === TECH_LEAD || name === PEOPLE_LEAD,
      urgency: round(sum(now.levels.map((l) => l.urgency))),
      current: now,
      history,
      actions: recommend(now, history.at(-2), donorsFor(name)),
    };
  });

  // All domains of domain expertise become one charted item.
  const domainItems = expertise.filter((e) => e.name.startsWith(DOMAIN_KEY));
  if (domainItems.length) expertise.splice(0, expertise.length, ...expertise.filter((e) => !domainItems.includes(e)), combineDomains(domainItems, quarters));

  // Most urgent first; alphabetical among equals.
  expertise.sort((a, b) => b.urgency - a.urgency);

  // Who moved into or out of the scope since the previous quarter.
  const previous = quarters.at(-2);
  const members = (q) => new Set(rosterAt(q).filter((r) => inScope(r.team)).map((r) => r.person));
  const now = members(current), before = previous ? members(previous) : now;
  const movement = { since: previous ?? null, joined: [...now].filter((p) => !before.has(p)).length, left: [...before].filter((p) => !now.has(p)).length };

  // Every rated person in scope this quarter, as working method per charted expertise: for drawing one profile per
  // person. Anonymous: no IDs or teams leave the model. Domains collapse into domain expertise (strongest domain).
  const profiles = [...Map.groupBy(byQuarter.get(current).supply.levels.filter((s) => inScope(s.team)), (s) => s.respondent).values()].map((rows) => {
    const levels = new Map();
    for (const { expertise: name, level } of rows) {
      const keys = name.startsWith(DOMAIN_KEY) ? [DOMAIN, name.slice(DOMAIN_KEY.length)] : [name];
      for (const key of keys) if (level >= 3) levels.set(key, Math.max(levels.get(key) ?? 0, Math.min(6, level)));
    }
    return levels;
  });

  return { quarters, expertise, rated: byQuarter.get(current).rated, headcount, movement, profiles };
}

// The resourcing "B's" that can be derived from data. Bot (automation) needs human judgement and is left out.
export function recommend(current, previous, donorsAt) {
  const actions = [];
  for (const l of current.levels) {
    const donors = donorsAt(l.level);
    const below = l.level > 3 ? current.levels[l.level - 4].spare : 0; // unused rated engineers one step down
    const method = METHOD_NAME[l.level].toLowerCase(), junior = METHOD_NAME[l.level - 1]?.toLowerCase();
    const gap = round(l.gap + l.unlocated);
    const hasGap = l.gap + l.unlocated > 0 && ["short", "strained", "fragile"].includes(l.status);
    if (hasGap) {
      if (donors.length) actions.push({ action: "Borrow", level: l.level, text: `Rotate in ${method} capacity from a team with more than it needs.`, teams: donors });
      if (junior && below >= Math.ceil(gap)) actions.push({ action: "Build", level: l.level, text: `Grow ${junior} engineers into the gap of ${gap} people.` });
      // Hiring is slow and costly: only for a confirmed critical gap that persists, and grows or has no internal route.
      const before = previous?.levels[l.level - 3];
      const persistent = before && before.gap + before.unlocated > 0;
      const growing = previous && current.total > previous.total;
      if (l.status === "short" && !l.provisional && persistent && (growing || (below < Math.ceil(gap) && !donors.length))) {
        actions.push({ action: "Buy", level: l.level, text: `Hire: a gap of ${gap} people for two quarters running.` });
      }
    }
    // Demand no project answers for (plan, people leadership) that ratings can't cover.
    if (l.project === null && ["short", "strained"].includes(l.status)) {
      const open = round(l.capacityGap);
      if (junior && below >= Math.ceil(open)) actions.push({ action: "Build", level: l.level, text: `Grow ${junior} engineers into ${open} planned ${method} people.` });
      else actions.push({ action: "Buy", level: l.level, text: `Hire or partner: ${open} planned ${method} people nobody can cover today.` });
    }
    if (l.status === "overqualified" && l.overqualified > 0) {
      const text = `${l.overqualified} people's worth of ${method} work is done by more senior engineers.`;
      if (donors.length) actions.push({ action: "Borrow", level: l.level, text: `${text} Rotate in ${method} engineers to free them.`, teams: donors });
      else if (junior) actions.push({ action: "Build", level: l.level, text: `${text} Grow ${junior} engineers into it to free them.` });
    }
    if (l.status === "fragile" && !hasGap && !l.provisional) actions.push({ action: "Bind", level: l.level, text: `${METHOD_NAME[l.level]} work relies on one person. Retain and pair a successor.` });
  }
  const top = current.levels.findLast((l) => l.demand > 0);
  const falling = previous && current.total < previous.total * 0.9;
  if (top && falling && (current.sharing || top.status === "surplus")) {
    actions.push({ action: "Bounce", level: top.level, text: "Demand is falling and teams report people to share. Redeploy or reskill into scarcer expertise." });
  }
  // Most urgent first: gap weighted by how badly the teams say it hurts.
  return actions.sort((a, b) => current.levels[b.level - 3].urgency - current.levels[a.level - 3].urgency);
}

// One person's own scored ratings as of a quarter, for their individual view.
export function personalRatings(assessments, person, quarter) {
  const own = assessments.filter((r) => r.respondent === person).map(keyedByDomain);
  return supplyAsOf(own, quarter, () => "own").levels.map(({ expertise, score, level, self }) => ({ expertise, score, level, self }));
}

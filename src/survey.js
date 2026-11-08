// The project survey as a working page. The team first picks the areas of expertise it needs from a word cloud
// (sized by a best guess from its history, searchable, open to new areas). The questions are per bucket: picking
// an area activates its bucket's grid. A new area is matched to a bucket by name, and the lead confirms which.
// On submit it shows the rows the answers would add to the demand tab; live, it saves them.
import { toCsv } from "./csv.js";
import { load, currentMode, DATA_TABS, SHEET_LABEL } from "./source.js";
import { whoAmI, appendRows, withSheet } from "./google.js";
import { DEMAND_HEADER } from "./sheets.js";
import { teamsOf, projectsByTeam } from "./teams.js";
import { relevance, matches } from "./cloud.js";
import { AREAS, COP, SUPPORT_KEY } from "./areas.js";
import { effectiveBuckets, suggestBuckets, demandAreas, surveySections, inBuckets } from "./buckets.js";
import { METHODS as METHOD_LEVEL, PEOPLE as PEOPLE_COUNT, LEVELS, supplyAsOf, assessedCoverage, WORKING_DAYS_PER_QUARTER, UTILISATION, BOOKABLE_DAYS_PER_QUARTER } from "./model.js";

const QUARTER = "2027-Q1";
const METHODS = ["Operative", "Conceptual", "Strategic", "Comprehensive"];
const PEOPLE = [["", "Not needed"], ["1", "1 person"], ["2", "2 people"], ["3", "3 people"], ["5", "5 people"]];
// Coverage per row: is this working method covered on the team today?
const COVERAGE = [["critical", "Critical"], ["under", "Under"], ["adequate", "Adequate"], ["over", "Over"]];
// The domain section is prefilled from the project's domain, kept by the discipline head.
const DOMAIN_EXAMPLES = {
  Legislation: ["Implement rules from legal texts correctly", "Model legal processes and their edge cases", "Own how the product interprets and tracks legal change", "Shape how legislation is made digital-ready across government"],
};
const GENERIC_DOMAIN = ["Implement the domain's rules correctly", "Model the domain's processes and edge cases", "Own how the product follows changes in the domain", "Shape how the domain is made digital-ready across government"];
// Areas a team adds itself have no tailored examples.
const GENERIC_CUSTOM = ["Do the work to the team's conventions", "Plan and design the approach for the team", "Set the direction and standards for it across teams", "Shape it across government"];

const $ = (tag, attrs = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  node.append(...children);
  return node;
};
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");

// previous: method -> { people, coverage, support } from last quarter's answers.
// hint: method -> people value suggested from recorded work. Both optional.
// Marked cells get a tiny label (last quarter, e.g. "Q4, 2026", or "Suggested") and a tooltip naming the source.
const quarterLabel = (q) => q.replace(/^(\d{4})-(Q\d)$/, "$2, $1");
function mark(cell, kind, on, tip, tag = "") {
  if (kind === "was") cell.dataset.last = tag;
  cell.classList.toggle(kind, on);
  if (on) cell.dataset[kind] = tip;
  else delete cell.dataset[kind];
  cell.title = [cell.dataset.was, cell.dataset.suggested].filter(Boolean).join("\n");
}
function areaSection({ id, name, expertise, domain = "", subject, support, examples, note, previous, hint }) {
  const section = $("section", { "data-area": name, "data-id": id, "data-expertise": expertise, "data-domain": domain, "data-support": support ?? "" });
  section.append($("h2", {}, name));
  if (note) section.append($("p", { class: "muted" }, note));
  section.append($("p", { class: "muted" }, "Examples. " + METHODS.map((m, i) => `${m}: ${examples[i].charAt(0).toLowerCase()}${examples[i].slice(1)}.`).join(" ")));

  const table = $("table");
  const head = $("tr", {}, $("th", {}, ""), ...PEOPLE.map(([, label]) => $("th", { class: "need" }, label)));
  head.append(...COVERAGE.map(([, label], i) => $("th", { class: i === 0 ? "cov coverage" : "cov" }, label)));
  if (support) head.append($("th", { class: "support" }, `Also from ${support}`));
  const groups = $("tr", { class: "groups" }, $("th", {}, ""),
    $("th", { colspan: PEOPLE.length, scope: "colgroup", class: "need" }, "People needed next quarter"),
    $("th", { colspan: COVERAGE.length, scope: "colgroup", class: "cov coverage" }, "Covered on your team today"));
  if (support) groups.append($("th", { class: "support" }, ""));
  table.append($("caption", { class: "muted", style: "text-align:left" }, `How many people on your team need to work this way in ${subject} next quarter, and how well is that covered today?`), groups, head);
  for (const method of METHODS) {
    const row = $("tr", {}, $("td", {}, method));
    PEOPLE.forEach(([value, label], i) => {
      const input = $("input", { type: "radio", name: `${id}-${slug(method)}`, value, "aria-label": `${method}: ${label}` });
      const was = previous?.[method] ? previous[method].people === value : false;
      input.checked = previous?.[method] ? was : i === 0;
      const cell = $("td", { class: "need" }, input);
      if (was) mark(cell, "was", true, `Your answer for ${quarterLabel(previous.quarter)}.`, quarterLabel(previous.quarter));
      if (hint?.[method] === value) mark(cell, "suggested", true, `Suggested from time bookings in ${hint.quarter}. A rough guide only.`);
      row.append(cell);
    });
    COVERAGE.forEach(([value, label], i) => {
      const input = $("input", { type: "radio", name: `${id}-${slug(method)}-coverage`, value, "aria-label": `${method}: ${label.toLowerCase()} covered` });
      const was = previous?.[method]?.coverage === value;
      input.checked = was;
      const cell = $("td", { class: i === 0 ? "cov coverage" : "cov" }, input);
      if (was) mark(cell, "was", true, `Your answer for ${quarterLabel(previous.quarter)}.`, quarterLabel(previous.quarter));
      row.append(cell);
    });
    if (support) {
      const input = $("input", { type: "checkbox", name: `${id}-${slug(method)}-support`, "aria-label": `${method}: also from ${support}` });
      input.checked = Boolean(previous?.[method]?.support);
      const cell = $("td", { class: "support" }, input);
      if (input.checked) mark(cell, "was", true, `Your answer for ${quarterLabel(previous.quarter)}.`, quarterLabel(previous.quarter));
      row.append(cell);
    }
    table.append(row);
  }
  section.append(table, nuance(id, subject));
  if (hint) {
    const how = $("ul");
    section.append($("details", { class: "how" }, $("summary", {}, "How are suggestions calculated?"), how));
    const update = () => coverageHint(section, id, hint, how);
    section.addEventListener("change", update);
    update();
  }

  return section;
}

// Free text under each grid: what exactly within the area, and anything the grid can't say.
function nuance(id, subject) {
  const field = (name, label, control) => $("label", { class: "nuance" }, $("span", {}, label), control);
  return $("div", { class: "nuance" },
    field("specifics", `What specifically within ${subject}?`,
      $("input", { type: "text", name: `${id}-specifics`, placeholder: "e.g. tools, frameworks, standards, sub-areas" })),
    field("comment", "Comment",
      $("textarea", { name: `${id}-comment`, rows: "2", placeholder: "Nuance the grid can't capture: timing, uncertainty, who you expect to join or leave" })));
}

// Coverage suggestion per needed working method, from the team's ratings combined with recorded work.
// Recomputed whenever the team changes how many people it needs. Never suggests critical: only the team knows.
function coverageHint(section, id, hint, how) {
  const need = Object.fromEntries(LEVELS.map((l) => [l, 0]));
  for (const m of METHODS) need[METHOD_LEVEL[m.toLowerCase()]] = PEOPLE_COUNT[section.querySelector(`[name="${id}-${slug(m)}"]:checked`)?.value] ?? 0;
  const cover = assessedCoverage(need, hint.rated);
  const lines = [];
  for (const m of METHODS) {
    const level = METHOD_LEVEL[m.toLowerCase()];
    const n = need[level];
    const rated = hint.rated.filter((l) => l >= level).length;
    const work = hint.work[m] ?? 0;
    let value = null;
    if (n && !rated && work >= 0.5) {
      // No ratings, but work was done: unrated people are likely doing it, so recorded work stands in for supply.
      const gap = n - work;
      value = gap >= 0.5 || gap >= n / 4 ? "under" : "adequate";
    } else if (n && rated) {
      const { gap, spare } = cover[level];
      if (gap >= 0.5 || gap >= n / 4) value = "under";
      else if (spare > 0 || work < n / 2) value = "over";
      else value = "adequate";
    }
    for (const input of section.querySelectorAll(`[name="${id}-${slug(m)}-coverage"]`)) {
      mark(input.parentElement, "suggested", input.value === value, `Suggested from your team's expertise ratings and time bookings in ${hint.quarter}. A rough guide only.`);
    }
    if (value) lines.push([$("strong", {}, m), `: you need ${n}, ${rated} rated at this level or above, about ${round1(work)} booked, so `, $("strong", {}, value), "."]);
  }
  how.replaceChildren(...explain(hint, lines));
}

const round1 = (x) => Math.round(x * 10) / 10;
const METHOD_OF_LEVEL = Object.fromEntries(Object.entries(METHOD_LEVEL).map(([m, l]) => [l, m]));
const b = (text) => $("strong", {}, text);
// A bullet with a lead sentence and, when there is data, a nested list of it.
const bullet = (lead, items, empty) => $("li", {}, ...lead, items.length ? $("ul", {}, ...items.map((i) => $("li", {}, ...i))) : ` ${empty}`);
// The real numbers behind this area's suggestions, in four bullets.
function explain(hint, coverageLines) {
  const worked = METHODS.filter((m) => hint.work[m]).map((m) => [
    b(m), `: ${Math.round(hint.work[m] * BOOKABLE_DAYS_PER_QUARTER)} days, about ${round1(hint.work[m])} people, `,
    hint[m] ? ["so ", b(PEOPLE.find(([v]) => v === hint[m])[1].toLowerCase())] : "too little to suggest",
  ].flat());
  const counts = {};
  for (const l of hint.rated) {
    const name = cap(METHOD_OF_LEVEL[l] ?? "below operative");
    counts[name] = (counts[name] ?? 0) + 1;
  }
  const rated = Object.entries(counts).map(([name, n]) => [b(name), `: ${n} ${n === 1 ? "person" : "people"}`]);
  return [
    bullet([b("People"), ` come from time booked in ${quarterLabel(hint.quarter)}, divided by ${BOOKABLE_DAYS_PER_QUARTER} bookable days per person (${WORKING_DAYS_PER_QUARTER} working days at ${UTILISATION * 100}% utilisation) and rounded to the nearest option.`], worked, "Your team booked no time here."),
    bullet([b("Ratings"), " are your team's latest self, peer and lead ratings, weighted towards the lead."], rated, "Nobody on your team is rated here."),
    bullet([b("Coverage"), " compares the people you need with people rated at that level or above. Where nobody is rated, ", b("booked time stands in"), "."], coverageLines, "Choose how many people you need to see a suggestion."),
    $("li", {}, b("Critical"), " is never suggested. Only your team knows whether a gap blocks delivery, or who is joining, leaving or busy elsewhere."),
  ];
}

// One row per working method that is needed or draws on support, in the Project Demand tab's shape.
// Only the areas the team picked have sections, so nothing else can produce rows.
function rowsFor(form, team) {
  const rows = [];
  // "Anything we should know?" is about the whole submission, so every row carries it.
  const notes = form.elements.notes.value.trim();
  for (const section of document.querySelectorAll("#areas [data-area]")) {
    // expertise: the bucket (or the domain expertise); picked: the areas the team picked in it.
    const { id, expertise, domain, picked: areasPicked = "" } = section.dataset;
    const specifics = form.elements[`${id}-specifics`].value.trim();
    const comment = form.elements[`${id}-comment`].value.trim();
    for (const method of METHODS) {
      const people = form.elements[`${id}-${slug(method)}`].value;
      const support = form.elements[`${id}-${slug(method)}-support`]?.checked ?? false;
      if (!people && !support) continue;
      rows.push({
        quarter: QUARTER,
        team,
        expertise,
        domain,
        method: method.toLowerCase(),
        people,
        coverage: form.elements[`${id}-${slug(method)}-coverage`]?.value ?? "",
        // Which support the team also draws on: platform, legal (legal and IT security) or cop (community of practice).
        support: support ? SUPPORT_KEY[section.dataset.support] ?? "" : "",
        specifics,
        comment,
        notes,
        areas: areasPicked,
      });
    }
  }
  return rows;
}

// Missing datasets come back empty: the survey still works, just without suggestions or a team list.
// Live reads the teams tab instead of staffing: staffing sits in the discipline sheet, which project leads
// can't open. The teams tab says who may answer for which team.
const BUCKET_TABS = ["buckets", "bucket-history"];
const LIVE_TABS = [...DATA_TABS.filter((n) => n !== "staffing"), "teams", ...BUCKET_TABS];
const session = await load((await currentMode()) === "live" ? LIVE_TABS : [...DATA_TABS, ...BUCKET_TABS]);
const sets = session.data;
const [staffing, plan, demand, activity, assessments] = ["staffing", "discipline-plan", "project-demand", "historical-activity", "expertise-assessments"].map((n) => sets[n] ?? []);
// The buckets in force (the default ten until a grouping is applied) and which bucket each area is in.
const bucketRows = effectiveBuckets(sets.buckets ?? []);
const bucketOfArea = new Map(bucketRows.map((r) => [r.area, r.bucket]));
const bucketNames = [...new Set(bucketRows.map((r) => r.bucket))];
// Earlier answers, activity and ratings per bucket, whatever they were recorded under.
const byBucket = inBuckets({ demand, activity, assessments }, bucketRows, sets["bucket-history"] ?? []);
// Prototype: the latest answered quarter stands in for "last time", the latest recorded quarter for "the last three months".
const lastAnswered = demand.map((r) => r.quarter).sort().at(-1);
const lastRecorded = activity.map((r) => r.quarter).sort().at(-1);
const cap = (m) => m.charAt(0).toUpperCase() + m.slice(1);
// Keys: "domain" for domain expertise, otherwise the slug of an area or bucket name.
const areaKey = (r) => (r.expertise === "Domain expertise" ? "domain" : slug(r.expertise));
function previousFor(team, key) {
  const rows = byBucket.demand.filter((r) => r.quarter === lastAnswered && r.team === team && areaKey(r) === key);
  return { quarter: lastAnswered, ...Object.fromEntries(rows.map((r) => [cap(r.method), r])) };
}
// Recorded person-days to the nearest people option. Under half a person counts as nothing.
function hintFor(team, key) {
  const hint = { quarter: lastRecorded };
  const days = {};
  for (const r of byBucket.activity.filter((r) => r.quarter === lastRecorded && r.team === team && areaKey(r) === key)) {
    days[r.method] = (days[r.method] ?? 0) + Number(r.person_days);
  }
  hint.work = {};
  hint.rated = ratings.levels.filter((s) => s.team === team && s.key === key).map((s) => s.level);
  for (const [method, d] of Object.entries(days)) {
    const fte = d / BOOKABLE_DAYS_PER_QUARTER;
    hint.work[cap(method)] = fte;
    if (fte < 0.5) continue;
    hint[cap(method)] = String([1, 2, 3, 5].reduce((a, b) => (Math.abs(b - fte) < Math.abs(a - fte) ? b : a)));
  }
  return hint;
}
const latest = staffing.map((r) => r.quarter).sort().at(-1);
// Live: only the teams the signed-in person is listed for, with their roles. Otherwise every staffed team.
// The teams list holds emails, so it exists only in the projects sheet, for live mode.
const live = session.mode === "live";
// Why the email couldn't be read, if it couldn't: shown to the person instead of a guess.
let whoError = "";
const me = live ? await whoAmI(session.token).catch((err) => ((whoError = err.message), "")) : "";
const myTeams = teamsOf(sets.teams ?? [], me);
const teams = live ? myTeams.map((t) => t.team) : [...new Set(staffing.filter((r) => r.quarter === latest).map((r) => r.team))].sort();
// Ratings as known now, placed in the team each person is staffed on. Only counts reach the page, never names.
const teamNow = new Map(staffing.filter((r) => r.quarter === latest).map((r) => [r.person, r.team]));
// Two views: per area for sizing the word cloud, per bucket for the grids' suggestions.
const ratingsOf = (rows) => {
  const r = supplyAsOf(rows.map((x) => ({ ...x, expertise: x.domain ? `${x.expertise}: ${x.domain}` : x.expertise })), "9999", (p) => teamNow.get(p));
  for (const s of r.levels) s.key = s.expertise.startsWith("Domain expertise") ? "domain" : slug(s.expertise);
  return r;
};
const ratings = ratingsOf(byBucket.assessments);
const areaRatings = ratingsOf(assessments);
const domainOf = new Map(plan.filter((r) => r.kind === "domain").map((r) => [r.subject, r.value]));
const projectOf = new Map([...staffing.map((r) => [r.team, r.project]), ...projectsByTeam(sets.teams ?? [])]);

const select = document.getElementById("team");
for (const team of teams) {
  const roles = myTeams.find((t) => t.team === team)?.roles ?? [];
  select.append($("option", { value: team }, roles.length ? `${team} (${roles.join(", ")})` : team));
}
// Live: someone on one team gets it filled in. Someone on none is told why they can't answer.
if (myTeams.length === 1 && teams.includes(myTeams[0].team)) select.value = myTeams[0].team;
if (live && !teams.length) {
  document.getElementById("team-note").textContent = me
    ? `${me} isn't listed for any team. Ask the discipline head to add you to the teams list.`
    : `Couldn't tell who is signed in, so no teams can be shown. Google said: ${whoError}`;
  // The form's const is declared further down, so reach the button directly.
  document.querySelector("#survey button[type=submit]").disabled = true;
}

const areas = document.getElementById("areas");
const form = document.getElementById("survey");
const demoState = document.getElementById("demo-state");
const search = document.getElementById("area-search");
const cloud = document.getElementById("cloud");
const addButton = document.getElementById("add-area");

// Step 1 state: the areas on offer, the ones picked (in picking order) and their built sections, kept so
// answers survive unpicking and re-picking. Reset whenever the team or demo state changes.
let catalogue = [];
let picked = [];
const built = new Map();

// The cloud offers areas: the suggested ones, every area in a bucket, every area a team has added before, and the
// project's domain. Each knows its bucket; a write-in another team placed keeps the bucket that team chose.
function catalogueFor(team) {
  const domain = domainOf.get(projectOf.get(team));
  const list = AREAS.map(([name, support, examples]) => ({ id: slug(name), name, bucket: bucketOfArea.get(name) ?? null, support, examples }));
  if (domain) list.push({
    id: "domain", name: `Domain expertise: ${domain}`, domain, examples: DOMAIN_EXAMPLES[domain] ?? GENERIC_DOMAIN,
    note: "From your project's domain. If your team also works in another domain, add it.",
  });
  const known = new Set(list.map((a) => a.name));
  const placed = new Map(demand.flatMap((r) => demandAreas(r).map((a) => [a, bucketNames.includes(r.expertise) ? r.expertise : null])));
  for (const name of [...bucketOfArea.keys(), ...placed.keys()]) {
    if (!known.has(name)) list.push(customArea(name, bucketOfArea.get(name) ?? placed.get(name) ?? null));
    known.add(name);
  }
  return list;
}
const customArea = (name, bucket) => ({ id: `x-${slug(name)}`, name, bucket, support: COP, examples: GENERIC_CUSTOM, custom: true });

// The best guess at what this team needs, from its last answers, booked work and ratings, then discipline-wide demand.
// Per area: a row per bucket counts for each area it names.
function weightsFor(team, historical) {
  const add = (acc, key, v) => ((acc[key] = (acc[key] ?? 0) + v), acc);
  const tally = (rows, value) => rows.reduce((acc, r) => (r.expertise === "Domain expertise" ? add(acc, "domain", value(r)) : demandAreas(r).reduce((a, name) => add(a, slug(name), value(r)), acc)), {});
  const last = demand.filter((r) => r.quarter === lastAnswered);
  const mine = (rows) => rows.filter((r) => r.team === team);
  const signals = {
    org: tally(last, (r) => PEOPLE_COUNT[r.people] ?? 0),
    team: team ? {
      demand: historical ? tally(mine(last), (r) => PEOPLE_COUNT[r.people] ?? 0) : {},
      days: tally(mine(activity.filter((r) => r.quarter === lastRecorded)), (r) => Number(r.person_days)),
      rated: tally(areaRatings.levels.filter((s) => s.team === team), () => 1),
    } : {},
  };
  return relevance(catalogue.map(weightKey), signals);
}
// Areas are keyed by the slug of their name, like the areas in survey rows.
const weightKey = (a) => (a.id === "domain" ? "domain" : a.id.replace(/^x-/, ""));

function renderCloud() {
  const query = search.value;
  const weights = renderCloud.weights ?? {};
  const shown = catalogue.filter((a) => matches(a.name, query));
  cloud.replaceChildren(...shown.map((a) => {
    const w = weights[weightKey(a)] ?? 0;
    const on = picked.includes(a.id);
    const button = $("button", { type: "button", "aria-pressed": String(on), style: `font-size:${(0.85 + w * 1.15).toFixed(2)}rem`, title: a.custom ? "Added by a team" : "" }, a.name);
    button.addEventListener("click", () => toggle(a.id));
    return button;
  }));
  if (!shown.length) cloud.append($("p", { class: "muted" }, "No area matches. Add it as a new one."));
  const exact = catalogue.some((a) => a.name.toLowerCase() === query.trim().toLowerCase());
  addButton.hidden = !query.trim() || exact;
  addButton.textContent = `+ Add “${query.trim()}” as a new area`;
}

function toggle(id) {
  picked = picked.includes(id) ? picked.filter((p) => p !== id) : [...picked, id];
  renderCloud();
  renderPicked();
}

// A new area: an existing one of that name is simply picked. Otherwise the lead says which bucket it belongs to,
// starting from the buckets whose names or areas share words with it. "None of these" keeps it in a section of its
// own until a discipline head regroups.
const chooser = document.createElement("div");
chooser.className = "write-in";
chooser.hidden = true;
addButton.after(chooser);
function addCustom() {
  const name = search.value.trim();
  if (!name) return;
  const existing = catalogue.find((a) => a.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    if (!picked.includes(existing.id)) picked.push(existing.id);
    search.value = "";
    chooser.hidden = true;
    renderCloud();
    return renderPicked();
  }
  const suggested = suggestBuckets(name, bucketRows).slice(0, 3);
  const place = (bucket) => {
    const area = customArea(name, bucket);
    catalogue.push(area);
    picked.push(area.id);
    search.value = "";
    chooser.hidden = true;
    renderCloud();
    renderPicked();
  };
  const choice = (label, bucket, cls = "") => {
    const button = $("button", { type: "button", class: cls }, label);
    button.addEventListener("click", () => place(bucket));
    return button;
  };
  const others = $("select", { "aria-label": "Another bucket" }, $("option", { value: "" }, "Another bucket…"),
    ...bucketNames.filter((n) => !suggested.includes(n)).map((n) => $("option", { value: n }, n)));
  others.addEventListener("change", () => others.value && place(others.value));
  chooser.replaceChildren(
    $("p", {}, suggested.length ? `Which bucket does “${name}” belong to? Closest by name first.` : `No bucket's name matches “${name}”. Which does it belong to?`),
    $("div", { class: "choices" }, ...suggested.map((n) => choice(n, n)), others, choice("None of these", null, "secondary")),
  );
  chooser.hidden = false;
}

// Step 2: one grid per bucket with a picked area, in picking order, plus the domain's. A section is kept while its
// bucket stays active, so answers survive picking and unpicking areas within it.
function renderPicked() {
  const team = select.value;
  const historical = team && demoState.value === "historical";
  const chosen = picked.map((id) => catalogue.find((a) => a.id === id));
  const domain = chosen.find((a) => a.id === "domain");
  const sections = surveySections(chosen.filter((a) => a.id !== "domain").map((a) => ({ name: a.name, bucket: a.bucket })));
  const nodes = sections.map(({ bucket, areas: names, grouped }) => {
    const id = `b-${slug(bucket)}`;
    if (!built.has(id)) {
      // Examples and support come from the first picked area that has them.
      const lead = names.map((n) => catalogue.find((a) => a.name === n)).find((a) => !a.custom) ?? {};
      built.set(id, areaSection({
        id, name: bucket, expertise: bucket, subject: bucket, support: lead.support ?? COP, examples: lead.examples ?? GENERIC_CUSTOM,
        note: grouped ? "" : "Not in any bucket yet. Describe it below so the discipline can group it with similar ones.",
        previous: historical ? previousFor(team, slug(bucket)) : undefined,
        hint: historical && grouped ? hintFor(team, slug(bucket)) : undefined,
      }));
    }
    const section = built.get(id);
    section.dataset.picked = names.join("; ");
    section.querySelector(".covers")?.remove();
    section.querySelector("h2").after($("p", { class: "covers" }, `For what you picked: ${names.join(", ")}.`));
    return section;
  });
  if (domain) {
    if (!built.has("domain")) {
      built.set("domain", areaSection({
        ...domain, expertise: "Domain expertise", subject: `${domain.domain} domain knowledge`,
        previous: historical ? previousFor(team, "domain") : undefined, hint: historical ? hintFor(team, "domain") : undefined,
      }));
    }
    nodes.push(built.get("domain"));
  }
  areas.replaceChildren(...nodes);
  if (!nodes.length) areas.append($("section", { class: "muted" }, "Pick the areas your team needs above. Each bucket you pick an area in gets its own questions here."));
}

function reset() {
  const team = select.value;
  const historical = Boolean(team) && demoState.value === "historical";
  catalogue = catalogueFor(team);
  built.clear();
  renderCloud.weights = weightsFor(team, historical);
  // Areas the team answered last time start picked, so returning teams only review them.
  const before = demand.filter((r) => r.quarter === lastAnswered && r.team === team);
  const named = new Set(before.flatMap(demandAreas));
  picked = historical ? catalogue.filter((a) => named.has(a.name) || (a.id === "domain" && before.some((r) => r.expertise === "Domain expertise"))).map((a) => a.id) : [];
  search.value = "";
  chooser.hidden = true;
  renderCloud();
  renderPicked();
}
for (const el of [select, demoState]) el.addEventListener("change", reset);
search.addEventListener("input", renderCloud);
search.addEventListener("keydown", (ev) => {
  if (ev.key !== "Enter") return;
  ev.preventDefault();
  const shown = catalogue.filter((a) => matches(a.name, search.value));
  if (shown.length === 1 && search.value.trim()) {
    if (!picked.includes(shown[0].id)) toggle(shown[0].id);
    search.value = "";
    renderCloud();
  } else if (!shown.length) addCustom();
});
addButton.addEventListener("click", addCustom);
reset();

const resultNote = document.querySelector("#result p");
const submitButton = form.querySelector("button[type=submit]");

// Live: appends the answers to the projects sheet's demand tab, stamped with who and when.
// Re-submitting appends again; only the latest submission per team and quarter counts when read.
async function save(rows) {
  if (!myTeams.some((t) => t.team === select.value)) throw new Error("You aren't listed for this team.");
  const at = new Date().toISOString();
  const stamped = rows.map((r) => ({ ...r, submitted_by: me, submitted_at: at }));
  const { config, token } = session;
  await withSheet(config, token, config.sheets.projects, SHEET_LABEL.projects,
    () => appendRows(token, config.sheets.projects, "demand", DEMAND_HEADER, stamped));
}

form.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const rows = rowsFor(form, select.value);
  document.getElementById("rows").textContent = rows.length ? toCsv(rows) : "No areas answered.";
  document.getElementById("result").hidden = false;
  if (session.mode !== "live") return;
  if (!rows.length) return (resultNote.textContent = "Nothing to save: no areas answered.");
  submitButton.disabled = true;
  resultNote.textContent = "Saving…";
  try {
    await save(rows);
    resultNote.textContent = `Saved ${rows.length} rows for ${select.value}. Submitting again replaces them.`;
  } catch (err) {
    resultNote.textContent = `Not saved. ${err.message}`;
  } finally {
    submitButton.disabled = false;
  }
});

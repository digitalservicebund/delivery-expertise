// The project survey as a working page. The team first picks the areas of expertise it needs from a word cloud
// (sized by a best guess from its history, searchable, open to new areas). Only the picked areas get a grid.
// On submit it shows the rows the answers would add to the Project Demand tab. Nothing is sent anywhere.
import { toCsv } from "./csv.js";
import { load, DATA_TABS } from "./source.js";
import { relevance, matches } from "./cloud.js";
import { AREAS, COP, SUPPORT_KEY } from "./areas.js";
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
  for (const section of document.querySelectorAll("#areas [data-area]")) {
    const { id, expertise, domain } = section.dataset;
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
      });
    }
  }
  return rows;
}

// Missing datasets come back empty: the survey still works, just without suggestions or a team list.
const { data: sets } = await load(DATA_TABS);
const [staffing, plan, demand, activity, assessments] = ["staffing", "discipline-plan", "project-demand", "historical-activity", "expertise-assessments"].map((n) => sets[n] ?? []);
// Prototype: the latest answered quarter stands in for "last time", the latest recorded quarter for "the last three months".
const lastAnswered = demand.map((r) => r.quarter).sort().at(-1);
const lastRecorded = activity.map((r) => r.quarter).sort().at(-1);
const cap = (m) => m.charAt(0).toUpperCase() + m.slice(1);
const areaKey = (r) => (r.expertise === "Domain expertise" ? "domain" : slug(r.expertise));
function previousFor(team, key) {
  const rows = demand.filter((r) => r.quarter === lastAnswered && r.team === team && areaKey(r) === key);
  return { quarter: lastAnswered, ...Object.fromEntries(rows.map((r) => [cap(r.method), r])) };
}
// Recorded person-days to the nearest people option. Under half a person counts as nothing.
function hintFor(team, key) {
  const hint = { quarter: lastRecorded };
  const days = {};
  for (const r of activity.filter((r) => r.quarter === lastRecorded && r.team === team && areaKey(r) === key)) {
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
const teams = [...new Set(staffing.filter((r) => r.quarter === latest).map((r) => r.team))].sort();
// Ratings as known now, placed in the team each person is staffed on. Only counts reach the page, never names.
const teamNow = new Map(staffing.filter((r) => r.quarter === latest).map((r) => [r.person, r.team]));
const ratings = supplyAsOf(assessments.map((r) => ({ ...r, expertise: r.domain ? `${r.expertise}: ${r.domain}` : r.expertise })), "9999", (p) => teamNow.get(p));
for (const s of ratings.levels) s.key = s.expertise.startsWith("Domain expertise") ? "domain" : slug(s.expertise);
const domainOf = new Map(plan.filter((r) => r.kind === "domain").map((r) => [r.subject, r.value]));
const projectOf = new Map(staffing.map((r) => [r.team, r.project]));

const select = document.getElementById("team");
for (const team of teams) select.append($("option", { value: team }, team));

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

function catalogueFor(team) {
  const domain = domainOf.get(projectOf.get(team));
  const list = AREAS.map(([name, support, examples]) => ({ id: slug(name), name, expertise: name, subject: name, support, examples }));
  if (domain) list.push({
    id: "domain", name: `Domain expertise: ${domain}`, expertise: "Domain expertise", domain, subject: `${domain} domain knowledge`,
    examples: DOMAIN_EXAMPLES[domain] ?? GENERIC_DOMAIN, note: "From your project's domain. If your team also works in another domain, add it.",
  });
  // Areas other teams have added before are offered too.
  const known = new Set(list.map((a) => a.expertise));
  for (const name of new Set(demand.map((r) => r.expertise))) if (!known.has(name)) list.push(customArea(name));
  return list;
}
const customArea = (name) => ({ id: `x-${slug(name)}`, name, expertise: name, subject: name, support: COP, examples: GENERIC_CUSTOM, custom: true });

// The best guess at what this team needs, from its last answers, booked work and ratings, then discipline-wide demand.
function weightsFor(team, historical) {
  const tally = (rows, value) => rows.reduce((acc, r) => ((acc[areaKey(r)] = (acc[areaKey(r)] ?? 0) + value(r)), acc), {});
  const last = demand.filter((r) => r.quarter === lastAnswered);
  const mine = (rows) => rows.filter((r) => r.team === team);
  const signals = {
    org: tally(last, (r) => PEOPLE_COUNT[r.people] ?? 0),
    team: team ? {
      demand: historical ? tally(mine(last), (r) => PEOPLE_COUNT[r.people] ?? 0) : {},
      days: tally(mine(activity.filter((r) => r.quarter === lastRecorded)), (r) => Number(r.person_days)),
      rated: tally(ratings.levels.filter((s) => s.team === team), () => 1),
    } : {},
  };
  return relevance(catalogue.map(weightKey), signals);
}
// Areas added by teams are keyed like their survey rows: by the slug of their name.
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

function addCustom() {
  const name = search.value.trim();
  if (!name) return;
  const existing = catalogue.find((a) => a.name.toLowerCase() === name.toLowerCase());
  const area = existing ?? customArea(name);
  if (!existing) catalogue.push(area);
  if (!picked.includes(area.id)) picked.push(area.id);
  search.value = "";
  renderCloud();
  renderPicked();
}

// Step 2: one grid per picked area, in picking order.
function renderPicked() {
  const team = select.value;
  const historical = team && demoState.value === "historical";
  areas.replaceChildren(...picked.map((id) => {
    if (!built.has(id)) {
      const area = catalogue.find((a) => a.id === id);
      const key = weightKey(area);
      built.set(id, areaSection({
        ...area,
        note: area.custom ? "A new area. Describe it below so we can group it with similar ones." : area.note,
        previous: historical ? previousFor(team, key) : undefined,
        hint: historical && !area.custom ? hintFor(team, key) : undefined,
      }));
    }
    return built.get(id);
  }));
  if (!picked.length) areas.append($("section", { class: "muted" }, "Pick the areas your team needs above. Each one you pick gets its own questions here."));
}

function reset() {
  const team = select.value;
  const historical = Boolean(team) && demoState.value === "historical";
  catalogue = catalogueFor(team);
  built.clear();
  renderCloud.weights = weightsFor(team, historical);
  // Areas the team answered last time start picked, so returning teams only review them.
  picked = historical ? catalogue.filter((a) => demand.some((r) => r.quarter === lastAnswered && r.team === team && areaKey(r) === weightKey(a))).map((a) => a.id) : [];
  search.value = "";
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

form.addEventListener("submit", (ev) => {
  ev.preventDefault();
  const rows = rowsFor(form, select.value);
  document.getElementById("rows").textContent = rows.length ? toCsv(rows) : "No areas answered.";
  document.getElementById("result").hidden = false;
});

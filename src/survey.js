// The project survey as a working page. Builds one section per area of expertise, and on submit shows the
// rows the answers would add to the Project Demand tab. Nothing is sent anywhere.
import { parseCsv, toCsv } from "./csv.js";
import { METHODS as METHOD_LEVEL, PEOPLE as PEOPLE_COUNT, LEVELS, supplyAsOf, assessedCoverage, WORKING_DAYS_PER_QUARTER, UTILISATION, BOOKABLE_DAYS_PER_QUARTER } from "./model.js";

const QUARTER = "2027-Q1";
const METHODS = ["Operative", "Conceptual", "Strategic", "Comprehensive"];
const PEOPLE = [["", "Not needed"], ["1", "1 person"], ["2", "2 people"], ["3", "3 people"], ["5", "5 people"]];
// Coverage per row: is this working method covered on the team today?
const COVERAGE = [["critical", "Critical"], ["under", "Under"], ["adequate", "Adequate"], ["over", "Over"]];
const COP = "the community of practice";
const SUPPORT_KEY = { "the platform team": "platform", "the legal and IT security team": "legal", [COP]: "cop" };
// Name, support the area can also draw on, and one example per working method.
const AREAS = [
  ["Discovery & Inception", COP, ["Run technical spikes and prototypes", "Map an existing system and its constraints", "Shape the technical approach, options and estimates for a new product", "Advise ministries on what is technically feasible before a project starts"]],
  ["Frontend", COP, ["Build components to the design system", "Plan the structure of a new journey", "Set frontend standards across teams", "Shape the shared design system across government services"]],
  ["Backend", COP, ["Build endpoints to the team's conventions", "Design the data model and service boundaries for a feature", "Set API guidelines across teams, decide build or buy", "Shape interoperability standards with other ministries"]],
  ["Architecture", COP, ["Document and maintain existing decisions", "Design the architecture of a new component", "Own the system architecture and its trade-offs", "Align architecture with federal IT strategy and shared platforms"]],
  ["Security", COP, ["Patch dependencies, follow secure coding guidance", "Threat-model a new integration", "Own the security architecture and its trade-offs", "Align with BSI requirements and cross-government security developments"]],
  ["DevOps, CI/CD & Infrastructure", "the platform team", ["Maintain build and deployment pipelines, environments and monitoring", "Design CI/CD, environments and release processes for a new service", "Set infrastructure and delivery standards and hosting choices", "Shape sovereign cloud and shared platform strategy"]],
  ["Quality & Documentation", COP, ["Write automated tests, keep developer and API documentation current", "Plan the test and documentation approach for a release or handover", "Set quality and documentation standards across teams", "Shape quality and knowledge-sharing practice across the organisation"]],
  ["Data & AI", COP, ["Build data pipelines and queries, integrate a model, write and evaluate prompts", "Design a data model, migration, or agent and retrieval workflow with evaluation", "Own data architecture and governance, or decide models, hosting and safeguards", "Shape data sharing and responsible AI use across government"]],
  ["Compliance & Privacy", "the legal and IT security team", ["Apply data protection requirements in code", "Design consent, retention and audit flows", "Own the product's GDPR and compliance approach", "Shape compliance practice with data protection officers across ministries"]],
  ["Accessibility", COP, ["Fix audit findings, test with assistive technology", "Plan accessible patterns for a new journey", "Define the product's accessibility strategy and BITV compliance route", "Influence accessibility standards across government services"]],
];
// The domain section is prefilled from the project's domain, kept by the discipline head.
const DOMAIN_EXAMPLES = {
  Legislation: ["Implement rules from legal texts correctly", "Model legal processes and their edge cases", "Own how the product interprets and tracks legal change", "Shape how legislation is made digital-ready across government"],
};
const GENERIC_DOMAIN = ["Implement the domain's rules correctly", "Model the domain's processes and edge cases", "Own how the product follows changes in the domain", "Shape how the domain is made digital-ready across government"];

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
function areaSection({ id, name, subject, support, examples, note, previous, hint }) {
  const section = $("section", { "data-area": name, "data-id": id, "data-support": support ?? "" });
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
  section.append(table);
  if (hint) {
    const how = $("ul");
    section.append($("details", { class: "how" }, $("summary", {}, "How are suggestions calculated?"), how));
    const update = () => coverageHint(section, id, hint, how);
    section.addEventListener("change", update);
    update();
  }

  return section;
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
function rowsFor(form, team, domain) {
  const rows = [];
  for (const section of document.querySelectorAll("[data-area]")) {
    const name = section.dataset.area;
    const id = section.dataset.id;
    for (const method of METHODS) {
      const people = form.elements[`${id}-${slug(method)}`].value;
      const support = form.elements[`${id}-${slug(method)}-support`]?.checked ?? false;
      if (!people && !support) continue;
      const isDomain = name.startsWith("Domain expertise");
      rows.push({
        quarter: QUARTER,
        team,
        expertise: isDomain ? "Domain expertise" : name,
        domain: isDomain ? domain : "",
        method: method.toLowerCase(),
        people,
        coverage: form.elements[`${id}-${slug(method)}-coverage`]?.value ?? "",
        // Which support the team also draws on: platform, legal (legal and IT security) or cop (community of practice).
        support: support ? SUPPORT_KEY[section.dataset.support] ?? "" : "",
      });
    }
  }
  return rows;
}

async function load(path) {
  const res = await fetch(path);
  return res.ok ? parseCsv(await res.text()) : [];
}

const [staffing, plan, demand, activity, assessments] = await Promise.all(
  ["staffing", "discipline-plan", "project-demand", "historical-activity", "expertise-assessments"].map((f) => load(`data/${f}.csv`)),
);
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
function renderAreas() {
  const team = select.value;
  const domain = domainOf.get(projectOf.get(team));
  const historical = team && demoState.value === "historical";
  const extras = (id) => ({
    previous: historical ? previousFor(team, id) : undefined,
    hint: historical ? hintFor(team, id) : undefined,
  });
  areas.replaceChildren(...AREAS.map(([name, support, examples]) => areaSection({ id: slug(name), name, subject: name, support, examples, ...extras(slug(name)) })));
  if (domain) {
    const section = areaSection({
      id: "domain",
      name: `Domain expertise: ${domain}`,
      subject: `${domain} domain knowledge`,
      examples: DOMAIN_EXAMPLES[domain] ?? GENERIC_DOMAIN,
      note: "Prefilled from your project's domain. If your team also works in another domain, tell the discipline head.",
      ...extras("domain"),
    });
    areas.append(section);
  }
}
for (const el of [select, demoState]) el.addEventListener("change", renderAreas);
renderAreas();

form.addEventListener("submit", (ev) => {
  ev.preventDefault();
  const rows = rowsFor(form, select.value, domainOf.get(projectOf.get(select.value)) ?? "");
  document.getElementById("rows").textContent = rows.length ? toCsv(rows) : "No areas answered.";
  document.getElementById("result").hidden = false;
});

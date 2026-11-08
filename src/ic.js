// The IC page: an engineer rates themselves per top area, the answers stay in this browser, and the IC form opens
// with them filled in. Once they have submitted, the page shows their own profile against discipline-wide demand.
// Live supply is anonymous counts, so the personal view comes from the answers kept here, not from any sheet.
import { load, currentMode, SHEET_LABEL } from "./source.js";
import { readTabs, withSheet } from "./google.js";
import { buildModel } from "./model.js";
import { personaView } from "./persona.js";
import { inBuckets, topAreas } from "./buckets.js";
import { DEFAULT_BUCKETS } from "./areas.js";
import { RATINGS } from "./icform.js";
import { readFormRows, prefillUrl, ratingsToProfile } from "./prefill.js";

const STORE = "ic-self-assessment";
const $ = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};

// { ratings: area -> rating, submitted: boolean }. Storage can be unavailable (private windows, blocked site data):
// the page then works for this visit only.
function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) ?? "{}");
    return { ratings: saved.ratings ?? {}, submitted: Boolean(saved.submitted) };
  } catch {
    return { ratings: {}, submitted: false };
  }
}
function persist(state) {
  try {
    localStorage.setItem(STORE, JSON.stringify(state));
  } catch {
    // Not kept: fine, the form is the record.
  }
}

const table = document.getElementById("ratings");
const submit = document.getElementById("submit");
const rateStatus = document.getElementById("rate-status");
const rateNote = document.getElementById("rate-note");
const profile = document.getElementById("profile");

const mode = await currentMode();
// Engineers can't open the staffing snapshot or the activity log live, and the view needs neither: it compares one
// person's answers with discipline-wide demand and supply.
const names = ["project-demand", "discipline-plan", "expertise-assessments", "buckets", ...(mode === "live" ? [] : ["historical-activity"])];
const session = await load(names);
const sets = session.data;
const areas = topAreas(sets.buckets ?? [], DEFAULT_BUCKETS);
if (!(sets.buckets ?? []).length) {
  rateNote.hidden = false;
  rateNote.textContent = "The discipline hasn't grouped its areas into buckets yet, so these are the default ten. Demand from the project survey may not match them until it has.";
}

// Demand per bucket, like supply. Prototype ratings and activity are per area too.
const loaded = { demand: sets["project-demand"], plan: sets["discipline-plan"], assessments: sets["expertise-assessments"], activity: sets["historical-activity"] ?? [] };
const { demand, plan, assessments, activity } = loaded;
const mapped = inBuckets(session.mode === "live" ? { demand, plan } : { demand, plan, assessments, activity }, sets.buckets ?? []);
const model = demand.length ? buildModel({ ...loaded, ...mapped, staffing: [] }) : null;

// The form's link and entry IDs, from the aggregate sheet, written by the portal's Set up IC form.
let form = readFormRows([]);
try {
  const id = session.config.sheets.aggregate;
  const { rows } = await withSheet(session.config, session.token, id, SHEET_LABEL.aggregate, () => readTabs(session.token, id, ["form"]));
  form = readFormRows(rows.form);
} catch {
  // No link: said below, where the button is.
}

const state = restore();
// Answers for areas no longer asked about are dropped; new areas start unanswered.
state.ratings = Object.fromEntries(areas.map((a) => [a, RATINGS.includes(state.ratings[a]) ? state.ratings[a] : ""]));

function renderTable() {
  const head = $("tr", {}, $("th", { scope: "col", textContent: "Area" }), ...RATINGS.map((r) => $("th", { scope: "col", textContent: r })));
  const rows = areas.map((area, i) => {
    const cells = RATINGS.map((rating) => {
      const input = $("input", { type: "radio", name: `area-${i}`, value: rating, checked: state.ratings[area] === rating });
      input.setAttribute("aria-label", `${area}: ${rating}`);
      input.addEventListener("change", () => {
        state.ratings[area] = rating;
        persist(state);
        update();
      });
      return $("td", {}, $("label", {}, input));
    });
    const tr = $("tr", {}, $("th", { scope: "row", textContent: area }), ...cells);
    tr.dataset.area = area;
    return tr;
  });
  table.replaceChildren($("thead", {}, head), $("tbody", {}, ...rows));
}

const unanswered = () => areas.filter((a) => !state.ratings[a]);

function renderProfile() {
  profile.hidden = !state.submitted;
  if (!state.submitted) return;
  const body = document.getElementById("profile-body");
  if (!model) return body.replaceChildren($("p", { className: "muted", textContent: "No project has answered the survey yet, so there is no demand to compare with." }));
  const you = personaView(model, ratingsToProfile(state.ratings));
  const section = (title, items) => (items.length ? [$("h3", { textContent: title }), $("ul", {}, ...items.map((m) =>
    $("li", {}, $("strong", { textContent: `${m.label}${m.method ? ` (${m.method.toLowerCase()})` : ""}. ` }), m.text)))] : []);
  const by = (signal) => you.mine.filter((m) => m.signal === signal);
  const parts = [
    ...section("Your skills in demand", by("needed")),
    ...section("Room to grow", by("grow")),
    ...section("Steady", by("steady")),
    ...section("Worth reconsidering", by("watch")),
    ...section("Areas the discipline needs", you.learn),
  ];
  body.replaceChildren(...(parts.length ? parts : [$("p", { className: "muted", textContent: "Rate yourself Operative or above somewhere to see where you're needed." })]));
}

function update() {
  const missing = unanswered();
  for (const tr of table.querySelectorAll("tbody tr")) tr.classList.toggle("unanswered", state.submitted && missing.includes(tr.dataset.area));
  submit.disabled = !form.url || missing.length > 0;
  rateStatus.textContent = !form.url
    ? "The form isn't linked yet: the discipline head runs Set up IC form in the portal once."
    : missing.length ? `${missing.length} of ${areas.length} areas to go. The form asks about every one; choose Not my area where it isn't.` : "";
  renderProfile();
}

// Opens the form straight from the click, so the browser allows the new tab. The page can't see whether the form
// was then submitted; opening it counts. Peer validation is the real check.
submit.addEventListener("click", () => {
  window.open(prefillUrl(form, state.ratings), "_blank", "noopener");
  state.submitted = true;
  persist(state);
  rateStatus.textContent = "The form opened in a new tab with your answers. Check them and submit it there.";
  renderProfile();
});

document.getElementById("forget").addEventListener("click", () => {
  for (const a of areas) state.ratings[a] = "";
  state.submitted = false;
  persist(state);
  renderTable();
  update();
});

renderTable();
update();

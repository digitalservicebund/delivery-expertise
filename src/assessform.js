// The self-assessment page: an engineer rates themselves per top area, the answers stay in this browser, and the IC form opens
// with them filled in. Submitting takes them to their own view of the discipline charts (ic.html),
// drawn from these answers: live supply is anonymous counts, so no sheet holds anyone's own ratings for the page.
import { load, SHEET_LABEL } from "./source.js";
import { readTabs, withSheet } from "./google.js";
import { topAreas } from "./buckets.js";
import { DEFAULT_BUCKETS } from "./areas.js";
import { RATINGS } from "./icform.js";
import { readFormRows, prefillUrl } from "./prefill.js";
import { restoreAssessment, saveAssessment } from "./selfassessment.js";

const OWN_VIEW = "ic.html";
const $ = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};

const table = document.getElementById("ratings");
const submit = document.getElementById("submit");
const rateStatus = document.getElementById("rate-status");
const rateNote = document.getElementById("rate-note");

// Only the buckets are needed here: they are the questions. Optional in both modes.
const session = await load(["buckets"]);
const buckets = session.data.buckets ?? [];
const areas = topAreas(buckets, DEFAULT_BUCKETS);
if (!buckets.length) {
  rateNote.hidden = false;
  rateNote.textContent = "The discipline hasn't grouped its areas into buckets yet, so these are the default ten. Demand from the project survey may not match them until it has.";
}

// The form's link and entry IDs, from the aggregate sheet, written by the portal's Set up IC form.
let form = readFormRows([]);
try {
  const id = session.config.sheets.aggregate;
  const { rows } = await withSheet(session.config, session.token, id, SHEET_LABEL.aggregate, () => readTabs(session.token, id, ["form"]));
  form = readFormRows(rows.form);
} catch {
  // No link: said below, where the button is.
}

const state = restoreAssessment();
// Answers for areas no longer asked about are dropped; new areas start unanswered.
state.ratings = Object.fromEntries(areas.map((a) => [a, RATINGS.includes(state.ratings[a]) ? state.ratings[a] : ""]));
document.getElementById("own-view").hidden = !state.submitted;

function renderTable() {
  const head = $("tr", {}, $("th", { scope: "col", textContent: "Area" }), ...RATINGS.map((r) => $("th", { scope: "col", textContent: r })));
  const rows = areas.map((area, i) => {
    const cells = RATINGS.map((rating) => {
      const input = $("input", { type: "radio", name: `area-${i}`, value: rating, checked: state.ratings[area] === rating });
      input.setAttribute("aria-label", `${area}: ${rating}`);
      input.addEventListener("change", () => {
        state.ratings[area] = rating;
        saveAssessment(state);
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

function update() {
  const missing = areas.filter((a) => !state.ratings[a]);
  submit.disabled = !form.url || missing.length > 0;
  rateStatus.textContent = !form.url
    ? "The form isn't linked yet: the discipline head runs Set up IC form in the portal once."
    : missing.length ? `${missing.length} of ${areas.length} areas to go. The form asks about every one; choose Not my area where it isn't.` : "";
}

// Opens the form in a new tab straight from the click, so the browser allows it, and takes this tab to the charts.
// The page can't see whether the form was then submitted; opening it counts. Peer validation is the real check.
submit.addEventListener("click", () => {
  window.open(prefillUrl(form, state.ratings), "_blank", "noopener");
  state.submitted = true;
  saveAssessment(state);
  location.assign(OWN_VIEW);
});

document.getElementById("forget").addEventListener("click", () => {
  for (const a of areas) state.ratings[a] = "";
  state.submitted = false;
  saveAssessment(state);
  document.getElementById("own-view").hidden = true;
  renderTable();
  update();
});

renderTable();
update();

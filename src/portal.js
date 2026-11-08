// The portal: shows the data mode, and offers two set-up actions to whoever has edit access to the sheets:
// fill the prototype sheet with the generated dummy data, and set up the live sheets' tabs and imports.
import { parseCsv } from "./csv.js";
import { bar, currentMode, loadConfig, DATA_TABS, SHEET_LABEL } from "./source.js";
import { token, replaceTabs, setUpTabs, withSheet, tabTitles, getForm, updateForm } from "./google.js";
import { liveLayout } from "./sheets.js";
import { FORM_INFO, formItems, formRequests, branchRequest, supplyFormula } from "./icform.js";
import { AREA_NAMES } from "./areas.js";

const mode = await currentMode();
bar(mode);

const panel = document.getElementById("sheet-setup");
const status = panel.querySelector("output");

// Runs a set-up action from a button: signs in first, while the click still counts as the person's own
// (browsers block popups opened later), and reports any failure in the panel.
function action(button, failure, run) {
  button.addEventListener("click", async () => {
    for (const b of panel.querySelectorAll("button")) b.disabled = true;
    try {
      const config = await loadConfig();
      await run(config, await token(config.clientId));
    } catch (err) {
      status.replaceChildren(`${failure} ${err.message}`);
    } finally {
      for (const b of panel.querySelectorAll("button")) b.disabled = false;
    }
  });
}

async function loadDummyData(config, t) {
  status.replaceChildren("Reading the generated data…");
  const data = {};
  for (const name of DATA_TABS) {
    const res = await fetch(`data/${name}.csv`);
    if (!res.ok) throw new Error(`data/${name}.csv is missing. Run npm run data.`);
    data[name] = parseCsv(await res.text());
  }
  status.replaceChildren("Writing to the prototype sheet…");
  await withSheet(config, t, config.sheets.prototype, SHEET_LABEL.prototype, () => replaceTabs(t, config.sheets.prototype, data));
  const total = Object.values(data).reduce((n, rows) => n + rows.length, 0);
  status.replaceChildren(`Done: ${total} rows in ${DATA_TABS.length} tabs.`);
}

// The tab the IC form writes to. Its name depends on the form owner's language.
async function responsesTab(config, t) {
  const id = config.sheets.icResponses;
  const tabs = [...await withSheet(config, t, id, SHEET_LABEL.icResponses, () => tabTitles(t, id))];
  // Re-linking a form adds a new tab ("Form responses 2") and leaves the old one behind: the highest number is current.
  const number = (name) => Number(name.match(/(\d+)\s*$/)?.[1] ?? 0);
  const tab = tabs.filter((name) => /^(Form responses|Formularantworten)/i.test(name)).sort((a, b) => number(b) - number(a))[0];
  if (!tab) throw new Error(`The IC responses sheet has no form responses tab (found: ${tabs.join(", ")}). Link the IC form to it first.`);
  return tab;
}

// Survey sheets first, so the aggregate sheet's imports point at tabs that exist.
async function setUpLiveSheets(config, t) {
  const layout = liveLayout(config.sheets);
  status.replaceChildren(`Finding the IC form's responses…`);
  const lines = [];
  // Without linked responses the rest is still worth setting up: supply just waits for a later run.
  try {
    const tab = await responsesTab(config, t);
    layout.aggregate.supply = { formula: supplyFormula(config.sheets.icResponses, tab, AREA_NAMES) };
    lines.push(`IC responses sheet: counting from the “${tab}” tab`);
  } catch (err) {
    lines.push(`aggregate sheet, supply: skipped. ${err.message}`);
  }
  // Sources first, so every import points at a tab that exists.
  for (const sheet of ["discipline", "projects", "aggregate"]) {
    status.replaceChildren(`Setting up the ${SHEET_LABEL[sheet]}…`);
    const id = config.sheets[sheet];
    const notes = await withSheet(config, t, id, SHEET_LABEL[sheet], () => setUpTabs(t, id, layout[sheet]));
    lines.push(...notes.map((n) => `${SHEET_LABEL[sheet]}, ${n}`));
  }
  // Google lets nobody approve an import through the API: it takes one click in each importing sheet.
  const link = (sheet) => Object.assign(document.createElement("a"), {
    href: `https://docs.google.com/spreadsheets/d/${config.sheets[sheet]}/edit`, target: "_blank", rel: "noopener", textContent: SHEET_LABEL[sheet],
  });
  const list = document.createElement("ul");
  list.append(...lines.map((l) => Object.assign(document.createElement("li"), { textContent: l })));
  status.replaceChildren("Done.", list, "Last step, once per source: open the ", link("aggregate"), " and the ", link("projects"),
    ", click a cell showing #REF! and choose Allow access.");
}

// Brings the IC form in line with formItems(), keeping existing questions' IDs so response columns stay put.
async function setUpIcForm(config, t) {
  const id = config.icFormId;
  status.replaceChildren("Reading the IC form…");
  const form = await withSheet(config, t, id, "IC form", () => getForm(t, id), "FORMS");
  status.replaceChildren("Updating the questions…");
  const { form: updated } = await updateForm(t, id, [
    { updateFormInfo: { info: FORM_INFO, updateMask: "title,description" } },
    ...formRequests(form.items ?? [], formItems(AREA_NAMES)),
  ]);
  await updateForm(t, id, [branchRequest(updated.items)]);
  let email = "Verified email collection: on.";
  try {
    await updateForm(t, id, [{ updateSettings: { settings: { emailCollectionType: "VERIFIED" } , updateMask: "emailCollectionType" } }]);
  } catch {
    email = "Verified email collection: couldn't be set through the API, turn it on in Settings → Responses.";
  }
  const open = Object.assign(document.createElement("a"), {
    href: `https://docs.google.com/forms/d/${id}/edit#settings`, target: "_blank", rel: "noopener", textContent: "the form's settings",
  });
  const list = document.createElement("ul");
  list.append(...[
    `Questions: ${updated.items.length} items, ${AREA_NAMES.length} areas in the grid.`,
    email,
  ].map((l) => Object.assign(document.createElement("li"), { textContent: l })));
  status.replaceChildren("Done.", list, "Google allows these only by hand, in ", open,
    ": restrict responses to DigitalService, allow response editing, and link responses to the IC responses sheet. Then run Set up live sheets for the supply counts.");
}

if (mode !== "files") {
  panel.hidden = false;
  const [dummy, live, form] = panel.querySelectorAll("button");
  action(dummy, "Could not load the dummy data.", loadDummyData);
  action(live, "Could not set up the live sheets.", setUpLiveSheets);
  action(form, "Could not set up the IC form.", setUpIcForm);
}

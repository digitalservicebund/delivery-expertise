// The portal: shows the data mode, and offers discipline heads the set-up actions: fill the prototype sheet with
// dummy data, set up the live sheets' tabs and imports, and set up the IC form.
import { generateDummyData } from "./dummy.js";
import { bar, currentMode, loadConfig, DATA_TABS, SHEET_LABEL } from "./source.js";
import { token, hasToken, canEdit, readTabs, replaceTabs, setUpTabs, withSheet, tabTitles, getForm, updateForm } from "./google.js";
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

// Generates the dummy data in the browser from the staffing snapshot in the discipline sheet, and writes it to the
// prototype sheet. Only team structure and levels are used: names and emails never leave the discipline sheet.
async function loadDummyData(config, t) {
  status.replaceChildren("Reading the staffing snapshot…");
  const id = config.sheets.discipline;
  const { rows, absent } = await withSheet(config, t, id, SHEET_LABEL.discipline, () => readTabs(t, id, ["staffing"]));
  if (absent.length || !rows.staffing.length) {
    throw new Error("The discipline sheet's staffing tab is empty: paste the ds-staffing snapshot into it first (see Set up live sheets).");
  }
  status.replaceChildren("Generating the dummy data…");
  const data = generateDummyData(rows.staffing);
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

// The set-up panel is for discipline heads only: whoever may edit the discipline sheet, as Google says. That is
// its owner and anyone it's shared with for editing, with no list to keep. Everyone else sees only the prototypes.
// The sheets' own sharing still decides what any action may do; this only keeps the buttons out of the way.
const access = document.getElementById("head-access");
const accessNote = access.querySelector("output");
const [dummy, live, form] = panel.querySelectorAll("button");
action(dummy, "Could not load the dummy data.", loadDummyData);
action(live, "Could not set up the live sheets.", setUpLiveSheets);
action(form, "Could not set up the IC form.", setUpIcForm);

const isHead = async (config, t, { ask }) => {
  const id = config.sheets.discipline;
  const check = () => canEdit(t, id);
  // Asking opens the Picker once if the sheet hasn't been handed to the app yet. Silent checks never do.
  return ask ? withSheet(config, t, id, SHEET_LABEL.discipline, check) : check().catch(() => false);
};
const showPanel = () => ((panel.hidden = false), (access.hidden = true));

if (mode !== "unconfigured") {
  access.hidden = false;
  const config = await loadConfig();
  // Already signed in this session: check quietly, without any popup.
  if (hasToken() && (await isHead(config, await token(config.clientId), { ask: false }))) showPanel();
  access.querySelector("button").addEventListener("click", async () => {
    accessNote.textContent = "";
    try {
      if (await isHead(config, await token(config.clientId), { ask: true })) return showPanel();
      accessNote.textContent = "You can view the discipline sheet but not edit it, so the set-up isn't available to you.";
    } catch (err) {
      // No access looks like "not found" to the app; anything else is a real error worth showing.
      accessNote.textContent = err.status === 404
        ? "Only discipline heads, who can edit the discipline sheet, can set up the sheets."
        : `Couldn't check your access to the discipline sheet. Google said: ${err.message}`;
    }
  });
}

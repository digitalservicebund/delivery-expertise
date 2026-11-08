// Where every page gets its data from, and the bar that says so.
//   prototype: the prototype sheet, filled with dummy data from the portal. The default.
//   live:      the real sheets. Only what exists live is returned; the rest comes back empty and listed as missing.
//   files:     data/*.csv beside the pages. Used automatically when there is no config.js, e.g. a fresh clone.
// ?mode=live or ?mode=prototype switches, and the choice is kept for the browser tab's session.
import { parseCsv } from "./csv.js";
import { token, hasToken, readTabs, withSheet } from "./google.js";

// The dummy data's tabs, named like the generated CSVs.
export const DATA_TABS = ["staffing", "discipline-plan", "project-demand", "historical-activity", "expertise-assessments"];
// Where each dataset lives in live mode: [sheet in config.sheets, tab]. Anything not listed has no live source yet.
const LIVE = { "project-demand": ["aggregate", "demand"], "discipline-plan": ["aggregate", "plan"] };
const MODE_KEY = "data-mode";
const LABEL = { prototype: "Prototype data", live: "Live data", files: "Local dummy files" };

export async function loadConfig() {
  try {
    return (await import("../config.js")).default;
  } catch {
    return null;
  }
}

function chosenMode() {
  const asked = new URLSearchParams(location.search).get("mode");
  try {
    if (asked === "live" || asked === "prototype") sessionStorage.setItem(MODE_KEY, asked);
    return sessionStorage.getItem(MODE_KEY) === "live" ? "live" : "prototype";
  } catch {
    return asked === "live" ? "live" : "prototype";
  }
}

export async function currentMode() {
  return (await loadConfig()) ? chosenMode() : "files";
}

// The bar at the top of every page: which data is shown, a switch, and sign-in when needed.
const STYLE = `
.mode-bar { font: 13px/1.4 system-ui, sans-serif; padding: 0.4rem 1rem; background: #fef7e0; border-bottom: 1px solid #f9e2a2; color: #202124; }
.mode-bar.live { background: #e6f4ea; border-color: #ceead6; }
.mode-bar a { color: #1a73e8; }
.mode-bar button { font: inherit; margin-left: 0.5rem; padding: 0.2rem 0.75rem; border: 1px solid #1a73e8; border-radius: 4px; background: #fff; color: #1a73e8; cursor: pointer; }`;
export function bar(mode) {
  document.head.append(Object.assign(document.createElement("style"), { textContent: STYLE }));
  const el = document.createElement("div");
  el.className = `mode-bar ${mode}`;
  el.setAttribute("role", "status");
  const label = Object.assign(document.createElement("strong"), { textContent: LABEL[mode] });
  el.append(label);
  if (mode !== "files") {
    const other = mode === "live" ? "prototype" : "live";
    const link = Object.assign(document.createElement("a"), { href: `?mode=${other}`, textContent: `Switch to ${LABEL[other].toLowerCase()}` });
    el.append(" · ", link);
  }
  const status = document.createElement("span");
  el.append(" ", status);
  document.body.prepend(el);
  return { el, status };
}

// Resolves with a token, showing a sign-in button first if there is none.
function signIn(clientId, ui) {
  if (hasToken()) return token(clientId);
  return new Promise((resolve, reject) => {
    const button = Object.assign(document.createElement("button"), { type: "button", textContent: "Sign in with Google to load data" });
    ui.status.replaceChildren(button);
    button.addEventListener("click", () => token(clientId).then((t) => (button.remove(), resolve(t)), reject));
  });
}

// What the Picker calls each sheet when asking for it.
export const SHEET_LABEL = { prototype: "prototype data sheet", aggregate: "aggregate sheet", projects: "projects sheet", discipline: "discipline sheet", icResponses: "IC responses sheet" };
const readSheet = (config, t, sheet, tabs) =>
  withSheet(config, t, config.sheets[sheet], SHEET_LABEL[sheet], () => readTabs(t, config.sheets[sheet], tabs));

async function fromFiles(names) {
  const read = async (n) => {
    const res = await fetch(`data/${n}.csv`);
    if (!res.ok) throw new Error(`data/${n}.csv: ${res.status}. Run npm run data.`);
    return [n, parseCsv(await res.text())];
  };
  return Object.fromEntries(await Promise.all(names.map(read)));
}

async function fromLive(t, config, names) {
  const data = Object.fromEntries(names.map((n) => [n, []]));
  const missing = names.filter((n) => !LIVE[n]);
  const bySheet = Map.groupBy(names.filter((n) => LIVE[n]), (n) => LIVE[n][0]);
  for (const [sheet, ns] of bySheet) {
    const { rows, absent } = await readSheet(config, t, sheet, ns.map((n) => LIVE[n][1]));
    for (const n of ns) {
      data[n] = rows[LIVE[n][1]];
      // A live tab not set up yet is the same as no live source: empty, and said so.
      if (absent.includes(LIVE[n][1])) missing.push(n);
    }
  }
  return { data, missing };
}

// names: datasets, as in DATA_TABS. Returns { data: name -> rows, missing: names with no source in this mode, mode }.
export async function load(names) {
  const config = await loadConfig();
  const mode = config ? chosenMode() : "files";
  const ui = bar(mode);
  if (mode === "files") return { data: await fromFiles(names), missing: [], mode };
  const t = await signIn(config.clientId, ui);
  ui.status.textContent = "Loading…";
  try {
    if (mode === "live") {
      const { data, missing } = await fromLive(t, config, names);
      ui.status.textContent = missing.length ? `Not available live yet: ${missing.join(", ")}.` : "";
      return { data, missing, mode };
    }
    const { rows: data, absent } = await readSheet(config, t, "prototype", names);
    // The prototype sheet should have every tab: if not, it hasn't been filled yet.
    if (absent.length) throw new Error(`The prototype sheet has no ${absent.join(", ")} tab${absent.length > 1 ? "s" : ""}.`);
    ui.status.textContent = "";
    return { data, missing: [], mode };
  } catch (err) {
    ui.status.textContent = mode === "prototype" ? `${err.message} Load the dummy data from the portal first.` : err.message;
    throw err;
  }
}

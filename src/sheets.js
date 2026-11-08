// Converting between Sheets API values (arrays of rows, the first being the header) and the row objects
// the pages work with, the same shape parseCsv gives. Pure, so it runs in tests.
import { STAFFING_HEADER, teamsFormula } from "./teams.js";

export function rowsFromValues(values = []) {
  const [header = [], ...body] = values;
  const keys = header.map((h) => String(h).trim());
  return body
    .filter((r) => r.some((v) => String(v).trim() !== ""))
    .map((r) => Object.fromEntries(keys.map((k, i) => [k, String(r[i] ?? "").trim()])));
}

export function valuesFromRows(rows) {
  const header = Object.keys(rows[0] ?? {});
  return [header, ...rows.map((r) => header.map((h) => r[h] ?? ""))];
}

// The survey only ever appends, so a team that submits again has two sets of rows for the quarter.
// Keeps only the set with the latest submitted_at for each team and quarter. ISO timestamps sort as text.
export function latestSubmissions(rows) {
  const key = (r) => `${r.team}\u0000${r.quarter}`;
  const latest = new Map();
  for (const r of rows) if ((r.submitted_at ?? "") > (latest.get(key(r)) ?? "")) latest.set(key(r), r.submitted_at);
  return rows.filter((r) => (r.submitted_at ?? "") === (latest.get(key(r)) ?? ""));
}

// The live sheets' tabs. Survey sheets get header rows. The aggregate sheet gets one import formula per tab.
export const DEMAND_HEADER = ["quarter", "team", "expertise", "domain", "method", "people", "coverage", "support", "specifics", "comment", "submitted_by", "submitted_at", "notes"];
// notes ("Anything we should know?") is for the whole submission, so it repeats on each of its rows.
// It comes last so the columns before it keep their place in sheets set up before it existed.
export const PLAN_HEADER = ["quarter", "kind", "subject", "method", "value", "reason", "submitted_by", "submitted_at"];
const lastColumn = (header) => String.fromCharCode(64 + header.length); // fine up to 26 columns
// The aggregate sheet is readable by everyone at DigitalService, a wider audience than the survey sheets.
// So the import leaves out who submitted (an email) and free-text comments, which may name people.
const NOT_SHARED = new Set(["submitted_by", "comment", "notes"]);

// What to write to row 1 of a survey tab. Empty: the whole header. The start of the expected header, as in a
// sheet set up before a column was added: just the missing cells. Anything else is someone's and stays.
export function headerUpdate(current, header) {
  if (!current.length) return { cell: "A1", values: header, note: "header added" };
  if (current.join() === header.join()) return { note: "already set up" };
  if (current.length < header.length && current.every((h, i) => h === header[i])) {
    const missing = header.slice(current.length);
    return { cell: `${lastColumn([...current, ""])}1`, values: missing, note: `header extended with ${missing.join(", ")}` };
  }
  return { note: `has a different header, left as it is (expected ${header.join(", ")})` };
}
export function liveLayout(sheets) {
  const importOf = (id, tab, header) => {
    const cols = header.flatMap((h, i) => (NOT_SHARED.has(h) ? [] : [`Col${i + 1}`])).join(", ");
    return `=QUERY(IMPORTRANGE("${id}", "${tab}!A:${lastColumn(header)}"), "select ${cols} where Col1 is not null", 1)`;
  };
  return {
    // teams is read only by the survey, from this sheet. Its emails never go to the aggregate sheet.
    projects: { demand: { header: DEMAND_HEADER }, teams: { formula: teamsFormula(sheets.discipline) } },
    // Pasted by hand from the ds-staffing snapshot export. Holds names and levels: discipline heads only.
    discipline: { plan: { header: PLAN_HEADER }, staffing: { header: STAFFING_HEADER } },
    aggregate: {
      demand: { formula: importOf(sheets.projects, "demand", DEMAND_HEADER) },
      plan: { formula: importOf(sheets.discipline, "plan", PLAN_HEADER) },
    },
  };
}

// A whole tab as an A1 range. Quoted, as tab names may contain dashes or spaces.
export const tabRange = (tab) => `'${tab.replaceAll("'", "''")}'`;

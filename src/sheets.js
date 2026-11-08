// Converting between Sheets API values (arrays of rows, the first being the header) and the row objects
// the pages work with, the same shape parseCsv gives. Pure, so it runs in tests.

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

// The live sheets' tabs. Survey sheets get header rows. The aggregate sheet gets one import formula per tab.
export const DEMAND_HEADER = ["quarter", "team", "expertise", "domain", "method", "people", "coverage", "support", "specifics", "comment", "submitted_by", "submitted_at"];
export const PLAN_HEADER = ["quarter", "kind", "subject", "method", "value", "reason", "submitted_by", "submitted_at"];
const lastColumn = (header) => String.fromCharCode(64 + header.length); // fine up to 26 columns
// The aggregate sheet is readable by everyone at DigitalService, a wider audience than the survey sheets.
// So the import leaves out who submitted (an email) and free-text comments, which may name people.
const NOT_SHARED = new Set(["submitted_by", "comment"]);
export function liveLayout(sheets) {
  const importOf = (id, tab, header) => {
    const cols = header.flatMap((h, i) => (NOT_SHARED.has(h) ? [] : [`Col${i + 1}`])).join(", ");
    return `=QUERY(IMPORTRANGE("${id}", "${tab}!A:${lastColumn(header)}"), "select ${cols} where Col1 is not null", 1)`;
  };
  return {
    projects: { demand: { header: DEMAND_HEADER } },
    discipline: { plan: { header: PLAN_HEADER } },
    aggregate: {
      demand: { formula: importOf(sheets.projects, "demand", DEMAND_HEADER) },
      plan: { formula: importOf(sheets.discipline, "plan", PLAN_HEADER) },
    },
  };
}

// A whole tab as an A1 range. Quoted, as tab names may contain dashes or spaces.
export const tabRange = (tab) => `'${tab.replaceAll("'", "''")}'`;

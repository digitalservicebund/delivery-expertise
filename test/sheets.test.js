import { test } from "node:test";
import assert from "node:assert/strict";
import { rowsFromValues, valuesFromRows, tabRange, liveLayout, DEMAND_HEADER, latestSubmissions, headerUpdate } from "../src/sheets.js";

test("only each team's latest submission per quarter counts", () => {
  const row = (team, quarter, at, method) => ({ team, quarter, submitted_at: at, method });
  const rows = [
    row("A", "2027-Q1", "2027-01-05T10:00:00Z", "operative"),
    row("A", "2027-Q1", "2027-01-05T10:00:00Z", "conceptual"),
    row("A", "2027-Q1", "2027-01-09T08:00:00Z", "strategic"),
    row("A", "2026-Q4", "2026-10-01T08:00:00Z", "operative"),
    row("B", "2027-Q1", "", "operative"),
  ];
  assert.deepEqual(latestSubmissions(rows).map((r) => `${r.team} ${r.quarter} ${r.method}`),
    ["A 2027-Q1 strategic", "A 2026-Q4 operative", "B 2027-Q1 operative"]);
});

test("demand adds new columns last (notes, the picked areas, then the project types), so earlier columns keep their place", () => {
  assert.deepEqual(DEMAND_HEADER.slice(-5), ["submitted_by", "submitted_at", "notes", "areas", "project_types"]);
});

test("a header that starts the expected one is extended; any other header is left alone", () => {
  assert.deepEqual(headerUpdate([], ["a", "b"]), { cell: "A1", values: ["a", "b"], note: "header added" });
  assert.deepEqual(headerUpdate(["a"], ["a", "b", "c"]), { cell: "B1", values: ["b", "c"], note: "header extended with b, c" });
  assert.deepEqual(headerUpdate(["a", "b"], ["a", "b"]), { note: "already set up" });
  assert.match(headerUpdate(["x"], ["a", "b"]).note, /different header, left as it is/);
  assert.equal(headerUpdate(["x"], ["a", "b"]).values, undefined);
});

test("the aggregate sheet imports the survey sheets without emails or comments", () => {
  const layout = liveLayout({ projects: "P", discipline: "D" });
  assert.deepEqual(layout.projects.demand.header, DEMAND_HEADER);
  // The teams list comes from the staffing snapshot in the discipline sheet. Its emails go nowhere else:
  // not to the aggregate sheet, and not to the prototype sheet.
  assert.ok(layout.projects.teams.formula.includes('IMPORTRANGE("D", "staffing!'));
  assert.ok(!("prototype" in layout));
  assert.equal(layout.discipline.staffing.header[0], "Email");
  assert.ok(!("teams" in layout.aggregate));
  assert.equal(layout.aggregate.demand.formula,
    '=QUERY(IMPORTRANGE("P", "demand!A:O"), "select Col1, Col2, Col3, Col4, Col5, Col6, Col7, Col8, Col9, Col12, Col14, Col15 where Col1 is not null", 1)');
  assert.equal(layout.aggregate.plan.formula,
    '=QUERY(IMPORTRANGE("D", "plan!A:H"), "select Col1, Col2, Col3, Col4, Col5, Col6, Col8 where Col1 is not null", 1)');
});

test("the first row is the header, short rows are padded, blank rows dropped", () => {
  const rows = rowsFromValues([["quarter", "team", "people"], ["2026-Q1", "A", "3"], [], ["2026-Q1", "B"]]);
  assert.deepEqual(rows, [{ quarter: "2026-Q1", team: "A", people: "3" }, { quarter: "2026-Q1", team: "B", people: "" }]);
});

test("an empty or missing tab gives no rows", () => {
  assert.deepEqual(rowsFromValues(undefined), []);
  assert.deepEqual(rowsFromValues([["quarter"]]), []);
});

test("rows round-trip through values", () => {
  const rows = [{ a: "1", b: "" }, { a: "2", b: "x" }];
  assert.deepEqual(valuesFromRows(rows), [["a", "b"], ["1", ""], ["2", "x"]]);
  assert.deepEqual(rowsFromValues(valuesFromRows(rows)), rows);
});

test("tab names are quoted for A1 ranges", () => {
  assert.equal(tabRange("project-demand"), "'project-demand'");
  assert.equal(tabRange("it's"), "'it''s'");
});

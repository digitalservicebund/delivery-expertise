import { test } from "node:test";
import assert from "node:assert/strict";
import { rowsFromValues, valuesFromRows, tabRange, liveLayout, DEMAND_HEADER } from "../src/sheets.js";

test("the aggregate sheet imports the survey sheets without emails or comments", () => {
  const layout = liveLayout({ projects: "P", discipline: "D" });
  assert.deepEqual(layout.projects.demand.header, DEMAND_HEADER);
  assert.equal(layout.aggregate.demand.formula,
    '=QUERY(IMPORTRANGE("P", "demand!A:L"), "select Col1, Col2, Col3, Col4, Col5, Col6, Col7, Col8, Col9, Col12 where Col1 is not null", 1)');
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

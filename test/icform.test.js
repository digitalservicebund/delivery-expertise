import { test } from "node:test";
import assert from "node:assert/strict";
import { formItems, formRequests, branchRequest, supplyFormula, WHOSE, GRID, MIN_GROUP } from "../src/icform.js";

const kinds = (requests) => requests.map((r) => Object.keys(r)[0]);

test("an empty form gets every item created in order", () => {
  const wanted = formItems(["Frontend", "Backend"]);
  const requests = formRequests([], wanted);
  assert.deepEqual(kinds(requests), wanted.map(() => "createItem"));
  assert.deepEqual(requests.map((r) => r.createItem.location.index), [0, 1, 2, 3, 4, 5]);
});

test("unknown items are deleted, last first, so earlier indexes stay valid", () => {
  const existing = [{ itemId: "a", title: "Expertise 1", questionItem: { question: { questionId: "q" } } }, { itemId: "b", title: "Old", textItem: {} }];
  const requests = formRequests(existing, []);
  assert.deepEqual(requests, [{ deleteItem: { location: { index: 1 } } }, { deleteItem: { location: { index: 0 } } }]);
});

test("a re-run keeps item and question IDs, so response columns stay the same", () => {
  const wanted = formItems(["Frontend", "Backend"]);
  const existing = wanted.map((w, i) => {
    const item = structuredClone(w);
    item.itemId = `i${i}`;
    if (item.questionItem) item.questionItem.question.questionId = `q${i}`;
    if (item.questionGroupItem) item.questionGroupItem.questions.forEach((q, j) => (q.questionId = `r${j}`));
    return item;
  });
  const requests = formRequests(existing, formItems(["Backend", "Frontend", "Data & AI"]));
  assert.deepEqual(kinds(requests), wanted.map(() => "updateItem"));
  const grid = requests.find((r) => r.updateItem.item.title === GRID).updateItem.item.questionGroupItem.questions;
  assert.deepEqual(grid.map((q) => [q.rowQuestion.title, q.questionId]), [["Backend", "r1"], ["Frontend", "r0"], ["Data & AI", undefined]]);
  assert.equal(requests[0].updateItem.item.questionItem.question.questionId, "q0");
});

test("items in the wrong place are moved, not recreated", () => {
  const [a, b] = formItems(["Frontend"]).map((w, i) => ({ ...structuredClone(w), itemId: `i${i}` }));
  const requests = formRequests([b, a], [formItems(["Frontend"])[0], formItems(["Frontend"])[1]]);
  assert.deepEqual(requests[0], { moveItem: { originalLocation: { index: 1 }, newLocation: { index: 0 } } });
});

test("Myself skips straight to the ratings section", () => {
  const items = formItems(["Frontend"]).map((w, i) => ({ ...structuredClone(w), itemId: `i${i}` }));
  const { updateItem } = branchRequest(items);
  assert.equal(updateItem.item.title, WHOSE);
  assert.deepEqual(updateItem.item.questionItem.question.choiceQuestion.options, [{ value: "Myself", goToSectionId: "i3" }, { value: "A colleague", goToAction: "NEXT_SECTION" }]);
});

test("the supply formula finds columns by header and suppresses small counts", () => {
  const f = supplyFormula("S", "Form responses 1", ['Data & "AI"']);
  assert.match(f, /IMPORTRANGE\("S", "'Form responses 1'!A:ZZ"\)/);
  assert.match(f, /\{"Data & ""AI"""\}/);
  assert.ok(f.includes(`IF(n < ${MIN_GROUP}, "", n)`));
  // Only a missing area column is caught. Everything else, like an import awaiting access, must show.
  assert.ok(!f.includes("IFERROR"));
});

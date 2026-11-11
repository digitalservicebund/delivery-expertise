import { test } from "node:test";
import assert from "node:assert/strict";
import { retryUngranted, unpicked } from "../src/google.js";

const notYet = Object.assign(new Error("not found"), { status: 404 });

test("a fresh grant that isn't usable yet is retried until it is", async () => {
  let calls = 0;
  const waits = [];
  const result = await retryUngranted(async () => (++calls < 3 ? Promise.reject(notYet) : "ok"), [1, 2, 3], async (ms) => waits.push(ms));
  assert.equal(result, "ok");
  assert.deepEqual(waits, [1, 2]);
});

test("other errors are not retried", async () => {
  let calls = 0;
  const boom = Object.assign(new Error("boom"), { status: 500 });
  await assert.rejects(retryUngranted(async () => { calls++; throw boom; }, [1, 2], async () => {}), boom);
  assert.equal(calls, 1);
});

test("a grant that never arrives fails after the last retry", async () => {
  await assert.rejects(retryUngranted(async () => { throw notYet; }, [1, 2], async () => {}), notYet);
});

test("files left unselected in the Picker are named", () => {
  const files = [{ id: "a", label: "A" }, { id: "b", label: "B" }];
  assert.deepEqual(unpicked(files, [{ id: "b" }]), [files[0]]);
  assert.deepEqual(unpicked(files, [{ id: "a" }, { id: "b" }]), []);
});

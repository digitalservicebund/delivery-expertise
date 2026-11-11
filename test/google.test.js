import { test } from "node:test";
import assert from "node:assert/strict";
import { scopesFor, SCOPE, EMAIL_SCOPE, READ_SCOPE } from "../src/google.js";

test("sign-in asks for files handed over and the email; prototype pages also read sheets, so they need no picker", () => {
  assert.deepEqual(scopesFor(), [SCOPE, EMAIL_SCOPE]);
  assert.deepEqual(scopesFor({ read: true }), [SCOPE, EMAIL_SCOPE, READ_SCOPE]);
  assert.equal(READ_SCOPE, "https://www.googleapis.com/auth/spreadsheets.readonly");
});

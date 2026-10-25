import { test } from "node:test";
import assert from "node:assert/strict";
import { buildModel } from "../src/model.js";
import { personaView } from "../src/persona.js";

const ask = (expertise, method, people, coverage, o) => ({ quarter: "2026-Q1", team: "T", expertise, method, people, coverage, ...o });
const model = buildModel({
  demand: [
    ask("Backend", "conceptual", "3", "critical"), // short at conceptual
    ask("Frontend", "conceptual", "2", "adequate"), // fine at conceptual, short one step up
    ask("Frontend", "strategic", "1", "under", { team: "U" }),
    ask("Search", "conceptual", "1", "over"), // more than needed
    ask("Data", "operative", "1", "under"), // needed, but the person doesn't know it
  ],
  assessments: [],
  activity: [],
  staffing: [],
});

test("an individual sees where they are needed, where to grow, what is oversupplied and what to learn", () => {
  const you = personaView(model, [
    { expertise: "Backend", level: 4 },
    { expertise: "Frontend", level: 4 },
    { expertise: "Search", level: 4 },
    { expertise: "Mobile", level: 5 },
  ]);
  const signal = Object.fromEntries(you.mine.map((m) => [m.label, m.signal]));
  assert.deepEqual(signal, { Backend: "needed", Frontend: "grow", Search: "watch", Mobile: "watch" });
  assert.deepEqual(you.learn.map((l) => l.label), ["Data"]);
  assert.equal(you.position.get("Backend"), 4);
});

// Linking the IC page to the IC form with the person's answers filled in. Set up IC form writes the form's public
// link and the entry ID of each question the page fills to the aggregate sheet's form tab, which everyone can read;
// engineers can't read the form itself. Pure, so it runs in tests.
import { WHOSE, MYSELF, RATINGS } from "./icform.js";

export const FORM_HEADER = ["role", "name", "entry"];

// A pre-fill link names each question by its entry ID: the Forms API's hexadecimal questionId, in decimal.
const entryOf = (questionId) => String(parseInt(questionId, 16));

// items: the form's items from the Forms API; responderUri: its public …/viewform link.
export function formRows(items, responderUri) {
  const rows = [{ role: "url", name: "", entry: responderUri }];
  for (const item of items) {
    if (item.title === WHOSE && item.questionItem) rows.push({ role: "whose", name: WHOSE, entry: entryOf(item.questionItem.question.questionId) });
    for (const q of item.questionGroupItem?.questions ?? []) rows.push({ role: "area", name: q.rowQuestion.title, entry: entryOf(q.questionId) });
  }
  return rows;
}

export function readFormRows(rows) {
  const form = { url: "", whose: "", areas: new Map() };
  for (const r of rows) {
    if (r.role === "url") form.url = r.entry;
    else if (r.role === "whose") form.whose = r.entry;
    else if (r.role === "area" && r.name) form.areas.set(r.name, r.entry);
  }
  return form;
}

// ratings: area -> one of RATINGS, or "" for unanswered. Areas the form doesn't ask about are left out.
export function prefillUrl(form, ratings) {
  if (!form.url) return "";
  const params = new URLSearchParams({ usp: "pp_url" });
  if (form.whose) params.set(`entry.${form.whose}`, MYSELF);
  for (const [area, rating] of Object.entries(ratings)) {
    if (rating && form.areas.has(area)) params.set(`entry.${form.areas.get(area)}`, rating);
  }
  return `${form.url}?${params}`;
}

// The form's ratings on the model's level scale: Learning 2 to Comprehensive 6. Not my area is 0.
export function levelOf(rating) {
  const i = RATINGS.indexOf(rating);
  return i > 0 ? i + 1 : 0;
}

// The person's own ratings as the profile personaView() expects: self-assessed, so level and self agree.
export const ratingsToProfile = (ratings) =>
  Object.entries(ratings)
    .map(([expertise, rating]) => ({ expertise, level: levelOf(rating), self: levelOf(rating) }))
    .filter((r) => r.level > 0);

// Saved answers (area -> rating) carried over to the current areas. An answer for a former bucket moves to the
// bucket it went to (history: the bucket-history tab), unless that bucket has an answer of its own; on a merge
// the highest rating wins. Answers for areas no longer asked about are dropped; new areas start unanswered.
export function followBuckets(saved, areas, history) {
  const out = Object.fromEntries(areas.map((a) => [a, RATINGS.includes(saved[a]) ? saved[a] : ""]));
  for (const { bucket, now } of history) {
    const rating = saved[bucket];
    if (!(now in out) || !RATINGS.includes(rating) || RATINGS.includes(saved[now])) continue;
    if (RATINGS.indexOf(rating) > RATINGS.indexOf(out[now])) out[now] = rating;
  }
  return out;
}

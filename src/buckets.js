// The top areas: every area of expertise, including the ones teams add in the survey, grouped into exactly
// BUCKET_COUNT buckets. The IC form asks about the buckets, and the aggregate supply counts per bucket.
// The buckets tab in the discipline sheet is the source of truth; regrouping only proposes, and an admin applies.
// Pure, so it runs in tests. Gemini proposes the grouping, through copy and paste in the portal (src/portal.js).
import { DEFAULT_BUCKET_AREAS } from "./areas.js";


export const BUCKET_COUNT = 10;
export const BUCKET_HEADER = ["area", "bucket", "generated_at"];
// Where every former bucket went: its closest match in the current buckets. IC answers are stored per bucket
// name, so this keeps older answers counted after a regrouping.
export const HISTORY_HEADER = ["bucket", "now", "changed_at"];
// After this long, admins are nudged to regroup even without new areas: one survey round.
const STALE_DAYS = 90;

const byName = (a, b) => a.localeCompare(b);

// Everything to group: the standard areas, every area a team answered for (custom ones included) and every area
// already in a bucket, so regrouping never drops one. Domain expertise is per policy domain and stays apart.
export function areasToGroup(demand, currentRows, standard) {
  const names = [...standard, ...demand.flatMap(demandAreas), ...currentRows.map((r) => r.area)]
    .map((n) => String(n ?? "").trim())
    .filter((n) => n && n !== "Domain expertise");
  return [...new Set(names)].sort(byName);
}

// The buckets tab as groups, in the order buckets first appear, with when they were generated.
export function readBuckets(rows) {
  const groups = new Map();
  let generatedAt = "";
  for (const r of rows) {
    if (!r.area || !r.bucket) continue;
    if (!groups.has(r.bucket)) groups.set(r.bucket, []);
    groups.get(r.bucket).push(r.area);
    if ((r.generated_at ?? "") > generatedAt) generatedAt = r.generated_at;
  }
  return { groups: [...groups].map(([name, areas]) => ({ name, areas: areas.sort(byName) })), generatedAt };
}

// The names the IC form asks about and supply counts: the buckets, or the standard areas until there are any.
export function topAreas(rows, standard) {
  const names = readBuckets(rows).groups.map((g) => g.name);
  return names.length ? names : standard;
}

// Supply is counted per bucket, so the discipline view counts demand per bucket too: each demand row's area, and
// each planned adjustment's subject, becomes its bucket. Areas in no bucket, and domain expertise, stay as they are.
// Prototype ratings and activity are per area as well, so they are passed in and mapped too; live supply already
// comes per bucket and is left out.
// history: the bucket-history tab, so rows naming an old bucket (such as a planned adjustment) follow it too.
export function inBuckets(data, rows, history = []) {
  const bucketOf = new Map(rows.filter((r) => r.area && r.bucket).map((r) => [r.area, r.bucket]));
  if (!bucketOf.size) return data;
  const moved = renamedTo(history);
  const current = new Set(bucketOf.values());
  // A row naming a current bucket (survey answers are per bucket) keeps it; an area or former bucket follows.
  const to = (name) => (current.has(name) ? name : bucketOf.get(name) ?? moved.get(name) ?? name);
  const out = {};
  for (const [name, list] of Object.entries(data)) {
    out[name] = name === "plan"
      ? list.map((r) => (r.kind === "adjust" ? { ...r, subject: to(r.subject) } : r))
      : list.map((r) => ({ ...r, expertise: to(r.expertise) }));
  }
  return out;
}

// The bucket history after applying a regrouping (result: from compareBuckets). A renamed bucket went to its new
// name, a merged one to the bucket that took most of its areas; earlier entries follow along. A name that is a
// bucket again is dropped: it counts as itself.
export function nextHistory(history, result, at) {
  const step = new Map([
    ...result.renamed.map((r) => [r.from, r.to]),
    ...result.removed.filter((r) => r.mergedInto).map((r) => [r.name, r.mergedInto]),
  ]);
  const current = new Set(result.buckets.map((b) => b.name));
  const rows = [
    ...history.filter((r) => r.bucket && r.now).map((r) => ({ ...r, now: step.get(r.now) ?? r.now })),
    ...[...step].map(([bucket, now]) => ({ bucket, now, changed_at: at })),
  ];
  // One entry per old name, the latest winning; never a current bucket, never pointing at itself.
  const latest = new Map(rows.map((r) => [r.bucket, r]));
  return [...latest.values()].filter((r) => !current.has(r.bucket) && r.bucket !== r.now);
}

// Retroactive history: every bucket the IC form ever asked about is a column of its responses ("Expertise [X]").
// A former name that the history doesn't know is placed by its areas: an area name goes to the bucket that area is
// in now; one of the default buckets (defaults: name -> the suggested areas it covered) goes to the current bucket
// holding most of those areas. Returns new history rows and the names that couldn't be placed.
export function inferHistory(headers, bucketRows, history, defaults, at) {
  const bucketOf = new Map(bucketRows.filter((r) => r.area && r.bucket).map((r) => [r.area, r.bucket]));
  if (!bucketOf.size) return { rows: [], unresolved: [] };
  const current = new Set(bucketOf.values());
  const known = renamedTo(history);
  const names = headers.map((h) => String(h).match(/^Expertise \[(.+)\]$/)?.[1]).filter(Boolean);
  const rows = [];
  const unresolved = [];
  for (const name of new Set(names)) {
    if (current.has(name) || known.has(name)) continue;
    const now = bucketOf.get(name) ?? mostCommon((defaults[name] ?? []).map((a) => bucketOf.get(a)).filter(Boolean));
    if (now) rows.push({ bucket: name, now, changed_at: at });
    else unresolved.push(name);
  }
  return { rows, unresolved };
}

// The most frequent value, ties going to the first seen; undefined for none.
function mostCommon(values) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts].reduce((best, entry) => (!best || entry[1] > best[1] ? entry : best), null)?.[0];
}

export const renamedTo =(history) => new Map(history.filter((r) => r.bucket && r.now).map((r) => [r.bucket, r.now]));

// Current bucket -> the former buckets that went into it.
export function aliasesOf(history) {
  const out = {};
  for (const [bucket, now] of renamedTo(history)) (out[now] ??= []).push(bucket);
  return out;
}

export const bucketRows =(groups, at) =>
  groups.flatMap((g) => [...g.areas].sort(byName).map((area) => ({ area, bucket: g.name, generated_at: at })));

// What the portal prompts admins about: areas in no bucket, and a grouping older than a survey round.
export function pending(currentRows, areas, now = new Date()) {
  const { groups, generatedAt } = readBuckets(currentRows);
  const grouped = new Set(groups.flatMap((g) => g.areas));
  const age = generatedAt ? (now - new Date(generatedAt)) / 86400000 : 0;
  return { ungrouped: areas.filter((a) => !grouped.has(a)), stale: age > STALE_DAYS, empty: !groups.length };
}

// The grouping is proposed by Gemini, in the admin's own browser tab: the portal copies this prompt, the admin
// pastes it into Gemini and pastes the answer back. Current buckets go in, so stable groups keep their names.
export function bucketPrompt(areas, current) {
  return [
    `Group these areas of software engineering expertise into exactly ${BUCKET_COUNT} buckets of related skills, as an engineering discipline would staff and train for them. Some names are German.`,
    "Every area goes in exactly one bucket, and no bucket is empty. Name each bucket after its most typical area, or keep a current bucket's name where the bucket still fits.",
    "",
    "Areas:",
    ...areas.map((a) => `- ${a}`),
    ...(current.length ? ["", "Current buckets:", ...current.map((g) => `${g.name}: ${g.areas.join(", ")}`)] : []),
    "",
    "Answer with one line per area, formatted as: area | bucket",
    "Use the area names exactly as listed. No other text.",
  ].join("\n");
}

// Reads the pasted answer back: one "area | bucket" per line, tolerating markdown tables, bold, code fences and
// chatter. Area names match case-insensitively. Returns { groups, errors }; any error means don't apply it.
// count: how many buckets there must be. Ten, or one per area when there are fewer areas.
export function parseBuckets(text, areas, count = Math.min(BUCKET_COUNT, areas.length)) {
  const canonical = new Map(areas.map((a) => [a.toLowerCase(), a]));
  const bucketOf = new Map();
  const errors = [];
  const unknown = [];
  for (const line of text.split("\n")) {
    const cells = line.replace(/[*`]/g, "").trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
    if (cells.length !== 2 || !cells[0] || !cells[1] || /^-+$/.test(cells[0])) continue;
    if (cells[0].toLowerCase() === "area" && cells[1].toLowerCase() === "bucket") continue;
    const area = canonical.get(cells[0].toLowerCase());
    if (!area) { unknown.push(cells[0]); continue; }
    const before = bucketOf.get(area);
    if (before && before !== cells[1]) errors.push(`${area} is in more than one bucket: ${before}, ${cells[1]}`);
    else bucketOf.set(area, cells[1]);
  }
  if (unknown.length) errors.push(`Not one of the areas: ${unknown.join(", ")}`);
  const missing = areas.filter((a) => !bucketOf.has(a));
  if (missing.length) errors.push(`Missing: ${missing.join(", ")}`);
  const groups = readBuckets([...bucketOf].map(([area, bucket]) => ({ area, bucket }))).groups.sort((a, b) => byName(a.name, b.name));
  if (groups.length !== count) errors.push(`${groups.length} bucket${groups.length === 1 ? "" : "s"}: exactly ${count}, please`);
  return { groups, errors };
}

// Pairs each proposed group with the current bucket it overlaps most, largest overlaps first, one to one.
function match(current, proposed) {
  const pairs = [];
  proposed.forEach((p, i) => current.forEach((c, j) => {
    const n = p.areas.filter((a) => c.areas.includes(a)).length;
    if (n) pairs.push({ i, j, n });
  }));
  pairs.sort((a, b) => b.n - a.n || a.i - b.i || a.j - b.j);
  const of = new Map();
  const taken = new Set();
  for (const { i, j } of pairs) {
    if (of.has(i) || taken.has(j)) continue;
    of.set(i, j);
    taken.add(j);
  }
  return of;
}

// Where most of the given areas sit in a grouping, or null. Ties go to the first group.
function mostly(areas, groups, nameOf = (g) => g.name) {
  let best = null;
  for (const g of groups) {
    const n = areas.filter((a) => g.areas.includes(a)).length;
    if (n && (!best || n > best.n)) best = { n, name: nameOf(g) };
  }
  return best?.name ?? null;
}

// Compares a proposed grouping with the current buckets. A proposed group matched to a current bucket keeps its
// name while that name is still one of its areas, or isn't an area at all (named by hand); otherwise it takes the
// proposed name. Returns the buckets as they would be written, and what changed.
export function compareBuckets(current, proposed) {
  const of = match(current, proposed);
  const allAreas = new Set(proposed.flatMap((g) => g.areas));
  const used = new Set();
  const buckets = proposed.map((p, i) => {
    const previous = of.has(i) ? current[of.get(i)].name : null;
    const keep = previous !== null && (p.areas.includes(previous) || !allAreas.has(previous));
    let name = keep ? previous : p.name;
    for (let k = 2; used.has(name); k++) name = `${keep ? previous : p.name} (${k})`;
    used.add(name);
    return { name, previous, areas: p.areas };
  });
  const bucketOf = new Map(current.flatMap((c) => c.areas.map((a) => [a, c.name])));
  const added = [];
  const moves = [];
  for (const b of buckets) {
    for (const area of b.areas) {
      const from = bucketOf.get(area);
      if (from === undefined) added.push({ area, to: b.name });
      else if (from !== b.previous) moves.push({ area, from, to: b.name });
    }
  }
  const sortArea = (a, b) => byName(a.area, b.area);
  const matched = new Set(buckets.map((b) => b.previous));
  const changes = {
    added: added.sort(sortArea),
    moves: moves.sort(sortArea),
    renamed: buckets.filter((b) => b.previous !== null && b.previous !== b.name).map((b) => ({ from: b.previous, to: b.name })),
    created: buckets.filter((b) => b.previous === null).map((b) => ({ name: b.name, splitFrom: mostly(b.areas, current) })),
    removed: current.filter((c) => !matched.has(c.name)).map((c) => ({ name: c.name, mergedInto: mostly(c.areas, buckets) })),
  };
  return { buckets, unchanged: Object.values(changes).every((l) => !l.length), ...changes };
}

// The buckets in force: the applied grouping, or until there is one, the default buckets and the areas they cover.
export function effectiveBuckets(rows) {
  if (rows.some((r) => r.area && r.bucket)) return rows;
  return Object.entries(DEFAULT_BUCKET_AREAS).flatMap(([bucket, areas]) => areas.map((area) => ({ area, bucket })));
}

// A demand row's areas. Survey answers are per bucket and name the picked areas in their areas column ("; ");
// rows from before that name a single area as their expertise. Domain expertise is no area.
export function demandAreas(row) {
  if (row.expertise === "Domain expertise") return [];
  const listed = String(row.areas ?? "").split(";").map((a) => a.trim()).filter(Boolean);
  return listed.length ? listed : [row.expertise].filter(Boolean);
}

const words = (s) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter((w) => w.length > 1);
// Words match when one starts the other, as "deploy" and "deployment".
const shared = (a, b) => a.filter((w) => b.some((t) => t.startsWith(w) || w.startsWith(t))).length;

// Buckets a write-in may belong to, best first: the bucket of an area of that exact name, else every bucket whose
// name or areas share words with it. The project lead confirms one; nothing is assigned silently.
export function suggestBuckets(name, rows) {
  const exact = rows.find((r) => r.area.toLowerCase() === name.trim().toLowerCase());
  if (exact) return [exact.bucket];
  const typed = words(name);
  const score = new Map();
  for (const r of rows) {
    const s = Math.max(shared(typed, words(r.area)), shared(typed, words(r.bucket)));
    if (s) score.set(r.bucket, Math.max(score.get(r.bucket) ?? 0, s));
  }
  return [...score].sort((a, b) => b[1] - a[1]).map(([bucket]) => bucket);
}

// picked: [{ name, bucket }] in picking order, bucket null for a write-in that fits none. One section per bucket,
// in the order its first area was picked; an unplaced write-in gets a section of its own until it is grouped.
export function surveySections(picked) {
  const sections = new Map();
  for (const { name, bucket } of picked) {
    const key = bucket ?? name;
    if (!sections.has(key)) sections.set(key, { bucket: key, areas: [], grouped: Boolean(bucket) });
    sections.get(key).areas.push(name);
  }
  return [...sections.values()];
}

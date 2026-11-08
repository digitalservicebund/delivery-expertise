// The top areas: every area of expertise, including the ones teams add in the survey, grouped into exactly
// BUCKET_COUNT buckets. The IC form asks about the buckets, and the aggregate supply counts per bucket.
// The buckets tab in the discipline sheet is the source of truth; regrouping only proposes, and an admin applies.
// Pure, so it runs in tests. Gemini proposes the grouping, through copy and paste in the portal (src/portal.js).

export const BUCKET_COUNT = 10;
export const BUCKET_HEADER = ["area", "bucket", "generated_at"];
// After this long, admins are nudged to regroup even without new areas: one survey round.
const STALE_DAYS = 90;

const byName = (a, b) => a.localeCompare(b);

// Everything to group: the standard areas, every area a team answered for (custom ones included) and every area
// already in a bucket, so regrouping never drops one. Domain expertise is per policy domain and stays apart.
export function areasToGroup(demand, currentRows, standard) {
  const names = [...standard, ...demand.map((r) => r.expertise), ...currentRows.map((r) => r.area)]
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
export function inBuckets(data, rows) {
  const bucketOf = new Map(rows.filter((r) => r.area && r.bucket).map((r) => [r.area, r.bucket]));
  if (!bucketOf.size) return data;
  const to = (name) => bucketOf.get(name) ?? name;
  const out = {};
  for (const [name, list] of Object.entries(data)) {
    out[name] = name === "plan"
      ? list.map((r) => (r.kind === "adjust" ? { ...r, subject: to(r.subject) } : r))
      : list.map((r) => ({ ...r, expertise: to(r.expertise) }));
  }
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

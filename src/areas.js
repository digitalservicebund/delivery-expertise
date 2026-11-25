// The organisation's areas of expertise live in the discipline sheet's areas tab, edited by discipline heads and
// imported into the aggregate sheet for everyone else. Each row: an area, the bucket it is in, the support it can
// also draw on, when the portal last grouped it, and optionally:
// - same_as: the area this is another name for ("front-end" → "Frontend development"). Such a row drops out of the
//   list; answers naming it count for the area it stands for, and searching for it finds that area.
// - family: closely related areas share one (React, TypeScript → "Web frontend"), finer than a bucket. A family
//   places an area that has no bucket, guides where write-ins go, and asks regrouping to keep it together.
// - description: what the area covers, kept up to date by the descriptions workflow (src/descriptions.js).
// It is the one place that says which bucket an area is in: the portal's regrouping writes the bucket, same_as and
// family columns, and all can be edited by hand. The buckets themselves, with an example per working method, are
// on the buckets tab (src/buckets.js). Pure, so it runs in tests.
export const COP = "the community of practice";
export const SUPPORT_KEY = { "the platform team": "platform", "the legal and IT security team": "legal", [COP]: "cop" };
export const AREA_HEADER = ["area", "bucket", "support", "grouped_at", "same_as", "family", "description"];
const SUPPORT_TEXT = Object.fromEntries(Object.entries(SUPPORT_KEY).map(([text, key]) => [key, text]));
const BUCKET_COUNT = 10;

const key = (name) => String(name ?? "").trim().toLowerCase();

// The most frequent value, the first seen on a tie; undefined for none.
function mostCommon(values) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
}

// The areas tab as the pages use it:
// - areas as [name, support], their names, the buckets in order of first use
// - bucketRows: [{ area, bucket, generated_at }] for every area in a bucket, the shape src/buckets.js groups. An
//   area with no bucket of its own goes where most of its family is, marked inferred.
// - aliases: other name (lower case) -> the area it stands for; aliasesOf: area -> its other names
// - familyOf: area -> its family
// Another name only counts as one when the area it points to is on the list; otherwise it stays an area.
export function readAreas(rows) {
  const all = rows.filter((r) => r.area?.trim());
  const listed = new Map(all.filter((r) => !r.same_as?.trim()).map((r) => [key(r.area), r.area]));
  const aliases = new Map();
  const aliasesOf = new Map();
  for (const r of all) {
    const main = listed.get(key(r.same_as));
    if (!main) continue;
    aliases.set(key(r.area), main);
    aliasesOf.set(main, [...(aliasesOf.get(main) ?? []), r.area]);
  }
  const list = all.filter((r) => !aliases.has(key(r.area)));
  const familyOf = new Map(list.filter((r) => r.family?.trim()).map((r) => [r.area, r.family.trim()]));
  const own = list.filter((r) => r.bucket?.trim()).map((r) => ({ area: r.area, bucket: r.bucket, generated_at: r.grouped_at ?? "" }));
  const bucketOf = new Map(own.map((r) => [r.area, r.bucket]));
  const placed = list.filter((r) => !bucketOf.has(r.area) && familyOf.has(r.area)).flatMap((r) => {
    const bucket = mostCommon([...familyOf].filter(([a, f]) => f === familyOf.get(r.area) && bucketOf.has(a)).map(([a]) => bucketOf.get(a)));
    return bucket ? [{ area: r.area, bucket, generated_at: "", inferred: true }] : [];
  });
  const bucketRows = [...own, ...placed];
  return {
    areas: list.map((r) => [r.area, SUPPORT_TEXT[r.support] ?? COP]),
    names: list.map((r) => r.area),
    buckets: [...new Set(bucketRows.map((r) => r.bucket))],
    bucketRows: list.map((r) => bucketRows.find((b) => b.area === r.area)).filter(Boolean),
    aliases,
    aliasesOf,
    familyOf,
  };
}

// An area name as the list has it: the area another name stands for, or the name itself.
export const canonicalArea = (name, aliases) => aliases.get(key(name)) ?? String(name ?? "").trim();

// Survey answers with other names replaced by the areas they stand for, so they count as one: the picked areas,
// the critical ones, and the expertise of rows from before buckets, which named a single area.
export function canonicalDemand(rows, aliases) {
  if (!aliases.size) return rows;
  const list = (s) => [...new Set(String(s ?? "").split(";").map((a) => a.trim()).filter(Boolean).map((a) => canonicalArea(a, aliases)))].join("; ");
  return rows.map((r) => ({
    ...r,
    expertise: aliases.has(key(r.expertise)) ? canonicalArea(r.expertise, aliases) : r.expertise,
    ...("areas" in r ? { areas: list(r.areas) } : {}),
    ...("critical" in r ? { critical: list(r.critical) } : {}),
  }));
}

// Words that say little about which area it is: "Frontend development" and "front-end" are the same area.
const FILLER = new Set(["development", "developer", "integration", "engineering", "entwicklung", "integrierung", "integration"]);
const sameness = (name) => key(name).normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter((w) => w && !FILLER.has(w)).join("");
// Pairs of names that are probably the same area, each paired with the first name of its kind: a hint for the
// regrouping prompt, never applied without the discipline head's say.
export function likelyDuplicates(names) {
  const first = new Map();
  const pairs = [];
  for (const name of names) {
    const s = sameness(name);
    if (!s) continue;
    if (first.has(s)) pairs.push([first.get(s), name]);
    else first.set(s, name);
  }
  return pairs;
}

// What Set up live sheets reports about the areas tab, checked against the buckets tab (bucketList: its rows).
export function areaIssues(rows, bucketList) {
  const { names, buckets, aliases } = readAreas(rows);
  if (!names.length) return ["No areas yet: fill in the tab"];
  const issues = [];
  if (buckets.length !== BUCKET_COUNT) issues.push(`${buckets.length} bucket${buckets.length === 1 ? "" : "s"}: exactly ${BUCKET_COUNT}, please`);
  const without = rows.filter((r) => r.area?.trim() && !r.bucket?.trim() && !aliases.has(key(r.area))).map((r) => r.area);
  if (without.length) issues.push(`In no bucket: ${without.join(", ")}`);
  const listed = new Set(bucketList.map((r) => r.bucket?.trim()).filter(Boolean));
  const unlisted = buckets.filter((b) => !listed.has(b));
  if (unlisted.length) issues.push(`Not on the buckets tab: ${unlisted.join(", ")}. Add it there, with its examples`);
  const empty = [...listed].filter((b) => !buckets.includes(b));
  if (empty.length) issues.push(`On the buckets tab but no area is in it: ${empty.join(", ")}`);
  return issues;
}

// The areas tab after applying a grouping (groups: [{ name, areas }]): each grouped area takes its bucket and the
// time; areas new to the list join it with community-of-practice support. same: other name -> area, written to
// same_as with the area's bucket; families: area -> family, written where given and left alone elsewhere. Every
// other column is kept as it is.
export function areasAfterGrouping(rows, groups, at, { same = new Map(), families = new Map() } = {}) {
  const bucketOf = new Map(groups.flatMap((g) => g.areas.map((a) => [a, g.name])));
  const keys = [...new Set([...AREA_HEADER, ...rows.flatMap(Object.keys)])];
  const blank = Object.fromEntries(keys.map((k) => [k, ""]));
  const update = (area) => ({
    ...(bucketOf.has(area) ? { bucket: bucketOf.get(area), grouped_at: at } : {}),
    ...(same.has(area) ? { same_as: same.get(area), bucket: bucketOf.get(same.get(area)) ?? "", grouped_at: at } : {}),
    ...(families.has(area) ? { family: families.get(area) } : {}),
  });
  const known = new Set(rows.map((r) => r.area));
  const kept = rows.map((r) => ({ ...blank, ...r, ...update(r.area) }));
  const fresh = [...new Set([...bucketOf.keys(), ...same.keys()])].filter((a) => !known.has(a));
  return [...kept, ...fresh.map((area) => ({ ...blank, area, support: "cop", ...update(area) }))];
}

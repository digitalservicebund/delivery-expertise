// The organisation's areas of expertise live in the discipline sheet's areas tab, edited by discipline heads and
// imported into the aggregate sheet for everyone else. Each row: an area, the bucket it is in, the support it can
// also draw on, and when the portal last grouped it. It is the one place that says which bucket an area is in:
// the portal's regrouping writes the bucket column, and it can be edited by hand. The buckets themselves, with an
// example per working method, are on the buckets tab (src/buckets.js). Pure, so it runs in tests.
export const COP = "the community of practice";
export const SUPPORT_KEY = { "the platform team": "platform", "the legal and IT security team": "legal", [COP]: "cop" };
export const AREA_HEADER = ["area", "bucket", "support", "grouped_at"];
const SUPPORT_TEXT = Object.fromEntries(Object.entries(SUPPORT_KEY).map(([text, key]) => [key, text]));
const BUCKET_COUNT = 10;

// The areas tab as the pages use it: areas as [name, support], their names, the buckets in order of first use,
// and bucketRows: [{ area, bucket, generated_at }] for every area in a bucket, the shape src/buckets.js groups.
export function readAreas(rows) {
  const list = rows.filter((r) => r.area?.trim());
  const bucketRows = list.filter((r) => r.bucket?.trim()).map((r) => ({ area: r.area, bucket: r.bucket, generated_at: r.grouped_at ?? "" }));
  return {
    areas: list.map((r) => [r.area, SUPPORT_TEXT[r.support] ?? COP]),
    names: list.map((r) => r.area),
    buckets: [...new Set(bucketRows.map((r) => r.bucket))],
    bucketRows,
  };
}

// What Set up live sheets reports about the areas tab, checked against the buckets tab (bucketList: its rows).
export function areaIssues(rows, bucketList) {
  const { names, buckets } = readAreas(rows);
  if (!names.length) return ["No areas yet: fill in the tab"];
  const issues = [];
  if (buckets.length !== BUCKET_COUNT) issues.push(`${buckets.length} bucket${buckets.length === 1 ? "" : "s"}: exactly ${BUCKET_COUNT}, please`);
  const without = rows.filter((r) => r.area?.trim() && !r.bucket?.trim()).map((r) => r.area);
  if (without.length) issues.push(`In no bucket: ${without.join(", ")}`);
  const listed = new Set(bucketList.map((r) => r.bucket?.trim()).filter(Boolean));
  const unlisted = buckets.filter((b) => !listed.has(b));
  if (unlisted.length) issues.push(`Not on the buckets tab: ${unlisted.join(", ")}. Add it there, with its examples`);
  const empty = [...listed].filter((b) => !buckets.includes(b));
  if (empty.length) issues.push(`On the buckets tab but no area is in it: ${empty.join(", ")}`);
  return issues;
}

// The areas tab after applying a grouping (groups: [{ name, areas }]): each grouped area takes its bucket and the
// time; areas new to the list join it with community-of-practice support. Every other column is kept as it is.
export function areasAfterGrouping(rows, groups, at) {
  const bucketOf = new Map(groups.flatMap((g) => g.areas.map((a) => [a, g.name])));
  const keys = [...new Set([...AREA_HEADER, ...rows.flatMap(Object.keys)])];
  const blank = Object.fromEntries(keys.map((k) => [k, ""]));
  const known = new Set(rows.map((r) => r.area));
  const kept = rows.map((r) => ({ ...blank, ...r, ...(bucketOf.has(r.area) ? { bucket: bucketOf.get(r.area), grouped_at: at } : {}) }));
  const added = [...bucketOf].filter(([area]) => !known.has(area)).map(([area, bucket]) => ({ ...blank, area, bucket, support: "cop", grouped_at: at }));
  return [...kept, ...added];
}

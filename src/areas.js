// The organisation's areas of expertise live in the discipline sheet's areas tab, edited by discipline heads and
// imported into the aggregate sheet for everyone else. Each row: an area, its default bucket (what the IC form
// asks about until the portal's grouping is applied), the support it can also draw on, and one example per
// working method for the project survey. Pure, so it runs in tests.
export const COP = "the community of practice";
export const SUPPORT_KEY = { "the platform team": "platform", "the legal and IT security team": "legal", [COP]: "cop" };
export const AREA_HEADER = ["area", "default_bucket", "support", "operative", "conceptual", "strategic", "comprehensive"];
const SUPPORT_TEXT = Object.fromEntries(Object.entries(SUPPORT_KEY).map(([text, key]) => [key, text]));
const EXAMPLE_COLUMNS = AREA_HEADER.slice(3);

// The areas tab as the pages use it: areas as [name, support, examples], their names, the default buckets in
// order and the areas each covers.
export function readAreas(rows) {
  const list = rows.filter((r) => r.area?.trim());
  const defaultBucketAreas = {};
  for (const r of list) if (r.default_bucket) (defaultBucketAreas[r.default_bucket] ??= []).push(r.area);
  return {
    areas: list.map((r) => [r.area, SUPPORT_TEXT[r.support] ?? COP, EXAMPLE_COLUMNS.map((c) => r[c] ?? "")]),
    names: list.map((r) => r.area),
    defaultBuckets: Object.keys(defaultBucketAreas),
    defaultBucketAreas,
  };
}

// What Set up live sheets reports about the areas tab.
export function areaIssues(rows) {
  const { names, defaultBuckets } = readAreas(rows);
  if (!names.length) return ["No areas yet: fill in the tab"];
  const issues = [];
  if (defaultBuckets.length !== 10) issues.push(`${defaultBuckets.length} default bucket${defaultBuckets.length === 1 ? "" : "s"}: exactly 10, please`);
  const without = rows.filter((r) => r.area?.trim() && !r.default_bucket?.trim()).map((r) => r.area);
  if (without.length) issues.push(`No default bucket: ${without.join(", ")}`);
  return issues;
}

// Areas named in the buckets tab that the areas tab lacks, as new areas-tab rows: so the list matches the
// buckets. Each takes the default bucket most of its bucket-mates on the list have, so the ten default buckets stay
// ten; with none on the list it is left blank to fill in. Community-of-practice support, no examples yet.
export function areasMissingFrom(areaRows, bucketRows) {
  const defaultOf = new Map(areaRows.filter((r) => r.area?.trim()).map((r) => [r.area, r.default_bucket ?? ""]));
  const missing = new Map();
  for (const { area, bucket } of bucketRows) if (area && !defaultOf.has(area) && !missing.has(area)) missing.set(area, bucket);
  const mateDefault = (bucket) => {
    const counts = new Map();
    for (const r of bucketRows) {
      const d = r.bucket === bucket ? defaultOf.get(r.area) : "";
      if (d) counts.set(d, (counts.get(d) ?? 0) + 1);
    }
    return [...counts].reduce((best, e) => (!best || e[1] > best[1] ? e : best), null)?.[0] ?? "";
  };
  return [...missing].map(([area, bucket]) => ({ area, default_bucket: mateDefault(bucket), support: "cop", operative: "", conceptual: "", strategic: "", comprehensive: "" }));
}

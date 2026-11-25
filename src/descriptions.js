// Descriptions: one short sentence saying what each bucket, area and project type means, kept in a description
// column on the buckets, areas and project-types tabs, plus each bucket's level descriptions: one example of the work
// per working method, shown above the bucket's grid in the project survey. Like regrouping, Gemini proposes them
// through copy and paste in the portal and an admin applies them; this app never calls it. The prompt gives every
// item's current text, so what still fits stays word for word and only stale or missing text changes. Pure, so it
// runs in tests.
import { cellsOf, readBuckets, readExamples, METHOD_COLUMNS } from "./buckets.js";
import { readAreas } from "./areas.js";
import { readProjectTypes } from "./projecttypes.js";

const KINDS = { bucket: "buckets", area: "areas", type: "project types" };
const current = (d) => d?.trim() || "(none yet)";

// Everything to describe, from the buckets, areas and project-types tabs as read. Buckets are the ones areas are in;
// other names for an area are left out, as they mean the same.
export function descriptionItems({ bucketList, areaRows, typeRows }) {
  const descriptionOf = (rows, column) => new Map(rows.filter((r) => r[column]?.trim()).map((r) => [r[column].trim(), r.description ?? ""]));
  const bucketText = descriptionOf(bucketList, "bucket");
  const levels = readExamples(bucketList);
  const areaText = descriptionOf(areaRows, "area");
  const { names, bucketRows, familyOf } = readAreas(areaRows);
  const bucketOf = new Map(bucketRows.map((r) => [r.area, r.bucket]));
  return {
    buckets: readBuckets(bucketRows).groups.map((g) => ({ ...g, description: bucketText.get(g.name) ?? "", levels: levels.get(g.name) ?? ["", "", "", ""] })),
    areas: names.map((name) => ({ name, bucket: bucketOf.get(name) ?? "", family: familyOf.get(name) ?? "", description: areaText.get(name) ?? "" })),
    types: readProjectTypes(typeRows),
  };
}

// items: from descriptionItems.
export function descriptionPrompt({ buckets, areas, types }) {
  const typeNotes = (t) => [t.english, t.areas.length ? `areas: ${t.areas.join(", ")}` : ""].filter(Boolean).join("; ");
  const areaNotes = (a) => [a.bucket && `bucket: ${a.bucket}`, a.family && `family: ${a.family}`].filter(Boolean).join(", ");
  const line = (name, notes, description) => `- ${name}${notes ? ` (${notes})` : ""}: ${current(description)}`;
  const levelLine = (levels) => `  ${METHOD_COLUMNS.map((c, i) => `${c}: ${current(levels[i])}`).join(" | ")}`;
  return [
    "Write a short description for every bucket, area of expertise and project type below, for a software engineering discipline in the public sector. They show as tooltips to engineers and project leads, to say what each name covers.",
    "Each description: English, one plain sentence of at most 25 words, saying what the work is, without repeating the name or saying why it matters. Never use the character |.",
    "A bucket's description sums up its areas. An area's says what it covers, so it can be told apart from the other areas in its bucket and family. A project type's says what a project of that type does; type names are German, with an English translation where given.",
    "Each bucket also has four level descriptions: one example of its work at each working method. Operative: implementing, applying standard methods. Conceptual: planning, shaping and adapting methods. Strategic: setting guidelines, leading across teams. Comprehensive: shaping it across the wider government ecosystem.",
    "Keep each level description short, starting with a verb, for example: Build components to the design system. Make the four clearly different steps for the same bucket.",
    "Everything shows its current text. Keep text that is still accurate word for word; rewrite text that no longer fits its name, areas or bucket; write what is marked (none yet).",
    "",
    "Buckets, each with its level descriptions below it:",
    ...buckets.flatMap((b) => [line(b.name, b.areas.length ? `areas: ${b.areas.join(", ")}` : "", b.description), levelLine(b.levels)]),
    "",
    "Areas:",
    ...areas.map((a) => line(a.name, areaNotes(a), a.description)),
    ...(types.length ? ["", "Project types:", ...types.map((t) => line(t.name, typeNotes(t), t.description))] : []),
    "",
    "Answer with one line for every item, using the names exactly as listed, formatted as:",
    `bucket | name | description | ${METHOD_COLUMNS.join(" | ")}`,
    "area | name | description",
    ...(types.length ? ["type | name | description"] : []),
    "No other text.",
  ].join("\n");
}

const isFormatLine = (name, rest) => name.toLowerCase() === "name" && rest[0]?.toLowerCase() === "description";

// Reads the pasted answer back, leniently like parseBuckets. Names match case-insensitively. Returns
// { bucket, area, type: name -> description, levels: bucket -> its four level descriptions, errors, missing: names
// given no description }. Errors (unknown names, bucket lines without all five texts) mean don't apply it; missing
// ones just keep their current text.
export function parseDescriptions(text, { buckets, areas, types }) {
  const known = {
    bucket: new Map(buckets.map((b) => [b.name.toLowerCase(), b.name])),
    area: new Map(areas.map((a) => [a.name.toLowerCase(), a.name])),
    type: new Map(types.map((t) => [t.name.toLowerCase(), t.name])),
  };
  const out = { bucket: new Map(), levels: new Map(), area: new Map(), type: new Map(), errors: [] };
  for (const line of text.split("\n")) {
    const [tag, name, ...rest] = cellsOf(line);
    const kind = tag?.toLowerCase();
    if (!known[kind] || !name || !rest.some(Boolean) || isFormatLine(name, rest)) continue;
    const canonical = known[kind].get(name.toLowerCase());
    if (!canonical) { out.errors.push(`Not one of the ${KINDS[kind]}: ${name}`); continue; }
    if (kind !== "bucket") { out[kind].set(canonical, rest.join(" | ").trim()); continue; }
    // A bucket line has exactly five texts, so a stray | can't be told apart: it is an error, not a guess.
    if (rest.length !== 5 || !rest.every(Boolean)) { out.errors.push(`${canonical} needs a description and four level descriptions`); continue; }
    out.bucket.set(canonical, rest[0]);
    out.levels.set(canonical, rest.slice(1));
  }
  const missing = Object.keys(known).flatMap((k) => [...known[k].values()].filter((n) => !out[k].has(n)));
  return { ...out, missing };
}

// A tab's rows with new descriptions (descriptions: name -> text), matched on the given column; all else kept.
export const withDescriptions = (rows, column, descriptions) =>
  rows.map((r) => (descriptions.has(r[column]?.trim()) ? { ...r, description: descriptions.get(r[column].trim()) } : r));

// The buckets tab's rows with new level descriptions (levels: bucket -> four texts); all else kept.
export const withLevels = (rows, levels) =>
  rows.map((r) => (levels.has(r.bucket?.trim()) ? { ...r, ...Object.fromEntries(METHOD_COLUMNS.map((c, i) => [c, levels.get(r.bucket.trim())[i]])) } : r));

// What applying would change, for the preview: [{ kind, name, from, to }] for each text that differs. A bucket's
// four level descriptions show as one change, joined by " · ".
export function descriptionChanges(items, parsed) {
  const joined = (levels) => levels.map((l) => l.trim()).filter(Boolean).join(" · ");
  const texts = {
    bucket: items.buckets.map((b) => [b.name, b.description]),
    levels: items.buckets.map((b) => [b.name, joined(b.levels)]),
    area: items.areas.map((a) => [a.name, a.description]),
    type: items.types.map((t) => [t.name, t.description]),
  };
  const proposed = { ...parsed, levels: new Map([...parsed.levels].map(([n, l]) => [n, joined(l)])) };
  return Object.entries(texts).flatMap(([kind, list]) => list
    .filter(([name, from]) => proposed[kind].has(name) && proposed[kind].get(name) !== (from ?? "").trim())
    .map(([name, from]) => ({ kind, name, from: (from ?? "").trim(), to: proposed[kind].get(name) })));
}

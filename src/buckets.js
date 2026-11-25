// The top areas: every area of expertise, including the ones teams add in the survey, grouped into exactly
// BUCKET_COUNT buckets. The IC form asks about the buckets, and the aggregate supply counts per bucket.
// The discipline sheet holds them in two tabs: buckets lists the buckets with an example per working method, and
// the areas tab's bucket column says which bucket each area is in (src/areas.js). Regrouping only proposes, and an
// admin applies. Pure, so it runs in tests. Gemini proposes the grouping, through copy and paste in the portal.
// Groupings are worked with as rows of { area, bucket, generated_at }: readAreas(...).bucketRows.


export const BUCKET_COUNT = 10;
// Where the discipline view counts demand for write-ins that are in no bucket yet. Not a real bucket: the IC form
// never asks about it, so it has no supply, and it disappears once a regrouping places those write-ins.
export const OTHER = "Other (not yet grouped)";
// The buckets tab: one row per bucket, with one example of the work per working method, shown above the bucket's
// grid in the project survey.
export const BUCKET_HEADER = ["bucket", "operative", "conceptual", "strategic", "comprehensive"];
// Where every former bucket went: its closest match in the current buckets. IC answers are stored per bucket
// name, so this keeps older answers counted after a regrouping.
export const HISTORY_HEADER = ["bucket", "now", "changed_at"];
const METHOD_COLUMNS = BUCKET_HEADER.slice(1);

// The buckets tab: bucket -> its four examples.
export const readExamples = (rows) => new Map(rows.filter((r) => r.bucket?.trim()).map((r) => [r.bucket, METHOD_COLUMNS.map((c) => r[c] ?? "")]));

// The buckets that lack any of their four examples, for the set-up to report.
export function bucketsWithoutExamples(buckets, rows) {
  const examples = readExamples(rows);
  return buckets.filter((b) => !(examples.get(b) ?? []).filter(Boolean).length || examples.get(b).some((e) => !e));
}

// The buckets tab after applying a regrouping (result: from compareBuckets; examples: by proposed name, from
// parseBuckets, with the proposed groups). The result keeps their order, so each final name takes its group's.
export function exampleRows(result, proposed, examples) {
  return result.buckets.map((b, i) => {
    const four = examples.get(proposed[i].name) ?? ["", "", "", ""];
    return { bucket: b.name, ...Object.fromEntries(METHOD_COLUMNS.map((c, j) => [c, four[j] ?? ""])) };
  });
}
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

// A grouping's rows as groups, in the order buckets first appear, with when they were generated.
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

// The names the IC form asks about and supply counts: the buckets tab's, in its order, then any other bucket an
// area is in (areaBuckets: bucketRows), so no area goes unasked while its bucket waits to be listed.
export function bucketNames(bucketList, areaBuckets) {
  const listed = bucketList.map((r) => r.bucket?.trim()).filter(Boolean);
  return [...new Set([...listed, ...areaBuckets.map((r) => r.bucket)])];
}

// Supply is counted per bucket, so the discipline view counts demand per bucket too: each demand row's area, and
// each planned adjustment's subject, becomes its bucket. Areas in no bucket, and domain expertise, stay as they are.
// Prototype ratings and activity are per area as well, so they are passed in and mapped too; live supply already
// comes per bucket and is left out.
// history: the bucket-history tab, so rows naming an old bucket (such as a planned adjustment) follow it too.
// other: put demand that fits no bucket (write-ins not grouped yet) in one OTHER bucket, so the discipline view ranks
// them together rather than each on its own. The survey leaves it off: a write-in's section shows its own answers.
export function inBuckets(data, rows, history = [], { other = false } = {}) {
  const bucketOf = new Map(rows.filter((r) => r.area && r.bucket).map((r) => [r.area, r.bucket]));
  if (!bucketOf.size) return data;
  const moved = renamedTo(history);
  const current = new Set(bucketOf.values());
  // A row naming a current bucket (survey answers are per bucket) keeps it; an area or former bucket follows.
  const to = (name) => (current.has(name) ? name : bucketOf.get(name) ?? moved.get(name) ?? name);
  const placed = (name) => current.has(name) || bucketOf.has(name) || moved.has(name) || name === "Domain expertise";
  // Survey answers name their areas, so they follow the areas: to the bucket now holding most of them, a tie
  // staying where the row was saved. Rows that name no area in a bucket fall back to their stored name.
  const toByAreas = (r) => {
    const stored = to(r.expertise);
    const listed = String(r.areas ?? "").split(";").map((a) => a.trim());
    const buckets = listed.map((a) => bucketOf.get(a)).filter(Boolean);
    if (buckets.length) return mostCommon(buckets, stored);
    return other && !placed(r.expertise) ? OTHER : stored;
  };
  const out = {};
  for (const [name, list] of Object.entries(data)) {
    out[name] = name === "plan"
      ? list.map((r) => (r.kind === "adjust" ? { ...r, subject: to(r.subject) } : r))
      : list.map((r) => ({ ...r, expertise: name === "demand" ? toByAreas(r) : to(r.expertise) }));
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

// The most frequent value, ties going to `preferred` when it is among them, else the first seen; undefined for none.
export function mostCommon(values, preferred) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  const top = Math.max(0, ...counts.values());
  if (preferred !== undefined && counts.get(preferred) === top) return preferred;
  return [...counts].find(([, n]) => n === top)?.[0];
}

export const renamedTo =(history) => new Map(history.filter((r) => r.bucket && r.now).map((r) => [r.bucket, r.now]));

// Current bucket -> the former buckets that went into it.
export function aliasesOf(history) {
  const out = {};
  for (const [bucket, now] of renamedTo(history)) (out[now] ??= []).push(bucket);
  return out;
}

// What the portal prompts admins about: areas in no bucket, and a grouping older than a survey round.
export function pending(currentRows, areas, now = new Date()) {
  const { groups, generatedAt } = readBuckets(currentRows);
  const grouped = new Set(groups.flatMap((g) => g.areas));
  const age = generatedAt ? (now - new Date(generatedAt)) / 86400000 : 0;
  return { ungrouped: areas.filter((a) => !grouped.has(a)), stale: age > STALE_DAYS, empty: !groups.length };
}

// People asked for per area in the latest survey round: what the buckets are sized by. A row naming several areas
// splits its people evenly across them. Platform answers aren't a team's own demand, and domain expertise is no area.
export function areaDemand(demand) {
  const latest = demand.map((r) => r.quarter ?? "").sort().at(-1);
  const out = new Map();
  for (const r of demand.filter((r) => (r.quarter ?? "") === latest)) {
    const people = Number(r.people);
    const areas = demandAreas(r);
    if (!Number.isFinite(people) || !areas.length) continue;
    for (const a of areas) out.set(a, (out.get(a) ?? 0) + people / areas.length);
  }
  return out;
}

// Teams that flagged each area critical in the latest survey round (the critical column), each team once per area.
export function areaCritical(demand) {
  const latest = demand.map((r) => r.quarter ?? "").sort().at(-1);
  const teams = new Map();
  for (const r of demand.filter((r) => (r.quarter ?? "") === latest)) {
    for (const a of String(r.critical ?? "").split(";").map((x) => x.trim()).filter(Boolean)) {
      (teams.get(a) ?? teams.set(a, new Set()).get(a)).add(r.team);
    }
  }
  return new Map([...teams].map(([a, t]) => [a, t.size]));
}

// Teams that answered "critical" coverage for each bucket in the latest survey round: the gap blocks delivery.
// Per bucket, not per area: coverage is answered per bucket. A bucket renamed since counts under its current name.
export function bucketGaps(demand, history) {
  const latest = demand.map((r) => r.quarter ?? "").sort().at(-1);
  const moved = renamedTo(history);
  const teams = new Map();
  for (const r of demand.filter((r) => (r.quarter ?? "") === latest && r.coverage === "critical" && r.expertise !== "Domain expertise")) {
    const bucket = moved.get(r.expertise) ?? r.expertise;
    (teams.get(bucket) ?? teams.set(bucket, new Set()).get(bucket)).add(r.team);
  }
  return new Map([...teams].map(([b, t]) => [b, t.size]));
}

// People asked for per project type in the latest survey round, like areaDemand: a row naming several types splits
// its people evenly across them. Rows naming no type count for none.
export function typeDemand(demand) {
  const latest = demand.map((r) => r.quarter ?? "").sort().at(-1);
  const out = new Map();
  for (const r of demand.filter((r) => (r.quarter ?? "") === latest)) {
    const people = Number(r.people);
    const types = String(r.project_types ?? "").split(";").map((t) => t.trim()).filter(Boolean);
    if (!Number.isFinite(people) || !types.length) continue;
    for (const t of types) out.set(t, (out.get(t) ?? 0) + people / types.length);
  }
  return out;
}

const percent = (n, total) => `${Math.round((100 * n) / total)}%`;

// A project type's line in the prompt: its translation, its share of demand, and the areas it usually needs.
function typeLine({ name, english, areas }, demand, total) {
  const notes = [...(english ? [english] : []), ...(total ? [percent(demand.get(name) ?? 0, total)] : [])];
  return `- ${name}${notes.length ? ` (${notes.join(", ")})` : ""}${areas.length ? `: ${areas.join(", ")}` : ""}`;
}

// The project types section: the portfolio's own terms, for naming buckets that mainly serve one or two of them.
function typeSection(types, demand) {
  if (!types.length) return [];
  const total = [...demand.values()].reduce((a, b) => a + b, 0);
  return [
    "",
    `Project types: the kinds of project the portfolio runs, named in its official terms${total ? ", each with its share of the people projects asked for last quarter" : ""}, and the areas each usually needs:`,
    ...types.map((t) => typeLine(t, demand, total)),
    "Where a bucket's areas mainly serve one project type, or a few closely related ones, and those types carry a meaningful share of demand, consider using the official term in the bucket's name instead of an outside term that means much the same (for example a consultancy's jargon).",
    "This is a hint, not a rule: use a type's name only where it fits the bucket's skills, and never name a bucket after a type with little demand.",
    "Bucket names are in English: where a type has an English translation (in brackets above), use the translation, never the German term, whether the type is one word or several. A type with no translation (such as Discovery) is already English.",
  ];
}
// What an area's line in the prompt says about it: its share of demand, and the teams it is critical for.
function areaNotes(area, demand, total, critical) {
  const teams = critical.get(area) ?? 0;
  const notes = [
    ...(total ? [percent(demand.get(area) ?? 0, total)] : []),
    ...(teams ? [`critical for ${teams} team${teams === 1 ? "" : "s"}`] : []),
  ];
  return notes.length ? `- ${area} (${notes.join(", ")})` : `- ${area}`;
}

// The grouping is proposed by Gemini, in the admin's own browser tab: the portal copies this prompt, the admin
// pastes it into Gemini and pastes the answer back. Current buckets go in, so stable groups keep their names.
// demand: from areaDemand. With any, each area carries its share, and buckets are sized by it, so a heavily
// demanded field gets several buckets and fields nobody asks for share one, rather than each taking a slot.
// critical: from areaCritical. Areas teams can't do without are named, so they aren't buried in an unrelated bucket.
// opts.familyOf: area -> family. Families are listed, to keep each in one bucket, and Gemini gives every area one.
// opts.duplicates: likely pairs of names for the same area (likelyDuplicates in src/areas.js), for Gemini to confirm.
// gaps: from bucketGaps. Current buckets critically understaffed are marked, so Gemini weighs keeping them
// recognisable: a weighting, not a lock, as the data may still call for a change.
// opts.projectTypes: from readProjectTypes, weighted by opts.typeDemand (typeDemand), so a bucket serving a
// heavily demanded type may take the portfolio's own term for it rather than an outside one.
// Demand sizing alone pushes Gemini to split a busy field into near-duplicates (Frontend development + React), so
// the prompt ranks distinct buckets above evenly sized ones.
// Models drift off a stated count, so the prompt makes it hard to: the names come first as a numbered list, every
// later line may use only those, and the answer ends with a count check. parseBuckets still enforces it.
export function bucketPrompt(areas, current, demand = new Map(), critical = new Map(), gaps = new Map(), { familyOf = new Map(), duplicates = [], projectTypes = [], typeDemand = new Map() } = {}, count = Math.min(BUCKET_COUNT, areas.length)) {
  const inList = new Set(areas);
  const families = [...Map.groupBy([...familyOf].filter(([a]) => inList.has(a)), ([, f]) => f)].map(([f, pairs]) => `${f}: ${pairs.map(([a]) => a).join(", ")}`);
  const total = [...demand.values()].reduce((a, b) => a + b, 0);
  const anyCritical = areas.some((a) => critical.get(a));
  const anyGap = current.some((g) => gaps.get(g.name));
  const gapNote = (name) => {
    const n = gaps.get(name) ?? 0;
    return n ? ` (critically understaffed for ${n} team${n === 1 ? "" : "s"})` : "";
  };
  return [
    `Group these areas of software engineering expertise into exactly ${count} buckets of related skills, as an engineering discipline would staff and train for them. Some names are German.`,
    `The number of buckets is fixed at exactly ${count}: not ${count - 1}, not ${count + 1}. An answer with any other number is unusable.`,
    "Every area goes in exactly one bucket, except another name for an area (see below), and no bucket is empty. Keep a current bucket's name, spelled exactly the same, wherever the bucket still fits: every name you change is a rename. Name new buckets after their most typical area.",
    ...(current.length ? [
      "A bucket keeps its identity through its name: never give a current bucket's name to a different bucket, and never rename two buckets so that one takes over the other's name or scope (such as renaming Backend development to APIs & integration and Data & AI to Backend development).",
      "Where the areas need to shift, move areas and families between buckets and keep the names; rename only a bucket whose own core areas stay with it.",
    ] : []),
    ...(total ? [
      "Each area shows its share of demand: the people projects asked for last quarter. Size the buckets by demand, so each holds a comparable share:",
      "split a related field into several buckets where its areas are in high demand, and merge related fields into one bucket where demand for them is low.",
      "Areas with little or no demand never get a bucket of their own; put them with their nearest related areas. Don't keep a current bucket only because it exists.",
    ] : []),
    "Every bucket must be clearly distinct from every other: a person should never wonder which of two buckets they belong in. Never make a bucket a subset or specialisation of another, such as a framework, language or tool next to the field it belongs to (React next to Frontend development, Kubernetes next to Platform engineering). A technology goes inside its field's bucket.",
    "This overrides sizing by demand: where splitting a busy field would give two such overlapping buckets, keep the field whole and split or separate something else instead.",
    ...(anyCritical ? [
      "Some areas say how many project teams marked them critical: the team can't deliver without them. Whatever their demand, put each in a bucket of closely related areas whose name makes it easy to recognise, never in an unrelated catch-all bucket.",
    ] : []),
    "",
    "Areas:",
    ...areas.map((a) => areaNotes(a, demand, total, critical)),
    ...(current.length ? ["", "Current buckets:", ...current.map((g) => `${g.name}${gapNote(g.name)}: ${g.areas.join(", ")}`)] : []),
    ...(families.length ? [
      "",
      "Families: closely related areas, finer than buckets. Keep each family in the same bucket, unless it is too big for one bucket by itself:",
      ...families,
    ] : []),
    ...(duplicates.length ? [
      "",
      "These look like the same area under different names. Confirm the ones that are, and look for others:",
      ...duplicates.map(([a, b]) => `${a} ~ ${b}`),
    ] : []),
    ...typeSection(projectTypes, typeDemand),
    ...(anyGap ? [
      "",
      "Buckets marked critically understaffed are ones project teams can't currently deliver without, and the discipline is staffing for them under those names.",
      "Be somewhat more cautious about renaming, splitting or merging them: prefer keeping their name and core areas. You can still change them where the areas or demand clearly call for it.",
    ] : []),
    "",
    `Answer in five parts. First, the ${count} bucket names, numbered 1 to ${count}, one per line, as: 1. name`,
    `Before going on, count them: exactly ${count}. With more, merge the two most closely related; with fewer, split the largest. Repeat until there are ${count}.`,
    "Then check every pair: if one bucket is a subset of another, or their names could swap, merge them and split elsewhere.",
    "",
    "Second, one line per area, formatted as: area | bucket",
    "Use the area names exactly as listed, and only the bucket names from your numbered list, spelled the same.",
    "",
    "Third, for each of those buckets, one line with an example of the work at each working method, formatted as:",
    "bucket | operative | conceptual | strategic | comprehensive",
    "Operative: implementing, applying standard methods. Conceptual: planning, shaping and adapting methods. Strategic: setting guidelines, leading across teams. Comprehensive: shaping it across the wider government ecosystem.",
    "Keep each example short, starting with a verb, for example: Build components to the design system.",
    "",
    "Fourth, one line for each area that is only another name for another area on the list (the same thing, spelled or worded differently, not merely related), formatted as:",
    "same | other name | area",
    "Such an other name gets no line in the second part. Leave this part empty if there are none.",
    "",
    "Fifth, one line per area giving its family: a short name for a few closely related areas, finer than a bucket, keeping the families above where they still fit.",
    "Keep families narrow: one tight theme, never two joined by \"&\" (not Governance & compliance), and never so broad that a family becomes a shadow bucket covering most of its bucket. Split an existing family that has grown too broad.",
    "A family of one area is fine, and better than stretching a family's meaning to hold an area that doesn't quite fit. Formatted as:",
    "family | area | family",
    "No other text."
  ].join("\n");
}

// A follow-up for the same Gemini chat when an answer can't be used (errors and groups: from parseBuckets). With
// the wrong number of buckets it names the ones used, and whether to merge or split.
export function fixPrompt(errors, groups, count) {
  const n = groups.length;
  return [
    "Your answer can't be used:",
    ...errors.map((e) => `- ${e}`),
    ...(n === count ? [] : [
      "",
      `You used ${n} buckets: ${groups.map((g) => g.name).join(", ")}.`,
      n > count
        ? `Merge the most closely related ones until exactly ${count} remain.`
        : `Split the largest ones until there are exactly ${count}.`,
    ]),
    "",
    `Answer again in full, in the same five parts and format, with exactly ${count} buckets. Count them before answering.`,
  ].join("\n");
}

// Reads the pasted answer back: one "area | bucket" per line, tolerating markdown tables, bold, code fences and
// chatter, then "bucket | operative | conceptual | strategic | comprehensive" lines with examples. Area names match
// case-insensitively. Returns { groups, errors, examples: bucket -> 4 examples }; any error means don't apply it.
// count: how many buckets there must be. Ten, or one per area when there are fewer areas.
export function parseBuckets(text, areas, count = Math.min(BUCKET_COUNT, areas.length)) {
  const canonical = new Map(areas.map((a) => [a.toLowerCase(), a]));
  const bucketOf = new Map();
  const errors = [];
  const unknown = [];
  const examples = new Map();
  const same = new Map();
  const families = new Map();
  const tagged = [];
  for (const line of text.split("\n")) {
    const cells = line.replace(/[*`]/g, "").trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
    const tag = cells[0]?.toLowerCase();
    if (cells.length === 3 && (tag === "same" || tag === "family") && cells[1] && cells[2]) {
      // The format lines themselves ("same | other name | area") name no area, so they are skipped like headers.
      if (canonical.has(cells[1].toLowerCase())) tagged.push([tag, canonical.get(cells[1].toLowerCase()), cells[2]]);
      continue;
    }
    if (cells.length === 5 && cells.every(Boolean) && cells[0].toLowerCase() !== "bucket" && !/^:?-+:?$/.test(cells[1])) {
      examples.set(cells[0].toLowerCase(), cells.slice(1));
      continue;
    }
    if (cells.length !== 2 || !cells[0] || !cells[1] || /^-+$/.test(cells[0])) continue;
    if (cells[0].toLowerCase() === "area" && cells[1].toLowerCase() === "bucket") continue;
    const area = canonical.get(cells[0].toLowerCase());
    if (!area) { unknown.push(cells[0]); continue; }
    const before = bucketOf.get(area);
    if (before && before !== cells[1]) errors.push(`${area} is in more than one bucket: ${before}, ${cells[1]}`);
    else bucketOf.set(area, cells[1]);
  }
  // Other names: each must point to an area that is itself no other name. A valid one needs no bucket.
  // One pointing at an area is spared the missing-bucket error even when invalid: its own error says what to fix.
  const named = new Set(tagged.filter(([t]) => t === "same").map(([, a]) => a));
  const pointsAtArea = new Set();
  for (const [t, area, value] of tagged) {
    if (t === "family") { families.set(area, value); continue; }
    const main = canonical.get(value.toLowerCase());
    if (main) pointsAtArea.add(area);
    if (!main) errors.push(`Other name for something that isn't an area: ${area} → ${value}`);
    else if (named.has(main)) errors.push(`Other name for another other name: ${area} → ${main}`);
    else { same.set(area, main); bucketOf.delete(area); }
  }
  if (unknown.length) errors.push(`Not one of the areas: ${unknown.join(", ")}`);
  const missing = areas.filter((a) => !bucketOf.has(a) && !pointsAtArea.has(a));
  if (missing.length) errors.push(`Missing: ${missing.join(", ")}`);
  const groups = readBuckets([...bucketOf].map(([area, bucket]) => ({ area, bucket }))).groups.sort((a, b) => byName(a.name, b.name));
  if (groups.length !== count) errors.push(`${groups.length} bucket${groups.length === 1 ? "" : "s"}: exactly ${count}, please`);
  // Examples keyed by the bucket names the grouping uses, matched case-insensitively.
  const byGroup = new Map(groups.filter((g) => examples.has(g.name.toLowerCase())).map((g) => [g.name, examples.get(g.name.toLowerCase())]));
  const noExamples = groups.map((g) => g.name).filter((n) => !byGroup.has(n));
  if (noExamples.length) errors.push(`No examples for: ${noExamples.join(", ")}`);
  return { groups, errors, examples: byGroup, same, families };
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

// Compares a proposed grouping with the current buckets. Each proposed group is matched to the current bucket it
// overlaps most, and takes the proposed name: the prompt asks Gemini to keep a current name where the bucket still
// fits, so a different name is a deliberate rename. Returns the buckets as they would be written, and what changed.
export function compareBuckets(current, proposed) {
  const of = match(current, proposed);
  const used = new Set();
  const buckets = proposed.map((p, i) => {
    const previous = of.has(i) ? current[of.get(i)].name : null;
    let name = p.name;
    for (let k = 2; used.has(name); k++) name = `${p.name} (${k})`;
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
// familyOf: area -> family. Words matching a family's name count for the bucket most of the family is in, so
// "Frontend testing" finds the bucket React and TypeScript ("Web frontend") are in.
export function suggestBuckets(name, rows, familyOf = new Map()) {
  const exact = rows.find((r) => r.area.toLowerCase() === name.trim().toLowerCase());
  if (exact) return [exact.bucket];
  const typed = words(name);
  const score = new Map();
  const bump = (bucket, s) => s && score.set(bucket, Math.max(score.get(bucket) ?? 0, s));
  for (const r of rows) bump(r.bucket, Math.max(shared(typed, words(r.area)), shared(typed, words(r.bucket))));
  const bucketOf = new Map(rows.map((r) => [r.area, r.bucket]));
  for (const [family, members] of Map.groupBy([...familyOf], ([, f]) => f)) {
    const home = mostCommon(members.map(([a]) => bucketOf.get(a)).filter(Boolean));
    if (home) bump(home, shared(typed, words(family)));
  }
  return [...score].sort((a, b) => b[1] - a[1]).map(([bucket]) => bucket);
}

// Families a grouping splits across buckets (groups: [{ name, areas }]), for the preview to point out.
export function splitFamilies(groups, familyOf) {
  const bucketsOf = new Map();
  for (const g of groups) for (const a of g.areas) {
    const f = familyOf.get(a);
    if (f) bucketsOf.set(f, new Set([...(bucketsOf.get(f) ?? []), g.name]));
  }
  return [...bucketsOf].filter(([, b]) => b.size > 1).map(([family, b]) => ({ family, buckets: [...b].sort(byName) }));
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

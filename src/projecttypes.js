// Project types: what kind of work a project does. The project survey asks for up to five before the word cloud,
// and each picks the areas of expertise it usually needs. The mapping lives in the discipline sheet's project-types
// tab, one row per type: `project_type | areas | english_translation | description`, the areas separated by semicolons
// or commas. An area can sit under several types. Types are named in German, as the portfolio names them; the optional
// English translation shows under the name, and the optional description (what the type means) as its tooltip. Imported into the aggregate sheet like the areas
// tab. Pure, so it runs in tests.
export const PROJECT_TYPE_HEADER = ["project_type", "areas", "english_translation", "description"];
export const MAX_PROJECT_TYPES = 5;
// What Set up live sheets writes to an empty tab: the types, with their areas left for discipline heads to fill in.
export const PROJECT_TYPE_SEED = [
  ["Steuerungsunterstützung", "Steering support"], ["Produktentwicklung", "Product development"],
  ["Befähigung", "Enablement"], ["Umsetzungsberatung", "Implementation consulting"],
  ["Standardentwicklung", "Standards development"], ["Umsetzung", "Implementation"],
  ["Strategiebegleitung", "Strategy support"], ["Regelungsbegleitung", "Regulatory support"],
  ["Geschäftsstelle", "Coordination office"], ["Weiterentwicklung und Betrieb", "Further development and operations"],
  ["Discovery", ""], ["Others", ""],
].map(([project_type, english_translation]) => ({ project_type, areas: "", english_translation, description: "" }));

// Semicolons, commas or new lines: no area name has a comma, and commas are what people type.
// Prototype only: a best guess at each type's areas, from the dummy data's area list (src/dummy.js). Load dummy data
// fills types left blank on the discipline sheet with these, in the prototype sheet's copy only. "Others" has none.
const GUESSED_AREAS = {
  Steuerungsunterstützung: ["Data analysis", "Software architecture", "Technical documentation"],
  Produktentwicklung: ["Feature development", "Frontend development", "Backend development", "Design systems", "Test automation", "Accessibility"],
  Befähigung: ["Developer experience", "Technical documentation", "Open source", "Design systems"],
  Umsetzungsberatung: ["Software architecture", "APIs & integration", "Technical discovery", "IT security compliance"],
  Standardentwicklung: ["APIs & integration", "Open source", "Technical documentation", "Software architecture", "Accessibility"],
  Umsetzung: ["Feature development", "Backend development", "Frontend development", "APIs & integration", "CI/CD", "Test automation"],
  Strategiebegleitung: ["Technical discovery", "Software architecture", "AI engineering", "Data analysis"],
  Regelungsbegleitung: ["Data protection", "IT security compliance", "Technical discovery", "Prototyping"],
  Geschäftsstelle: ["Technical documentation", "Data analysis"],
  "Weiterentwicklung und Betrieb": ["Maintenance", "Operations", "On-call & incident response", "Release management", "Observability", "Support", "Legacy modernisation", "Cloud infrastructure"],
  Discovery: ["Technical discovery", "Prototyping", "Data analysis", "Software architecture"],
};

// The prototype's project-types rows: the tab's (or the seed's, if it is empty), with blank types given the guesses
// that are on the area list. Types with areas filled in are kept as they are.
export function dummyProjectTypes(rows, areaNames) {
  const known = new Set(areaNames.map((n) => n.toLowerCase()));
  const base = readProjectTypes(rows).length ? rows.filter((r) => r.project_type?.trim()) : PROJECT_TYPE_SEED;
  return base.map((r) => (split(r.areas).length ? r : {
    project_type: r.project_type,
    areas: (GUESSED_AREAS[r.project_type.trim()] ?? []).filter((a) => known.has(a.toLowerCase())).join("; "),
    english_translation: r.english_translation ?? "",
    description: r.description ?? "",
  }));
}

const split = (s = "") => s.split(/[;,\n]/).map((a) => a.trim()).filter(Boolean);

// The tab as the survey uses it: [{ name, areas, english, description }], in the tab's order. A type named twice gets
// both rows' areas and the first translation and description given.
export function readProjectTypes(rows) {
  const types = new Map();
  for (const r of rows) {
    const name = r.project_type?.trim();
    if (!name) continue;
    const type = types.get(name) ?? { name, areas: [], english: "", description: "" };
    for (const a of split(r.areas)) if (!type.areas.includes(a)) type.areas.push(a);
    type.english ||= r.english_translation?.trim() ?? "";
    type.description ||= r.description?.trim() ?? "";
    types.set(name, type);
  }
  return [...types.values()];
}

// Which of the chosen types suggest each area: area name (lower case) -> type names, in the order they were chosen.
export function typesByArea(types, chosen) {
  const byArea = new Map();
  for (const name of chosen) {
    for (const area of types.find((t) => t.name === name)?.areas ?? []) {
      const key = area.toLowerCase();
      byArea.set(key, [...(byArea.get(key) ?? []), name]);
    }
  }
  return byArea;
}

// What Set up live sheets reports about the tab: types with no areas, and areas the area list doesn't have.
export function projectTypeIssues(rows, areaNames) {
  const types = readProjectTypes(rows);
  if (!types.length) return ["No project types yet: fill in the tab"];
  const known = new Set(areaNames.map((n) => n.toLowerCase()));
  const issues = [];
  const empty = types.filter((t) => !t.areas.length).map((t) => t.name);
  if (empty.length) issues.push(`No areas for: ${empty.join(", ")}`);
  const unknown = [...new Set(types.flatMap((t) => t.areas).filter((a) => !known.has(a.toLowerCase())))];
  if (unknown.length) issues.push(`Not on the areas tab, so never suggested: ${unknown.join(", ")}`);
  return issues;
}

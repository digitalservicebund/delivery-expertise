// Project types: what kind of work a project does. The project survey asks for up to three before the word cloud,
// and each picks the areas of expertise it usually needs. The mapping lives in the discipline sheet's project-types
// tab, one row per type: `project_type | areas`, the areas separated by semicolons or commas. An area can sit under several types.
// Imported into the aggregate sheet like the areas tab. Pure, so it runs in tests.
export const PROJECT_TYPE_HEADER = ["project_type", "areas"];
export const MAX_PROJECT_TYPES = 3;
// What Set up live sheets writes to an empty tab: the types, with their areas left for discipline heads to fill in.
export const PROJECT_TYPE_SEED = [
  "Steering support", "Product development", "Enablement", "Implementation consulting", "Standards development",
  "Implementation", "Strategy support", "Regulatory support", "Coordination office", "Further development and operations",
  "Discovery", "Other",
].map((project_type) => ({ project_type, areas: "" }));

// Semicolons, commas or new lines: no area name has a comma, and commas are what people type.
// Prototype only: a best guess at each type's areas, from the dummy data's area list (src/dummy.js). Load dummy data
// fills types left blank on the discipline sheet with these, in the prototype sheet's copy only. "Other" has none.
const GUESSED_AREAS = {
  "Steering support": ["Data analysis", "Software architecture", "Technical documentation"],
  "Product development": ["Feature development", "Frontend development", "Backend development", "Design systems", "Test automation", "Accessibility"],
  Enablement: ["Developer experience", "Technical documentation", "Open source", "Design systems"],
  "Implementation consulting": ["Software architecture", "APIs & integration", "Technical discovery", "IT security compliance"],
  "Standards development": ["APIs & integration", "Open source", "Technical documentation", "Software architecture", "Accessibility"],
  Implementation: ["Feature development", "Backend development", "Frontend development", "APIs & integration", "CI/CD", "Test automation"],
  "Strategy support": ["Technical discovery", "Software architecture", "AI engineering", "Data analysis"],
  "Regulatory support": ["Data protection", "IT security compliance", "Technical discovery", "Prototyping"],
  "Coordination office": ["Technical documentation", "Data analysis"],
  "Further development and operations": ["Maintenance", "Operations", "On-call & incident response", "Release management", "Observability", "Support", "Legacy modernisation", "Cloud infrastructure"],
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
  }));
}

const split =(s = "") => s.split(/[;,\n]/).map((a) => a.trim()).filter(Boolean);

// The tab as the survey uses it: [{ name, areas }], in the tab's order. A type named twice gets both rows' areas.
export function readProjectTypes(rows) {
  const types = new Map();
  for (const r of rows) {
    const name = r.project_type?.trim();
    if (!name) continue;
    const areas = types.get(name) ?? [];
    for (const a of split(r.areas)) if (!areas.includes(a)) areas.push(a);
    types.set(name, areas);
  }
  return [...types].map(([name, areas]) => ({ name, areas }));
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

// Best guess at how relevant each area of expertise is to a team, for sizing the survey's word cloud.
// Pure: the page passes in counts it has already derived, keyed by area.

// What the team itself asked for last time counts most, then the work it booked, then who on it is rated.
// Discipline-wide demand only breaks ties for a team with no history.
const WEIGHT = { demand: 1, days: 1 / 20, rated: 0.5, org: 0.05 };

// signals.team: { demand: key -> people asked for, days: key -> person-days booked, rated: key -> people rated }
// signals.org: key -> people asked for across all teams. Returns key -> 0..1, the strongest at 1.
export function relevance(keys, { team = {}, org = {} } = {}) {
  const raw = Object.fromEntries(keys.map((k) => [k,
    (team.demand?.[k] ?? 0) * WEIGHT.demand
    + (team.days?.[k] ?? 0) * WEIGHT.days
    + (team.rated?.[k] ?? 0) * WEIGHT.rated
    + (org[k] ?? 0) * WEIGHT.org]));
  const max = Math.max(0, ...Object.values(raw));
  return Object.fromEntries(keys.map((k) => [k, max ? raw[k] / max : 0]));
}

const norm = (s) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();
// Every word typed appears somewhere in the name, as the start of a word.
export function matches(name, query) {
  const words = ` ${norm(name)}`;
  return norm(query).split(" ").filter(Boolean).every((w) => words.includes(` ${w}`));
}

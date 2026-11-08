// Turns live data into the shapes the model takes from the dummy CSVs, so the discipline view runs unchanged.
// Pure, so it runs in tests.
import { teamName } from "./teams.js";

// The anonymous supply counts belong to no team. Ratings carry this as their team, so they count towards the
// whole discipline only: a project or team filter leaves them out.
export const DISCIPLINE_WIDE = "Discipline-wide (anonymous self-assessments)";

// The IC form's levels, from the aggregate sheet's supply columns, as rating levels.
const LEVEL_OF = { Learning: 2, Operative: 3, Conceptual: 4, Strategic: 5, Comprehensive: 6 };

export const quarterOf = (date) => `${date.getFullYear()}-Q${Math.floor(date.getMonth() / 3) + 1}`;

const isEngineering = (department = "") => /^Engineering(\s*\/|$)/.test(department.trim());

// The ds-staffing snapshot, as pasted into the discipline sheet: active engineers only, each once, in the team
// with their largest assignment. Emails and names stay behind; people become P001, P002, … in snapshot order.
// Roles: a tech lead in their main team is its tech lead. A tech lead who is also in the project leadership team,
// in any team of the same engagement, is the engagement's lead. People leads aren't in the snapshot.
const hasRole = (r, role) => (r["Roles in Team"] ?? "").split(";").some((x) => x.trim().toLowerCase() === role);
export function staffingFromSnapshot(rows, quarter) {
  const active = rows.filter((r) => r.Status === "Active" && isEngineering(r.Department) && r.Email);
  const main = new Map();
  for (const r of active) {
    const best = main.get(r.Email);
    if (!best || Number(r["% Assignment in Team"]) > Number(best["% Assignment in Team"])) main.set(r.Email, r);
  }
  const inEngagement = (r) => active.filter((x) => x.Email === r.Email && x.Engagement === r.Engagement);
  const leadsEngagement = (r) => hasRole(r, "tech lead") && inEngagement(r).some((x) => hasRole(x, "project leadership team"));
  return [...main.values()].map((r, i) => ({
    quarter,
    person: `P${String(i + 1).padStart(3, "0")}`,
    project: r.Engagement,
    team: teamName({ project: r.Engagement, team: r.Team }),
    level: r.Level,
    role: hasRole(r, "tech lead") ? "tech-lead" : "engineer",
    people_lead: "",
    engagement_lead: leadsEngagement(r) ? "yes" : "",
  }));
}

// The aggregate sheet's supply counts as self-ratings by made-up respondents S1, S2, … per area. Respondent
// numbers restart in every area, so the same number in two areas says nothing about one person.
// A blank count (suppressed, or nobody) adds no one.
// Supply rows for the domain grid are labelled "Domain expertise: <domain>".
const domainOf = (area) => (area.startsWith("Domain expertise: ") ? { expertise: "Domain expertise", domain: area.slice(18) } : { expertise: area, domain: "" });
export function assessmentsFromSupply(rows, quarter) {
  return rows.flatMap((r) => {
    let n = 0;
    return Object.entries(LEVEL_OF).flatMap(([column, level]) => Array.from({ length: Number(r[column]) || 0 }, () => ({
      quarter, respondent: `S${++n}`, ...domainOf(r.area), assessor: "self", level, team: DISCIPLINE_WIDE,
    })));
  });
}

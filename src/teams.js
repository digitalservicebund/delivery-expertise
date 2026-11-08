// Who answers the project survey for which team, from the projects sheet's `teams` tab:
// one row per person and team, with their roles in it. Pure, so it runs in tests.

export const TEAMS_HEADER = ["project", "team", "email", "role"];

// The ds-staffing snapshot export's columns (utils/export-snapshot.ts there), as pasted into the discipline
// sheet's `staffing` tab. Semicolon-separated; several roles share one field, joined by ";".
export const STAFFING_HEADER = ["Email", "First Name", "Last Name", "Seniority", "Level", "FTE", "Employment Type",
  "Engagement Type", "Business Unit", "Engagement", "Team", "Department", "Roles in Team", "% Assignment in Team", "Status"];

// The teams list as an import from that tab: only active people who have a role in the team.
// Only these four columns leave the discipline sheet. Names, levels and FTE stay behind.
export function teamsFormula(disciplineSheetId) {
  const col = (name) => `Col${STAFFING_HEADER.indexOf(name) + 1}`;
  const last = String.fromCharCode(64 + STAFFING_HEADER.length);
  const pick = [["Engagement", "project"], ["Team", "team"], ["Email", "email"], ["Roles in Team", "role"]];
  const query = `select ${pick.map(([c]) => col(c)).join(", ")} where ${col("Roles in Team")} <> '' and ${col("Status")} = 'Active' `
    + `label ${pick.map(([c, as]) => `${col(c)} '${as}'`).join(", ")}`;
  return `=QUERY(IMPORTRANGE("${disciplineSheetId}", "staffing!A:${last}"), "${query}", 1)`;
}

// Named like the staffing data: "Project / Team", or just the project when it has one team.
export const teamName = (r) => (r.team ? `${r.project} / ${r.team}` : r.project);

const sameEmail = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

// The teams a person is listed in, each with their roles there, sorted by name.
export function teamsOf(rows, email) {
  if (!email) return [];
  const mine = new Map();
  for (const r of rows.filter((r) => r.email && sameEmail(r.email, email))) {
    const name = teamName(r);
    const roles = (r.role ?? "").split(";").map((x) => x.trim());
    mine.set(name, [...(mine.get(name) ?? []), ...roles].filter(Boolean));
  }
  return [...mine].map(([team, roles]) => ({ team, roles })).sort((a, b) => a.team.localeCompare(b.team));
}

export const projectsByTeam = (rows) => new Map(rows.map((r) => [teamName(r), r.project]));

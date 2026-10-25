# Discipline survey

A quarterly survey for the head of the discipline, completed after the [project survey](project-survey.md) closes and with its results to hand. It adds the strategic view only the discipline head has: demand no project has reported yet, demand that is going away, and the two roles the discipline staffs itself.

It has four parts. All are optional. A quarter without changes repeats the previous quarter's targets.

## 1. Strategic adjustments

The same grid as the project survey, for any expertise, including one no project uses yet.

| | Headcount to add or remove | Reason |
|---|---|---|
| **Operative** | −2 to +4 | |
| **Conceptual** | | |
| **Strategic** | | |
| **Comprehensive** | | |

Reasons are one of the following:
- **Business development:** opening up a new type of project.
- **Expected project:** won or likely work not yet staffed.
- **Building a capability:** growing expertise the discipline lacks.
- **Winding down:** demand the discipline expects to fall away.

How adjustments show in the tool:
- **Scope:** they belong to no team, so they only appear in the "All projects" view.
- **Demand:** they add to or subtract from what projects report.
- **Expertise no project reports:** it appears on the chart with a grey background, because no project answered for it. Its segments show whether ratings across the discipline can cover it.
- **Drill-down:** it lists each adjustment with its reason.

## 2. Tech lead targets

Every project team needs one tech lead. By default the tool expects a conceptual tech lead for teams of up to four people and a strategic one for larger teams. Here the discipline head overrides that for teams whose need differs, for example a comprehensive tech lead on a multi-team product.

| Team | Working method needed |
|---|---|

Tech leadership is then charted on its own line, with the same logic as an expertise:
- **Demand:** one person per project team, at the working method set here.
- **Project half:** whether the staffing export shows a tech lead on the team. A team without one counts as "milestone will slip".
- **People half:** individual ratings in tech leadership, from self, peers and leads.

## 3. People leadership ratios

The organisation is a matrix, so people leadership is discipline-wide, not per team. For each level of report, set how many reports one people lead carries and the working method their lead needs.

| Reports at level | Reports per lead | Lead's working method |
|---|---|---|
| 3 | 7 | Conceptual |
| 4 | 6 | Conceptual |
| 5 | 5 | Strategic |
| 6 | 4 | Comprehensive |

How the tool uses these ratios:
- **Demand:** reports at each level, from the staffing export, divided by the ratio.
- **Supply:** the people leads named in the staffing export, by their level.
- **Visibility:** it only appears in the "All projects" view.

## 4. Domains

The list of policy domains, and the domain of each project. Projects are mapped once and carried forward; only changes need entering.

| Project | Domain |
|---|---|
| Rechtsinformationsportal (NeuRIS) | Legislation |
| Digitale Rechtsantragsstelle (RAST) | Justice and courts |

The project survey uses this to prefill its domain expertise section, so leads never type a domain. Domain expertise is matched per domain: a welfare expert never covers a legal gap, and Borrow only suggests teams in the same domain.

## How answers become data

Each answer becomes one row in the **Discipline Plan** tab (`data/discipline-plan.csv`):

| Column | Strategic adjustment | Tech lead target | People leadership ratio | Domain |
|---|---|---|---|---|
| quarter | Survey round | Survey round | Survey round | Survey round |
| kind | adjust | tech-lead | people-lead | domain |
| subject | Expertise | Team | Report level | Project |
| method | Working method | Working method needed | Lead's working method | |
| value | Headcount, signed | 1 | Reports per lead | Domain |
| reason | Reason | | | |

Tech leadership and people leadership also need two columns in the staffing export: `role` (tech-lead or engineer) and `people_lead`, the person ID of each engineer's people lead.

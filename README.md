# Delivery Expertise

Collating and visualising project demand matched against current delivery capabilities.

```sh
npm start      # serves on http://localhost:8000 (survey prototype at /survey.html)
npm test
npm run data   # regenerates the dummy data in data/ from teams.csv
```

The pages live in `public/` and load `src/` and `data/` beside them. Every push to `main` deploys `public/`, `src/` and `data/` to GitHub Pages via `.github/workflows/pages.yml`, under the unguessable folder in the `PAGES_PATH` repository secret (kept in 1Password). The site root returns 404.

## Inputs

Five CSV files in `data/`: the project survey, assessments, activity, the discipline survey and the staffing per quarter. Every row carries its quarter. `teams.csv` is the real, anonymised current staffing that the dummy data is generated from.

| File | Source | Columns |
|---|---|---|
| `project-demand.csv` | The mandatory [project survey](docs/project-survey.md), one row per answered grid row | team, expertise, domain, method, people, coverage, support |
| `expertise-assessments.csv` | Individual ratings: self-assessment, any number of peer reviews, and the person's project or tech lead | respondent (pseudonym), expertise, domain, assessor (self / peer / lead), level (1–6) |
| `historical-activity.csv` | Logged project activity | team, expertise, domain, method demonstrated, person_days |
| `staffing.csv` | Staffing export, one row per engineer per quarter | person (same pseudonym as respondent), project, team, level, role (tech-lead / engineer), people_lead |
| `discipline-plan.csv` | The quarterly [discipline survey](docs/discipline-survey.md) | kind (adjust / tech-lead / people-lead / domain), subject, method, value, reason |

Leads answer one grid per expertise. Each row is a **working method**: operative, conceptual, strategic or comprehensive, which correspond to levels 3 to 6. For each row they give the **headcount** needed, 1, 2, 3 or 5, and the **coverage** on the team today: critical, under, adequate or over. A checkbox marks support the team also draws on: the platform team, the legal and IT security team, or a community of practice.

## Model

The survey decides status, individual ratings locate and size gaps when they are up to date, and activity verifies.

- **Headcount is exact.** Answers are on a Fibonacci scale, 1, 2, 3 or 5, so every answer is a whole number of people.
- **Ratings are scored per person.** Each score is a weighted mean of the latest self-assessment (weight 1), the average of peer reviews given since (weight 2) and the lead's latest rating (weight 3), over whichever exist. It rounds to the nearest level. Engineers cover work at their exact level, and leftovers may step down but never up.
- **Ratings follow the person.** A rating carries no team. Each quarter's staffing places it in the team the person is on, so people who move take their ratings with them, and people who leave drop out. The header shows how many engineers joined or left the selected project or team since last quarter.
- **Ratings count only when fresh.** A team's ratings locate its gaps when at least 60% of the team has been rated in the last two quarters.
- **A row's colour** follows from its coverage and the people needed:

  | Coverage \ People needed | 1 | 2 | 3 | 5 |
  |---|---|---|---|---|
  | Critical | Red | Red | Red | Red |
  | Under | Orange | Orange | Yellow | Yellow |
  | Adequate | Yellow | Green | Green | Green |
  | Over | Blue | Blue | Blue | Blue |

  Several teams' rows combine by headcount: a working method takes the most severe colour held by at least a quarter of its demand, with severe rows counting towards milder ones.
- **Rows place the gaps.** Rows marked critical or under are gaps at that working method. Where the team's ratings are fresh, they size them. Otherwise each counts as half a person and shows provisional.
- **Urgency** is the gap weighted by the row's colour: red 3, orange 2, yellow 1. It orders the expertise list and the actions.
- **Over-supply comes from both sides.** Projects report it by marking rows "over". Ratings show it as engineers unused at their own working method, or seniors covering junior work. When a team marks a row "adequate" but its ratings show people to spare, a disagreement note names it.
- **Statuses** run along the spectrum: Critical shortage (red), Undersupplied (orange), Covered but fragile (yellow), Well covered (green), Oversupplied (blue). Work covered by someone more senior is shown hatched rather than in a colour of its own.
- **The two sources are compared per working method.** What projects report and what up-to-date ratings show are both kept per row, and disagreements between them are listed.
- **Disagreements are surfaced**, grouped by type with the teams listed. Examples are a team marking a row "adequate" while its ratings show a gap or people to spare, or marking rows "over" when its ratings show nobody to spare. A row marked "under" that ratings don't confirm gets its own note. A working method is also flagged when recorded activity is under half of what is reported covered.
- **Demand change** is shown per quarter as a percentage, shaded green for growth and red for decline, saturating at ±50%.
- **The discipline plan sits on top of project demand.** Strategic adjustments add or remove headcount, but only in the "All projects" view, since they belong to no team. Expertise that only the plan asks for has a grey background, since no project answered for it, and its segments come from ratings across the discipline.
- **Support is a flag, not a replacement.** A team's ticked support adds to its own demand rather than replacing it, and shows as an emoji on the circle: 🛠️ platform team, ⚖️ legal and IT security, 👥 community of practice.
- **Roles have their own lines.** Tech leadership and people leadership are roles, not expertise, so they stay off the main chart and out of the expertise list. Each is a straight line beneath the domain chart: a spoke straightened out, with the same circles at levels 4, 5 and 6. Clicking a line opens its drill-down. Engineers see the lines too, discipline-wide and without team names.
- **Tech leadership** is derived: one per project team, at the working method the discipline plan sets, or by default conceptual for up to four people and strategic above. A team with a tech lead in the staffing counts as adequately covered, one without as under. Ratings in tech leadership fill the segments.
- **Domain expertise** is one expertise qualified by a policy domain, such as Legislation or Family and welfare. Projects are mapped to a domain in the discipline plan, so the survey prefills it. Demand, ratings and Borrow are matched per domain, so a welfare expert never covers a legal gap. Domain expertise has its own smaller radial chart in the top right, one spoke per domain, with the same logic, since domains are not comparable with the technical areas. Its drill-down has a table per domain.
- **People leadership** is derived and discipline-wide: reports per level divided by the plan's ratios, against the people leads named in the staffing. Its line shows only in the "All projects" view and in the engineers' views.
- **Resourcing actions:**
  - **Borrow:** teams marking that working method "over", then bench teams with fresh ratings at that working method. With no filter, any team can lend.
  - **Build:** enough spare engineers one step below.
  - **Buy:** a confirmed critical gap for two quarters while demand grows, or nobody can grow into it.
  - **Bind:** one person.
  - **Bounce:** demand falling over 10% while teams mark rows "over".
  - **Buy for planned demand:** Buy also applies, as "hire or partner", to planned demand nobody can cover today.
  - Bot needs human judgement and is not derived.

The interface shows aggregates by organisation, project or team. Individuals are never named.

## Emphasis

Status is shown by colour alone, at full strength. In an individual's view, demand outside their profile and its frontier fades to 25%. The frontier is one working method above their own in an area they know, or an area the discipline needs up to their highest working method. Needs on the frontier get a thin black outline.

## Chart

The chart is radial:
- **Spokes:** one per expertise, numbered in urgency order clockwise from the top.
- **Distance from the centre:** the working method, from operative on the inner ring to comprehensive on the edge. An empty core sits inside operative.
- **Marks:** one per working method asked for, with area proportional to the people needed.

For the discipline head, each mark is one circle, its area proportional to the people needed:
- **Background and outline:** pale, in the colour projects report for that working method, grey where no project answered. The outline is relatively thick.
- **Segments:** one per person needed, filled one by one from the spoke's outward direction, clockwise. Where people data is verified, rated people fill them. Otherwise the project's answer approximates them: critical none, under half, adequate and over all. Nothing but the tick tells the two apart.
- **Segment colour:** by how much is filled. Under half is red, more than that orange. All filled is yellow if it is one person, otherwise green. Solid segments are people at that working method, and hatched ones are filled by someone more senior.
- **Blue segments outside:** spare people beyond the need, one each, just outside the circle. Verified, they come from ratings; otherwise one per team marking the row "over".
- **✓ top left:** the people data is verified, meaning fresh ratings for enough of the demand.
- **Top right:** support teams expect to draw on, 🛠️ platform, ⚖️ legal and IT security, 👥 community of practice.
- **Legend:** "Reading a circle", above the domain chart, is an example circle half as large again as the largest on the main chart, drawn by the same code, with each element labelled. Its counts are illustrative: they show every element at once, which real data cannot.
- **Grey bands, labelled "Rated people":** the team's depth as filled contour bands in neutral grey. On every spoke, the outer band reaches the most senior working method at least one person in scope is rated at. Inner bands do the same for at least two, three and five people. Bands join spoke to spoke, so complementary people on adjacent areas form one continuous shape, and they stack darker where the team is deep. No individual is drawn.

For an individual, circles show one reconciled colour, and a thin black line joins their working method on every spoke, or the inner ring where they have none, into the outline of their profile. Demand inside it is within reach, and demand just outside is the next step.

## Personas

A switcher at the start of the header's second row shows the same data to different audiences.

- **Discipline head:** the full view described above, with project and team filters, team names, disagreements and resourcing actions. The expertise list is numbered most urgent first, with a bar for each item's urgency and a divider before items with no reported gaps.
- **Principal, Senior, Regular, Entry-level:** an individual engineer's view, using a real pseudonymous engineer at that level from the data. It is always discipline-wide and never names teams or colleagues. Marks are single, solid and reconciled: the project's answer is the baseline. Ratings speak where no project answered and where ratings place a reported gap elsewhere. Over-coverage that ratings show bleeds over a project's "well covered". Ratings never clear or invent a gap, and the signals below use the same status. The chart outlines their profile across all spokes, as described under Chart. The side panels show:
  - **Your skills in demand:** where the discipline is short at their working method.
  - **Room to grow:** where it is short one step above.
  - **Worth reconsidering:** where projects ask for little or nothing at their working method, capacity exceeds demand, or demand fell by a quarter or more over the year.
  - **Areas the discipline needs:** capabilities the discipline plan is building, and the most urgent areas they don't work in yet.

# Project survey

A quarterly, mandatory survey for project and tech leads. One response per team. It asks what kind of engineering work the team needs, how much of it, and how the quarter looks with the people the team has. It never asks about named people.

Target effort: about ten minutes. Most teams answer for three to five areas of expertise.

## Structure

Built as a custom page (`public/survey.html`): Google Forms can't show questions only for areas picked earlier.

1. **Team.** Dropdown of project and team, taken from the staffing list.
1. **Project type.** Up to five of: Steuerungsunterstützung, Produktentwicklung, Befähigung, Umsetzungsberatung, Standardentwicklung, Umsetzung, Strategiebegleitung, Regelungsbegleitung, Geschäftsstelle, Weiterentwicklung und Betrieb, Discovery, Others — the German names the portfolio uses. Each preselects the areas the discipline sheet's `project-types` tab maps to it, marked in the cloud with a dot in the type's colour (an area under several chosen types gets one dot each). Unchoosing a type unpicks its areas again, unless the lead touched them or another chosen type suggests them. Last quarter's types start chosen. Choosing a type says which areas it just picked, as interviewees didn't notice the preselection. A type's optional `english_translation` from the tab shows in small grey text under it, and its optional `description` as a tooltip. The choice is saved on every row as `project_types`. The section is hidden while the tab is empty.
2. **Pick the areas.** A word cloud of every area of expertise: the suggested ones (about thirty, finer than the ten buckets the IC form asks about), the project's domain, and any area a team has added before. Word size is a best guess at relevance to this team, from its last answers, its booked time and its members' ratings, with discipline-wide demand as a tiebreak (`src/cloud.js`). Leads can search, and add an area that isn't there. Searching finds areas by their other names too (`same_as` on the areas tab), and typing another name picks the area it stands for rather than adding a duplicate. A new area's suggested groups also come from families: words matching a family's name suggest the group most of that family is in. Areas answered last quarter start picked.
3. **One section per bucket**, in picking order: the areas picked activate their buckets (the ten from the portal's grouping, or the default ten until there is one), and each active bucket gets one grid, naming the areas picked in it. Buckets the team doesn't need never appear, so nothing is skipped. Each section also has an optional **critical** tick per picked area (saved as `critical`), one **help from** tick for the bucket's support (see below), and two optional free-text fields: **what specifically** (tools, frameworks, sub-areas) and a **comment** for what the lead had in mind: scope or sub-project, timing within the quarter, uncertainty.
   **A new area** typed in is matched to buckets by name first: an area of that exact name, else the buckets whose names or areas share words with it. The lead picks one of those, any other bucket, or **None of these**, which gives it a section of its own until a discipline head regroups. The page then says where the area went.
   The page calls buckets "groups" and doesn't ask leads to understand them: related areas simply share one set of questions.
4. **Domain expertise ({domain})** is offered in the cloud like the others, taken from the project's domain, which the discipline head maps once.
5. **Anything we should know?** Optional, for the whole submission.

## Questions per expertise

### 1. How many people on your team need to work this way in {expertise} this quarter?

A multiple-choice grid, one answer per row. A blank row means the team doesn't need that way of working.

| | 1 person | 2 people | 3 people | 5 people |
|---|---|---|---|---|
| **Operative** | | | | |
| **Conceptual** | | | | |
| **Strategic** | | | | |
| **Comprehensive** | | | | |

Help text shown above the grid:

Below the grid, one tick per section: **We also expect help from {the platform team / the legal and IT security team / the community of practice}**, explained as advice, reviews or mentoring from outside the team that doesn't add to or replace the people counted. It used to be a column per working method; interviewees didn't know what a tick per level meant. It is saved on every row the team needs people for, or on the operative row alone when none are needed.

People are a **headcount**, never FTE. The survey asks about the whole next quarter and doesn't record timing: the help text asks leads to count expertise needed for part of the quarter, and to use the comment if timing matters.

> Count heads, not time. If you'll need it for part of the quarter, count it. A part-time person counts as one. The same person can count in several areas of expertise. Pick the closest of 1, 2, 3 or 5.
>
> Each row shows its level and a short gist, and the full definition on hover:
>
> - **Operative:** implementing, applying standard methods, finding solutions, executing.
> - **Conceptual:** planning, coordinating, shaping and guiding; adapting methods to the situation.
> - **Strategic:** technically innovative and entrepreneurial with limited resources; creating guidelines, leading, looking ahead.
> - **Comprehensive:** strategic across the wider ecosystem, including trends and developments beyond the project.

### Coverage, in the same grid

Each row also has four options: **Critical**, **Under**, **Adequate**, **Over**. For each working method the team needs, is it covered on the team today? Critical means the gap blocks delivery or breaches a legal or security obligation. This places gaps and surplus exactly where they are, and says how badly they hurt, so there is no separate question for that.

The row's colour follows from its coverage and the people needed:

| Coverage \ People needed | 1 | 2 | 3 | 5 |
|---|---|---|---|---|
| Critical | Red | Red | Red | Red |
| Under | Orange | Orange | Yellow | Yellow |
| Adequate | Yellow | Green | Green | Green |
| Over | Blue | Blue | Blue | Blue |

Help text:

> Marking a row "over" is how other teams get help, and how yours gets help next time. It starts a conversation with you. Nobody is moved without one.

This promise only holds if it is kept. The first time someone is moved without that conversation, teams will stop marking rows "over".

## Examples

Each expertise section shows two or three examples under the grid. These are drafts to refine with the discipline.

| Expertise | Operative | Conceptual | Strategic | Comprehensive |
|---|---|---|---|---|
| Backend | Build endpoints to the team's conventions | Design the data model and service boundaries for a new feature | Set API guidelines across teams; decide build or buy | Shape interoperability standards with other ministries |
| Accessibility | Fix audit findings; test with assistive technology | Plan accessible patterns for a new journey | Define the team's accessibility strategy and BITV compliance route | Influence accessibility standards across government services |
| Security | Patch dependencies; follow secure coding guidance | Threat-model a new integration | Own the security architecture and its trade-offs | Align with BSI requirements and cross-government security developments |


## What each answer is used for

| Signal | Source |
|---|---|
| What is needed, by working method and headcount | Question 1 |
| Where the team is critically, under, adequately or over covered, by working method | The coverage columns |
| How many people short, where a row is under | The team's individual ratings, when they are up to date |
| Who could lend people | Teams marking that working method "over", then the bench |

Individual ratings arrive less regularly than this survey. A team's ratings are used only when most of the team has been rated in the last two quarters. Otherwise the tool shows the lead's reported gap as provisional and not yet located by working method. The survey answer is never overruled by old ratings.

## How answers become data

Each answered grid row becomes one row in the **Project Demand** tab (`data/project-demand.csv`):

| Column | Source |
|---|---|
| quarter | Survey round |
| team | Question: Team |
| expertise | The bucket (or Domain expertise) |
| domain | Prefilled for the domain expertise section, otherwise empty |
| method | Grid row: operative, conceptual, strategic, comprehensive |
| people | Question 1: 1, 2, 3, 5, or platform |
| coverage | The row's coverage: critical, under, adequate, over |
| support | Which support the team also draws on, if ticked: platform, legal or cop. One tick per section, repeated on its rows |
| specifics | The area's "what specifically" text, repeated on each of its rows |
| comment | The area's comment, repeated on each of its rows |
| notes | "Anything we should know?", repeated on every row of the submission |
| areas | The areas picked in the bucket, "; "-separated |
| project_types | The project types chosen, "; "-separated, repeated on every row |
| critical | The areas in the bucket flagged critical, "; "-separated, repeated on its rows |
| areas | The areas picked in the bucket, separated by `; `. Rows from before buckets have none: their expertise is the area |

Headcount is on a Fibonacci scale, 1, 2, 3 or 5, so every answer is an exact number of people and nothing is fractional. Leads never see these numbers. A **From the platform team** answer is left out of the team's own demand. It counts as a quarter of a person of load on the platform team instead.

## Rating team members

Separately, and privately, leads rate each person on their team. This is an individual assessment, weighted above peer reviews and self-assessments. It is a different form, and its answers never appear by name.

For each person and each expertise the team works in, the lead answers: "Which working method best describes how this person works in {expertise}?" The options are Learning, Operative, Conceptual, Strategic and Comprehensive. Domain expertise is rated the same way, for the project's domain.

Self-assessments ask for domain expertise per domain: "Which domains do you know, and at which working method?", choosing from the same list of domains. The form suggests the domains of projects the person has worked on, from staffing history, for them to confirm.

## Open questions

- The expertise list is a placeholder of 18 areas. It needs agreeing with the discipline before the first round.
- The freshness rule, at least 60% of a team rated in the last two quarters, is a starting point.
- Prefilling each section with the previous quarter's answers would cut effort further, but needs Apps Script rather than a plain form.

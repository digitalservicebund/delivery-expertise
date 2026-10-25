# Project survey

A quarterly, mandatory survey for project and tech leads. One response per team. It asks what kind of engineering work the team needs, how much of it, and how the quarter looks with the people the team has. It never asks about named people.

Target effort: about ten minutes. Most teams answer for three to five areas of expertise.

## Structure

Built as a Google Form.

1. **Team.** Dropdown of project and team, taken from the staffing list.
2. **One section per expertise**, in a fixed order, each with one grid. Neither question is required. An expertise the team doesn't need is simply left blank.
3. **Domain expertise ({domain})**, a section like the others whose domain is prefilled from the project's domain, which the discipline head maps once. A project working in two domains gets two such sections. Leads never type a domain.

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

For expertise the platform team supports (DevOps, CI/CD & Infrastructure), the grid has one more column: **From the platform team**. Choosing it says the team needs this way of working and expects the platform team to provide it on demand, rather than staffing it.

> Count people, not time. The same person can count in several areas of expertise. Pick the closest of 1, 2, 3 or 5.
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
| expertise | Section |
| domain | Prefilled for the domain expertise section, otherwise empty |
| method | Grid row: operative, conceptual, strategic, comprehensive |
| people | Question 1: 1, 2, 3, 5, or platform |
| coverage | The row's coverage: critical, under, adequate, over |
| support | Which support the team also draws on, if ticked: platform, legal or cop |

Headcount is on a Fibonacci scale, 1, 2, 3 or 5, so every answer is an exact number of people and nothing is fractional. Leads never see these numbers. A **From the platform team** answer is left out of the team's own demand. It counts as a quarter of a person of load on the platform team instead.

## Rating team members

Separately, and privately, leads rate each person on their team. This is an individual assessment, weighted above peer reviews and self-assessments. It is a different form, and its answers never appear by name.

For each person and each expertise the team works in, the lead answers: "Which working method best describes how this person works in {expertise}?" The options are Learning, Operative, Conceptual, Strategic and Comprehensive. Domain expertise is rated the same way, for the project's domain.

Self-assessments ask for domain expertise per domain: "Which domains do you know, and at which working method?", choosing from the same list of domains. The form suggests the domains of projects the person has worked on, from staffing history, for them to confirm.

## Open questions

- The expertise list is a placeholder of 18 areas. It needs agreeing with the discipline before the first round.
- The freshness rule, at least 60% of a team rated in the last two quarters, is a starting point.
- Prefilling each section with the previous quarter's answers would cut effort further, but needs Apps Script rather than a plain form.

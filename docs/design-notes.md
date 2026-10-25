# Engineering expertise: design notes

How we matched demand for engineering expertise against the people who have it, what we tried on the way, and why the prototype looks the way it does. For discipline heads, partners, the CTO, and project and tech leads.

## The problem

We staff engineers across many projects for different ministries. We could not see, in one place, where we are short of a kind of expertise, where we have more than we need, and where people could grow. Spreadsheets of staffing say who is where. They do not say whether the work is covered.

The prototype answers three questions:

- **Where does it hurt?** Which expertise, at which working method, is short, and how badly.
- **Who could help?** Which teams have more than they need, and who could grow into a gap.
- **Where should I grow?** For an individual engineer: where their skills are needed, and what is one step away.

## Principles that held throughout

1. **Every element earns its place.** Anything that could not be explained in one sentence was removed. Most iterations were subtractions.
2. **Projects are the baseline; people data verifies.** Leads see their team's reality every week. People ratings arrive slowly and go stale. The chart never lets old ratings overrule a current project report.
3. **Ask about work, not people.** Leads describe the work their team needs. They never rate named colleagues in the project survey.
4. **Aggregate, never expose.** No view names an individual. Engineers see only their own ratings against discipline-wide demand.
5. **Whole numbers only.** Every quantity a reader sees is a count of people. Fractions confused everyone who saw them.

## How the inputs evolved

| First version | Problem | Where we landed |
|---|---|---|
| Demand in FTE | Too granular. People contribute to several areas over a quarter. | Headcount on a Fibonacci scale: 1, 2, 3 or 5 |
| Ranges such as "2–3 people" | A range must be averaged, which puts 2.5 people on the chart | Exact numbers |
| "Occasionally" or "fractional" support | Created quarter-people and confusing edge cases | Dropped |
| Seniority as levels 3 to 6 | Leads thought about people, not work | Working methods from our level structure: operative, conceptual, strategic, comprehensive |
| A separate "need" or "pain" question | Did not say which working method hurt, and overlapped with coverage | One coverage answer per row: critical, under, adequate, over |
| Platform support as a headcount answer | Replaced team demand; support is in addition to it | A checkbox per row naming the support: platform team, legal and IT security, community of practice |

The project survey is now **one grid per area of expertise**. Each row is a working method, with the people needed and how well it is covered today. A row's colour follows directly:

| Coverage \ People needed | 1 | 2 | 3 | 5 |
|---|---|---|---|---|
| Critical | Red | Red | Red | Red |
| Under | Orange | Orange | Yellow | Yellow |
| Adequate | Yellow | Green | Green | Green |
| Over | Blue | Blue | Blue | Blue |

Adequate with one person is yellow: it works, but rests on one person. Under with several people is yellow: probably one short of several.

**People data** comes from self-assessment, peer review and the person's lead. They are weighted lead 3, peers 2 and self 1, because leads see the work and self-ratings run high. Ratings follow the person when they move teams. They only count when fresh: most of a team rated in the last two quarters.

## How the picture evolved

We went through roughly a dozen designs. The lessons matter more than the sequence.

- **A scatter of seniority against quantity** was precise but unreadable at a glance. **A radial chart** won: one spoke per area of expertise in urgency order, working methods as rings. Pressure shows as a shape.
- **Showing both sources in one mark failed every time.** We tried split half-circles, coloured outlines, interwoven stripes, thick coloured spokes and wedges. Each overloaded one circle with five meanings: need, supply, supply status, project view, agreement. The fix was to stop asking one mark to say everything. The circle now shows coverage, its background shows what the project reported, and disagreements are listed in words in the drill-down.
- **Quantity must look like quantity.** Circles filled from the middle hid how many people were missing. A pie split into one segment per person needed shows "two of five filled" at a glance. Spare people are extra blue segments outside the circle, uncapped, so large surpluses stay visible.
- **Colour runs along one spectrum:** red (critical), orange (undersupplied), yellow (fragile), green (well covered), blue (oversupplied). Purple for over-qualification was dropped. It now shows as hatching: the seat is filled, but by someone more senior than the work needs.
- **Fading things for emphasis confused people.** Opacity that varied by status read as uncertainty. Everything is now drawn at full strength. A pulsing glow marks only critical circles.
- **Missing data is not a gap.** When people data is too thin, the circle trusts the project's answer and fills from it. A ✅ marks circles the people data has verified.
- **Domain knowledge is not comparable with technical skills.** Domains such as Legislation or Family and welfare have their own smaller chart, with one spoke per domain.
- **Leadership is a role, not an expertise.** Tech leadership and people leadership first sat on the main chart as dashed spokes. They distorted it, but they are not like domains either: they have no sub-areas. We tried a strip of team tiles and load bars, then two small pies of positions filled. Both took explaining. The layout that stuck is one straight line per role, a radial spoke straightened out, beneath the domain chart. Each line carries the same circles as the radials at levels 4, 5 and 6. Leadership is never needed at operative level, so that position was dropped.
- **Leadership demand is derived, not asked.** Tech leadership needs one lead per project team. Small teams need conceptual leadership and larger ones strategic, unless the discipline head sets otherwise. People leadership follows headcount at the discipline head's ratio per level. It covers the whole discipline, so it only shows without a team filter.

## Two audiences, one dataset

- **Discipline head:** project and team filters, teams named, disagreements between sources, and resourcing actions: Borrow, Build, Buy, Bind, Bounce.
- **Engineers:** discipline-wide only, nothing named. Their verified profile as a filled shape, their self-assessment as a dotted outline, and 🎯 where a shortage sits one working method above them. This was added because the same data can tell an engineer where they are needed, or confront them with an area that is no longer in demand. Engineers also see the leadership lines, under the same rules: discipline-wide, in their own circle style, with no teams or actions in the drill-down. That shows anyone considering a lead role where leads are needed.

A switch on the header's second row moves between the two audiences. The discipline head's view always shows the grey shape of rated people's depth. The checkbox that hid it was removed because nobody needed it.

## FAQ

**Is this a performance tool?** No. Ratings describe what work someone can do today, not how well they do their job. Nothing is used for appraisal, and engineers only ever see their own ratings.

**Can colleagues see my ratings?** No. Views are aggregated. Discipline heads can filter to a team, and in a very small team that approaches individual detail. That is why the team view is limited to discipline heads.

**Why do leads rate their team members if the survey never names people?** They are separate instruments. The project survey describes the work and is shared. Lead ratings are individual and private, and only feed aggregates.

**What if a lead overstates or hides problems?** Leads lean optimistic about gaps and protective of spare people. Fresh people ratings and logged activity act as checks. Where they disagree with the lead, the drill-down says so. The tool flags, it does not overrule.

**What happens if I mark a row "over"?** It starts a conversation, nothing more. It is how other teams get help, and how yours gets help next time. Nobody is moved without that conversation. If that promise is broken once, teams will stop reporting spare capacity, and the tool loses one of its two sources.

**Why not ask for FTE? It's more precise.** It is precise about something nobody knows. Leads can say how many people they need. They cannot honestly say 0.35 of a person.

**Why only four working methods?** They map one to one onto our existing level structure, so nobody learns a new scale.

**How much effort is this for project leads?** One grid per area of expertise the team needs, usually three to five areas. About ten minutes a quarter.

**What if people data is missing for my team?** Your answers stand. The chart fills circles from what you report and leaves off the ✅ until ratings catch up.

**Why does the tool recommend "Buy" so rarely?** Hiring is slow and costly. It is only suggested for a critical gap that has lasted two quarters, where nobody internal can borrow or grow into it.

**Where do the areas of expertise come from?** A working list of ten areas plus domains, agreed with the discipline. It is meant to change, and adding an area is a matter of adding it to the survey.

**Is the data real?** The staffing is real and anonymised. Everything else in the prototype is generated dummy data, built to show realistic situations, including optimistic leads and stale ratings.

## Still open

- Agree the final list of areas of expertise and the examples for each working method.
- Check the 25% threshold for combining teams' answers, and the 60% freshness rule, against the first real rounds.
- Decide who besides discipline heads may filter to team level.
- Decide whether engineers should see how their lead and peers rated them, or only the combined result.
- Decide whether engineers should see their own position on the leadership lines, as they do on the expertise spokes.
- Check that the tech-lead default, conceptual up to four people and strategic above, matches how the discipline staffs leads.

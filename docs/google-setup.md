# Google setup

The prototypes store everything in Google Sheets and a Google Form. There is no backend: pages sign people in with their own Google account in the browser and call the Sheets API as that person. What each person can see is decided only by how the files are shared.

| File | Written by | Shared with | Holds |
|---|---|---|---|
| Projects sheet | Project survey, in the browser | Project and tech leads, discipline head: edit | Raw demand rows |
| Discipline sheet | Discipline survey, in the browser | Discipline head(s): edit | The discipline plan |
| IC form | ICs, through Google Forms | Anyone at DigitalService can respond | Self-assessments and peer ratings |
| IC responses sheet | The IC form | Discipline head only | Raw ratings, with emails |
| Aggregate sheet | Formulas only | Everyone at DigitalService: view | Only what the visualisations need |
| Prototype sheet | The data generator, uploaded once per refresh | Same people as the Pages site: view | Dummy data, in the same tabs and columns as the live sources |

## Prototype and live mode

Every page reads through one loader, `src/source.js`, and shows a bar at the top saying which data it shows, with a switch and a Google sign-in button when needed.

- **Prototype** (the default) reads the prototype sheet. It has one tab per generated CSV, named like the file without `.csv`: `staffing`, `discipline-plan`, `project-demand`, `historical-activity`, `expertise-assessments`. Fill or refresh it with **Load dummy data** on the portal, which writes `data/*.csv` into it with your own access. Survey pages write nothing.
- **Live** reads `demand`, `plan` and `supply` from the aggregate sheet. The survey adds the projects sheet's `teams` list. The discipline view adds the discipline sheet's `staffing` snapshot, which only discipline heads can open (`src/live.js` turns both into the dummy data's shapes):
  - **Staffing:** active engineers only, each once, in the team with their largest assignment, with names and emails dropped. One quarter only, with no people leads.
  - **Supply:** the anonymous counts become ratings that belong to no team. They count for the whole discipline, but a project or team filter leaves them out, so filtered views rest on what the leads reported.
  - **Not available:** booked time, so there are no suggestions from it. The individual view, because nobody's own ratings are known.
- **Local files**: without a `config.js`, as in a fresh clone, pages read `data/*.csv` directly and need no sign-in.

`?mode=live` or `?mode=prototype` switches, and the choice holds for the browser tab's session. The access token is also kept for the tab's session only, so moving between pages doesn't ask again. It expires within the hour.

The dummy data is generated from `teams.csv`, the real, anonymised staffing. Project and team names are real, so share the prototype sheet no more widely than the Pages site, never publicly or by link.

The IDs live in `public/config.js`, which is git-ignored. On deploy it is written from the `SHEETS_CONFIG` repository secret by `scripts/write-config.js`. The secret holds the JSON shape in `public/config.example.js`. Its master copy, and the OAuth credentials JSON with its client secret, are in 1Password. The client secret is never used and never goes into the config.

```sh
gh secret set SHEETS_CONFIG < sheets-config.json   # the JSON from 1Password
```

## OAuth client

In Google Cloud: an OAuth client of type **Web application**, consent screen **Internal**. Authorised JavaScript origins: the GitHub Pages origin and `http://localhost:8000`. No redirect URIs. Enable the **Google Sheets API**, **Google Drive API** and **Google Picker API** in the same project.

Two scopes: `userinfo.email`, so the survey knows who is answering, and `drive.file`, so the app can reach only files a person has handed to it. The first time a page needs a sheet, Google answers 404, and the page opens Google Picker showing just that sheet. One **Select** hands it over for good, on every device, until the person removes the app's access in their Google account. Nobody grants access to all their spreadsheets.

The Picker needs an API key (`pickerKey` in the config). It identifies the project and grants no access. Restrict it to **Websites** `http://localhost:8000/*` and `https://digitalservicebund.github.io/delivery-expertise/*`, and to the **Google Picker API** only. The Picker's app ID is the project number, taken from the start of the client ID.

## Setting up the sheets

The portal's **Set up live sheets** button does the next three sections' tab work for you: it creates the `demand` and `plan` tabs with their header rows, and the aggregate sheet's `demand` and `plan` tabs with their imports. It is safe to run again. It only adds a header to an empty row 1, and leaves a different existing header alone, saying so. Google allows no one to approve an `IMPORTRANGE` through the API, so afterwards open the aggregate sheet and click **Allow access** once per source sheet. It also writes the aggregate `supply` tab, once the IC form is linked to the IC responses sheet. Until then it skips `supply` and says so.

## Projects sheet

One tab, `demand`, with this header row. The survey only ever appends rows. A team's latest submission for a quarter replaces its earlier ones, by `submitted_at`.

```
quarter | team | expertise | domain | method | people | coverage | support | specifics | comment | submitted_by | submitted_at
```

Everyone with access can read and change every team's rows. That is accepted. Version history shows who changed what.

A second tab, `teams`, says who answers for which team: `project | team | email | role`. Nobody edits it. It is one import formula, written by **Set up live sheets**, that pulls from the discipline sheet's `staffing` tab (below) every active person who has a role in a team. Only these four columns leave the discipline sheet. Names, levels and FTE stay behind. A person with several roles in a team has them in one field, separated by `;`. Its emails go nowhere else: not to the aggregate sheet, and not to the prototype sheet.

In live mode the survey finds out who is signed in and shows only the teams they have a role in. If that is one team, it is filled in for them. If it is none, they can't submit and are told to ask the discipline head. This is a convenience, not a lock: anyone with edit access to the sheet can still write any row by hand. Prototype mode has no teams list and offers every team in the dummy data.

On submit, the survey appends its rows to `demand`, with the person's email in `submitted_by` and the time in `submitted_at`. Pages read only each team's latest submission per quarter. The `teams` tab never reaches the aggregate sheet, because it holds emails.

## Discipline sheet

### `staffing`: the ds-staffing snapshot

**Set up live sheets** creates a `staffing` tab with the header row of the ds-staffing snapshot export (`Email;First Name;…;Roles in Team;% Assignment in Team;Status`). To refresh it:

1. In ds-staffing, export the staffing snapshot as CSV. Active status is enough.
2. In the discipline sheet, select the `staffing` tab, then **File → Import → Upload** the CSV.
3. Choose **Replace current sheet** and separator **Semicolon**, and untick converting text to numbers, dates and formulas.

The export's own header replaces the tab's header, and the projects sheet's teams list updates on its own within minutes. The tab holds names, emails and levels, so the discipline sheet stays shared with discipline heads only.

### `plan`

One tab, `plan`, in the shape of `data/discipline-plan.csv` plus who submitted it:

```
quarter | kind | subject | method | value | reason | submitted_by | submitted_at
```

## IC form

The portal's **Set up IC form** button sets the questions through the Google Forms API (`src/icform.js`), and can be run again whenever the top areas change. It needs the form's edit ID in the config (`icFormId`, from the editor URL `docs.google.com/forms/d/<id>/edit`) and the **Google Forms API** enabled. It deletes questions it doesn't know, such as the placeholder `Expertise 1`, and keeps the IDs of questions it does, so their answers stay in the same response columns. A new area becomes a new column. A removed one keeps its old column, which is simply no longer counted.

Questions:

1. **Whose expertise are you rating?** `Myself` or `A colleague`. Required. `Myself` skips straight to the ratings.
2. **Your colleague's email**, in a section only `A colleague` goes through. The API can't add email validation, so add it by hand if you want it.
3. **Expertise**: a grid, one row per area, required. Until the grouping from embeddings exists, the areas are the project survey's ten (`src/areas.js`). Columns: `Not my area`, `Learning`, `Operative`, `Conceptual`, `Strategic`, `Comprehensive`.
4. **Anything to add?** Optional.

The button also turns on verified email collection where the API allows it. These settings only work by hand, in the form's settings:

- **Responses → Restrict to users in DigitalService.**
- **Allow response editing: on.** This is the only way an IC can see their own answers again.
- **Limit to 1 response: off.** One response per self-assessment, and one per peer rating.
- **Link responses to the IC responses sheet**, and share that sheet with nobody but the discipline head.

## Aggregate sheet

Every tab is a single formula. Raw IC rows never land in a cell: they stay inside the formula, and only counts come out. Anyone who can view the sheet can read the formulas, which name the source sheet IDs. That is harmless, because an ID gives no access.

The first time each `IMPORTRANGE` source is used, the sheet's owner must click **Allow access** once. The owner needs access to every source, so the discipline head should own it.

**`demand` and `plan`** copy the projects and discipline sheets row by row, without `submitted_by` and `comment`. The aggregate sheet is readable by everyone at DigitalService, a wider audience than the survey sheets, so emails and free text that may name people stay out.

```
=QUERY(IMPORTRANGE("<projects sheet id>", "demand!A:L"), "select Col1, Col2, Col3, Col4, Col5, Col6, Col7, Col8, Col9, Col12 where Col1 is not null", 1)
=QUERY(IMPORTRANGE("<discipline sheet id>", "plan!A:H"), "select Col1, Col2, Col3, Col4, Col5, Col6, Col8 where Col1 is not null", 1)
```

**`supply`** counts self-assessments per area and working method: one row per area, one column per level from `Learning` to `Comprehensive`. Counts below 3 are left blank, so nobody can be singled out. The formula is generated by `supplyFormula` in `src/icform.js` and written by **Set up live sheets**, which finds the responses tab by name (`Form responses…` or `Formularantworten…`). It finds columns by their header (`Expertise [Frontend]`, …), not their position, so the form can change. Each person's latest self-assessment counts, once. It assumes the email column is headed `Email address`, as for a form owned by an English-language account.

Peer validation is not aggregated yet. The plan is to count, per area and working method, the people whose self-assessment is matched or exceeded by at least one peer rating, with the same suppression below 3.

## Not secured

- The survey sheets: any participant can edit any row. Accepted.
- Aggregates over small groups: suppression below 3 applies per area and method, not to combinations of filters. Don't add tabs that break counts down further, by team for example, without the same rule.
- The IC entry gate is a flag in the browser. It shows intent, not proof.

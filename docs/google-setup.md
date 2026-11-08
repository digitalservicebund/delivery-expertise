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

- **Prototype** (the default) reads the prototype sheet. It has one tab per generated CSV, named like the file without `.csv`: `staffing`, `discipline-plan`, `project-demand`, `historical-activity`, `expertise-assessments`. Fill or refresh it with **Load dummy data** on the portal, which generates the dummy data in the browser from the discipline sheet's `staffing` snapshot and writes it with your own access. Survey pages write nothing.
- **Live** reads `demand`, `plan` and `supply` from the aggregate sheet. The survey adds the projects sheet's `teams` list. The discipline view adds the discipline sheet's `staffing` snapshot, which only discipline heads can open (`src/live.js` turns both into the dummy data's shapes):
  - **Staffing:** active engineers only, each once, in the team with their largest assignment, with names and emails dropped. One quarter only, with no people leads.
  - **Supply:** the anonymous counts become ratings that belong to no team. They count for the whole discipline, but a project or team filter leaves them out, so filtered views rest on what the leads reported.
  - **Not available:** booked time, so there are no suggestions from it. The individual view, because nobody's own ratings are known.
- **Not set up**: without a `config.js`, as in a fresh clone, pages say so and show nothing.

`?mode=live` or `?mode=prototype` switches, and the choice holds for the browser tab's session. The access token is also kept for the tab's session only, so moving between pages doesn't ask again. It expires within the hour.

The dummy data is generated from the ds-staffing snapshot in the discipline sheet. Names and emails stay there, but project and team names are real, so share the prototype sheet no more widely than the Pages site, never publicly or by link.

The IDs live in `public/config.js`, which is git-ignored. On deploy it is written from the `SHEETS_CONFIG` repository secret by `scripts/write-config.js`. The secret holds the JSON shape in `public/config.example.js`. Its master copy, and the OAuth credentials JSON with its client secret, are in 1Password. The client secret is never used and never goes into the config.

```sh
gh secret set SHEETS_CONFIG < sheets-config.json   # the JSON from 1Password
```

## OAuth client

In Google Cloud: an OAuth client of type **Web application**, consent screen **Internal**. Authorised JavaScript origins: the GitHub Pages origin and `http://localhost:8000`. No redirect URIs. Enable the **Google Sheets API**, **Google Drive API** and **Google Picker API** in the same project.

Two scopes: `userinfo.email`, so the survey knows who is answering, and `drive.file`, so the app can reach only files a person has handed to it. The first time a page needs a sheet, Google answers 404, and the page opens Google Picker showing just that sheet. One **Select** hands it over for good, on every device, until the person removes the app's access in their Google account. Nobody grants access to all their spreadsheets.

The Picker needs an API key (`pickerKey` in the config). It identifies the project and grants no access. Restrict it to **Websites** `http://localhost:8000/*` and `https://digitalservicebund.github.io/delivery-expertise/*`, and to the **Google Picker API** only. The Picker's app ID is the project number, taken from the start of the client ID.

## Setting up the sheets

The portal's set-up panel (**Load dummy data**, **Set up live sheets**, **Set up IC form**) is shown only to discipline heads: whoever Google says may edit the discipline sheet, which is its owner and anyone it's shared with for editing. There is no list to maintain. A discipline head clicks **Sign in to set up the sheets** once. The first time, the Picker asks for the discipline sheet, and after that the check runs quietly on every visit. Hiding the panel is a convenience: what each action may do is still decided by the sheets' own sharing.

The portal's **Set up live sheets** button does the next three sections' tab work for you: it creates the `demand` and `plan` tabs with their header rows, and the aggregate sheet's `demand` and `plan` tabs with their imports. It is safe to run again. It only adds a header to an empty row 1, or the missing columns to a header that holds the start of it (as when a column was added later), and leaves a different existing header alone, saying so. Google allows no one to approve an `IMPORTRANGE` through the API, so afterwards open the aggregate sheet and click **Allow access** once per source sheet. It also writes the aggregate `supply` tab, once the IC form is linked to the IC responses sheet. Until then it skips `supply` and says so.

## Projects sheet

One tab, `demand`, with this header row. The survey only ever appends rows. A team's latest submission for a quarter replaces its earlier ones, by `submitted_at`.

```
quarter | team | expertise | domain | method | people | coverage | support | specifics | comment | submitted_by | submitted_at | notes
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

An `areas` tab holds the area list: `area | default_bucket | support`, one row per area. It is the source for the survey's word cloud, the support it offers (`cop`, `platform` or `legal`), and the default buckets used until a grouping is applied. It is filled in and edited here; there is no list in the code. **Set up live sheets** adds its header, adds any area the buckets name that it lacks (with the default bucket of its bucket-mates), and warns when it is empty, its default buckets aren't exactly ten, or an area has none. **Load dummy data** copies it into the prototype sheet.

A `bucket-examples` tab holds one example of the work per working method for each bucket: `bucket | operative | conceptual | strategic | comprehensive`. The project survey shows them above each bucket's grid; a bucket without all four gets generic ones. **Ask Gemini** asks for them along with the grouping and **Apply** writes them; for the default buckets, fill them in here. **Set up live sheets** lists buckets that lack them.

A `buckets` tab holds the top areas: `area | bucket | generated_at`, one row per area. It is the source of truth for the IC form's grid and the supply counts, which ask and count per bucket. The portal's **Top areas** panel prompts discipline heads when areas are in no bucket or the grouping is over a quarter old, copies a prompt for Gemini (which they run in their own Gemini tab), reads the pasted answer back, previews it against the current buckets and writes it on **Apply**. The app never calls Gemini itself. Rename a bucket by editing the `bucket` column; a renamed bucket gets a new response column in the IC form.

A `bucket-history` tab records where every former bucket went: `bucket | now | changed_at`. **Apply** adds a row for each renamed bucket (to its new name) and each merged one (to the bucket that took most of its areas), and moves earlier rows along. A name that becomes a bucket again is dropped. Answers given under a former bucket, in the IC form or saved in an engineer's browser, count towards the bucket it went to. Project survey answers need none of this: they are stored per area and mapped through `buckets` whenever they are read.

It also works backwards. **Set up live sheets** reads the IC responses' column headers (`Expertise [X]`), which name every bucket the form has ever asked about. A former bucket the history doesn't know yet is placed by its areas: an area name goes to the bucket that area is in now, and one of the ten default buckets goes to the bucket holding most of the suggested areas it covered (`DEFAULT_BUCKET_AREAS` in `src/areas.js`). The rows it adds are listed in the set-up output and can be corrected in the tab. Names it can't place are listed too, to add by hand.

## IC form

The portal's **Set up IC form** button sets the questions through the Google Forms API (`src/icform.js`), and can be run again whenever the top areas change. It needs the form's edit ID in the config (`icFormId`, from the editor URL `docs.google.com/forms/d/<id>/edit`) and the **Google Forms API** enabled. It deletes questions it doesn't know, such as the placeholder `Expertise 1`, and keeps the IDs of questions it does, so their answers stay in the same response columns. A new area becomes a new column. A removed one keeps its old column, which is simply no longer counted.

Questions:

1. **Whose expertise are you rating?** `Myself` or `A colleague`. Required. `Myself` skips straight to the ratings.
2. **Your colleague's email**, in a section only `A colleague` goes through. The API can't add email validation, so add it by hand if you want it.
3. **Expertise**: a grid, one row per area, required. The rows are the buckets from the discipline sheet's `buckets` tab, or the ten default buckets (`DEFAULT_BUCKETS` in `src/areas.js`) while it is empty. Columns: `Not my area`, `Learning`, `Operative`, `Conceptual`, `Strategic`, `Comprehensive`.
4. **Domain expertise**: a second grid, one optional row per policy domain from the discipline sheet's `plan` tab (its `domain` rows), when there are any. Same columns.
5. **Anything to add?** Optional.

The button also turns on verified email collection where the API allows it. These settings only work by hand, in the form's settings:

- **Responses → Restrict to users in DigitalService.**
- **Allow response editing: on.** This is the only way an IC can see their own answers again.
- **Limit to 1 response: off.** One response per self-assessment, and one per peer rating.
- **Link responses to the IC responses sheet**, and share that sheet with nobody but the discipline head.

## Aggregate sheet

Every tab is a single formula. Raw IC rows never land in a cell: they stay inside the formula, and only counts come out. Anyone who can view the sheet can read the formulas, which name the source sheet IDs. That is harmless, because an ID gives no access.

The first time each `IMPORTRANGE` source is used, the sheet's owner must click **Allow access** once. The owner needs access to every source, so the discipline head should own it.

**`demand` and `plan`** copy the projects and discipline sheets row by row, without `submitted_by`, `comment` and `notes`. The aggregate sheet is readable by everyone at DigitalService, a wider audience than the survey sheets, so emails and free text that may name people stay out.

```
=QUERY(IMPORTRANGE("<projects sheet id>", "demand!A:M"), "select Col1, Col2, Col3, Col4, Col5, Col6, Col7, Col8, Col9, Col12 where Col1 is not null", 1)
=QUERY(IMPORTRANGE("<discipline sheet id>", "plan!A:H"), "select Col1, Col2, Col3, Col4, Col5, Col6, Col8 where Col1 is not null", 1)
```

**`supply`** counts self-assessments per area and working method: one row per area, one column per level from `Learning` to `Comprehensive`. Counts below 3 are left blank, so nobody can be singled out. The formula is generated by `supplyFormula` in `src/icform.js` and written by **Set up live sheets**, which finds the responses tab by name (`Form responses…` or `Formularantworten…`). It finds columns by their header (`Expertise [Frontend]`, …), not their position, so the form can change. Each person's latest self-assessment counts, once. It assumes the email column is headed `Email address`, as for a form owned by an English-language account.

Rows for policy domains come after the buckets, labelled `Domain expertise: <domain>`, counted from the domain grid. Every column whose header matches is counted, duplicates included: Google adds a second column of the same name when a question is recreated, so a person's highest level across them counts.

IC answers are stored per bucket name, so after a regrouping older answers sit in former buckets' columns. `supply` counts them with the bucket each went to, from the `bucket-history` tab: per person, the highest level across the bucket's own column and its former buckets' columns.

**`areas`** copies the discipline sheet's `areas` tab, so the project survey and the IC pages can read the area list.

**`bucket-examples`** copies the discipline sheet's `bucket-examples` tab, for the project survey.

**`buckets`** copies the discipline sheet's `buckets` tab: area and bucket names only. In live mode the discipline view maps demand and planned adjustments to these buckets, so they meet supply, which is counted per bucket. Areas in no bucket and domain expertise stay as they are.

**`bucket-history`** copies the discipline sheet's `bucket-history` tab, so pages read by engineers can follow former buckets too.

**`form`** is written by **Set up IC form**, not imported: the form's public link and the entry ID of "Whose expertise" and each grid row (`role | name | entry`). The self-assessment page (`self-assessment.html`) reads it to open the form with the person's answers filled in, since engineers can't read the form itself. An entry ID is taken to be the Forms API's hexadecimal `questionId` in decimal (`src/prefill.js`). To check, compare one with the form editor's **Get pre-filled link**. Re-run **Set up IC form** whenever the buckets change.

Peer validation is not aggregated yet. The plan is to count, per area and working method, the people whose self-assessment is matched or exceeded by at least one peer rating, with the same suppression below 3.

## Not secured

- The survey sheets: any participant can edit any row. Accepted.
- Aggregates over small groups: suppression below 3 applies per area and method, not to combinations of filters. Don't add tabs that break counts down further, by team for example, without the same rule.
- The IC entry gate is a flag in the browser. It shows intent, not proof.

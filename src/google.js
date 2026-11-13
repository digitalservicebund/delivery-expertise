// Google sign-in and Sheets API calls, entirely in the browser, as the signed-in person.
// Uses Google Identity Services' token model: a short-lived access token, no refresh token, no client secret.
// The only scope is drive.file: the app reaches only files the person has handed to it once in Google Picker.
import { rowsFromValues, valuesFromRows, tabRange, headerUpdate } from "./sheets.js";

const API = "https://sheets.googleapis.com/v4/spreadsheets";
export const SCOPE = "https://www.googleapis.com/auth/drive.file";
// Also asked for at sign-in: the person's own email, to know which teams they answer for. Non-sensitive.
const EMAIL_SCOPE = "https://www.googleapis.com/auth/userinfo.email";
// Kept for the browser tab's session only, so moving between pages doesn't ask again. Expires within the hour.
const STORE = "google-token";

const loaded = new Map();
function loadScript(src, ready) {
  if (!loaded.has(src)) loaded.set(src, new Promise((resolve, reject) => {
    const script = Object.assign(document.createElement("script"), { src, async: true });
    script.onload = () => resolve(ready());
    script.onerror = () => reject(new Error(`Could not load ${src}`));
    document.head.append(script);
  }));
  return loaded.get(src);
}
const loadGis = () => loadScript("https://accounts.google.com/gsi/client", () => window.google.accounts.oauth2);
const loadPicker = () => loadScript("https://apis.google.com/js/api.js",
  () => new Promise((resolve) => window.gapi.load("picker", () => resolve(window.google.picker))));

function record() {
  try {
    return JSON.parse(sessionStorage.getItem(STORE) ?? "null");
  } catch {
    return null;
  }
}
// Tokens from before the email scope was added lack it, so they are replaced by a new sign-in.
const fullScopes = (t) => Boolean(t?.scopes?.includes(SCOPE) && t.scopes.includes(EMAIL_SCOPE));
function stored() {
  const t = record();
  return fullScopes(t) && t.expires > Date.now() + 60_000 ? t.token : null;
}
// Someone who already consented in this tab gets a new token without the consent screen:
// Google's popup closes by itself while they're still signed in. Otherwise Google decides what to ask.
export const promptFor = (previous) => (fullScopes(previous) ? "" : undefined);

// Resolves with a token if one is stored. Otherwise needs a click: call it from a click handler,
// or browsers block Google's popup.
export async function token(clientId) {
  const cached = stored();
  if (cached) return cached;
  const oauth2 = await loadGis();
  const prompt = promptFor(record());
  return new Promise((resolve, reject) => {
    oauth2.initTokenClient({
      client_id: clientId,
      scope: `${SCOPE} ${EMAIL_SCOPE}`,
      callback: (res) => {
        if (res.error) return reject(new Error(res.error_description ?? res.error));
        try {
          sessionStorage.setItem(STORE, JSON.stringify({ token: res.access_token, scopes: res.scope.split(" "), expires: Date.now() + res.expires_in * 1000 }));
        } catch { /* storage blocked: sign in again on the next page */ }
        resolve(res.access_token);
      },
      error_callback: (err) => reject(new Error(err.message ?? err.type)),
    }).requestAccessToken(prompt === undefined ? {} : { prompt });
  });
}
export const hasToken = () => Boolean(stored());
export function signOut() {
  try { sessionStorage.removeItem(STORE); } catch { /* nothing stored */ }
}

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}
async function call(accessToken, url, init = {}) {
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(body.error?.message ?? `Google Sheets: ${res.status}`, res.status);
  return body;
}

const isUngranted = (err) => err.status === 404 || err.status === 403;

// Google Picker showing only the expected files, all selectable at once. Picking hands them to the app, for good.
// files: [{ id, label }]. viewId: DOCS when the files are of mixed kinds (sheets and a form).
async function pick({ clientId, pickerKey }, accessToken, files, viewId = "SPREADSHEETS") {
  const picker = await loadPicker();
  const names = files.map((f) => `“${f.label}”`).join(", ");
  return new Promise((resolve, reject) => {
    const view = new picker.DocsView(picker.ViewId[viewId]).setFileIds(files.map((f) => f.id).join(",")).setMode(picker.DocsViewMode.LIST);
    new picker.PickerBuilder()
      .setTitle(files.length > 1 ? `Select all ${files.length} files (${names}) to let this page use them` : `Select ${names} to let this page use it`)
      .addView(view)
      .enableFeature(picker.Feature.MULTISELECT_ENABLED)
      .setOAuthToken(accessToken)
      .setDeveloperKey(pickerKey)
      // The app ID is the Cloud project number, the first part of the OAuth client ID.
      .setAppId(clientId.split("-")[0])
      .setCallback((res) => {
        if (res.action === picker.Action.PICKED) {
          const left = unpicked(files, res.docs);
          return left.length ? reject(new Error(`Still needed: ${left.map((f) => f.label).join(", ")}. Please select every file shown.`)) : resolve();
        }
        if (res.action === picker.Action.CANCEL) reject(new Error(`${names} ${files.length > 1 ? "are" : "is"} needed to continue.`));
      })
      .build()
      .setVisible(true);
  });
}
export const unpicked = (files, docs = []) => files.filter((f) => !docs.some((d) => d.id === f.id));

// A fresh Picker grant takes a moment to reach the APIs: until then they still answer 404. Retrying right away
// failed, and only a page reload got past it. So retry a few times, waiting longer each time.
export async function retryUngranted(fn, delays = [500, 1000, 2000, 4000], wait = (ms) => new Promise((r) => setTimeout(r, ms))) {
  for (const ms of delays) {
    try {
      return await fn();
    } catch (err) {
      if (!isUngranted(err)) throw err;
      await wait(ms);
    }
  }
  return fn();
}

// Runs fn; if Google says the app has no access to the sheet yet, asks the person to hand it over in the
// Picker once, then runs fn again. drive.file answers files not yet handed over with 404 (sometimes 403).
export async function withSheet(config, accessToken, sheetId, label, fn, viewId = "SPREADSHEETS") {
  try {
    return await fn();
  } catch (err) {
    if (!isUngranted(err)) throw err;
    await pick(config, accessToken, [{ id: sheetId, label }], viewId);
    return retryUngranted(fn);
  }
}

// Hands over, in one Picker, every file in files ([{ id, label }]) the app can't reach yet, so a page that needs
// several asks once instead of once per file. Files already handed over are left out; none left, no Picker.
export async function grantAll(config, accessToken, files, viewId = "SPREADSHEETS") {
  const reachable = await Promise.all(files.map((f) => fileMeta(accessToken, f.id).then(() => true, (err) => {
    if (isUngranted(err)) return false;
    throw err;
  })));
  const missing = files.filter((_, i) => !reachable[i]);
  if (!missing.length) return;
  await pick(config, accessToken, missing, viewId);
  await Promise.all(missing.map((f) => retryUngranted(() => fileMeta(accessToken, f.id))));
}
const fileMeta = (accessToken, fileId) => call(accessToken, `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id&supportsAllDrives=true`);

// A tab's first row: its column headers, as text.
export async function readHeader(accessToken, sheetId, tab) {
  const { values = [] } = await call(accessToken, `${API}/${sheetId}/values/${encodeURIComponent(`${tabRange(tab)}!1:1`)}`);
  return (values[0] ?? []).map(String);
}

export const tabTitles = async (accessToken, sheetId) =>
  new Set((await call(accessToken, `${API}/${sheetId}?fields=sheets.properties.title`)).sheets.map((s) => s.properties.title));

// The signed-in person's email, from the userinfo.email scope asked for at sign-in.
export async function whoAmI(accessToken) {
  const { email } = await call(accessToken, "https://openidconnect.googleapis.com/v1/userinfo");
  if (!email) throw new Error("Google didn't return an email address.");
  return email;
}

// Appends rows below the tab's last row, in the order of header. RAW keeps values exactly as given.
export async function appendRows(accessToken, sheetId, tab, header, rows) {
  const values = rows.map((r) => header.map((h) => r[h] ?? ""));
  const range = encodeURIComponent(`${tabRange(tab)}!A1`);
  await call(accessToken, `${API}/${sheetId}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
    method: "POST", body: JSON.stringify({ values }),
  });
}

// Whether the signed-in person may edit a file. Throws a 404 ApiError when the file hasn't been handed to the
// app in the Picker yet, or the person has no access at all: drive.file can't tell those apart.
export async function canEdit(accessToken, fileId) {
  const { capabilities } = await call(accessToken, `https://www.googleapis.com/drive/v3/files/${fileId}?fields=capabilities(canEdit)&supportsAllDrives=true`);
  return Boolean(capabilities?.canEdit);
}

// Google Forms: read a form, and apply batches of changes to it. Same drive.file scope: the form must have
// been handed over in the Picker.
const FORMS_API = "https://forms.googleapis.com/v1/forms";
export const getForm = (accessToken, formId) => call(accessToken, `${FORMS_API}/${formId}`);
export const updateForm = (accessToken, formId, requests) =>
  call(accessToken, `${FORMS_API}/${formId}:batchUpdate`, { method: "POST", body: JSON.stringify({ requests, includeFormInResponse: true }) });

// tabs: names. Returns { rows: name -> rows, absent: names of tabs the sheet doesn't have }.
// An absent tab reads as no rows; the caller decides whether that is an error.
export async function readTabs(accessToken, sheetId, tabs) {
  const existing = await tabTitles(accessToken, sheetId);
  const present = tabs.filter((t) => existing.has(t));
  const rows = Object.fromEntries(tabs.map((t) => [t, []]));
  if (present.length) {
    const ranges = present.map((t) => `ranges=${encodeURIComponent(tabRange(t))}`).join("&");
    const { valueRanges } = await call(accessToken, `${API}/${sheetId}/values:batchGet?${ranges}`);
    present.forEach((t, i) => (rows[t] = rowsFromValues(valueRanges[i].values)));
  }
  return { rows, absent: tabs.filter((t) => !existing.has(t)) };
}

async function addTabs(accessToken, sheetId, tabs) {
  const existing = await tabTitles(accessToken, sheetId);
  const missing = tabs.filter((t) => !existing.has(t));
  if (missing.length) {
    await call(accessToken, `${API}/${sheetId}:batchUpdate`, {
      method: "POST", body: JSON.stringify({ requests: missing.map((title) => ({ addSheet: { properties: { title } } })) }),
    });
  }
  return missing;
}

// Sets up tabs without losing data. layout: tab -> { header } or { formula }.
// A header goes in only where row 1 is empty or holds the start of it, so answers already collected are never touched.
// A formula always replaces A1: it holds nothing but the formula. Returns a line per tab saying what happened.
export async function setUpTabs(accessToken, sheetId, layout) {
  const created = await addTabs(accessToken, sheetId, Object.keys(layout));
  const notes = [];
  const writes = [];
  for (const [tab, spec] of Object.entries(layout)) {
    if (spec.formula) {
      writes.push({ range: `${tabRange(tab)}!A1`, values: [[spec.formula]] });
      notes.push(`${tab}: import formula ${created.includes(tab) ? "added" : "updated"}`);
      continue;
    }
    const { values = [] } = await call(accessToken, `${API}/${sheetId}/values/${encodeURIComponent(`${tabRange(tab)}!1:1`)}`);
    const update = headerUpdate((values[0] ?? []).map(String), spec.header);
    if (update.values) writes.push({ range: `${tabRange(tab)}!${update.cell}`, values: [update.values] });
    notes.push(`${tab}: ${update.note}`);
  }
  if (writes.length) {
    await call(accessToken, `${API}/${sheetId}/values:batchUpdate`, {
      method: "POST",
      // USER_ENTERED so formulas are formulas. Headers are plain words, so nothing else changes.
      body: JSON.stringify({ valueInputOption: "USER_ENTERED", data: writes }),
    });
  }
  return notes;
}

// Replaces each tab's contents with its rows, creating tabs that don't exist yet. data: name -> rows.
export async function replaceTabs(accessToken, sheetId, data) {
  await addTabs(accessToken, sheetId, Object.keys(data));
  const ranges = Object.keys(data).map(tabRange);
  await call(accessToken, `${API}/${sheetId}/values:batchClear`, { method: "POST", body: JSON.stringify({ ranges }) });
  await call(accessToken, `${API}/${sheetId}/values:batchUpdate`, {
    method: "POST",
    // RAW keeps "2026-Q1" and "3" exactly as written, as the CSVs have them.
    body: JSON.stringify({ valueInputOption: "RAW", data: Object.entries(data).map(([t, rows]) => ({ range: tabRange(t), values: valuesFromRows(rows) })) }),
  });
}

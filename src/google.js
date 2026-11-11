// Google sign-in and Sheets API calls, entirely in the browser, as the signed-in person.
// Uses Google Identity Services' token model: a short-lived access token, no refresh token, no client secret.
// The only scope is drive.file: the app reaches only files the person has handed to it once in Google Picker.
import { rowsFromValues, valuesFromRows, tabRange, headerUpdate } from "./sheets.js";

const API = "https://sheets.googleapis.com/v4/spreadsheets";
export const SCOPE = "https://www.googleapis.com/auth/drive.file";
// Also asked for at sign-in: the person's own email, to know which teams they answer for. Non-sensitive.
export const EMAIL_SCOPE = "https://www.googleapis.com/auth/userinfo.email";
// Prototype pages also read any sheet the person can open, so the prototype sheet (shared within the organisation)
// needs no Picker. Only ever read; writes still go through drive.file.
export const READ_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";
export const scopesFor = ({ read = false } = {}) => [SCOPE, EMAIL_SCOPE, ...(read ? [READ_SCOPE] : [])];
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

function stored(opts) {
  try {
    const t = JSON.parse(sessionStorage.getItem(STORE) ?? "null");
    // A token lacking a scope now needed (e.g. from before it was added) is replaced by a new sign-in.
    return scopesFor(opts).every((s) => t?.scopes.includes(s)) && t.expires > Date.now() + 60_000 ? t.token : null;
  } catch {
    return null;
  }
}

// Resolves with a token if one is stored. Otherwise needs a click: call it from a click handler,
// or browsers block Google's popup.
// opts: { read: true } on prototype pages, see READ_SCOPE.
export async function token(clientId, opts) {
  const cached = stored(opts);
  if (cached) return cached;
  const oauth2 = await loadGis();
  return new Promise((resolve, reject) => {
    oauth2.initTokenClient({
      client_id: clientId,
      scope: scopesFor(opts).join(" "),
      callback: (res) => {
        if (res.error) return reject(new Error(res.error_description ?? res.error));
        try {
          sessionStorage.setItem(STORE, JSON.stringify({ token: res.access_token, scopes: res.scope.split(" "), expires: Date.now() + res.expires_in * 1000 }));
        } catch { /* storage blocked: sign in again on the next page */ }
        resolve(res.access_token);
      },
      error_callback: (err) => reject(new Error(err.message ?? err.type)),
    }).requestAccessToken();
  });
}
export const hasToken = (opts) => Boolean(stored(opts));
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

// Google Picker showing only the one expected sheet. Picking it hands that file to the app, for good.
async function pick({ clientId, pickerKey }, accessToken, sheetId, label, viewId = "SPREADSHEETS") {
  const picker = await loadPicker();
  return new Promise((resolve, reject) => {
    const view = new picker.DocsView(picker.ViewId[viewId]).setFileIds(sheetId).setMode(picker.DocsViewMode.LIST);
    new picker.PickerBuilder()
      .setTitle(`Select “${label}” to let this page use it`)
      .addView(view)
      .setOAuthToken(accessToken)
      .setDeveloperKey(pickerKey)
      // The app ID is the Cloud project number, the first part of the OAuth client ID.
      .setAppId(clientId.split("-")[0])
      .setCallback((res) => {
        if (res.action === picker.Action.PICKED) {
          return res.docs[0]?.id === sheetId ? resolve() : reject(new Error(`That isn't the ${label}. Please select the one shown.`));
        }
        if (res.action === picker.Action.CANCEL) reject(new Error(`The ${label} is needed to continue.`));
      })
      .build()
      .setVisible(true);
  });
}

// Runs fn; if Google says the app has no access to the sheet yet, asks the person to hand it over in the
// Picker once, then runs fn again. drive.file answers files not yet handed over with 404 (sometimes 403).
export async function withSheet(config, accessToken, sheetId, label, fn, viewId = "SPREADSHEETS") {
  try {
    return await fn();
  } catch (err) {
    if (err.status !== 404 && err.status !== 403) throw err;
    await pick(config, accessToken, sheetId, label, viewId);
    return fn();
  }
}

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

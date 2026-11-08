// Writes public/config.js from the SHEETS_CONFIG environment variable (JSON; see public/config.example.js).
// Used on deploy. Refuses anything that looks like an OAuth client secret: only public identifiers belong here.
import { writeFile } from "node:fs/promises";

const raw = process.env.SHEETS_CONFIG;
if (!raw) throw new Error("SHEETS_CONFIG is not set");
const config = JSON.parse(raw);
if (/secret/i.test(raw)) throw new Error("SHEETS_CONFIG must not contain a client secret");
if (!config.clientId?.endsWith(".apps.googleusercontent.com")) throw new Error("SHEETS_CONFIG.clientId is not an OAuth client ID");
if (!/^AIza[\w-]{35}$/.test(config.pickerKey ?? "")) throw new Error("SHEETS_CONFIG.pickerKey is not a Google API key");
if (!/^[\w-]{20,}$/.test(config.icFormId ?? "")) throw new Error("SHEETS_CONFIG.icFormId is not a form edit ID");
for (const key of ["projects", "discipline", "icResponses", "aggregate", "prototype"]) {
  if (!/^[\w-]{20,}$/.test(config.sheets?.[key] ?? "")) throw new Error(`SHEETS_CONFIG.sheets.${key} is not a sheet ID`);
}
await writeFile(new URL("../public/config.js", import.meta.url), `export default ${JSON.stringify(config, null, 2)};\n`);

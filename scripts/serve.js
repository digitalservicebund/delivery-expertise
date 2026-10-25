// Static file server for the prototype. Sends no-store so browsers always load the latest code and data.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const PORT = Number(process.env.PORT ?? 8000);
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".csv": "text/csv", ".md": "text/markdown" };

createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://localhost").pathname)).replace(/^(\.\.[/\\])+/, "");
  const rel = path.endsWith("/") ? `${path}index.html` : path;
  // Mirrors the GitHub Pages layout: pages live in public/, src/ and data/ sit beside them.
  const file = join(ROOT, rel);
  if (!file.startsWith(ROOT)) return res.writeHead(403).end();
  try {
    const body = await readFile(join(ROOT, "public", rel)).catch(() => readFile(file));
    res.writeHead(200, { "Content-Type": `${TYPES[extname(file)] ?? "application/octet-stream"}; charset=utf-8`, "Cache-Control": "no-store" });
    res.end(body);
  } catch {
    res.writeHead(404).end("Not found");
  }
}).listen(PORT, () => console.log(`http://localhost:${PORT}`));

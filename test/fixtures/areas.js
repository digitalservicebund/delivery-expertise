// A small areas tab, as the discipline sheet holds it, for tests. Ten default buckets.
import { readAreas } from "../../src/areas.js";

const row = (area, bucket, support = "cop") => ({ area, default_bucket: bucket, support });

export const AREA_ROWS = [
  row("Technical discovery", "Discovery & Inception"),
  row("Frontend development", "Frontend"),
  row("Design systems", "Frontend"),
  row("Backend development", "Backend"),
  row("Software architecture", "Architecture"),
  row("Application security", "Security & Compliance"),
  row("Data protection", "Security & Compliance", "legal"),
  row("CI/CD", "DevOps, CI/CD & Infrastructure", "platform"),
  row("Test automation", "Quality & Documentation"),
  row("Data engineering", "Data & AI"),
  row("Search", "Data & AI"),
  row("Feature development", "Software lifecycle"),
  row("Operations", "Software lifecycle", "platform"),
  row("Accessibility", "Accessibility"),
];
export const CATALOGUE = readAreas(AREA_ROWS);

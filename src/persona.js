// The individual engineer's view of the same data: their own ratings against discipline-wide demand.
// Only aggregates and the person's own ratings are used. No team or colleague is ever named.
import { change, METHOD_NAME, DOMAIN, PEOPLE_LEAD, reconciledStatus } from "./model.js";

const NEEDED = ["short", "strained", "fragile"];
const SPARE = ["surplus", "overqualified"];
export const SIGNAL = { needed: "In demand", grow: "Room to grow", steady: "Steady", watch: "Low demand" };
const ORDER = Object.keys(SIGNAL);

// The charted item a rating refers to: an expertise, or one domain of domain expertise.
function find(model, expertise) {
  const prefix = `${DOMAIN}: `;
  if (expertise.startsWith(prefix)) {
    const domain = expertise.slice(prefix.length);
    const item = model.expertise.find((e) => e.name === DOMAIN)?.domains.find((d) => d.name === domain);
    return { item, chart: DOMAIN, label: `${domain} (domain)` };
  }
  return { item: model.expertise.find((e) => e.name === expertise), chart: expertise, label: expertise };
}

// One signal per area the person is rated in, at their own working method.
function read(model, rating) {
  const { item, chart, label } = find(model, rating.expertise);
  const level = Math.min(6, rating.level);
  const method = level >= 3 ? METHOD_NAME[level] : "Learning";
  const base = { expertise: rating.expertise, chart, label, level, method, self: rating.self ?? null };
  if (!item?.current.total) return { ...base, signal: "watch", text: `No project or plan asks for ${label} this quarter.` };

  const levels = item.current.levels;
  const at = level >= 3 ? levels[level - 3] : null;
  const next = levels[Math.max(3, level + 1) - 3];
  const yearly = change(item.history[0].total, item.current.total);
  const falling = Number.isFinite(yearly) && yearly <= -0.25 ? ` Demand fell ${Math.round(-yearly * 100)}% over the year.` : "";
  const way = method.toLowerCase();

  // Signals use the same reconciled status the individual sees on the chart.
  if (at?.demand && NEEDED.includes(reconciledStatus(at))) {
    return { ...base, signal: "needed", text: `The discipline is short of ${way} ${label} work. Your skills count here.` };
  }
  if (next && next !== at && next.demand && NEEDED.includes(reconciledStatus(next))) {
    return { ...base, signal: "grow", text: `${METHOD_NAME[next.level]} ${label} work is in short supply, one step from where you are.` };
  }
  if (at && !at.demand) return { ...base, signal: "watch", text: `Projects aren't asking for ${way} ${label} work at the moment.${falling}` };
  if (at && SPARE.includes(reconciledStatus(at))) return { ...base, signal: "watch", text: `There is more ${way} ${label} capacity than projects need.${falling}` };
  if (falling) return { ...base, signal: "watch", text: falling.trim() };
  return { ...base, signal: "steady", text: `Supply and demand for ${way} ${label} work are in balance.` };
}

// ratings: the person's own scored ratings, as from personalRatings().
export function personaView(model, ratings) {
  const mine = ratings
    .filter((r) => r.level >= 3 && r.expertise !== PEOPLE_LEAD)
    .map((r) => read(model, r))
    .sort((a, b) => ORDER.indexOf(a.signal) - ORDER.indexOf(b.signal) || b.level - a.level);

  // Areas the discipline needs that the person doesn't work in yet: capabilities being built first, then the most urgent.
  const known = new Set(mine.map((m) => m.chart));
  const candidates = model.expertise.filter((e) => !e.role && !known.has(e.name));
  const building = candidates.filter((e) => e.plan.some((r) => r.reason === "Building a capability"));
  const urgent = candidates.filter((e) => e.urgency > 0 && !building.includes(e)).slice(0, 3);
  const learn = [
    ...building.map((e) => ({ chart: e.name, label: e.name, text: "The discipline is building this capability." })),
    ...urgent.map((e) => ({ chart: e.name, label: e.name, text: "Among the areas the discipline needs most." })),
  ];

  // Strongest working method per charted item, for marking the person on the chart. Domain ratings map to
  // both the aggregate Domain expertise spoke and their own domain, so the domain radial can mark them too.
  const position = new Map();
  for (const m of mine) {
    const put = (k) => position.set(k, Math.max(position.get(k) ?? 0, m.level));
    put(m.chart);
    if (m.chart === DOMAIN) put(m.label.replace(/\s*\(domain\)$/, ""));
  }
  // Self-assessed levels as their own shape: a petal wherever the person has rated themselves (level 3 and up).
  const selfPosition = new Map();
  // Every self-rating, low ones included, for comparing against the verified level.
  const selfLevel = new Map();
  for (const m of mine) {
    const put = (k) => {
      if (m.self != null) selfLevel.set(k, Math.max(selfLevel.get(k) ?? 0, m.self));
      if ((m.self ?? 0) >= 3) selfPosition.set(k, Math.max(selfPosition.get(k) ?? 0, Math.min(6, m.self)));
    };
    put(m.chart);
    if (m.chart === DOMAIN) put(m.label.replace(/\s*\(domain\)$/, ""));
  }
  return { mine, learn, position, selfPosition, selfLevel };
}

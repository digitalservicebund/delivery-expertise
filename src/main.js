import { parseCsv } from "./csv.js";
import { personaView, SIGNAL } from "./persona.js";
import { buildModel, change, LEVELS, METHOD_NAME, personalRatings, reconciledStatus, DOMAIN } from "./model.js";

const SOURCES = {
  demand: "data/project-demand.csv",
  assessments: "data/expertise-assessments.csv",
  activity: "data/historical-activity.csv",
  plan: "data/discipline-plan.csv",
  staffing: "data/staffing.csv",
};
const STATUS_LABEL = { short: "Critical shortage", strained: "Undersupplied", overqualified: "Overqualified", fragile: "Covered but fragile", covered: "Well covered", surplus: "Oversupplied", none: "Not demanded" };
const SEVERITY = ["short", "strained", "fragile", "overqualified", "surplus", "covered"];
const HTML = new Set(["table", "thead", "tbody", "tr", "td", "th", "h2", "p", "ul", "li", "i", "strong", "button", "span", "h3"]);
const forYou = document.getElementById("for-you");
const personaSwitch = document.getElementById("personas");

const svg = document.getElementById("chart");
const detail = document.getElementById("detail");
const scopeList = document.getElementById("scopes");
const expertiseList = document.getElementById("expertise");

function el(tag, attrs = {}, parent, text) {
  const node = document.createElementNS(HTML.has(tag) ? "http://www.w3.org/1999/xhtml" : "http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  parent?.append(node);
  return node;
}

const shortQuarter = (q) => q.slice(-2);
const fmt = (x) => (x === null ? "–" : String(Math.round(x * 100) / 100));
// Each ring is split: the left half is what projects report, the right half what up-to-date people ratings
// show. A half with no answer of its own for a working method borrows the other side's colour, hatched:
// the right half without fresh ratings shows the project's answer; the left half, where ratings place the
// team's reported gap in another working method, shows what the ratings say here. Hatching keeps the hue
// exact, where fading would turn orange into something that reads as yellow.
const STATUSES = ["short", "strained", "fragile", "covered", "overqualified", "surplus", "none"];
// Individuals see one reconciled, solid colour instead of the two sources side by side.
let reconciled = false;
// Purple is not used: work covered by someone more senior shows as well covered, hatched.
const asShown = (status) => (status === "overqualified" ? { status: "covered", hatched: true } : { status, hatched: false });
function sides(l) {
  if (reconciled) {
    const one = asShown(reconciledStatus(l));
    return [one, one];
  }
  const ratings = l.ratings && { status: l.ratings, hatched: false };
  const left = l.project === null || l.projectFaded ? { status: l.ratings ?? l.project ?? "none", hatched: true } : { status: l.project, hatched: false };
  return [left, ratings ?? { status: l.project, hatched: true }];
}
const svgFill = ({ status, hatched }) => (hatched ? `url(#hatch-${status})` : `var(--${status})`);
const cssFill = ({ status, hatched }) =>
  hatched ? `repeating-linear-gradient(45deg, var(--${status}) 0 1.5px, #fff 1.5px 3px)` : `linear-gradient(var(--${status}), var(--${status}))`;

// One diagonal hatch pattern per status, redrawn with the chart.
let defs;
function drawHatches() {
  defs = el("defs", {}, svg);
  for (const status of STATUSES) {
    const p = el("pattern", { id: `hatch-${status}`, width: 6, height: 6, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" }, defs);
    el("rect", { width: 3, height: 6, style: `fill:var(--${status})` }, p);
  }
}

const NEEDED = ["short", "strained", "fragile"];
// A full disc in the left colour with the right half laid over it, so agreeing halves look seamless.
function splitDisc(parent, cx, cy, r, l, emphasis = { opacity: 1 }) {
  const [left, right] = sides(l);
  const g = el("g", { opacity: emphasis.opacity }, parent);
  el("circle", { cx, cy, r, style: `fill:${svgFill(left)}` }, g);
  el("path", { d: `M${cx},${cy - r}A${r},${r} 0 0 1 ${cx},${cy + r}Z`, style: `fill:${svgFill(right)}` }, g);
  el("circle", { class: "ring", cx, cy, r }, g);
}
const splitDot = (l) => {
  const [left, right] = sides(l);
  return `background:${cssFill(left)} left / 50% 100% no-repeat, ${cssFill(right)} right / 50% 100% no-repeat`;
};

// Quarter-on-quarter demand change: saturation grows with magnitude, full at ±50%.
function trend(value) {
  if (value === null) return { text: "–", fill: "var(--flat)", ink: "var(--muted)" };
  if (value === Infinity) return { text: "new", fill: "var(--up)", ink: "#202124" };
  const pct = Math.round(value * 100);
  if (pct === 0) return { text: "0%", fill: "var(--flat)", ink: "var(--muted)" };
  const strength = Math.min(Math.abs(value) / 0.5, 1);
  return {
    text: `${pct > 0 ? "+" : ""}${pct}%`,
    fill: `color-mix(in srgb, var(${pct > 0 ? "--up" : "--down"}) ${Math.round(15 + 85 * strength)}%, white)`,
    ink: pct < 0 && strength > 0.55 ? "#fff" : "#202124", // the up colour is light: dark text throughout
  };
}
const changes = (values, quarters) => values.slice(1).map((v, i) => ({ quarter: quarters[i + 1], value: change(values[i], v) }));






// Radial alternative: one spoke per expertise, in urgency order clockwise from the top. Distance from the centre
// is the working method (operative inside, comprehensive outside); each dot's area is the people needed there,
// coloured like the rings. Selecting an expertise dims the other spokes; the table below gives the detail.
// For an individual, a thin line joins their working method on every spoke (the inner ring where they have none)
// into the area of their profile: demand inside it is within reach, demand just outside is the next step.
// The discipline head's mark for one working method on a spoke: one circle, area proportional to the people needed.
//   background and outline  pale, in the colour projects report for that row (grey where no project answered)
//   segments                one per person needed, filled one by one from the spoke's outward direction:
//                           from people data where it is verified, otherwise approximated from the project's answer
//                           (critical none, under half, adequate and over all), with nothing to tell them apart
//                           but the tick. Solid: people at that working method. Hatched: seniors stepping down.
//                           Colour by how much is filled: under half dark red ‼️, more orange ⚠️, all yellow if one person 😕,
//                           otherwise blue 👍. The status emoji leads the badges so status never relies on colour alone.
//   purple segments outside spare people beyond the need, one per person, just outside the circle
//   badges outside          status emoji, then 🙋 when the people data is verified, then support teams
//   support badges          support teams expect to draw on: 🛠️ platform, ⚖️ legal and IT security, 👥 community
const FILL_FROM_PROJECT = { critical: 0, under: 0.5, adequate: 1, over: 1 };
const STATUS_MARK = { short: "‼️", strained: "⚠️", fragile: "😕", covered: "👍" };
const SUPPORT_MARK ={ platform: "🛠️", legal: "⚖️", cop: "👥" };
const pale = (status, share = 35) => `color-mix(in srgb, var(--${status}) ${share}%, white)`;
// counts: optional { verified, own, above, spare } overriding the data, for the legend's example circle.
// individual: the engineers' style. One continuous pie without white dividers; background and outline in the colour
// the coverage implies rather than the project's answer; spare people as continuous purple rings; no corner markers.
// emphasis removed: the individual view shows every circle at full strength.
function circleMark(parent, x, y, l, size, spoke, counts = null, { individual = false } = {}) {
  const mark = el("g", {}, parent);
  const seats = Math.max(1, Math.round(l.demand));
  const r = size(l.demand);
  const background = el("circle", { cx: x, cy: y, r }, mark);

  const verified = counts ? counts.verified : l.project === null || l.ratings !== null;
  let own, above, spare;
  if (counts) ({ own, above, spare } = counts);
  else if (verified) {
    own = Math.min(seats, Math.round(l.capacity.people));
    above = Math.min(seats - own, Math.round(l.capacity.fromAbove));
    spare = Math.max(0, Math.round(l.capacity.people) - seats);
  } else {
    const estimate = l.teams.reduce((n, t) => n + t.demand * (FILL_FROM_PROJECT[t.coverage] ?? 1), 0);
    own = Math.min(seats, Math.round(estimate));
    above = 0;
    spare = l.teams.filter((t) => t.coverage === "over").length;
  }
  const filled = own + above;
  const colour = filled < seats / 2 ? "short" : filled < seats ? "strained" : seats === 1 ? "fragile" : "covered";
  const tint = individual ? colour : l.project ?? "none";
  // A subtle pulsing glow behind critical (less than half covered) circles.
  if (colour === "short") mark.prepend(el("circle", { class: "glow", cx: x, cy: y, r: r + 5 }));
  background.setAttribute("style", `fill:${pale(tint, 30)}`);

  const angle = (k) => spoke + (2 * Math.PI * k) / seats;
  const wedge = (k, inner, outer, step = 1) => {
    const [a0, a1] = [angle(k), angle(k + step)];
    const p = (rad, a) => `${x + rad * Math.cos(a)},${y + rad * Math.sin(a)}`;
    // A whole ring (one seat) cannot be drawn as a single arc: draw it as two halves.
    if (step >= seats && inner) {
      const am = (a0 + a1) / 2;
      return `M${p(outer, a0)}A${outer},${outer} 0 0 1 ${p(outer, am)}A${outer},${outer} 0 0 1 ${p(outer, a0)}` +
        `M${p(inner, a0)}A${inner},${inner} 0 0 0 ${p(inner, am)}A${inner},${inner} 0 0 0 ${p(inner, a0)}Z`;
    }
    const large = a1 - a0 > Math.PI ? 1 : 0;
    return inner
      ? `M${p(inner, a0)}L${p(outer, a0)}A${outer},${outer} 0 ${large} 1 ${p(outer, a1)}L${p(inner, a1)}A${inner},${inner} 0 ${large} 0 ${p(inner, a0)}Z`
      : `M${x},${y}L${p(outer, a0)}A${outer},${outer} 0 ${large} 1 ${p(outer, a1)}Z`;
  };
  for (let k = 0; k < filled; k++) {
    const style = k < own ? `fill:var(--${colour})` : `fill:url(#hatch-${colour})`;
    if (seats === 1) el("circle", { cx: x, cy: y, r, style }, mark);
    else el("path", { d: wedge(k, 0, r), style }, mark);
  }
  // Spare people: purple just outside the circle, one segment per person (continuous in the engineers' style),
  // continuing round onto further rings once a ring is full, however large the surplus.
  if (individual) {
    for (let left = spare, ring = 0; left > 0; left -= seats, ring++) {
      const inner = r + 3 + ring * 6;
      el("path", { class: "spare", "fill-rule": "evenodd", d: wedge(0, inner, inner + 4, Math.min(seats, left)) }, mark);
    }
  } else for (let k = 0; k < spare; k++) {
    const ring = Math.floor(k / seats);
    const inner = r + 3 + ring * 6;
    el("path", { class: "spare", "fill-rule": "evenodd", d: wedge(k % seats, inner, inner + 4) }, mark);
  }
  // White dividers between segments, running out through the spare rings too.
  const reach = spare ? r + 3 + (Math.ceil(spare / seats) - 1) * 6 + 4 : r;
  if (seats > 1 && !individual) {
    for (let k = 0; k < seats; k++) {
      el("line", { class: "segment", x1: x, y1: y, x2: x + reach * Math.cos(angle(k)), y2: y + reach * Math.sin(angle(k)) }, mark);
    }
  }
  el("circle", { class: "need-outline", cx: x, cy: y, r, style: `stroke:${pale(tint, 55)}` }, mark);
  // The outer radius including any spare rings, so corner marks clear them.
  if (individual) return reach;
  // Head-view badges sit just outside the circle, centred on the midpoint between the spoke (which exits
  // the top of the circle) and the working-method ring when rotating clockwise — the labelled lines the
  // badges must stay off. Multiple badges radiate symmetrically away from that midpoint, spaced to stay
  // legible: status first, then verified, then support teams.
  const mid0 = spoke + Math.PI / 4;
  const spread = Math.max(0.3, 16 / (reach + 15));
  const marks = [STATUS_MARK[colour], verified ? "🙋" : null, (l.support ?? []).map((key) => SUPPORT_MARK[key]).filter(Boolean).join("") || null].filter(Boolean);
  marks.forEach((text, k) => {
    const a = mid0 + (k - (marks.length - 1) / 2) * spread;
    el("text", { class: "badge", x: x + Math.cos(a) * (reach + 15), y: y + Math.sin(a) * (reach + 15) + 4, "text-anchor": "middle" }, mark, text);
  });
}

// A radial chart. Spokes are `items` (expertise, or the domains of domain expertise), numbered in urgency order;
// distance from the centre is the working method, operative inside. Selecting an item dims the other spokes.
//   number(e)  the label number of a spoke; select(e) what clicking it selects; key(e) its name in people profiles
function renderRadial(model, items, { selected, you, cx, cy, R, number, choose, key = (e) => e.name, labels = true, centre = null }) {
  // An empty core keeps "no rating" off the dead centre, so the rose is always one many-sided shape.
  const core = R * 0.15;
  const radius = (level) => core + ((R - core) * (level - 2)) / 4;
  const step = (R - core) / 4;
  const chart = el("g", {}, svg);
  el("circle", { class: "axis", cx, cy, r: core, fill: "none" }, chart);
  const most = Math.max(0.25, ...items.flatMap((e) => e.current.levels.map((l) => l.demand)));
  const dot = (demand) => Math.max(2.5, Math.sqrt(demand / most) * step * 0.45);
  for (const level of LEVELS) {
    el("circle", { class: "axis", cx, cy, r: radius(level), fill: "none" }, chart);
  }
  // Rated people's depth and the profile rose, in semi-transparent grey, behind the circles.
  const peopleLayer = el("g", {}, chart);
  const spokeLayer = el("g", {}, chart);
  const n = items.length;
  const angleOf = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const point = (i, r) => [cx + r * Math.cos(angleOf(i)), cy + r * Math.sin(angleOf(i))];
  // Grid labels: subtle grey text centred on the lines, conforming to their direction and repeating on
  // every stretch between intersections — method names along each ring's arc segments, item names along
  // each spoke's segments between the rings.
  if (labels) {
    const gridLabel = (x, y, angle, text, cls = "grid-label") => {
      let deg = (angle * 180) / Math.PI;
      if (Math.cos(angle) < 0) deg += 180; // keep the text upright
      el("text", { class: cls, x, y, dy: 3, "text-anchor": "middle", transform: `rotate(${deg.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})` }, chart, text);
    };
    for (const [li, level] of LEVELS.entries()) {
      const rr = radius(level);
      for (let i = 0; i < n; i++) {
        // Every second segment, staggered ring to ring, so labels never crowd on small screens.
        if ((i + li) % 2) continue;
        const mid = angleOf(i) + Math.PI / n;
        gridLabel(cx + rr * Math.cos(mid), cy + rr * Math.sin(mid), mid + Math.PI / 2, METHOD_NAME[level]);
      }
    }
    items.forEach((e, i) => {
      const a = angleOf(i);
      const stops = [core, ...LEVELS.slice(0, -1).map(radius), R];
      for (let k = 0; k + 1 < stops.length; k++) {
        if ((k + i) % 2) continue; // every second stretch, staggered spoke to spoke
        const rr = (stops[k] + stops[k + 1]) / 2;
        gridLabel(cx + rr * Math.cos(a), cy + rr * Math.sin(a), a, e.name);
      }
      // The outermost label sits on an invisible ring a third of a ring-spacing beyond the outer one,
      // centred where the extended spoke meets it, conforming to the ring like the method labels, in the
      // same style as the centre label.
      gridLabel(cx + (R + step / 3) * Math.cos(a), cy + (R + step / 3) * Math.sin(a), a + Math.PI / 2, e.name, "tick bold");
    });
  }

  chart.classList.toggle("dimmed", Boolean(selected) && items.includes(selected));
  items.forEach((e, i) => {
    const angle = angleOf(i);
    const at = (r) => point(i, r);
    const g = el("g", { class: e.role ? "glyph role" : "glyph", tabindex: 0, role: "button", "aria-label": `${e.name}: ${fmt(e.current.total)} people needed` }, chart);
    if (e === selected) g.classList.add("active");
    const [x1, y1] = at(core), [x2, y2] = at(R);
    el("line", { class: "axis", x1, y1, x2, y2 }, spokeLayer);
    let own = null, step = null; // the person's own circle, and the frontier circle one method up
    for (const l of [...e.current.levels].reverse().filter((l) => l.demand > 0)) {
      const [x, y] = at(radius(l.level));
      const out = circleMark(g, x, y, l, dot, angle, null, you ? { individual: true } : {});
      const mine = you?.position.get(key(e));
      if (mine && l.level === Math.min(6, mine)) own ??= { x, y, reach: out };
      if (mine && l.level === Math.min(6, mine + 1)) step = { x, y, reach: out, l };
    }
    // The individual's marks all sit just outside the outermost of their own and the frontier circle,
    // offset clockwise off the spoke's labels and rotating further for each subsequent one: 🎯 a shortage
    // one working method up first, then 🔥/🧊 demand rising or falling.
    if (you && (own || step)) {
      const outer = step ?? own;
      const v = change(e.history.at(-2)?.total, e.current.total);
      const marks = [
        step && NEEDED.includes(reconciledStatus(step.l)) ? "🎯" : null,
        Number.isFinite(v) && Math.abs(v) > 0.1 ? (v > 0 ? "🔥" : "🧊") : null,
      ].filter(Boolean);
      const mid0 = angle + Math.PI / 4; // midpoint between the spoke and the next ring clockwise
      const spread = Math.max(0.3, 16 / (outer.reach + 15));
      marks.forEach((m, k) => {
        const a = mid0 + (k - (marks.length - 1) / 2) * spread;
        el("text", { class: "badge", x: outer.x + Math.cos(a) * (outer.reach + 15), y: outer.y + Math.sin(a) * (outer.reach + 15) + 4, "text-anchor": "middle" }, g, m);
      });
    }

    const highlight = (on) => {
      if (selected) return;
      chart.classList.toggle("dimmed", on);
      g.classList.toggle("active", on);
    };
    highlighters.set(e.name, highlight);
    g.addEventListener("mouseenter", () => highlight(true));
    g.addEventListener("mouseleave", () => highlight(false));
    g.addEventListener("focus", () => highlight(true));
    g.addEventListener("blur", () => highlight(false));
    g.addEventListener("click", (ev) => (ev.stopPropagation(), select(choose(e) === selected?.name ? null : choose(e))));
    g.addEventListener("keydown", (ev) => ev.key === "Enter" && select(choose(e)));
  });

  // A rose: a solid centre circle with one straight-edged petal per spoke, tip at the given radius
  // (null skips the spoke). Petals meet their neighbours edge to edge and start on the centre circle,
  // all as one seamless path.
  const rose = (tips) => {
    const w = Math.PI / n;
    const base = core; // the solid centre: the whole core circle
    const P = (ang, rad) => `${cx + rad * Math.cos(ang)},${cy + rad * Math.sin(ang)}`;
    let d = `M${cx + base},${cy}A${base},${base} 0 1 0 ${cx - base},${cy}A${base},${base} 0 1 0 ${cx + base},${cy}Z`;
    tips.forEach((r, i) => {
      if (r === null) return;
      const a = angleOf(i);
      // Wound the same way round as the circle, so the nonzero fill rule unions them without notches.
      d += `M${P(a + w, base)}L${P(a + w, r)}L${P(a, r)}L${P(a - w, r)}L${P(a - w, base)}Z`;
    });
    return d;
  };
  // The self-assessed rose as one unbroken outline. Adjacent petals share an edge, so their tips connect
  // straight across it; only a spoke with no self-assessment dips down to follow the core curve.
  const roseLine = (tips) => {
    const w = Math.PI / n;
    const P2 = (ang, rad) => `${cx + rad * Math.cos(ang)},${cy + rad * Math.sin(ang)}`;
    const circle = `M${cx + core},${cy}A${core},${core} 0 1 1 ${cx - core},${cy}A${core},${core} 0 1 1 ${cx + core},${cy}`;
    const idx = tips.map((r, i) => (r === null ? null : i)).filter((i) => i !== null);
    if (!idx.length) return circle; // nothing self-assessed: just the centre circle
    const arc = (from, to) => {
      let delta = to - from;
      while (delta < 0) delta += 2 * Math.PI;
      return `A${core},${core} 0 ${delta > Math.PI ? 1 : 0} 1 ${P2(to, core)}`;
    };
    let d = `M${P2(angleOf(idx[0]) - w, tips[idx[0]])}`;
    idx.forEach((i, k) => {
      const a = angleOf(i), r = tips[i];
      d += `L${P2(a, r)}L${P2(a + w, r)}`; // across the tip
      const j = idx[(k + 1) % idx.length], rj = tips[j], aj = angleOf(j);
      if ((j - i + n) % n === 1) return (d += `L${P2(aj - w, rj)}`); // shared edge: straight to the next tip
      d += `L${P2(a + w, core)}${arc(a + w, aj - w)}L${P2(aj - w, rj)}`; // gap: dip to the core curve
    });
    return d + "Z";
  };
  // A tip reaches just past its level's ring: between it and the next, or just outside the outer ring at
  // the most senior method.
  const tipAt = (level) => (level >= 6 ? R + 6 : radius(level) + step / 2);

  // Discipline head: one aggregate frontier shape. Each petal reaches the most senior working method
  // anyone in scope is rated at (skipping spokes nobody is rated on). No individual is drawn.
  if (!you && n > 2) {
    const tips = items.map((e) => {
      const levels = model.profiles.filter((p) => p.has(key(e))).map((p) => p.get(key(e)));
      const top = LEVELS.findLast((L) => levels.some((x) => x >= L));
      return top ? tipAt(top) : null;
    });
    if (tips.some((r) => r !== null)) el("path", { class: "rated-band", d: rose(tips) }, peopleLayer);
  }

  // Individual: the verified profile rose, with the self-assessed rose as a dotted outline underneath.
  if (you && n > 2) {
    const selfTips = items.map((e) => {
      const lvl = you.selfPosition.get(key(e));
      return lvl ? tipAt(lvl) : null;
    });
    if (selfTips.some((r) => r !== null)) el("path", { class: "profile self", d: roseLine(selfTips) }, peopleLayer);
    const tips = items.map((e) => {
      const lvl = you.position.get(key(e));
      return lvl ? tipAt(lvl) : null;
    });
    el("path", { class: "profile", d: rose(tips) }, peopleLayer);
    // Gaps between self-assessment and verified level: yellow where self is higher, blue where colleagues rate higher.
    const w = Math.PI / n;
    const P = (ang, rad) => `${cx + rad * Math.cos(ang)},${cy + rad * Math.sin(ang)}`;
    const reach = (lvl) => (lvl >= 3 ? tipAt(Math.min(6, lvl)) : core);
    items.forEach((e, i) => {
      const self = you.selfLevel?.get(key(e)), verified = you.position.get(key(e));
      if (self == null || verified == null) return;
      const rs = reach(self), rv = reach(verified);
      if (rs === rv) return;
      const a = angleOf(i), [lo, hi] = rs < rv ? [rs, rv] : [rv, rs];
      const inflated = rs > rv;
      const zone = el("path", {
        class: `gap-zone ${inflated ? "reflection" : "imposter"}`,
        d: `M${P(a - w, lo)}L${P(a, lo)}L${P(a + w, lo)}L${P(a + w, hi)}L${P(a, hi)}L${P(a - w, hi)}Z`,
      }, peopleLayer);
      el("title", {}, zone, inflated
        ? `Reflection zone · ${e.name}: you rate yourself higher than your verified peer assessments. Might your sense of your performance here be inflated? Or is there something your colleagues aren't seeing, and what might the reasons be?`
        : `Imposter zone · ${e.name}: your colleagues rate you higher than you rate yourself. What might they be seeing that you don't? Why might there be a gap in your confidence here?`);
    });
  }
  // A label in the solid centre of the rose.
  if (centre) el("text", { class: "tick bold", x: cx, y: cy + 4, "text-anchor": "middle" }, chart, centre);
  return chart;
}

// Hover handlers per expertise, so the expertise list can highlight glyphs on the chart.
const highlighters = new Map();

// The main chart, with domain expertise on its own smaller radial chart in the top right: domains are not
// comparable with the technical areas, and would skew their spoke. you: the individual view, or null.
// An example circle with each of its elements labelled: drawn by circleMark itself, so it cannot drift from the
// real circles. Five people needed, two filled by people at that working method, one by someone more senior, two
// empty, and two spare: counts that cannot all occur at once, chosen to show every element.
function drawLegend(cx, cy, size, individual = false) {
  const group = el("g", { class: "legend-circle" }, svg);
  const example = { demand: 5, project: "strained", ratings: "strained", teams: [], support: ["platform", "cop"] };
  circleMark(group, cx, cy, example, () => size, -Math.PI / 2, { verified: true, own: 2, above: 1, spare: 2 }, { individual });
  el("text", { class: "legend-title", x: cx, y: cy - size - 28, "text-anchor": "middle" }, group, "Reading a circle");
  const mid = (k) => -Math.PI / 2 + ((k + 0.5) * 2 * Math.PI) / 5; // middle of segment k
  const at = (a, r) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  const reach = size + 7; // the circle's outer edge, past the spare rings the example shows
  // Badges sit just outside the circle, centred on the midpoint between the vertical spoke and the next
  // ring clockwise, radiating symmetrically apart like the real badges do.
  const spread = Math.max(0.3, 16 / (reach + 15));
  const base = -Math.PI / 2 + Math.PI / 4;
  const first = at(base - spread / 2, reach + 15), second = at(base + spread / 2, reach + 15);
  const callouts = [
    // [point on the circle, side, slot from top (-1) to bottom (1), label]
    [second, 1, -0.7, "🛠️ platform ⚖️ legal 👥 CoP"],
    [at(mid(0), size * 0.6), 1, -0.35, "Solid: rated people"],
    [at(mid(1) - 0.2, size + 5), 1, 0.3, "Blue outside: spare people"],
    [at(mid(2), size * 0.6), 1, 0.95, "Hatched: someone more senior"],
    [first, -1, -1.05, "🙋 verified by people data"],
    [at(Math.PI * 1.15, size), -1, -0.2, "Ring: projects' report"],
    [at(mid(3), size * 0.6), -1, 0.6, "Empty: no one yet"],
  ];
  const shown = individual
    ? callouts.filter(([, , , text]) => !/platform|verified|projects' report/.test(text)).concat([
        [at(Math.PI * 1.15, size), -1, -0.2, "Colour: how well covered"],
        [first, -1, -1.05, "🎯 shortage one method up: a target"],
        [second, 1, -0.7, "🔥 demand rising · 🧊 falling"],
      ])
    : callouts;
  // The individual's marks on the example circle, fanned like the real ones.
  if (individual) {
    el("text", { class: "badge", x: first[0], y: first[1] + 4, "text-anchor": "middle" }, group, "🎯");
    el("text", { class: "badge", x: second[0], y: second[1] + 4, "text-anchor": "middle" }, group, "🔥");
  }
  for (const [[px, py], side, slot, text] of shown) {
    const lx = cx + side * (size + 26), ly = cy + slot * size;
    el("line", { class: "legend-leader", x1: px, y1: py, x2: lx - side * 3, y2: ly - 3 }, group);
    el("text", { class: "legend-label", x: lx, y: ly, "text-anchor": side > 0 ? "start" : "end" }, group, text);
  }
}

function renderChart(model, selected, you = null) {
  const { width, height } = svg.getBoundingClientRect();
  if (!width || !height) return;
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.replaceChildren();
  drawHatches();
  highlighters.clear();
  const domain = model.expertise.find((e) => e.name === DOMAIN);
  const main = model.expertise.filter((e) => e !== domain);
  const rank = (e) => model.expertise.indexOf(e) + 1;
  // The main chart sits on the left. The right-hand column holds the legend (discipline head) and the domain chart.
  // Spoke labels need about 80px around each chart; the outer labels sit just past the outer ring.
  const label = 80;
  const domains = domain?.domains?.filter((d) => d.current.total) ?? [];
  const hasDomains = domains.length > 2;
  // With domain demand, the domain chart sits in a right-hand column while both fit; on narrower
  // screens it stacks below the main chart at the same size. Without it, the main chart goes full
  // size. In the last two layouts there is no column, so the legend sits in the top right corner.
  const legendSizeOf = (R) => Math.max(22, 1.5 * ((R * 0.85) / 4) * 0.45); // half as large again as the chart's biggest circle
  // Side by side only while the main chart is height-limited, so the column never costs it size:
  // as soon as the main radial fills the container's width, the domain chart drops underneath it.
  const column = hasDomains && height / 2 - 90 <= width / 2 - label;
  const R = Math.max(60, Math.min(column ? height / 2 - 90 : hasDomains ? height / 4 - 55 : height / 2 - 90, (column ? width * 0.62 : width) / 2 - label));
  const mainX = column ? R + label : width / 2;
  const mainY = column ? height / 2 : hasDomains ? height / 4 + 15 : height / 2;
  renderRadial(model, main, { selected, you, cx: mainX, cy: mainY, R, number: rank, choose: (e) => e.name, centre: you ? "Own verified expertise" : "Discipline expertise frontier" });

  const domainChart = (cx, cy, r) =>
    renderRadial(model, domains, { selected: selected === domain ? domains[0] : null, you, cx, cy, R: r, number: (d) => domains.indexOf(d) + 1, choose: () => DOMAIN, centre: DOMAIN });
  // Leadership roles below the domain chart: one straight line per role, the radial's spoke straightened out,
  // with the same circles at each working method. Spans three quarters of the domain chart's diameter; names to the left.
  // Individuals see them too, like expertise: discipline-wide, in their own circle style, with no teams in the drill-down.
  const roles = model.roles;
  const linesHeight = (r) => (roles.length ? 24 + roles.length * lineRow(r) : 0);
  const lines = (cx, top, r) => roles.length && renderLines(roles, { selected, x0: cx - LINE_SPAN * r, x1: cx + LINE_SPAN * r, top, row: lineRow(r), big: lineDot(r), individual: Boolean(you) });
  if (column) {
    const left = mainX + R + label; // where the main chart's labels end
    const room = width - left;
    const colX = left + room / 2;
    const legendY = 60 + legendSizeOf(R);
    drawLegend(colX, legendY, legendSizeOf(R), Boolean(you));
    const top = legendY + legendSizeOf(R) + 30;
    const avail = height - top;
    // The domain chart needs its diameter plus about 70px of labels either side, less the lines' room.
    const fit = (lift) => Math.max(50, Math.min(room / 2 - label, (avail - 140 - lift) / 2, R * 0.75));
    const r = fit(linesHeight(fit(0)));
    const above = height - linesHeight(r) - 10; // where the lines start, at the bottom of the column
    domainChart(colX, top + (above - top) / 2, r);
    lines(colX, above, r);
  } else if (hasDomains) {
    drawLegend(width - 140, 110, legendSizeOf(R), Boolean(you));
    const top = height / 2 + 10;
    // Same size as the main chart unless the lines need room.
    const fit = (lift) => Math.max(50, Math.min(R, (height - top - 140 - lift) / 2));
    const r = roles.length ? fit(linesHeight(fit(0))) : R;
    const above = height - linesHeight(r) - 10;
    domainChart(width / 2, roles.length ? top + (above - top) / 2 : (3 * height) / 4 - 10, r);
    lines(width / 2, above, r);
  } else {
    drawLegend(width - 140, 110, legendSizeOf(R), Boolean(you));
    lines(width - 160, 110 + legendSizeOf(R) + 50, 110);
  }
  if (you) el("text", { class: "tick", x: width / 2, y: height - 12, "text-anchor": "middle" }, svg, "Shaded: your profile · fainter: your self-assessment · yellow: reflection zone · blue: imposter zone");
}

// The height of one line of roles for a span of 2r: room for the largest circle, its badges, and a gap.
// Roles need conceptual working method or above, so their lines show levels 4 to 6 only.
const LINE_LEVELS = LEVELS.filter((level) => level >= 4);
const LINE_SPAN = 0.75; // half the line's length, as a share of the domain chart's radius
const lineDot = (r) => Math.min(((2 * LINE_SPAN * r) / (LINE_LEVELS.length - 1)) * 0.3, 22);
const lineRow = (r) => 2 * lineDot(r) + 30;

// Roles as straight lines, level 4 on the left to level 6 on the right, with the radial's circles at
// each working method: the spoke points up, so segments start at twelve o'clock and badges sit top right.
function renderLines(items, { selected, x0, x1, top, row, big, individual }) {
  const chart = el("g", {}, svg);
  const xOf = (level) => x0 + ((x1 - x0) * (level - LINE_LEVELS[0])) / (LINE_LEVELS.length - 1);
  const most = Math.max(0.25, ...items.flatMap((e) => e.current.levels.map((l) => l.demand)));
  const dot = (demand) => Math.max(2.5, Math.sqrt(demand / most) * big);
  for (const level of LINE_LEVELS) el("text", { class: "grid-label", x: xOf(level), y: top + 10, "text-anchor": "middle" }, chart, `Level ${level}`);
  chart.classList.toggle("dimmed", Boolean(selected) && items.includes(selected));
  items.forEach((e, i) => {
    const y = top + 24 + row * i + row / 2;
    el("line", { class: "axis", x1: x0, y1: y, x2: x1, y2: y }, chart);
    el("text", { class: "tick bold", x: x0 - big - 14, y: y + 4, "text-anchor": "end" }, chart, e.name); // clear of the largest circle
    const g = el("g", { class: "glyph", tabindex: 0, role: "button", "aria-label": `${e.name}: ${fmt(e.current.total)} people needed` }, chart);
    if (e === selected) g.classList.add("active");
    for (const l of e.current.levels.filter((l) => l.demand > 0 && LINE_LEVELS.includes(l.level))) circleMark(g, xOf(l.level), y, l, dot, -Math.PI / 2, null, { individual });
    const highlight = (on) => {
      if (selected) return;
      chart.classList.toggle("dimmed", on);
      g.classList.toggle("active", on);
    };
    highlighters.set(e.name, highlight);
    g.addEventListener("mouseenter", () => highlight(true));
    g.addEventListener("mouseleave", () => highlight(false));
    g.addEventListener("focus", () => highlight(true));
    g.addEventListener("blur", () => highlight(false));
    g.addEventListener("click", (ev) => (ev.stopPropagation(), select(e.name === selected?.name ? null : e.name)));
    g.addEventListener("keydown", (ev) => ev.key === "Enter" && select(e.name));
  });
}

function renderDetail(model, e, individual = false) {
  detail.hidden = !e;
  detail.replaceChildren();
  if (!e) return;
  el("h2", {}, detail, e.name);

  const { current } = e;
  // Domain expertise is matched per domain, so its table is split by domain.
  if (e.domains) {
    for (const d of e.domains) {
      el("h3", {}, detail, d.name);
      renderTable(model, d, detail, individual);
    }
  } else renderTable(model, e, detail, individual);
  if (individual) return;

  if (e.plan.length) {
    el("h3", {}, detail, "Discipline plan");
    const list = el("ul", {}, detail);
    for (const r of e.plan) {
      const value = Number(r.value);
      el("li", {}, list, `${value > 0 ? "+" : ""}${value} ${r.method}: ${r.reason}`);
    }
  }

  // Over-supply as projects report it, whatever colour shortages elsewhere give the rings.
  const lenders = (key) => [...new Set(current.levels.flatMap((l) => l[key]))];
  const offers = [["More than needed", lenders("share")]].filter(([, teams]) => teams.length);
  if (offers.length) {
    el("h3", {}, detail, "Teams reporting more than needed");
    const list = el("ul", {}, detail);
    for (const [label, teams] of offers) {
      const li = el("li", {}, list);
      el("strong", {}, li, `${label}: `);
      li.append(teams.join(" · "));
    }
  }

  const notes = current.notes;
  if (notes.length) {
    el("h3", {}, detail, "Sources disagree");
    const list = el("ul", {}, detail);
    for (const n of notes) {
      const li = el("li", {}, list);
      if (n.level) el("strong", {}, li, `${METHOD_NAME[n.level]}: `);
      li.append(n.text);
      if (n.teams) el("p", { class: "muted" }, li, n.teams.join(" · "));
    }
  }

  if (!e.actions.length) return;
  el("h3", {}, detail, "Actions");
  const list = el("ul", {}, detail);
  for (const a of e.actions) {
    const li = el("li", {}, list);
    el("strong", {}, li, `${a.action}: `);
    li.append(a.text);
    if (a.teams?.length) el("p", { class: "muted" }, li, a.teams.join(" · "));
  }
}

// One row per working method with demand, for an expertise or a single domain of domain expertise.
function renderTable(model, e, parent, individual = false) {
  const { current } = e;
  const table = el("table", {}, parent);
  const head = el("tr", {}, el("thead", {}, table));
  const recordedIn = current.activityQuarter ? `Recorded in ${shortQuarter(current.activityQuarter)}` : "Recorded";
  const anyPlanned = current.levels.some((l) => l.planned), anyPlatform = current.levels.some((l) => l.platformFrom);
  const headers = ["", "People needed", ...(anyPlanned ? ["Discipline plan"] : []), "Gap", ...(anyPlatform ? ["From platform"] : []), recordedIn, "Engineers rated", ...(individual ? ["Status"] : ["Projects report", "People ratings show"])];
  for (const h of headers) el("th", {}, head, h);
  for (const q of model.quarters.slice(1)) el("th", { class: "trend-cell" }, head, `${shortQuarter(q)} change`);

  const body = el("tbody", {}, table);
  for (const l of [...current.levels].reverse()) {
    if (!l.demand && !l.activity) continue;
    const tr = el("tr", {}, body);
    el("td", {}, tr, METHOD_NAME[l.level]);
    el("td", {}, tr, fmt(l.demand));
    if (anyPlanned) el("td", {}, tr, l.planned ? `${l.planned > 0 ? "+" : ""}${fmt(l.planned)}` : "–");
    // Located gaps are confirmed by fresh ratings; the rest is reported by leads but not yet placed.
    el("td", {}, tr, l.gap || l.unlocated ? [l.gap && fmt(l.gap), l.unlocated && `${fmt(l.unlocated)} not located`].filter(Boolean).join(" + ") : "–");
    if (anyPlatform) el("td", { title: "Teams expecting this from the platform team" }, tr, l.platformFrom ? `${l.platformFrom} teams` : "–");
    el("td", {}, tr, fmt(l.activity));
    el("td", {}, tr, String(l.people));
    if (individual) {
      const cell = el("td", {}, tr);
      const status = reconciledStatus(l);
      el("i", { style: `background:var(--${status})` }, cell);
      cell.append(STATUS_LABEL[status]);
    } else {
    const reported = el("td", {}, tr);
    el("i", { style: `background:${cssFill(sides(l)[0])}` }, reported);
    reported.append(l.project === null ? "No project demand" : l.projectFaded ? "Gap reported, placed elsewhere by ratings" : STATUS_LABEL[l.project]);
    const shown = el("td", {}, tr);
    if (l.ratings) el("i", { style: `background:var(--${l.ratings})` }, shown);
    shown.append(l.ratings ? STATUS_LABEL[l.ratings] : "Not enough up-to-date ratings");
    // Which teams the ratings half rests on, when only some of them have fresh ratings.
    const fresh = l.teams.filter((t) => t.fresh).length;
    if (!individual && l.teams.length > 1 && fresh < l.teams.length) {
      el("span", { class: "muted", title: l.teams.filter((t) => t.fresh).map((t) => t.team).join(" · ") }, shown, ` · ${fresh} of ${l.teams.length} teams rated`);
    }
    }
    for (const c of changes(e.history.map((h) => h.levels[l.level - 3].demand), model.quarters)) {
      const t = trend(c.value);
      el("td", { class: "trend-cell", style: `background:${t.fill};color:${t.ink}` }, tr, t.text);
    }
  }

}

// The most severe status across levels; confirmed problems outrank provisional ones.
function worst(e) {
  const levels = e.current.levels.filter((l) => SEVERITY.includes(l.status));
  return levels.sort((a, b) => SEVERITY.indexOf(a.status) - SEVERITY.indexOf(b.status) || a.provisional - b.provisional)[0];
}

// Ordered by urgency: the gap weighted by how badly teams say it hurts. Numbered, with a bar for the size of
// the urgency, and a divider before expertise with no reported gaps.
function renderExpertiseList(model, selected) {
  expertiseList.replaceChildren();
  el("li", { class: "list-heading" }, expertiseList, "Most urgent first");
  const most = Math.max(0, ...model.expertise.map((e) => e.urgency));
  let divided = false;
  model.expertise.forEach((e, i) => {
    if (!divided && !e.urgency && i > 0) {
      el("li", { class: "list-heading" }, expertiseList, "No reported gaps");
      divided = true;
    }
    const button = el("button", { "aria-pressed": String(e.name === selected?.name) }, el("li", {}, expertiseList));
    el("span", { class: "rank" }, button, String(i + 1));
    const w = worst(e);
    el("i", w ? { style: splitDot(w) } : { class: "none" }, button);
    button.append(e.name);
    if (e.urgency) el("span", { class: "bar", style: `width:${(e.urgency / most) * 100}%` }, button);
    button.addEventListener("mouseenter", () => highlighters.get(e.name)?.(true));
    button.addEventListener("mouseleave", () => highlighters.get(e.name)?.(false));
    button.addEventListener("click", () => select(e.name === selected?.name ? null : e.name));
  });
}

// The individual's areas of expertise, most in demand first, each with its signal.
function renderPersonaList(you, selected) {
  expertiseList.replaceChildren();
  el("li", { class: "list-heading" }, expertiseList, "Your expertise");
  for (const m of you.mine) {
    const button = el("button", { "aria-pressed": String(m.chart === selected?.name), title: m.text }, el("li", {}, expertiseList));
    el("span", { class: `tag ${m.signal}` }, button, SIGNAL[m.signal]);
    button.append(`${m.label} `);
    el("span", { class: "muted" }, button, m.method);
    button.addEventListener("mouseenter", () => highlighters.get(m.chart)?.(true));
    button.addEventListener("mouseleave", () => highlighters.get(m.chart)?.(false));
    button.addEventListener("click", () => select(m.chart === selected?.name ? null : m.chart));
  }
}

// What the data means for the individual: where they are needed, where to grow, what to reconsider, what to learn.
function renderForYou(you) {
  forYou.replaceChildren();
  const section = (title, items) => {
    if (!items.length) return;
    el("h3", {}, forYou, title);
    const list = el("ul", {}, forYou);
    for (const m of items) {
      const li = el("li", {}, list);
      el("strong", {}, li, `${m.label}${m.method ? ` (${m.method.toLowerCase()})` : ""}. `);
      li.append(m.text);
    }
  };
  const by = (signal) => you.mine.filter((m) => m.signal === signal);
  section("Your skills in demand", by("needed"));
  section("Room to grow", by("grow"));
  section("Worth reconsidering", by("watch"));
  section("Areas the discipline needs", you.learn);
}

// Personas: the discipline head, and one real (pseudonymous) engineer at each level, the most widely rated.
function pickPersonas({ staffing, assessments }) {
  const latest = staffing.map((r) => r.quarter).sort().at(-1);
  const staffed = staffing.filter((r) => r.quarter === latest);
  const breadth = (person) => new Set(assessments.filter((r) => r.respondent === person && Number(r.level) >= 3).map((r) => `${r.expertise}|${r.domain}`)).size;
  const engineers = [[6, "Principal"], [5, "Senior"], [4, "Regular"], [3, "Entry-level"]].flatMap(([level, title]) => {
    const best = staffed
      .filter((r) => Number(r.level) === level)
      .map((r) => ({ person: r.person, rated: breadth(r.person) }))
      .sort((a, b) => b.rated - a.rated || a.person.localeCompare(b.person))[0];
    return best ? [{ key: best.person, label: `${title} (L${level})` }] : [];
  });
  return [{ key: "head", label: "Discipline head" }, ...engineers];
}

function renderPersonas() {
  personaSwitch.replaceChildren();
  for (const p of personas) {
    const button = el("button", { "aria-pressed": String(p.key === state.persona) }, personaSwitch, p.label);
    button.addEventListener("click", () => {
      state.persona = p.key;
      state.selected = null;
      update();
    });
  }
}

// Scope values: "" for everything, "p:<project>" or "t:<project> / <team>".
function populateScopes(staffing) {
  const add = (value, label, cls = "") => {
    const button = el("button", { "data-scope": value, title: label, class: cls }, el("li", {}, scopeList), label);
    button.addEventListener("mouseenter", () => preview(value));
    button.addEventListener("click", () => confirmScope(value));
  };
  add("", "All projects");
  // Projects and teams as staffed in the latest quarter.
  const latest = staffing.map((r) => r.quarter).sort().at(-1);
  const byProject = Map.groupBy(staffing.filter((r) => r.quarter === latest), (r) => r.project);
  for (const [project, rows] of [...byProject].sort(([a], [b]) => a.localeCompare(b))) {
    add(`p:${project}`, project);
    const teams = [...new Set(rows.map((r) => r.team))].sort();
    if (teams.length > 1) for (const t of teams) add(`t:${t}`, t.slice(project.length + 3), "team");
  }
  scopeList.addEventListener("mouseleave", () => preview(null));
}

function scopePredicate(value) {
  if (!value) return () => true;
  if (value.startsWith("t:")) return (team) => team === value.slice(2);
  const prefix = `${value.slice(2)} / `;
  return (team) => team.startsWith(prefix);
}

let data;
const state = { scope: "", preview: null, selected: null, persona: "head" };

let personas = [];
const models = new Map();
function modelFor(scope) {
  if (!models.has(scope)) {
    const model = buildModel(data, scopePredicate(scope));
    // Only expertise demanded this quarter is charted or listed. Leadership roles are drawn as straight lines instead.
    const shown = model.expertise.filter((e) => e.current.total);
    models.set(scope, { ...model, expertise: shown.filter((e) => !e.role), roles: shown.filter((e) => e.role) });
  }
  return models.get(scope);
}
const view = () => {
  const model = modelFor(state.preview ?? state.scope);
  return { model, selected: [...model.expertise, ...model.roles].find((e) => e.name === state.selected) ?? null };
};

// The closed drawers show what is chosen inside them, as vertical text on their edge strip.
function labelDrawers(scope) {
  scopeList.closest("nav").dataset.label = scope;
  expertiseList.closest("nav").dataset.label = state.selected ?? "All expertise";
}

function update() {
  renderPersonas();
  labelDrawers(personas.find((p) => p.key === state.persona).key === "head"
    ? scopeList.querySelector(`button[data-scope="${CSS.escape(state.scope)}"]`)?.textContent.trim() || "All teams"
    : "For you");
  const persona = personas.find((p) => p.key === state.persona);
  scopeList.hidden = persona.key !== "head";
  forYou.hidden = persona.key === "head";
  reconciled = persona.key !== "head";
  if (persona.key !== "head") return updateIndividual(persona);
  const { model, selected } = view();
  for (const b of scopeList.querySelectorAll("button")) {
    b.setAttribute("aria-pressed", String(b.dataset.scope === state.scope));
    b.classList.toggle("previewing", state.preview !== null && b.dataset.scope === state.preview);
  }
  const { joined, left, since } = model.movement;
  const moved = [joined && `${joined} joined`, left && `${left} left`].filter(Boolean).join(" and ");
  document.getElementById("progress").textContent =
    `${model.rated} of ${model.headcount} engineers rated in the last two quarters` + (moved ? ` · ${moved} since ${since.slice(-2)}` : "");
  renderDetail(model, selected); // before the chart, so the chart measures its final size
  redraw = () => renderChart(model, selected);
  redraw();
  renderExpertiseList(model, selected);
}

// The individual view: always discipline-wide, so no team or colleague can be singled out.
function updateIndividual(persona) {
  const model = modelFor("");
  const you = personaView(model, personalRatings(data.assessments, persona.key, model.quarters.at(-1)));
  const selected = [...model.expertise, ...model.roles].find((e) => e.name === state.selected) ?? null;
  document.getElementById("progress").textContent = `Viewing as ${persona.label}: your ratings against demand across the whole discipline`;
  renderForYou(you);
  renderDetail(model, selected, true);
  redraw = () => renderChart(model, selected, you);
  redraw();
  renderPersonaList(you, selected);
}

function preview(scope) {
  if (state.preview === scope) return;
  state.preview = scope;
  update();
}
function confirmScope(scope) {
  state.scope = scope;
  state.preview = null;
  update();
}
function select(name) {
  state.selected = name;
  update();
}

document.addEventListener("keydown", (ev) => ev.key === "Escape" && select(null));
svg.addEventListener("click", () => state.selected && select(null));
// Resizing only redraws the chart, with whatever the last update showed.
let redraw = () => {};
new ResizeObserver(() => redraw()).observe(svg);

const text = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.text();
};
try {
  const loaded = Object.fromEntries(await Promise.all(Object.entries(SOURCES).map(async ([k, url]) => [k, parseCsv(await text(url))])));
  data = loaded;
  personas = pickPersonas(loaded);
  populateScopes(loaded.staffing);
  update();
  document.getElementById("quarter").textContent = modelFor("").quarters.at(-1);
} catch (err) {
  document.getElementById("progress").textContent = `Could not load data. ${err.message}`;
}

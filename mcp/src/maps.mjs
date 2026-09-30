// Map pipeline: turn any battle-map image (AI-painted or bought) into a Foundry scene with
// walls, doors, windows, lights and hidden tokens. The agent traces the map from grid crops,
// writes a spec, previews the overlay, then imports. See docs/MAPS.md.
//
// All spec coordinates are ORIGINAL image pixels — exactly what the grid crops label.

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

// Foundry v13+ wall sense levels: 0 none, 10 limited, 20 normal.
const KINDS = {
  wall:      { move: 20, sight: 20, light: 20, sound: 20, door: 0 },
  window:    { move: 20, sight: 0,  light: 0,  sound: 10, door: 0 },   // see through, can't walk through
  door:      { move: 20, sight: 20, light: 20, sound: 20, door: 1 },
  secret:    { move: 20, sight: 20, light: 20, sound: 20, door: 2 },   // secret door
  invisible: { move: 20, sight: 0,  light: 0,  sound: 0,  door: 0 },   // blocks movement only (railings, cliffs)
  terrain:   { move: 20, sight: 10, light: 10, sound: 10, door: 0 },   // limited: hedges, curtains
};
const COLORS = { wall: "#ff2828", window: "#00e6ff", door: "#ffdc00", secret: "#ff00ff", invisible: "#ffffff", terrain: "#6cff5a" };

export const SPEC_HELP = `Map spec (all coordinates in ORIGINAL image pixels, as labelled on the grid crops):
{
  "name": "Coldwater Lane",                // scene name
  "image": "/abs/path/map.png",            // local image file
  "cols": 30, "grid": 96,                  // map width in squares, px per square in Foundry (default 30, 96)
  "darkness": 0.3, "globalLight": true,    // optional scene lighting
  "walls": [
    { "from": [28,42], "to": [1338,42],    // axis-aligned wall…
      "openings": [ { "at": [135,190], "type": "window" }, { "at": [150,200], "type": "door" } ] },  // spans along its axis
    { "from": [1362,505], "to": [1395,880], "type": "window" }   // any single segment, any angle
  ],
  "lights": [ { "at": [232,282], "dim": 22, "bright": 8, "color": "#ff9b40", "alpha": 0.35, "animation": "torch" } ],
  "tokens": [ { "actor": "Brenna", "at": [700,280], "hidden": true } ]   // at = token CENTRE; hidden defaults to true
}
Wall types: wall | window | door | secret | invisible | terrain. Water and pits get no walls.
Dim/bright are in grid units (feet on a 5 ft grid).`;

function fail(msg) { const e = new Error(msg); e.userFacing = true; throw e; }

export async function loadImage(file) {
  if (!file || !fs.existsSync(file)) fail(`Image not found: ${file}`);
  const meta = await sharp(file).metadata();
  return { file, width: meta.width, height: meta.height };
}

// ---- spec -> Foundry scene data ------------------------------------------------
export async function compile(spec) {
  if (!spec?.name) fail('Spec needs a "name"');
  const img = await loadImage(spec.image);
  const cols = spec.cols ?? 30, grid = spec.grid ?? 96;
  const scale = (cols * grid) / img.width;
  const W = cols * grid, H = Math.round((img.height * scale) / grid) * grid;
  const S = (v) => Math.round(v * scale);

  const walls = [];
  const push = (a, b, type = "wall") => {
    const k = KINDS[type]; if (!k) fail(`Unknown wall type "${type}" (use ${Object.keys(KINDS).join(", ")})`);
    walls.push({ c: [S(a[0]), S(a[1]), S(b[0]), S(b[1])], ...k, ds: 0, dir: 0, _type: type });
  };
  for (const [i, w] of (spec.walls ?? []).entries()) {
    const { from: p, to: q } = w;
    if (!p || !q) fail(`walls[${i}] needs "from" and "to"`);
    if (!w.openings?.length) { push(p, q, w.type ?? "wall"); continue; }
    const horiz = p[1] === q[1], vert = p[0] === q[0];
    if (!horiz && !vert) fail(`walls[${i}] has openings but is not horizontal or vertical — split it or use single segments`);
    const ax = horiz ? 0 : 1, lo = Math.min(p[ax], q[ax]), hi = Math.max(p[ax], q[ax]);
    const at = (v) => (horiz ? [v, p[1]] : [p[0], v]);
    let cur = lo;
    for (const o of [...w.openings].sort((a, b) => a.at[0] - b.at[0])) {
      const [s, e] = [Math.min(...o.at), Math.max(...o.at)];
      if (s < lo || e > hi) fail(`walls[${i}] opening [${o.at}] lies outside the wall ${lo}–${hi}`);
      if (s > cur) push(at(cur), at(s), w.type ?? "wall");
      push(at(s), at(e), o.type ?? "door");
      cur = e;
    }
    if (cur < hi) push(at(cur), at(hi), w.type ?? "wall");
  }

  const lights = (spec.lights ?? []).map((l, i) => {
    if (!l.at) fail(`lights[${i}] needs "at"`);
    const config = { dim: l.dim ?? 20, bright: l.bright ?? 10, color: l.color ?? null, alpha: l.alpha ?? 0.4 };
    if (l.animation) config.animation = { type: l.animation, speed: l.speed ?? 3, intensity: l.intensity ?? 3 };
    return { x: S(l.at[0]), y: S(l.at[1]), config };
  });

  const tokens = (spec.tokens ?? []).map((t, i) => {
    if (!t.actor || !t.at) fail(`tokens[${i}] needs "actor" and "at"`);
    return { actor: t.actor, x: S(t.at[0]) - grid / 2, y: S(t.at[1]) - grid / 2, hidden: t.hidden ?? true };
  });

  const data = { name: spec.name, width: W, height: H, padding: 0, navigation: spec.navigation ?? false,
    grid: { type: 1, size: grid, distance: spec.gridDistance ?? 5, units: spec.gridUnits ?? "ft", color: "#000000", alpha: 0.15 },
    tokenVision: true,
    environment: { globalLight: { enabled: spec.globalLight ?? true }, darknessLevel: spec.darkness ?? 0.3 },
    walls: walls.map(({ _type, ...w }) => w), lights };
  return { data, tokens, walls, img, W, H, grid, scale };
}

export async function renderScaled(spec, compiled, format = "webp") {
  const buf = await sharp(spec.image).resize(compiled.W, compiled.H, { kernel: "lanczos3" })
    .toFormat(format, { quality: 90 }).toBuffer();
  return buf;
}

// ---- overlay preview -------------------------------------------------------------
export async function preview(spec, { maxWidth = 1600, numbers = false } = {}) {
  const c = await compile(spec);
  const k = Math.min(1, maxWidth / c.W), w = Math.round(c.W * k), h = Math.round(c.H * k);
  const L = (v) => (v * k).toFixed(1);
  const lines = c.walls.map((x) => `<line x1="${L(x.c[0])}" y1="${L(x.c[1])}" x2="${L(x.c[2])}" y2="${L(x.c[3])}" stroke="${COLORS[x._type]}" stroke-width="5" stroke-linecap="round"/>`);
  const lights = c.data.lights.map((l) => `<circle cx="${L(l.x)}" cy="${L(l.y)}" r="7" fill="none" stroke="#fff" stroke-width="3"/>`);
  const toks = c.tokens.map((t) => `<rect x="${L(t.x)}" y="${L(t.y)}" width="${L(c.grid)}" height="${L(c.grid)}" fill="none" stroke="#00ff66" stroke-width="3"/><text x="${L(t.x) }" y="${(t.y * k - 4).toFixed(1)}" font-family="sans-serif" font-size="13" fill="#00ff66" stroke="#000" stroke-width="3" paint-order="stroke">${escapeXml(t.actor)}</text>`);
  // Optional wall numbers (index into spec.walls) so a reviewer can say "remove 3, 7 and 12".
  const nums = !numbers ? [] : (spec.walls ?? []).map((wl, i) => {
    const mx = ((wl.from[0] + wl.to[0]) / 2) * c.scale * k, my = ((wl.from[1] + wl.to[1]) / 2) * c.scale * k;
    return `<text x="${mx.toFixed(1)}" y="${(my + 5).toFixed(1)}" text-anchor="middle" font-family="sans-serif" font-weight="bold" font-size="15" fill="#fff" stroke="#000" stroke-width="4" paint-order="stroke">${i}</text>`;
  });
  const legend = Object.entries(COLORS).filter(([t]) => c.walls.some((x) => x._type === t))
    .map(([t, col], i) => `<rect x="10" y="${10 + i * 22}" width="18" height="6" fill="${col}"/><text x="34" y="${17 + i * 22}" font-family="sans-serif" font-size="14" fill="#fff" stroke="#000" stroke-width="3" paint-order="stroke">${t}</text>`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${lines.join("")}${lights.join("")}${toks.join("")}${nums.join("")}${legend.join("")}</svg>`;
  const png = await sharp(spec.image).resize(w, h).composite([{ input: Buffer.from(svg) }]).jpeg({ quality: 82 }).toBuffer();
  const counts = c.walls.reduce((m, x) => ((m[x._type] = (m[x._type] ?? 0) + 1), m), {});
  return { image: png, summary: { name: spec.name, size: `${c.W}x${c.H}`, squares: `${c.W / c.grid}x${c.H / c.grid}`, walls: counts, lights: c.data.lights.length, tokens: c.tokens.length } };
}

// ---- grid crops for tracing -----------------------------------------------------
// Splits the image into rows x cols tiles, zooms each 2x, and draws a grid every `step`
// px labelled in ORIGINAL image coordinates.
export async function gridCrops(file, { rows = 2, cols = 2, step = 25, overlap = 40, zoom = 2 } = {}) {
  const img = await loadImage(file);
  const tw = Math.ceil(img.width / cols), th = Math.ceil(img.height / rows);
  const out = [];
  for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) {
    const x0 = Math.max(0, q * tw - overlap), y0 = Math.max(0, r * th - overlap);
    const x1 = Math.min(img.width, (q + 1) * tw + overlap), y1 = Math.min(img.height, (r + 1) * th + overlap);
    const w = (x1 - x0) * zoom, h = (y1 - y0) * zoom;
    const g = [];
    for (let x = Math.ceil(x0 / step) * step; x < x1; x += step) {
      const X = (x - x0) * zoom, major = x % 100 === 0;
      g.push(`<line x1="${X}" y1="0" x2="${X}" y2="${h}" stroke="${major ? "#ff00ff" : "#00ffff"}" stroke-opacity="${major ? 0.8 : 0.45}" stroke-width="1"/>`);
      if (x % 50 === 0) g.push(`<text x="${X + 2}" y="12" font-family="sans-serif" font-size="12" fill="#ffff00" stroke="#000" stroke-width="3" paint-order="stroke">${x}</text>`);
    }
    for (let y = Math.ceil(y0 / step) * step; y < y1; y += step) {
      const Y = (y - y0) * zoom, major = y % 100 === 0;
      g.push(`<line x1="0" y1="${Y}" x2="${w}" y2="${Y}" stroke="${major ? "#ff00ff" : "#00ffff"}" stroke-opacity="${major ? 0.8 : 0.45}" stroke-width="1"/>`);
      if (y % 50 === 0) g.push(`<text x="2" y="${Y + 13}" font-family="sans-serif" font-size="12" fill="#ffff00" stroke="#000" stroke-width="3" paint-order="stroke">${y}</text>`);
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${g.join("")}</svg>`;
    const buf = await sharp(file).extract({ left: x0, top: y0, width: x1 - x0, height: y1 - y0 }).resize(w, h)
      .composite([{ input: Buffer.from(svg) }]).jpeg({ quality: 85 }).toBuffer();
    out.push({ region: [x0, y0, x1, y1], image: buf });
  }
  return { width: img.width, height: img.height, crops: out };
}

export function slug(name) {
  return String(name).toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "map";
}
function escapeXml(s) { return String(s).replace(/[<>&'"]/g, (ch) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[ch]); }
export { KINDS, path };

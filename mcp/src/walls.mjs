// First-pass wall detection for battle maps. Finds long straight horizontal and vertical dark
// strokes (how most top-down maps draw walls), returns them as spec walls in ORIGINAL image px,
// and marks door/window-sized gaps between collinear pieces as openings to check.
//
// It is a draft for the agent to review with map_preview — not a substitute for looking.

import sharp from "sharp";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Luminance of each pixel at analysis scale.
async function lumaAt(file, targetWidth) {
  const meta = await sharp(file).metadata();
  const k = Math.min(1, targetWidth / meta.width);
  const w = Math.round(meta.width * k), h = Math.round(meta.height * k);
  const { data } = await sharp(file).resize(w, h).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const L = new Uint8Array(w * h), S = new Uint8Array(w * h);
  for (let i = 0, p = 0; i < w * h; i++, p += 3) {
    const r = data[p], g = data[p + 1], b = data[p + 2];
    L[i] = (r * 299 + g * 587 + b * 114) / 1000;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    S[i] = mx === 0 ? 0 : ((mx - mn) * 255) / mx;
  }
  return { L, S, w, h, k, W: meta.width, H: meta.height };
}

// Wall-ink mask by LOCAL contrast: a pixel is ink if it is clearly darker than its neighbourhood
// (a box of about one grid square), whatever the map's overall brightness or palette. Night maps,
// coloured walls and textured floors all behave. `ratio` 0.72 = at least 28% darker than around it.
function wallMask({ L, w, h }, { ratio, radius, ceiling, ink = "dark" }) {
  // integral image for O(1) box means
  const I = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) { row += L[y * w + x]; I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + row; }
  }
  const m = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - radius), y1 = Math.min(h, y + radius + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - radius), x1 = Math.min(w, x + radius + 1);
      const sum = I[y1 * (w + 1) + x1] - I[y0 * (w + 1) + x1] - I[y1 * (w + 1) + x0] + I[y0 * (w + 1) + x0];
      const mean = sum / ((x1 - x0) * (y1 - y0));
      const v = L[y * w + x];
      const dark = v <= mean * ratio && v <= ceiling;
      const light = v >= mean / ratio && v >= 60;            // glass, pale lines on dark ground
      m[y * w + x] = (ink === "dark" ? dark : ink === "light" ? light : dark || light) ? 1 : 0;
    }
  }
  return { m, thr: ratio };
}

// Keep pixels that belong to a run of at least `len` mask pixels along one axis (1-D opening).
function longRuns(m, w, h, len, horizontal) {
  const out = new Uint8Array(w * h);
  const [outer, inner] = horizontal ? [h, w] : [w, h];
  const idx = horizontal ? (o, i) => o * w + i : (o, i) => i * w + o;
  for (let o = 0; o < outer; o++) {
    let start = -1;
    for (let i = 0; i <= inner; i++) {
      const on = i < inner && m[idx(o, i)];
      if (on && start < 0) start = i;
      if (!on && start >= 0) {
        if (i - start >= len) for (let j = start; j < i; j++) out[idx(o, j)] = 1;
        start = -1;
      }
    }
  }
  return out;
}

// Group runs into bands (consecutive rows/cols whose runs overlap) -> centre-line segments.
function bands(mask, w, h, horizontal, { maxThick, minThick = 1, minLen }) {
  const [outer, inner] = horizontal ? [h, w] : [w, h];
  const idx = horizontal ? (o, i) => o * w + i : (o, i) => i * w + o;
  const open = []; // {a, b, o0, o1, sum}
  const done = [];
  for (let o = 0; o <= outer; o++) {
    const runs = [];
    if (o < outer) {
      let s = -1;
      for (let i = 0; i <= inner; i++) {
        const on = i < inner && mask[idx(o, i)];
        if (on && s < 0) s = i;
        if (!on && s >= 0) { runs.push([s, i]); s = -1; }
      }
    }
    const still = [];
    for (const band of open) {
      const hit = runs.find((r) => r[0] < band.b && r[1] > band.a);
      if (hit) { band.a = Math.min(band.a, hit[0]); band.b = Math.max(band.b, hit[1]); band.o1 = o; band.sum += o; band.n++; hit.used = true; still.push(band); }
      else done.push(band);
    }
    for (const r of runs) if (!r.used) still.push({ a: r[0], b: r[1], o0: o, o1: o, sum: o, n: 1 });
    open.length = 0; open.push(...still);
  }
  return done
    .filter((b) => b.o1 - b.o0 + 1 <= maxThick && b.o1 - b.o0 + 1 >= minThick && b.b - b.a >= minLen)
    .map((b) => ({ horizontal, at: b.sum / b.n, a: b.a, b: b.b, thick: b.o1 - b.o0 + 1 }));
}

// Join collinear pieces; gaps of door/window size become openings.
function join(segs, { snap, maxGap, minOpening }) {
  const out = [];
  for (const horizontal of [true, false]) {
    const list = segs.filter((s) => s.horizontal === horizontal).sort((x, y) => x.at - y.at || x.a - y.a);
    // cluster by line position
    const lines = [];
    for (const s of list) {
      const line = lines.find((l) => Math.abs(l.at - s.at) <= snap);
      if (line) { line.segs.push(s); line.at = (line.at * line.w + s.at * (s.b - s.a)) / (line.w + (s.b - s.a)); line.w += s.b - s.a; }
      else lines.push({ at: s.at, w: s.b - s.a, segs: [s] });
    }
    for (const line of lines) {
      const pieces = line.segs.sort((x, y) => x.a - y.a);
      let cur = { a: pieces[0].a, b: pieces[0].b, openings: [] };
      for (const p of pieces.slice(1)) {
        const gap = p.a - cur.b;
        if (gap <= 0) { cur.b = Math.max(cur.b, p.b); continue; }
        if (gap <= maxGap) { if (gap >= minOpening) cur.openings.push([cur.b, p.a]); cur.b = Math.max(cur.b, p.b); continue; }
        out.push({ horizontal, at: line.at, ...cur }); cur = { a: p.a, b: p.b, openings: [] };
      }
      out.push({ horizontal, at: line.at, ...cur });
    }
  }
  return out;
}

/**
 * Detect walls. Options are in ORIGINAL px except where noted.
 *  cols         map width in grid squares (default 30) — sets expected wall/door sizes
 *  ratio        a pixel is wall ink when ≤ ratio × its neighbourhood's mean luminance (default 0.72)
 *  radiusSquares neighbourhood size in grid squares (default 1)
 */
export async function detectWalls(file, opts = {}) {
  const img = await lumaAt(file, opts.analysisWidth ?? Math.max(1024, (opts.cols ?? 30) * (opts.pxPerSquare ?? 32)));
  const cols = opts.cols ?? 30;
  const sq = img.w / cols;                                  // one grid square at analysis scale
  const { m, thr } = wallMask(img, { ink: opts.ink ?? "dark", ratio: opts.ratio ?? 0.72, radius: Math.round(sq * (opts.radiusSquares ?? 1)), ceiling: opts.ceiling ?? 200 });
  const minRun = Math.max(8, Math.round(sq * (opts.minRunSquares ?? 1.2)));
  const hMask = longRuns(m, img.w, img.h, minRun, true);
  const vMask = longRuns(m, img.w, img.h, minRun, false);
  const maxThick = Math.max(3, Math.round(sq * (opts.maxThickSquares ?? 0.9)));
  const minThick = Math.max(1, Math.round(sq * (opts.minThickSquares ?? 0)));
  const segs = [
    ...bands(hMask, img.w, img.h, true, { maxThick, minThick, minLen: minRun }),
    ...bands(vMask, img.w, img.h, false, { maxThick, minThick, minLen: minRun }),
  ];
  const joined = join(segs, { snap: Math.max(2, sq * 0.25), maxGap: sq * (opts.maxGapSquares ?? 1.6), minOpening: sq * 0.45 })
    .filter((s) => s.b - s.a >= sq * (opts.minWallSquares ?? 1.5))
    // the map's own frame: a line hugging and parallel to the image edge
    .filter((s) => { const edge = sq * (opts.frameSquares ?? 0), far = s.horizontal ? img.h : img.w;
      return !(s.at <= edge || s.at >= far - edge); });
  // Structure score: real walls meet other walls at corners and T-junctions; furniture edges and
  // floor seams mostly float free. A wall is "confident" if it's long or joins something at an end.
  const near = sq * (opts.junctionSquares ?? 0.5);
  const ends = (s) => s.horizontal ? [[s.a, s.at], [s.b, s.at]] : [[s.at, s.a], [s.at, s.b]];
  const touches = (pt, o) => o.horizontal
    ? Math.abs(pt[1] - o.at) <= near && pt[0] >= o.a - near && pt[0] <= o.b + near
    : Math.abs(pt[0] - o.at) <= near && pt[1] >= o.a - near && pt[1] <= o.b + near;
  for (const s of joined) {
    s.junctions = ends(s).filter((pt) => joined.some((o) => o !== s && o.horizontal !== s.horizontal && touches(pt, o))).length;
    s.squares = (s.b - s.a) / sq;
    s.confident = s.junctions >= (opts.minJunctions ?? 1) || s.squares >= (opts.longSquares ?? 6);
  }
  const inv = 1 / img.k, R = (v) => Math.round(v * inv);
  const toWall = (s) => {
    const at = R(s.at), a = R(s.a), b = R(s.b);
    const wall = s.horizontal ? { from: [a, at], to: [b, at] } : { from: [at, a], to: [at, b] };
    if (s.openings.length) wall.openings = s.openings.map(([x, y]) => ({ at: [R(x), R(y)], type: "door" }));
    return wall;
  };
  const walls = joined.filter((s) => s.confident).map(toWall);
  const candidates = joined.filter((s) => !s.confident).map(toWall);
  return { walls, candidates, stats: { threshold: thr, analysis: `${img.w}x${img.h}`, pieces: segs.length, walls: walls.length,
    candidates: candidates.length, openings: walls.reduce((n, w) => n + (w.openings?.length ?? 0), 0) } };
}

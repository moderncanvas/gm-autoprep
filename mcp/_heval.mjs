import fs from "node:fs";
import { detectWalls } from "/home/wise/Work/gm-autoprep/mcp/src/walls.mjs";
const TOL = +(process.env.TOL || 10);
const gt = JSON.parse(fs.readFileSync(process.argv[2] + "/gt.json", "utf8"));
const P = process.env.P ? JSON.parse(process.env.P) : {};
function covered(A, B, tol) {
  let tot = 0, cov = 0;
  for (const a of A) {
    const horiz = a.y1 === a.y2, len = horiz ? a.x2 - a.x1 : a.y2 - a.y1; tot += len; const ivs = [];
    for (const b of B) {
      if (horiz && b.y1 === b.y2 && Math.abs(b.y1 - a.y1) <= tol) ivs.push([Math.max(a.x1, b.x1), Math.min(a.x2, b.x2)]);
      if (!horiz && b.x1 === b.x2 && Math.abs(b.x1 - a.x1) <= tol) ivs.push([Math.max(a.y1, b.y1), Math.min(a.y2, b.y2)]);
    }
    ivs.filter(([s, e]) => e > s).sort((p, q) => p[0] - q[0]).reduce((end, [s, e]) => { if (e > end) { cov += e - Math.max(s, end); return e; } return end; }, -Infinity);
  }
  return { tot, cov };
}
const norm = (x1, y1, x2, y2) => ({ x1: Math.min(x1, x2), y1: Math.min(y1, y2), x2: Math.max(x1, x2), y2: Math.max(y1, y2) });
for (const [name, s] of Object.entries(gt)) {
  const meta = (await import("sharp")).default(s.file);
  const { width: iw } = await meta.metadata();
  const off = s.padding ? Math.ceil(s.padding * s.width / s.grid) * s.grid : 0;
  const k = iw / s.width, snap = 3;
  const G = s.walls.map((w) => { let [x1, y1, x2, y2] = w.c.map((v, i) => (v - (i % 2 ? (s.padding ? Math.ceil(s.padding * s.height / s.grid) * s.grid : 0) : off)) * k);
    if (Math.abs(y1 - y2) <= snap) y2 = y1; if (Math.abs(x1 - x2) <= snap) x2 = x1; return norm(x1, y1, x2, y2); })
    .filter((w) => (w.x1 === w.x2 || w.y1 === w.y2));
  const cols = Math.round(s.width / s.grid);
  const d = await detectWalls(s.file, { cols, ...P });
  const D = d.walls.map((w) => norm(w.from[0], w.from[1], w.to[0], w.to[1]));
  const tol = TOL * iw / 1536;
  const r = covered(G, D, tol), p = covered(D, G, tol);
  console.log(`${name.slice(0, 24).padEnd(24)} cols ${cols}  recall ${(100 * r.cov / r.tot).toFixed(0)}%  precision ${(100 * p.cov / p.tot).toFixed(0)}%  detected ${d.walls.length} (+${d.candidates.length} candidates) vs gt ${G.length} axis-aligned of ${s.walls.length}`);
  if (process.env.SAVE) fs.writeFileSync(`${process.argv[2]}/det-${name.slice(0,4)}.json`, JSON.stringify({ name, image: s.file, cols, walls: d.walls, lights: [], tokens: [] }));
}

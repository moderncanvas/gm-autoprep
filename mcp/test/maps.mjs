// End-to-end test of the map tools through a real MCP client: draws a small two-room map,
// crops it, previews a spec, imports it into the live world, checks the scene, deletes it.
// The uploaded image stays at assets/gm-autoprep-test/ (Foundry has no client-side file delete).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gm-autoprep-maps-"));
const mapFile = path.join(dir, "two-rooms.png");

// 600x400 map: two stone rooms side by side, a door between them, a window on the north wall
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400">
  <rect width="600" height="400" fill="#3b5a2e"/>
  <rect x="50" y="50" width="500" height="300" fill="#9a8f7d"/>
  <g stroke="#1b1b1b" stroke-width="12" fill="none">
    <rect x="50" y="50" width="500" height="300"/>
    <line x1="300" y1="50" x2="300" y2="170"/><line x1="300" y1="230" x2="300" y2="350"/>
  </g>
  <rect x="140" y="44" width="60" height="12" fill="#8fd3ff"/>
  <rect x="294" y="170" width="12" height="60" fill="#7a4a1f"/>
  <circle cx="420" cy="200" r="14" fill="#ffb347"/>
</svg>`;
await sharp(Buffer.from(svg)).png().toFile(mapFile);

const spec = {
  name: "_gm-autoprep map test", image: mapFile, cols: 12, grid: 100, darkness: 0.2,
  walls: [
    { from: [50, 50], to: [550, 50], openings: [{ at: [140, 200], type: "window" }] },
    { from: [50, 350], to: [550, 350] },
    { from: [50, 50], to: [50, 350] },
    { from: [550, 50], to: [550, 350] },
    { from: [300, 50], to: [300, 350], openings: [{ at: [170, 230], type: "door" }] },
  ],
  lights: [{ at: [420, 200], dim: 20, bright: 10, color: "#ffb347", animation: "torch" }],
  tokens: [{ actor: "__no_such_actor__", at: [175, 200] }],
};

let failures = 0;
const ok = (c, m) => { console.log(`${c ? "ok  " : "FAIL"} ${m}`); if (!c) failures++; };

const client = new Client({ name: "autoprep-maps-test", version: "0" });
await client.connect(new StdioClientTransport({ command: "node", args: [path.join(here, "../src/server.mjs")], env: { ...process.env } }));

const crops = await client.callTool({ name: "map_grid_crops", arguments: { image: mapFile, rows: 1, cols: 2 } });
ok(!crops.isError && crops.content.filter((c) => c.type === "image").length === 2, "map_grid_crops returns 2 images");

const prev = await client.callTool({ name: "map_preview", arguments: { spec } });
const summary = JSON.parse(prev.content[0].text);
ok(!prev.isError && prev.content[1]?.type === "image", "map_preview returns an overlay image");
ok(summary.walls.wall === 7 && summary.walls.window === 1 && summary.walls.door === 1, `map_preview counts ${JSON.stringify(summary.walls)}`);
fs.writeFileSync(path.join(dir, "preview.jpg"), Buffer.from(prev.content[1].data, "base64"));

const bad = await client.callTool({ name: "map_preview", arguments: { spec: { ...spec, walls: [{ from: [0, 0], to: [10, 10], openings: [{ at: [1, 2] }] }] } } });
ok(bad.isError && /not horizontal or vertical/.test(bad.content[0].text), "a diagonal wall with openings is rejected with a clear message");

const imp = await client.callTool({ name: "map_import", arguments: { spec, folder: "assets/gm-autoprep-test", replace: true } });
const r = imp.isError ? { error: imp.content[0].text } : JSON.parse(imp.content[0].text);
ok(!imp.isError && r.walls === 9 && r.doors === 1 && r.lights === 1, `map_import created the scene: ${JSON.stringify(r)}`);
ok(r.missing?.[0] === "__no_such_actor__" && r.tokens === 0, "a token for a missing actor is reported, not fatal");
ok(r.size === "1200x800", `scaled to the grid: ${r.size}`);

const del = await client.callTool({ name: "foundry_delete_scene", arguments: { scene: "_gm-autoprep map test" } });
ok(!del.isError, "test scene deleted");

await client.close();
console.log(`\npreview saved at ${path.join(dir, "preview.jpg")}`);
console.log(failures ? `${failures} FAILED` : "all passed");
process.exit(failures ? 1 : 0);

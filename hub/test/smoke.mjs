#!/usr/bin/env node
// End-to-end smoke test against a live world. Everything it creates is named "_cl-smoke…"
// and deleted at the end.   usage: CL_TOKEN=… node test/smoke.mjs   (or CL_TOKEN_FILE)
import fs from "node:fs";
import WebSocket from "ws";

const URL_ = process.env.CL_URL || "http://127.0.0.1:30777";
const TOKEN = process.env.CL_TOKEN || fs.readFileSync(process.env.CL_TOKEN_FILE || "/etc/campaign-loop/token", "utf8").trim();
let failures = 0;
const results = [];

async function rpc(method, params = {}) {
  const r = await fetch(`${URL_}/rpc`, { method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ method, params }) });
  const b = await r.json();
  if (b.error) throw new Error(`${method}: ${b.error.message}`);
  return b.result;
}
async function check(name, fn) {
  try { const v = await fn(); results.push(`ok   ${name}${v ? "  — " + v : ""}`); }
  catch (e) { failures++; results.push(`FAIL ${name}  — ${e.message}`); }
}
const assert = (c, m) => { if (!c) throw new Error(m); };

// 1x1 transparent PNG
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

await check("system.ping", async () => { const r = await rpc("system.ping"); assert(r.pong, "no pong"); });
await check("world.info", async () => { const r = await rpc("world.info"); return `${r.world} · Foundry ${r.foundry} · ${r.system} ${r.systemVersion} · ${r.modules.length} modules`; });
await check("users.list", async () => (await rpc("users.list")).map((u) => u.name + (u.active ? "*" : "")).join(", "));
await check("actors.list", async () => { const r = await rpc("actors.list", { type: "npc" }); return `${r.length} NPCs, ${r.filter((a) => a.shell).length} empty shells`; });
await check("actors.get", async () => { const r = await rpc("actors.get", { actor: "The Lieutenant" }); assert(r.system.attributes.hp.max === 150, "hp"); return `Lieutenant hp ${r.system.attributes.hp.max}`; });
await check("compendium.search", async () => { const r = await rpc("compendium.search", { query: "goblin", limit: 5 }); assert(r.length, "no hits"); return r.map((x) => `${x.name} (${x.pack})`).slice(0, 3).join(", "); });
await check("scenes.list", async () => `${(await rpc("scenes.list")).length} scenes`);
await check("journal.list", async () => `${(await rpc("journal.list")).length} journals`);
await check("chat.query", async () => `${(await rpc("chat.query", { since: "2026-09-09T00:00:00Z", until: "2026-09-10T12:00:00Z" })).length} messages on 9/9`);

let uploaded;
await check("files.upload", async () => { uploaded = (await rpc("files.upload", { path: "assets/_cl-smoke", name: "pixel.png", base64: PNG, contentType: "image/png" })).path; return uploaded; });
await check("actors.fromCompendium", async () => {
  const r = await rpc("actors.fromCompendium", { source: "Goblin Warrior", name: "_cl-smoke goblin", overrides: { attributes: { hp: { value: 33, max: 33 } } } });
  assert(r.items > 0 && r.hp === 33, `items ${r.items} hp ${r.hp}`); return `${r.items} items, hp ${r.hp}, CR ${r.cr}`; });
await check("actors.update", async () => { await rpc("actors.update", { actor: "_cl-smoke goblin", data: { "system.details.cr": 3 } });
  const r = (await rpc("actors.list", { query: "_cl-smoke goblin" }))[0]; assert(r.cr === 3, "cr"); });
await check("actors.fillFromCompendium", async () => {
  const r = await rpc("actors.fillFromCompendium", { actor: "_cl-smoke goblin", source: "mmCommoner000000", overrides: { attributes: { hp: { value: 7, max: 7 } } } });
  assert(r.hp === 7 && r.items > 0, `hp ${r.hp} items ${r.items}`); return `now ${r.items} items, hp ${r.hp}`; });
await check("actors.updateItem", async () => { const a = await rpc("actors.get", { actor: "_cl-smoke goblin" });
  await rpc("actors.updateItem", { actor: "_cl-smoke goblin", item: a.items[0]._id, data: { name: "Smoke Test Item" } }); });
await check("scenes.create", async () => {
  const r = await rpc("scenes.create", { replace: true, background: uploaded, data: { name: "_cl-smoke scene", width: 960, height: 960, padding: 0,
    grid: { type: 1, size: 96 }, walls: [{ c: [96, 96, 480, 96], move: 20, sight: 20, light: 20, sound: 20, door: 0 },
      { c: [480, 96, 480, 480], move: 20, sight: 20, light: 20, sound: 20, door: 1 }],
    lights: [{ x: 300, y: 300, config: { dim: 20, bright: 10 } }] }, tokens: [{ actor: "_cl-smoke goblin", x: 192, y: 192 }] });
  assert(r.walls === 2 && r.doors === 1 && r.tokens === 1 && r.lights === 1, JSON.stringify(r)); return `${r.walls} walls, ${r.doors} door, ${r.lights} light, ${r.tokens} token`; });
await check("scenes.syncTokens", async () => `${(await rpc("scenes.syncTokens", { scene: "_cl-smoke scene" })).updated} synced`);
await check("journal.create", async () => { const r = await rpc("journal.create", { replace: true, name: "_cl-smoke journal",
  pages: [{ name: "Image", type: "image", src: uploaded }, { name: "Text", type: "text", text: { format: 1, content: "<p>hi</p>" } }] });
  assert(r.pages === 2, "pages"); });
await check("bad param rejected", async () => { try { await rpc("actors.get", {}); } catch (e) { assert(/Missing param/.test(e.message), e.message); return "Missing param"; } throw new Error("accepted"); });
await check("unknown method rejected", async () => { try { await rpc("eval", { code: "1" }); } catch (e) { assert(/Unknown method/.test(e.message), e.message); return "Unknown method"; } throw new Error("accepted"); });

await check("second client gets busy (4009)", () => new Promise((resolve, reject) => {
  const ws = new WebSocket(URL_.replace(/^http/, "ws") + "/foundry");
  ws.on("open", () => ws.send(JSON.stringify({ type: "hello", token: TOKEN, protocol: 0, user: "smoke", world: "x" })));
  ws.on("close", (code) => code === 4009 ? resolve("busy") : reject(new Error(`closed ${code}`)));
  setTimeout(() => reject(new Error("no close")), 5000);
}));
await check("bad token denied (4003)", () => new Promise((resolve, reject) => {
  const ws = new WebSocket(URL_.replace(/^http/, "ws") + "/foundry");
  ws.on("open", () => ws.send(JSON.stringify({ type: "hello", token: "nope", protocol: 0 })));
  ws.on("close", (code) => code === 4003 ? resolve("denied") : reject(new Error(`closed ${code}`)));
  setTimeout(() => reject(new Error("no close")), 5000);
}));

// cleanup
await check("cleanup", async () => {
  await rpc("scenes.delete", { scene: "_cl-smoke scene" });
  await rpc("journal.delete", { journal: "_cl-smoke journal" });
  await rpc("actors.delete", { actor: "_cl-smoke goblin" });
  return "scene, journal, actor deleted";
});
await check("still connected after all that", async () => { const r = await (await fetch(`${URL_}/status`)).json(); assert(r.client?.user, "no client"); return r.client.user; });

console.log(results.join("\n"));
console.log(failures ? `\n${failures} FAILED` : "\nall passed");
process.exit(failures ? 1 : 0);

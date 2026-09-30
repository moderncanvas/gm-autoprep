#!/usr/bin/env node
// gm-autoprep MCP server — exposes a Foundry VTT world to MCP clients (Claude Code,
// Claude Desktop, …) through the gm-autoprep hub. See docs/PROTOCOL.md.
//
// env: AUTOPREP_URL (http://127.0.0.1:30777)   AUTOPREP_TOKEN or AUTOPREP_TOKEN_FILE (~/.gm-autoprep/token)

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as maps from "./maps.mjs";
import { makeArchivist } from "./archivist.mjs";

// Settings: environment variables win, then ~/.gm-autoprep/config.json
//   { "hubUrl": "http://<foundry-host>:30777", "archivistApiKey": "…" }
const CONFIG_DIR = process.env.AUTOPREP_HOME || path.join(os.homedir(), ".gm-autoprep");
const CONFIG = (() => { try { return JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, "config.json"), "utf8")); } catch { return {}; } })();
const HUB = (process.env.AUTOPREP_URL || CONFIG.hubUrl || "http://127.0.0.1:30777").replace(/\/$/, "");
const TOKEN_FILE = process.env.AUTOPREP_TOKEN_FILE || path.join(CONFIG_DIR, "token");
const token = () => {
  if (process.env.AUTOPREP_TOKEN) return process.env.AUTOPREP_TOKEN;
  try { return fs.readFileSync(TOKEN_FILE, "utf8").trim(); }
  catch { throw new Error(`No hub token. Copy it from the Foundry host (/etc/gm-autoprep/token) to ${TOKEN_FILE}, or set AUTOPREP_TOKEN.`); }
};
const archivist = makeArchivist(() => process.env.ARCHIVIST_API_KEY || CONFIG.archivistApiKey);

async function rpc(method, params = {}) {
  let r;
  try {
    r = await fetch(`${HUB}/rpc`, { method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token()}` },
      body: JSON.stringify({ method, params }) });
  } catch (e) {
    throw new Error(`Cannot reach the gm-autoprep hub at ${HUB} (${e.cause?.code ?? e.message}). Is it running, and is AUTOPREP_URL right?`);
  }
  const body = await r.json().catch(() => ({ error: { message: `hub returned HTTP ${r.status}` } }));
  if (body.error) throw new Error(body.error.message);
  return body.result;
}

const text = (v) => ({ content: [{ type: "text", text: typeof v === "string" ? v : JSON.stringify(v, null, 2) }] });
const fail = (e) => ({ isError: true, content: [{ type: "text", text: String(e.message ?? e) }] });

const server = new McpServer({ name: "gm-autoprep", version: "0.1.0" });

// tool(name, description, input shape, hub method or handler, annotations)
function tool(name, description, shape, target, annotations = {}) {
  server.registerTool(name, { description, inputSchema: shape, annotations }, async (args) => {
    try { return text(typeof target === "function" ? await target(args ?? {}) : await rpc(target, args ?? {})); }
    catch (e) { return fail(e); }
  });
}

const RO = { readOnlyHint: true };
const WRITE = { readOnlyHint: false, destructiveHint: false };
const DESTRUCTIVE = { readOnlyHint: false, destructiveHint: true };
const obj = () => z.record(z.string(), z.any());
const actor = z.string().describe("Actor id or exact name");

// ---- world ------------------------------------------------------------------
tool("foundry_status",
  "Check the connection: whether the hub is up and which Foundry world, version, game system and automation user are connected. Call this first if anything fails.",
  {}, async () => {
    const s = await (await fetch(`${HUB}/status`)).json();
    if (!s.client) return { hub: HUB, connected: false, hint: "The hub is running but no Foundry client is connected. Make sure the automation GM is logged in and the GM AutoPrep module has the hub URL and token." };
    return { hub: HUB, connected: true, ...s.client, world: await rpc("world.info") };
  }, RO);

tool("foundry_list_users", "List the world's users with role and whether they are logged in right now. Use it to check no players are in a live session before changing things.",
  {}, "users.list", RO);

// ---- actors -----------------------------------------------------------------
tool("foundry_list_actors",
  "List actors with a summary (id, name, type, folder, CR, max HP, AC, item count, portrait, token art). `shell: true` marks an NPC with no items and no HP — an empty sheet that needs building.",
  { type: z.string().optional().describe('"npc", "character", …'), folder: z.string().optional().describe("Folder name"),
    query: z.string().optional().describe("Case-insensitive name filter") },
  "actors.list", RO);

tool("foundry_get_actor", "Get one actor's full data (system data, items, effects, prototype token).",
  { actor }, "actors.get", RO);

tool("foundry_actor_from_compendium",
  "Create a NEW actor by copying a complete compendium stat block (all its items, attacks, spells and effects), then customise it. Prefer this over foundry_create_actor for NPCs so the sheet is never a bare shell. dnd5e 2024 stat blocks live in pack dnd5e.actors24 (the default) with ids like mmCommoner000000, mmCultistFanatic, mmMage0000000000 — use foundry_search_compendium to find others.",
  { source: z.string().describe("Compendium document id or exact name, e.g. \"Mage\""),
    name: z.string().describe("Name for the new actor"),
    pack: z.string().optional().describe("Compendium id, default dnd5e.actors24"),
    overrides: obj().optional().describe('Merged into system data, e.g. {"details":{"cr":6},"attributes":{"hp":{"value":99,"max":99}}}'),
    folder: z.string().optional().describe("Actor folder name or id"),
    img: z.string().optional().describe("Portrait path inside Foundry data (also used as token art), e.g. from foundry_upload_file"),
    prototypeToken: obj().optional().describe("Merged into the prototype token, e.g. {\"disposition\":0,\"width\":0.8,\"height\":0.8}") },
  "actors.fromCompendium", WRITE);

tool("foundry_fill_actor_from_compendium",
  "Fill an EXISTING actor (typically an empty shell) in place from a compendium stat block: replaces its system data and items but keeps its id, portrait, folder and biography, so tokens already placed on scenes stay linked.",
  { actor, source: z.string(), pack: z.string().optional(), overrides: obj().optional(),
    keepBio: z.boolean().optional().describe("Keep the current biography (default true)") },
  "actors.fillFromCompendium", DESTRUCTIVE);

tool("foundry_update_actor",
  'Update an actor with Foundry update data (dot-paths allowed), e.g. {"system.attributes.hp.max":150,"system.attributes.hp.value":150} or {"img":"…","prototypeToken.texture.src":"…"}.',
  { actor, data: obj(), options: obj().optional() }, "actors.update", WRITE);

tool("foundry_update_actor_item",
  'Update one item on an actor, by item id or exact name. Healing/damage formulas live on activities, e.g. {"system.activities.<activityId>.healing.custom.enabled":true,"system.activities.<activityId>.healing.custom.formula":"10"}.',
  { actor, item: z.string().describe("Item id or exact name"), data: obj() }, "actors.updateItem", WRITE);

tool("foundry_create_actor", "Create an actor from raw Foundry actor data. For NPCs prefer foundry_actor_from_compendium.",
  { data: obj() }, "actors.create", WRITE);

tool("foundry_delete_actor", "Delete an actor permanently.", { actor }, "actors.delete", DESTRUCTIVE);

tool("foundry_search_compendium", "Search actor compendiums by name. Returns pack, id, name and CR.",
  { query: z.string(), pack: z.string().optional(), limit: z.number().int().optional() }, "compendium.search", RO);

tool("foundry_tokenize_actor", "Make a framed, masked token from the actor's portrait with the Tokenizer 2 module (~60 s) and set it as the actor's token art. Run foundry_sync_scene_tokens afterwards for tokens already placed on scenes.",
  { actor, size: z.number().int().optional().describe("Token size in px, default 512") }, "tokens.tokenize", WRITE);

// ---- scenes -----------------------------------------------------------------
tool("foundry_list_scenes", "List scenes with wall, light and token counts and their background image.", {}, "scenes.list", RO);

tool("foundry_create_scene",
  "Create a battle-map scene: background image (upload it first with foundry_upload_file), walls, lights, and tokens placed HIDDEN by default so the GM reveals them. Wall: {c:[x1,y1,x2,y2], move, sight, light, sound, door} — normal 20/20/20/20 door 0; window move 20 sight 0 light 0 sound 10; door door 1. Light: {x, y, config:{dim, bright, color, alpha, animation:{type:\"torch\"}}}. Coordinates are scene pixels with padding 0.",
  { data: obj().describe("Scene data: name, width, height, padding (0), grid {type:1,size,distance,units}, walls, lights, environment"),
    background: z.string().describe("Image path inside Foundry data, e.g. assets/maps/coldwater-lane.webp"),
    tokens: z.array(z.object({ actor: z.string(), x: z.number(), y: z.number(), hidden: z.boolean().optional() })).optional()
      .describe("Tokens by actor name/id; x,y are the token's top-left in scene px"),
    replace: z.boolean().optional().describe("Delete an existing scene with the same name first") },
  "scenes.create", WRITE);

tool("foundry_sync_scene_tokens", "Reset every placed token on a scene to its actor's current token art and name (after re-tokenizing).",
  { scene: z.string().describe("Scene id or exact name") }, "scenes.syncTokens", WRITE);

tool("foundry_delete_scene", "Delete a scene permanently.", { scene: z.string() }, "scenes.delete", DESTRUCTIVE);

// ---- journals ---------------------------------------------------------------
tool("foundry_list_journals", "List journal entries (id, name, folder, page count).",
  { folder: z.string().optional() }, "journal.list", RO);

tool("foundry_create_journal",
  'Create a journal entry — e.g. a handout. Pages: {name, type:"image", src, image:{caption}} or {name, type:"text", text:{format:1, content:"<p>html</p>"}}. Hidden from players by default.',
  { name: z.string(), pages: z.array(obj()), folder: z.string().optional(), ownership: obj().optional(),
    replace: z.boolean().optional() }, "journal.create", WRITE);

tool("foundry_delete_journal", "Delete a journal entry permanently.", { journal: z.string() }, "journal.delete", DESTRUCTIVE);

// ---- files ------------------------------------------------------------------
tool("foundry_upload_file",
  "Upload a file from THIS machine into the Foundry server's data folder (portraits, handouts, maps, audio). Returns the path to use as an actor img, scene background or journal image.",
  { localPath: z.string().describe("Absolute path of the file on this machine"),
    folder: z.string().describe('Destination folder inside Foundry data, e.g. "assets/maps"'),
    name: z.string().optional().describe("File name to save as (default: the local file name)") },
  async ({ localPath, folder, name }) => {
    const buf = fs.readFileSync(localPath);
    const ext = path.extname(localPath).toLowerCase();
    const types = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
      ".gif": "image/gif", ".svg": "image/svg+xml", ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".webm": "video/webm", ".pdf": "application/pdf" };
    return rpc("files.upload", { path: folder, name: name || path.basename(localPath),
      base64: buf.toString("base64"), contentType: types[ext] || "application/octet-stream" });
  }, WRITE);

// ---- maps -------------------------------------------------------------------
// Any map image -> scene with walls, doors, windows, lights and hidden tokens.
// Workflow: map_grid_crops (look) -> write a spec -> map_preview (check) -> map_import.
const specArg = {
  spec: obj().optional().describe("The map spec object (see map_preview's description)"),
  specFile: z.string().optional().describe("Or: path to a JSON file holding the spec — handy while iterating"),
};
function readSpec({ spec, specFile }) {
  if (spec) return spec;
  if (specFile) return JSON.parse(fs.readFileSync(specFile, "utf8"));
  throw new Error("Pass spec or specFile");
}
const img = (buf) => ({ type: "image", data: buf.toString("base64"), mimeType: "image/jpeg" });

server.registerTool("map_grid_crops", {
  description: "Step 1 of turning a map image into a Foundry scene. Returns the map split into zoomed tiles with a labelled pixel grid (thin lines every 25 px, magenta every 100 px, labels every 50 px) in ORIGINAL image coordinates. Look at them and trace wall centre-lines, door spans (the drawn door leaf) and window spans, lights and where tokens should stand, then write a spec for map_preview.",
  inputSchema: { image: z.string().describe("Absolute path to the map image on this machine"),
    rows: z.number().int().min(1).max(4).optional().describe("Tile rows (default 2)"),
    cols: z.number().int().min(1).max(4).optional().describe("Tile columns (default 2)"),
    step: z.number().int().optional().describe("Grid spacing in image px (default 25)") },
  annotations: RO,
}, async ({ image, rows, cols, step }) => {
  try {
    const r = await maps.gridCrops(image, { rows, cols, step });
    return { content: [{ type: "text", text: `Image ${r.width}x${r.height}px, ${r.crops.length} tiles (labels are original image px):` },
      ...r.crops.flatMap((c) => [{ type: "text", text: `tile x ${c.region[0]}–${c.region[2]}, y ${c.region[1]}–${c.region[3]}` }, img(c.image)])] };
  } catch (e) { return fail(e); }
});

server.registerTool("map_preview", {
  description: "Step 2. Renders the spec over the map so you can check it: red walls, cyan windows, yellow doors, magenta secret doors, white rings for lights, green squares for tokens. Nothing is sent to Foundry. Expect a few doors or wall lines to be 10–15 px off on the first pass — fix and preview again.\n\n" + maps.SPEC_HELP,
  inputSchema: specArg, annotations: RO,
}, async (args) => {
  try {
    const r = await maps.preview(readSpec(args));
    return { content: [{ type: "text", text: JSON.stringify(r.summary, null, 2) }, img(r.image)] };
  } catch (e) { return fail(e); }
});

server.registerTool("map_import", {
  description: "Step 3. Upscales the map to the spec's grid, uploads it to the Foundry server and creates the scene with its walls, doors, windows, lights and tokens (tokens hidden by default so the GM reveals them). The scene is not activated for players.",
  inputSchema: { ...specArg,
    folder: z.string().optional().describe('Upload folder inside Foundry data (default "assets/maps")'),
    replace: z.boolean().optional().describe("Delete an existing scene with the same name first") },
  annotations: WRITE,
}, async (args) => {
  try {
    const spec = readSpec(args);
    const c = await maps.compile(spec);
    const buf = await maps.renderScaled(spec, c, "webp");
    const up = await rpc("files.upload", { path: args.folder || "assets/maps", name: `${maps.slug(spec.name)}.webp`,
      base64: buf.toString("base64"), contentType: "image/webp" });
    const scene = await rpc("scenes.create", { data: c.data, background: up.path, tokens: c.tokens, replace: args.replace ?? false });
    return text({ ...scene, background: up.path, size: `${c.W}x${c.H}`, imageBytes: buf.length });
  } catch (e) { return fail(e); }
});

// ---- archivist ----------------------------------------------------------------
// Session recordings -> summaries, moments and characters. Read-only.
const campaign = z.string().describe("Archivist campaign id (from the vault's campaign.yaml)");
tool("archivist_list_sessions",
  "List every recorded sitting in play order with its Archivist title and date. `sitting` is the chronological position — the campaign's own session numbers can differ (a session can span two sittings), so map them via the recaps' archivist-title.",
  { campaignId: campaign }, ({ campaignId }) => archivist.sessions(campaignId), RO);
tool("archivist_get_session", "Get one sitting's full Archivist summary and notes — the narrative source of truth for a recap.",
  { campaignId: campaign, sessionId: z.string() }, ({ campaignId, sessionId }) => archivist.session(campaignId, sessionId), RO);
tool("archivist_list_moments",
  "List Archivist moments (labelled highlights), optionally for one sitting. Recent sittings often have none — say so in the recap rather than inventing them.",
  { campaignId: campaign, sessionId: z.string().optional() },
  ({ campaignId, sessionId }) => archivist.moments(campaignId, sessionId), RO);
tool("archivist_list_characters", "List the characters Archivist knows about (PCs and NPCs), with player names and descriptions.",
  { campaignId: campaign }, ({ campaignId }) => archivist.characters(campaignId), RO);

// ---- chat -------------------------------------------------------------------
tool("foundry_query_chat",
  "Read the chat log between two times — every roll, attack, damage number and in-character message. The mechanical record of what actually happened at the table; use it to write session recaps.",
  { since: z.string().optional().describe("ISO time, e.g. 2026-09-09T00:00:00Z"), until: z.string().optional(),
    limit: z.number().int().optional().describe("Most recent N messages in range (default 500)") },
  "chat.query", RO);

await server.connect(new StdioServerTransport());

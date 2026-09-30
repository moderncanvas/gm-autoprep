// GM AutoPrep — Foundry side. Connects OUT to the gm-autoprep hub and serves typed
// JSON-RPC methods (docs/PROTOCOL.md). No arbitrary code execution, by design.

const ID = "gm-autoprep";
const PROTOCOL = 0;
const DEFAULT_PACK = "dnd5e.actors24";
const READ_ONLY = new Set(["system.ping", "world.info", "users.list", "actors.list", "actors.get",
  "compendium.search", "scenes.list", "journal.list", "chat.query"]);

const log = (...a) => console.log("GM AutoPrep |", ...a);
const setting = (k) => game.settings.get(ID, k);

// ---------------------------------------------------------------------------
// settings
Hooks.once("init", () => {
  const major = Number(game.release?.generation ?? 12);
  game.settings.register(ID, "hubUrl", { name: "AUTOPREP.hubUrl.name", hint: "AUTOPREP.hubUrl.hint",
    scope: "world", config: true, type: String, default: "ws://127.0.0.1:30777/foundry", requiresReload: true });
  game.settings.register(ID, "automationUser", { name: "AUTOPREP.automationUser.name", hint: "AUTOPREP.automationUser.hint",
    scope: "world", config: true, type: String, default: "", requiresReload: true });
  // v13+ has server-stored per-user settings; older cores fall back to this browser only.
  game.settings.register(ID, "token", { name: "AUTOPREP.token.name", hint: "AUTOPREP.token.hint",
    scope: major >= 13 ? "user" : "client", config: true, type: String, default: "", requiresReload: true });
  game.settings.register(ID, "allowWrites", { name: "AUTOPREP.allowWrites.name", hint: "AUTOPREP.allowWrites.hint",
    scope: "world", config: true, type: Boolean, default: true });
});

// ---------------------------------------------------------------------------
// connection: exactly one serving client per hub (see PROTOCOL.md "Exactly one serving client")
const state = { status: "idle", detail: "", ws: null, retry: null };

function shouldServe() {
  if (!game.user.isGM) return false;
  const who = setting("automationUser").trim();
  return !who || who === game.user.name || who === game.user.id;
}

function connect(delay = 0) {
  clearTimeout(state.retry);
  state.retry = setTimeout(openSocket, delay);
}

function openSocket() {
  const url = setting("hubUrl"), token = setting("token");
  if (!url || !token) { state.status = "unconfigured"; state.detail = "set Hub URL and Hub token"; return; }
  let ws;
  try { ws = new WebSocket(url); } catch (e) { state.status = "error"; state.detail = String(e); return connect(30000); }
  state.ws = ws;
  state.status = "connecting";
  ws.onopen = () => ws.send(JSON.stringify({
    type: "hello", token, protocol: PROTOCOL, module: game.modules.get(ID).version,
    world: game.world.id, user: game.user.name, foundry: game.version,
    system: game.system.id, systemVersion: game.system.version }));
  ws.onmessage = (ev) => onMessage(ws, ev.data);
  ws.onclose = (ev) => {
    if (state.ws !== ws) return;
    state.ws = null;
    if (ev.code === 4009) { state.status = "standby"; state.detail = "another client is serving"; return connect(60000); }
    if (ev.code === 4003 || ev.code === 4004) { state.status = "denied"; state.detail = ev.reason; log("hub refused:", ev.reason); return; }
    state.status = "disconnected"; state.detail = `code ${ev.code}`;
    connect(state.wasConnected ? 5000 : 30000);
    state.wasConnected = false;
  };
  ws.onerror = () => {};
}

async function onMessage(ws, raw) {
  let msg;
  try { msg = JSON.parse(raw); } catch { return; }
  if (msg.type === "welcome") { state.status = "connected"; state.detail = ""; state.wasConnected = true; log("serving the hub"); return; }
  if (msg.type === "busy" || msg.type === "denied") return; // close frame follows
  if (msg.jsonrpc !== "2.0" || msg.id == null) return;
  const reply = { jsonrpc: "2.0", id: msg.id };
  try {
    const fn = METHODS[msg.method];
    if (!fn) throw rpcError(-32601, `Unknown method ${msg.method}`);
    if (!READ_ONLY.has(msg.method) && !setting("allowWrites")) throw rpcError(-32001, "Writes are disabled in the GM AutoPrep settings");
    reply.result = (await fn(msg.params ?? {})) ?? null;
  } catch (e) {
    reply.error = { code: e.code ?? -32000, message: e.message ?? String(e) };
  }
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(reply));
}

Hooks.once("ready", () => {
  game.modules.get(ID).api = { status: () => ({ status: state.status, detail: state.detail }), reconnect: () => connect(0) };
  if (shouldServe()) connect(1000);
});

// ---------------------------------------------------------------------------
// helpers
function rpcError(code, message) { const e = new Error(message); e.code = code; return e; }
function need(params, ...keys) {
  for (const k of keys) if (params[k] === undefined || params[k] === null || params[k] === "") throw rpcError(-32602, `Missing param "${k}"`);
}
function findIn(collection, ref, label) {
  const doc = collection.get(ref) ?? collection.getName(ref);
  if (!doc) throw rpcError(-32000, `No ${label} "${ref}"`);
  return doc;
}
const actorRef = (ref) => findIn(game.actors, ref, "actor");
const sceneRef = (ref) => findIn(game.scenes, ref, "scene");
function folderId(ref, type) {
  if (!ref) return null;
  const f = game.folders.get(ref) ?? game.folders.find((x) => x.type === type && x.name === ref);
  if (!f) throw rpcError(-32000, `No ${type} folder "${ref}"`);
  return f.id;
}
async function compendiumDoc(packId, source) {
  const pack = game.packs.get(packId || DEFAULT_PACK);
  if (!pack) throw rpcError(-32000, `No compendium "${packId}"`);
  let doc = await pack.getDocument(source).catch(() => null);
  if (!doc) {
    const entry = (await pack.getIndex()).find((e) => e.name === source);
    if (entry) doc = await pack.getDocument(entry._id);
  }
  if (!doc) throw rpcError(-32000, `No "${source}" in ${pack.collection}`);
  return doc;
}
function summary(a) {
  const hp = a.system?.attributes?.hp, cr = a.system?.details?.cr;
  return { id: a.id, name: a.name, type: a.type, folder: a.folder?.name ?? null,
    cr: cr ?? null, hp: hp?.max ?? null, ac: a.system?.attributes?.ac?.value ?? null,
    items: a.items.size, img: a.img, token: a.prototypeToken?.texture?.src ?? null,
    shell: a.type === "npc" && a.items.size === 0 && !hp?.max };
}
const FilePickerImpl = () => foundry.applications?.apps?.FilePicker?.implementation ?? globalThis.FilePicker;
const textOf = (html) => { const d = document.createElement("div"); d.innerHTML = html ?? ""; return d.textContent.replace(/\s+/g, " ").trim(); };

// ---------------------------------------------------------------------------
// methods
const METHODS = {
  "system.ping": async () => ({ pong: true, time: Date.now() }),

  "world.info": async () => ({
    world: game.world.id, title: game.world.title, foundry: game.version,
    system: game.system.id, systemVersion: game.system.version,
    modules: game.modules.filter((m) => m.active).map((m) => ({ id: m.id, version: m.version })),
    users: game.users.map((u) => ({ name: u.name, role: u.role, isGM: u.isGM, active: u.active })) }),

  "users.list": async () => game.users.map((u) => ({ id: u.id, name: u.name, role: u.role, isGM: u.isGM, active: u.active })),

  // ---- actors
  "actors.list": async ({ type, folder, query }) => game.actors
    .filter((a) => (!type || a.type === type) && (!folder || a.folder?.name === folder) &&
      (!query || a.name.toLowerCase().includes(String(query).toLowerCase())))
    .map(summary),

  "actors.get": async (p) => { need(p, "actor"); return actorRef(p.actor).toObject(); },

  "actors.create": async (p) => { need(p, "data"); const a = await Actor.create(p.data); return { id: a.id, name: a.name }; },

  "actors.update": async (p) => {
    need(p, "actor", "data");
    const a = actorRef(p.actor);
    await a.update(p.data, p.options ?? {});
    return { id: a.id };
  },

  "actors.delete": async (p) => { need(p, "actor"); const a = actorRef(p.actor); await a.delete(); return { deleted: a.id }; },

  "actors.fromCompendium": async (p) => {
    need(p, "source", "name");
    const data = (await compendiumDoc(p.pack, p.source)).toObject();
    delete data._id; delete data._stats; delete data.folder;
    data.name = p.name;
    data.folder = folderId(p.folder, "Actor");
    if (p.overrides) data.system = foundry.utils.mergeObject(data.system, p.overrides, { inplace: false });
    if (p.prototypeToken) data.prototypeToken = foundry.utils.mergeObject(data.prototypeToken ?? {}, p.prototypeToken, { inplace: false });
    if (p.img) { data.img = p.img; data.prototypeToken = { ...(data.prototypeToken ?? {}), texture: { ...(data.prototypeToken?.texture ?? {}), src: p.img } }; }
    const a = await Actor.create(data);
    return summary(game.actors.get(a.id));
  },

  "actors.fillFromCompendium": async (p) => {
    need(p, "actor", "source");
    const a = actorRef(p.actor);
    const src = (await compendiumDoc(p.pack, p.source)).toObject();
    const system = foundry.utils.mergeObject(src.system, p.overrides ?? {}, { inplace: false });
    if (p.keepBio !== false) system.details = { ...system.details, biography: a.toObject().system?.details?.biography ?? system.details?.biography };
    await a.update({ system }, { diff: false, recursive: false });
    if (a.items.size) await a.deleteEmbeddedDocuments("Item", a.items.map((i) => i.id));
    if (src.items?.length) await a.createEmbeddedDocuments("Item", src.items);
    if (src.effects?.length) await a.createEmbeddedDocuments("ActiveEffect", src.effects);
    return summary(game.actors.get(a.id)); // re-fetch: the in-memory system is stale after recursive:false
  },

  "actors.updateItem": async (p) => {
    need(p, "actor", "item", "data");
    const a = actorRef(p.actor);
    const item = a.items.get(p.item) ?? a.items.getName(p.item);
    if (!item) throw rpcError(-32000, `${a.name} has no item "${p.item}"`);
    await item.update(p.data);
    return { id: item.id, name: item.name };
  },

  // ---- compendium
  "compendium.search": async (p) => {
    need(p, "query");
    const q = String(p.query).toLowerCase(), out = [];
    const packs = p.pack ? [game.packs.get(p.pack)].filter(Boolean) : game.packs.filter((x) => x.documentName === "Actor");
    for (const pack of packs) {
      const idx = await pack.getIndex({ fields: ["system.details.cr"] });
      for (const e of idx) if (e.name.toLowerCase().includes(q)) out.push({ pack: pack.collection, id: e._id, name: e.name, cr: e.system?.details?.cr ?? null });
    }
    return out.slice(0, p.limit ?? 50);
  },

  // ---- scenes
  "scenes.list": async () => game.scenes.map((s) => ({
    id: s.id, name: s.name, active: s.active, walls: s.walls.size, lights: s.lights.size, tokens: s.tokens.size,
    background: s.levels?.contents?.[0]?.background?.src ?? s.background?.src ?? null })),

  "scenes.create": async (p) => {
    need(p, "data", "background");
    if (p.replace) { const old = game.scenes.getName(p.data.name); if (old) await old.delete(); }
    const scene = await Scene.create(p.data);
    if (scene.levels) {           // Foundry v14: the map belongs to an embedded SceneLevel
      let level = scene.levels.contents[0];
      if (level) await level.update({ name: scene.name, "background.src": p.background });
      else [level] = await scene.createEmbeddedDocuments(scene.levels.documentClass.documentName,
        [{ name: scene.name, background: { src: p.background }, elevation: { bottom: 0, top: 20 } }]);
      await scene.update({ initialLevel: level.id });
    } else {
      await scene.update({ "background.src": p.background });
    }
    const missing = [], tokens = [];
    for (const t of p.tokens ?? []) {
      const a = game.actors.get(t.actor) ?? game.actors.getName(t.actor);
      if (!a) { missing.push(t.actor); continue; }
      tokens.push((await a.getTokenDocument({ x: t.x, y: t.y, hidden: t.hidden ?? true })).toObject());
    }
    if (tokens.length) await scene.createEmbeddedDocuments("Token", tokens);
    await scene.createThumbnail().then((t) => scene.update({ thumb: t.thumb })).catch(() => {});
    const s = game.scenes.get(scene.id);
    return { id: s.id, name: s.name, walls: s.walls.size, doors: s.walls.filter((w) => w.door).length,
      lights: s.lights.size, tokens: s.tokens.size, missing };
  },

  "scenes.delete": async (p) => { need(p, "scene"); const s = sceneRef(p.scene); await s.delete(); return { deleted: s.id }; },

  "scenes.syncTokens": async (p) => {
    need(p, "scene");
    const s = sceneRef(p.scene);
    const updates = s.tokens.filter((t) => t.actor).map((t) => ({ _id: t.id,
      "texture.src": t.actor.prototypeToken.texture.src, name: t.actor.prototypeToken.name }));
    if (updates.length) await s.updateEmbeddedDocuments("Token", updates);
    return { updated: updates.length };
  },

  // ---- journal
  "journal.list": async ({ folder }) => game.journal.filter((j) => !folder || j.folder?.name === folder)
    .map((j) => ({ id: j.id, name: j.name, folder: j.folder?.name ?? null, pages: j.pages.size })),

  "journal.create": async (p) => {
    need(p, "name", "pages");
    if (p.replace) { const old = game.journal.getName(p.name); if (old) await old.delete(); }
    const j = await JournalEntry.create({ name: p.name, folder: folderId(p.folder, "JournalEntry"),
      ownership: p.ownership ?? { default: 0 }, pages: p.pages });
    return { id: j.id, name: j.name, pages: j.pages.size };
  },

  "journal.delete": async (p) => { need(p, "journal"); const j = findIn(game.journal, p.journal, "journal"); await j.delete(); return { deleted: j.id }; },

  // ---- files
  "files.upload": async (p) => {
    need(p, "path", "name", "base64");
    const FP = FilePickerImpl();
    const parts = String(p.path).split("/").filter(Boolean);
    for (let i = 1; i <= parts.length; i++) await FP.createDirectory("data", parts.slice(0, i).join("/"), {}).catch(() => {});
    const bin = atob(p.base64), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const file = new File([bytes], p.name, { type: p.contentType || "application/octet-stream" });
    const r = await FP.upload("data", parts.join("/"), file, {}, { notify: false });
    if (!r?.path) throw rpcError(-32000, `Upload of ${p.name} failed`);
    return { path: r.path };
  },

  // ---- tokens
  "tokens.tokenize": async (p) => {
    need(p, "actor");
    const api = game.modules.get("tokenizer-2")?.api;
    if (!api?.tokenize) throw rpcError(-32000, "Tokenizer 2 is not installed or not active");
    const a = actorRef(p.actor);
    await api.tokenize(a, { useActorImg: true, portraitFit: "cover", forceBakedRing: true,
      exportSize: p.size ?? 512, exportFormat: "webp", save: true, updateActor: true });
    return { actor: a.id, token: game.actors.get(a.id).prototypeToken.texture.src };
  },

  // ---- chat
  "chat.query": async ({ since, until, limit }) => {
    const lo = since ? Date.parse(since) : 0, hi = until ? Date.parse(until) : Infinity;
    return game.messages.contents
      .filter((m) => m.timestamp >= lo && m.timestamp <= hi)
      .slice(-(limit ?? 500))
      .map((m) => ({ time: new Date(m.timestamp).toISOString(), speaker: m.speaker?.alias ?? m.author?.name ?? null,
        flavor: textOf(m.flavor), text: textOf(m.content).slice(0, 2000), rolls: (m.rolls ?? []).map((r) => r.total) }));
  },
};

#!/usr/bin/env node
// campaign-loop hub — forwards authenticated JSON-RPC calls to the one Foundry client
// connected over WebSocket. See docs/PROTOCOL.md.
//
// env: CL_PORT (30777)  CL_HOST (127.0.0.1)  CL_TOKEN  CL_DATA (~/.campaign-loop)  CL_TIMEOUT_MS (120000)

import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { WebSocketServer } from "ws";

const PROTOCOL = 0;
const PORT = Number(process.env.CL_PORT || 30777);
const HOST = process.env.CL_HOST || "127.0.0.1";
const DATA = process.env.CL_DATA || path.join(os.homedir(), ".campaign-loop");
const TIMEOUT = Number(process.env.CL_TIMEOUT_MS || 120000);
const MAX_BODY = 64 * 1024 * 1024; // room for base64 map uploads

const log = (...a) => console.log(new Date().toISOString(), ...a);

function loadToken() {
  if (process.env.CL_TOKEN) return process.env.CL_TOKEN.trim();
  fs.mkdirSync(DATA, { recursive: true, mode: 0o700 });
  const f = path.join(DATA, "token");
  if (!fs.existsSync(f)) {
    fs.writeFileSync(f, crypto.randomBytes(32).toString("hex") + "\n", { mode: 0o600 });
    log(`generated a new hub token in ${f}`);
  }
  return fs.readFileSync(f, "utf8").trim();
}
const TOKEN = loadToken();
const tokenOk = (t) => typeof t === "string" && t.length === TOKEN.length &&
  crypto.timingSafeEqual(Buffer.from(t), Buffer.from(TOKEN));

// ---- the active Foundry client --------------------------------------------
let active = null;          // { ws, info, since }
let nextId = 1;
const pending = new Map();  // id -> { resolve, timer }

function call(method, params) {
  return new Promise((resolve) => {
    if (!active) return resolve({ error: { code: -32010, message: "No Foundry client is connected to the hub" } });
    const id = nextId++;
    const timer = setTimeout(() => {
      pending.delete(id);
      resolve({ error: { code: -32011, message: `Timed out after ${TIMEOUT} ms waiting for ${method}` } });
    }, TIMEOUT);
    pending.set(id, { resolve, timer });
    active.ws.send(JSON.stringify({ jsonrpc: "2.0", id, method, params: params ?? {} }));
  });
}

function dropActive(reason) {
  if (!active) return;
  log(`foundry client gone (${reason}): ${active.info.user}@${active.info.world}`);
  active = null;
  for (const [id, p] of pending) {
    clearTimeout(p.timer);
    p.resolve({ error: { code: -32010, message: "Foundry client disconnected mid-request" } });
    pending.delete(id);
  }
}

// ---- HTTP ------------------------------------------------------------------
const server = http.createServer((req, res) => {
  const send = (code, body) => {
    res.writeHead(code, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  if (req.method === "GET" && req.url === "/status") {
    return send(200, { ok: true, protocol: PROTOCOL,
      client: active ? { ...active.info, since: active.since } : null });
  }
  if (req.method === "POST" && req.url === "/rpc") {
    const auth = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!tokenOk(auth)) return send(401, { error: { code: 401, message: "bad or missing token" } });
    let size = 0; const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) { send(413, { error: { code: 413, message: "body too large" } }); req.destroy(); }
      else chunks.push(c);
    });
    req.on("end", async () => {
      if (res.writableEnded) return;
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); }
      catch { return send(400, { error: { code: -32700, message: "invalid JSON" } }); }
      if (!body.method) return send(400, { error: { code: -32602, message: "missing method" } });
      const reply = await call(body.method, body.params);
      if (reply.error) {
        const code = reply.error.code === -32010 ? 502 : reply.error.code === -32011 ? 504 : 500;
        return send(code, { error: reply.error });
      }
      return send(200, { result: reply.result });
    });
    return;
  }
  send(404, { error: { code: 404, message: "not found" } });
});

// ---- WebSocket from the Foundry module --------------------------------------
const wss = new WebSocketServer({ server, path: "/foundry", maxPayload: MAX_BODY });

wss.on("connection", (ws, req) => {
  let authed = false;
  const hello = setTimeout(() => { if (!authed) ws.close(4001, "no hello"); }, 10000);

  ws.on("message", (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (!authed) {
      if (msg.type !== "hello" || !tokenOk(msg.token)) {
        ws.send(JSON.stringify({ type: "denied", reason: "bad token" }));
        return ws.close(4003, "denied");
      }
      if (msg.protocol !== PROTOCOL) {
        ws.send(JSON.stringify({ type: "denied", reason: `hub speaks protocol ${PROTOCOL}` }));
        return ws.close(4004, "protocol");
      }
      if (active && active.ws.readyState === active.ws.OPEN) {
        ws.send(JSON.stringify({ type: "busy", holder: active.info.user }));
        return ws.close(4009, "busy");
      }
      authed = true;
      clearTimeout(hello);
      const { token, type, ...info } = msg;
      active = { ws, info, since: new Date().toISOString() };
      ws.send(JSON.stringify({ type: "welcome", protocol: PROTOCOL }));
      log(`foundry client active: ${info.user}@${info.world} (Foundry ${info.foundry}, ${info.system} ${info.systemVersion}, module ${info.module}) from ${req.socket.remoteAddress}`);
      return;
    }

    if (msg.jsonrpc === "2.0" && msg.id != null && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      clearTimeout(p.timer);
      pending.delete(msg.id);
      p.resolve(msg.error ? { error: msg.error } : { result: msg.result });
    }
  });

  ws.on("close", () => { clearTimeout(hello); if (active?.ws === ws) dropActive("closed"); });
  ws.on("error", () => {});
});

// keepalive so dead connections are noticed
setInterval(() => {
  if (!active) return;
  if (active.alive === false) { active.ws.terminate(); return dropActive("no pong"); }
  active.alive = false;
  active.ws.ping();
}, 30000);
wss.on("connection", (ws) => ws.on("pong", () => { if (active?.ws === ws) active.alive = true; }));

server.listen(PORT, HOST, () => log(`campaign-loop hub listening on http://${HOST}:${PORT} (ws path /foundry)`));

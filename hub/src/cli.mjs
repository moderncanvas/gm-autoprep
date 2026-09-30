#!/usr/bin/env node
// cl — call the campaign-loop hub from a shell.
//
//   cl status
//   cl <method> ['<json params>']        e.g.  cl actors.list '{"type":"npc"}'
//   cl files.upload --file map.webp --path assets/maps
//
// env: CL_URL (http://127.0.0.1:30777)  CL_TOKEN or CL_TOKEN_FILE (~/.campaign-loop/token)

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const URL_ = process.env.CL_URL || "http://127.0.0.1:30777";
const token = () => process.env.CL_TOKEN ||
  fs.readFileSync(process.env.CL_TOKEN_FILE || path.join(os.homedir(), ".campaign-loop", "token"), "utf8").trim();

const [, , method, ...rest] = process.argv;
if (!method) {
  console.error("usage: cl status | cl <method> ['<json params>'] | cl files.upload --file <f> --path <dir>");
  process.exit(2);
}

if (method === "status") {
  const r = await fetch(`${URL_}/status`);
  console.log(JSON.stringify(await r.json(), null, 2));
  process.exit(0);
}

let params = {};
if (method === "files.upload") {
  const arg = (k) => rest[rest.indexOf(k) + 1];
  const file = arg("--file");
  params = { path: arg("--path") || "assets", name: path.basename(file),
             base64: fs.readFileSync(file).toString("base64") };
} else if (rest[0]) {
  params = JSON.parse(rest[0]);
}

const r = await fetch(`${URL_}/rpc`, {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${token()}` },
  body: JSON.stringify({ method, params }),
});
const body = await r.json();
if (body.error) { console.error(JSON.stringify(body.error, null, 2)); process.exit(1); }
console.log(JSON.stringify(body.result, null, 2));

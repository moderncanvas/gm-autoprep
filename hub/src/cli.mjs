#!/usr/bin/env node
// autoprep — call the GM AutoPrep hub from a shell.
//
//   autoprep status
//   autoprep <method> ['<json params>']        e.g.  autoprep actors.list '{"type":"npc"}'
//   autoprep files.upload --file map.webp --path assets/maps
//
// env: AUTOPREP_URL (http://127.0.0.1:30777)  AUTOPREP_TOKEN or AUTOPREP_TOKEN_FILE (~/.gm-autoprep/token)

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const URL_ = process.env.AUTOPREP_URL || "http://127.0.0.1:30777";
const token = () => process.env.AUTOPREP_TOKEN ||
  fs.readFileSync(process.env.AUTOPREP_TOKEN_FILE || path.join(os.homedir(), ".gm-autoprep", "token"), "utf8").trim();

const [, , method, ...rest] = process.argv;
if (!method) {
  console.error("usage: autoprep status | autoprep <method> ['<json params>'] | autoprep files.upload --file <f> --path <dir>");
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

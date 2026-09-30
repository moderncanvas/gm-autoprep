// Drives the MCP server over stdio the way an MCP client (Claude) does.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const client = new Client({ name: "autoprep-test", version: "0" });
await client.connect(new StdioClientTransport({ command: "node", args: [path.join(here, "../src/server.mjs")], env: { ...process.env } }));
const { tools } = await client.listTools();
console.log(`${tools.length} tools:`, tools.map((t) => t.name + (t.annotations?.destructiveHint ? "!" : t.annotations?.readOnlyHint ? "" : "*")).join(" "));
const call = async (name, args = {}) => {
  const r = await client.callTool({ name, arguments: args });
  const t = r.content[0].text;
  console.log(`\n${r.isError ? "ERR" : "ok "} ${name} ${JSON.stringify(args).slice(0, 80)}\n   ${t.replace(/\s+/g, " ").slice(0, 230)}`);
  return r;
};
await call("foundry_status");
await call("foundry_list_actors", { type: "npc" });
await call("foundry_search_compendium", { query: "Cultist", limit: 4 });
await call("foundry_query_chat", { since: "2026-09-09T23:00:00Z", until: "2026-09-10T02:00:00Z", limit: 3 });
if (process.env.UPLOAD) await call("foundry_upload_file", { localPath: process.env.UPLOAD, folder: "assets/_cl-mcp-test" });
await call("foundry_get_actor", { actor: "Nobody By This Name" });
await client.close();

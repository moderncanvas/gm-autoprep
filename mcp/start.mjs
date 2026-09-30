#!/usr/bin/env node
// Launcher used by the Claude Code plugin: installs the MCP server's dependencies on first run
// (plugin installs don't run npm), then starts the server. Progress goes to stderr, never stdout,
// which belongs to the MCP protocol.
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
if (!existsSync(path.join(here, "node_modules", "@modelcontextprotocol", "sdk"))) {
  process.stderr.write("gm-autoprep: first run — installing MCP server dependencies (about 20 s)…\n");
  execFileSync(process.platform === "win32" ? "npm.cmd" : "npm", ["ci", "--omit=dev", "--no-audit", "--no-fund"],
    { cwd: here, stdio: ["ignore", process.stderr, process.stderr] });
}
await import("./src/server.mjs");

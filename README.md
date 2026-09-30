# GM AutoPrep

**AI session prep and automatic asset building for game masters.**

GM AutoPrep lets a GM use AI to prepare for sessions and create the assets those sessions
need, automatically, inside Foundry VTT. It closes the loop:

**record the session → recap it → keep the campaign's memory → prep the next session → build
it into Foundry VTT → play → record.**

It grew out of a real campaign. After each session it reads the recording (via
[Archivist](https://myarchivist.ai)) and Foundry's own chat log, writes the recap into an
Obsidian vault, checks what's been planted and what's due to pay off, writes a
scene-by-scene prep doc — and then builds the session into Foundry: full NPC stat blocks,
portraits and tokens, handouts, and battle maps with walls, doors, windows and lights.

> **Status: early (0.4).** Everything below works and is used on a real campaign, but expect
> rough edges. D&D 5e is the best-supported system so far.
> See [Roadmap](#roadmap).

## What a GM gets

Three commands in Claude Code:

| Command | When | What it does |
|---|---|---|
| `/gm-setup` | once | Connects to your Foundry, creates (or adopts) your campaign vault, fills `campaign.yaml` from your world and recordings, and writes a one-page Campaign Brief with you |
| `/gm-log` | after a session | Reads the recording summary, the Foundry chat log and the world, and writes the recap: what happened, what was planned but didn't, open threads, bookkeeping flags. Updates the plant/payoff ledger |
| `/gm-prep` | before a session | Writes a scene-by-scene prep doc (running order, cut order, the things that must land, encounters rebalanced for the party's *real* level), then builds it into Foundry: full NPC stat blocks, portraits and tokens, handouts, and battle maps with walls, doors, windows, lights and hidden tokens |

Under them, 29 MCP tools that any MCP client can use directly: `foundry_*` (actors, compendium
clones, scenes, journals, uploads, tokens, chat log), `map_*` (any map image → a scene — see
[docs/MAPS.md](docs/MAPS.md)) and `archivist_*` (session recordings).

## Any system — with or without Foundry

Nothing in the skills assumes D&D. Your vault's `campaign.yaml` tells them how *your* game works:

- **`system.reference`** — your own rules notes; they win over the built-in D&D reference. Levels from
  time played, health as slots, difficulty by dungeon floor — whatever your system does.
- **`foundry.enabled: false`** — no VTT (or no Foundry system for your game yet): recaps, ledgers and
  prep docs still work, and art lands in your vault instead.
- **`log.evidence`**, **`log.ask`**, **`log.ledgers`**, **`log.procedure`** — your other records of play (a
  DM screen, a tracker's state file), the questions only you can answer (real hours played), every
  running-state note to keep current, and your system's own after-session steps.
- **`paths`** — adopt an existing vault as it is; `/gm-setup` maps it instead of moving anything.

Tested by adopting a second, non-D&D campaign with its own vault layout, ledgers and live DM screen and
no Foundry: a fresh session derived that system's difficulty formulas, levelling-by-hours and boss
sizing entirely from the campaign's own notes.

## How it fits together

```
 Claude Code + GM AutoPrep plugin                      Foundry VTT
   ├─ skills  /gm-setup /gm-log /gm-prep
   └─ MCP server ─────────HTTP──────► hub ◄──WebSocket── gm-autoprep module
        ├─ your campaign vault (markdown / Obsidian)       (runs in one GM client,
        ├─ Archivist (session recordings, optional)         dials out — no open port)
        └─ image model (optional: ChatGPT via Codex, or you)
```

| Piece | Folder | License |
|---|---|---|
| Claude Code plugin — skills, and the MCP server wiring | `skills/`, `.claude-plugin/`, `.mcp.json` | AGPL-3.0 |
| MCP server — 29 tools | `mcp/` | AGPL-3.0 |
| Campaign vault template | `vault-template/` | MIT |
| Foundry module — typed JSON-RPC methods | `module/` | MIT |
| Hub — authenticated relay to the one serving Foundry client | `hub/` | AGPL-3.0 |
| Automation GM — a headless Foundry client that stays logged in and configures itself | `automation/` | AGPL-3.0 |
| Docker packaging for the hub + automation GM | `compose.yml`, `.env.example` | AGPL-3.0 |
| Protocol · map guide | [docs/PROTOCOL.md](docs/PROTOCOL.md) · [docs/MAPS.md](docs/MAPS.md) | — |

Design choices worth knowing:

- **No arbitrary code execution.** The module exposes typed methods only. Read
  [docs/PROTOCOL.md](docs/PROTOCOL.md) and you know exactly what the assistant can do to your world.
- **It never builds during play.** Prep checks who's logged in and stops if your players are.
- **Scenes are created inactive and tokens hidden** — you decide what the table sees.
- **Exactly one serving client.** Several GM clients never fight over the connection.
- **The token never reaches players** (a per-user setting on the automation account), and a
  read-only switch in the module settings turns off all changes.

## Install

You need Foundry VTT v12+ (tested on v14.365 with dnd5e 5.3.3), Claude Code, and — for the
Foundry-side pieces — Docker (or Node 20+ and Chromium, see below).

**1. The Foundry module.** In Foundry: *Add-on Modules → Install Module*, paste this manifest URL:

```
https://github.com/moderncanvas/gm-autoprep/releases/latest/download/module.json
```

Enable **GM AutoPrep** in your world, and create a user for the assistant — e.g. **AutoPrep** —
with the **Gamemaster** role and a password.

**2. The hub and the automation GM** — on any machine that can reach your Foundry (the Foundry host
itself is simplest):

```bash
git clone https://github.com/moderncanvas/gm-autoprep && cd gm-autoprep
cp .env.example .env          # set FOUNDRY_URL, AUTOPREP_USER, AUTOPREP_PASSWORD
docker compose up -d --build
docker compose exec hub cat /data/token
```

The automation GM logs in as that user, stays logged in so the assistant works when nobody has Foundry
open, and configures the module for itself — no settings to paste. It rejoins after Foundry restarts
and recovers from browser crashes. `docker compose logs automation` shows what it's doing.

**3. Claude Code** — on the machine where you run it:

```bash
mkdir -p ~/.gm-autoprep && chmod 700 ~/.gm-autoprep
# paste the token into ~/.gm-autoprep/token (chmod 600), and create ~/.gm-autoprep/config.json:
#   { "hubUrl": "http://<hub machine>:30777", "archivistApiKey": "<optional>" }
```

```
/plugin marketplace add moderncanvas/gm-autoprep
/plugin install gm-autoprep@gm-autoprep
```

Restart Claude Code, open it in the folder where you want your campaign vault, and run `/gm-setup`.
The MCP server installs its own dependencies on first start (about 20 seconds).

**Check it:** `AUTOPREP_URL=http://<hub machine>:30777 AUTOPREP_TOKEN_FILE=~/.gm-autoprep/token node hub/test/smoke.mjs`
runs 23 end-to-end checks against your world and cleans up after itself.

<details>
<summary>Without Docker</summary>

On the Foundry host (Linux, systemd):

```bash
sudo AUTOPREP_HOST=0.0.0.0 deploy/install-hub.sh "$PWD"      # hub as a service; token in /etc/gm-autoprep/token
cd automation && npm install
FOUNDRY_URL=http://127.0.0.1:30000 AUTOPREP_USER=AutoPrep AUTOPREP_PASSWORD=… \
  AUTOPREP_TOKEN_FILE=/etc/gm-autoprep/token AUTOPREP_HUB_WS=ws://127.0.0.1:30777/foundry \
  CHROMIUM_PATH=/usr/bin/chromium node src/automation.mjs      # wrap in a systemd unit to keep it running
```

The automation GM uses about 1.4 GB of RAM (it's a full Foundry client in headless Chromium).
</details>

The hub listens on port 30777 and every call needs the token. Keep it on your LAN or put TLS in front
before exposing it further.

## Roadmap

1. ✅ Foundry module + hub + protocol
2. ✅ MCP server
3. ✅ Map pipeline — any map image → walls, doors, windows, lights, hidden tokens
4. ✅ Claude Code plugin: `/gm-setup`, `/gm-log`, `/gm-prep` + campaign vault template + Archivist tools
5. ✅ Automation GM that stays logged in and configures itself, `docker compose up`, and one-link
   module install from GitHub releases
6. ✅ Automatic first-draft wall detection (`map_detect_walls`) — measured, honest numbers in [docs/MAPS.md](docs/MAPS.md)
7. ✅ Any system, with or without Foundry, via `campaign.yaml` (`system`, `log`, `paths`)
8. Built-in references for more systems — `skills/gm-prep/references/<system>.md` for Pathfinder 2e and
   others (contributions welcome; a campaign's own rules notes already work today)

## Rules of the road

- Bring your own everything: Foundry license, Claude access, image source, Archivist account.
- Ships SRD 5.2 content only (CC-BY-4.0). Never commit books, paid modules or anyone's campaign.
- Session recordings are your players' voices — get their consent.

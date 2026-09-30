# campaign-loop *(working name)*

An open-source AI assistant for game masters that closes the loop:

**record the session → recap it → keep the campaign's memory → prep the next session → build
it into Foundry VTT → play → record.**

It grew out of a real campaign. After each session it reads the recording (via
[Archivist](https://myarchivist.ai)) and Foundry's own chat log, writes the recap into an
Obsidian vault, checks what's been planted and what's due to pay off, writes a
scene-by-scene prep doc — and then builds the session into Foundry: full NPC stat blocks,
portraits and tokens, handouts, and battle maps with walls, doors, windows and lights.

> **Status: early.** This repo currently holds the foundation — the Foundry module and the hub
> that let an AI agent work inside a world safely. The agent skills, vault template, map
> pipeline and MCP server are being extracted from a working personal setup next.
> See [Roadmap](#roadmap).

## How it fits together

```
 Claude (Code / Desktop / API)                        Foundry VTT
   └─ skills + MCP server ──HTTP──► hub ◄──WebSocket── campaign-loop module
        │                          (next to Foundry)   (runs in one GM client,
        ├─ Obsidian vault (markdown)                    dials out — no open port)
        ├─ Archivist API (session recordings)
        └─ image provider (OpenAI / ComfyUI / …)
```

| Piece | Folder | License |
|---|---|---|
| Foundry module — typed JSON-RPC methods for actors, compendium clones, scenes with walls/lights/tokens, journals, uploads, tokens, chat log | `module/` | MIT |
| Hub — authenticated relay between agents and the one serving Foundry client | `hub/` | AGPL-3.0 |
| Protocol | `docs/PROTOCOL.md` | — |

Design choices worth knowing:

- **No arbitrary code execution.** The module exposes typed methods only. Anyone can read the
  whole API in `docs/PROTOCOL.md` and know exactly what the assistant can do to their world.
- **Exactly one serving client.** Several GM clients never fight over the connection — the hub
  accepts one and tells the rest to stand by quietly.
- **The token never reaches players.** It is stored as a per-user setting on the automation
  account (Foundry v13+).
- **A read-only switch.** Turn off "Allow the assistant to change the world" and it can still
  read actors, scenes and the chat log, but not change anything.

## Try the foundation (developers)

Requires Foundry VTT v12+ (tested on v14.365 / dnd5e 5.3.3) and Node 20+ on the Foundry host.

```bash
# on the Foundry host
cp -r module /path/to/foundrydata/Data/modules/campaign-loop   # then restart Foundry
sudo deploy/install-hub.sh "$PWD"                              # hub on 127.0.0.1:30777
sudo cat /etc/campaign-loop/token
```

In the world: enable **Campaign Loop**, set **Automation user** to the GM account that should
serve (a dedicated headless GM is ideal), and — logged in as that user — paste the token.

```bash
node hub/src/cli.mjs status
CL_TOKEN_FILE=/etc/campaign-loop/token node hub/src/cli.mjs actors.list '{"type":"npc"}'
CL_TOKEN_FILE=/etc/campaign-loop/token node hub/test/smoke.mjs     # end-to-end, cleans up after itself
```

## Roadmap

1. ✅ Foundry module + hub + protocol, tested end to end on a live v14 world
2. MCP server over the hub, so any MCP client (Claude Code, Claude Desktop) gets the tools
3. Packaged headless automation client (a GM that stays logged in so the assistant works
   when nobody has Foundry open)
4. Map pipeline: any map image (AI-painted or bought) → walls, doors, windows, lights, preview,
   import
5. Campaign-agnostic prep skills + an Obsidian vault template (recaps, plant/payoff ledger,
   revelation sequence, prep docs)
6. Archivist integration, image-provider plug-ins, `docker compose up`

## Rules of the road

- Bring your own everything: Foundry license, Claude access, image source, Archivist account.
- Ships SRD 5.2 content only (CC-BY-4.0). Never commit books, paid modules or anyone's campaign.
- Session recordings are your players' voices — get their consent.

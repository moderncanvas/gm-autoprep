---
name: gm-setup
description: First-run setup for GM AutoPrep — checks the connection to Foundry (hub + module), creates or adopts a campaign vault from the template, fills campaign.yaml by interviewing the GM and reading their world and Archivist, and writes the Campaign Brief. Use for "set up gm autoprep", "gm-setup", "new campaign vault", "connect my Foundry", "import my campaign".
---

# /gm-setup — connect Foundry and set up a campaign vault

Goal: by the end the GM can run `/gm-log` and `/gm-prep`. Do the checks yourself; ask only what
you can't discover. Keep questions batched — one round, not a drip.

## 1. Connection

0. **Does this campaign use Foundry?** If not (or its system isn't on Foundry yet), set
   `foundry.enabled: false` and skip to step 3 — everything except the build works without it.
1. Call `foundry_status`.
   - **Tool missing** → the plugin's MCP server didn't start. Tell the GM to run
     `node <plugin>/mcp/start.mjs` once in a terminal to see the error (usually Node < 20).
   - **Hub unreachable** → the hub isn't running or `hubUrl` is wrong. Point them to the README's
     "Install" section; the hub URL goes in `~/.gm-autoprep/config.json` as `"hubUrl"`.
   - **No hub token** → copy `/etc/gm-autoprep/token` from the Foundry host to
     `~/.gm-autoprep/token` (chmod 600).
   - **Connected but no client** → in Foundry: enable the *GM AutoPrep* module, set *Automation
     user*, and — logged in as that user — paste the token. The user must stay logged in (a
     headless GM session is ideal; see README).
2. Report world, Foundry version, system, and whether players are online (`foundry_list_users`).
3. If the GM uses Archivist: check `archivist_list_sessions` works (key in
   `~/.gm-autoprep/config.json` as `"archivistApiKey"`).

## 2. The vault

- **New campaign:** copy `vault-template/` from the plugin to where the GM wants it (ask once; suggest
  a folder they already sync). Never overwrite an existing folder.
- **Existing vault:** don't restructure or rename anything. Add `campaign.yaml` beside what's there
  and point it at what already exists:
  - `paths` — where sessions, recaps, NPCs, locations and assets really live, and the brief (an existing
    `CLAUDE.md` or campaign overview works). Only create the plant ledger / revelation sequence if the
    vault has nothing that does that job.
  - `system.reference` — the vault's rules notes (a quick reference, running-the-game notes).
  - `log.template` — the vault's own session template, if it has one.
  - `log.ledgers` — every running-state note (clocks, reputation, loot, house rules).
  - `log.procedure` — a note or template that already lists after-session steps.
  - `log.evidence` — other records of play (a DM screen, a combat tracker's state file, a bot's log):
    ask what each is trustworthy for.
  - `log.ask` — anything the system needs from the GM that no record holds (e.g. real hours played).

## 3. campaign.yaml — fill it from evidence first

- `foundry.world`, `campaign.system`: from `foundry_status` — or, without Foundry, from the vault and the GM.
- `table.players`: from `foundry_list_actors {type: "character"}` + `foundry_list_users`, then
  Archivist characters if present. Pronouns: only what the GM states; otherwise they/them.
- `campaign.party_level`: from the character sheets.
- `archivist.campaign_id`: ask, or read it from the Archivist URL they paste.
- Ask the GM for: campaign name, setting, tone, current arc, art provider, and any pacing rules.

## 4. Campaign Brief and memory

Interview for the Campaign Brief (pitch, core secret, endings, load-bearing NPCs and mechanics,
table rules) — five or six questions, then write it. If there are past recordings, offer to
back-fill: read the Archivist sessions and draft the first rows of the Plant-Payoff Ledger and
Revelation Sequence **as a proposal for the GM to edit** — never as fact.

## 5. Finish

Tell the GM what's connected, where the vault is, and the two commands they'll use:
`/gm-log` after a session and `/gm-prep` before the next.

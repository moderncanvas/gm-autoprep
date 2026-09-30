---
name: gm-log
description: Post-session logging for a GM AutoPrep campaign — reads the session recording summary (Archivist), the Foundry chat log and the world's current state, then writes the session recap into the campaign vault with open threads, deferred content and bookkeeping flags, and updates the plant/payoff ledger. Use for "log the session", "session recap", "gm-log", "what happened last session", after a game night.
---

# /gm-log — write up the session that was just played

Run it end to end without stopping to confirm steps. Report at the end.

## 0. Load the campaign
Find the vault (the working directory, or ask once) and read `campaign.yaml`, then the brief at
`paths.brief`. Everything campaign-specific comes from there, not from memory:
- **`paths`** — where this vault keeps sessions, recaps, NPCs and ledgers (defaults are the template's).
- **`system.reference`** — read these rules notes before any rules judgement. **Never assume D&D**:
  levels, advancement, health and time can all work differently.
- **`foundry.enabled: false`** — skip every Foundry step; the vault, recordings and `log.evidence` are
  the whole record.
- **`log.ask`** — ask the GM these every time, in one batch, before writing (e.g. real hours played,
  when the system levels by time). Don't guess an answer that drives mechanics.

## 1. Gather evidence — three sources, each good for different things

| Source | Tool | Trust it for |
|---|---|---|
| Archivist summary + moments | `archivist_list_sessions`, `archivist_get_session`, `archivist_list_moments` | **Narrative and intent** — what happened and why |
| Foundry chat log | `foundry_query_chat {since, until}` | **Mechanics** — every roll, attack, damage number, who went down, spells cast |
| World state | `foundry_list_actors`, `foundry_get_actor`, `foundry_list_scenes` | Levels, items, HP, what exists now |
| `log.evidence` sources | read each (file, or fetch a local URL) | Whatever its `trust` says — e.g. a DM screen's state is the mechanical record when there's no Foundry |

Skip the Foundry rows when `foundry.enabled` is false. Skip Archivist when `archivist.campaign_id` is empty.

- **Map sittings to session numbers through the recaps' `archivist-title` frontmatter**, never by
  counting — one session can span two sittings and some sittings have no recap. If a sitting has no
  recap yet, flag it.
- Archivist dates are UTC, so an evening game carries the next day's date. Query the chat log over
  a generous window (from the afternoon before to the morning after).
- **Check every PC's level** — from the Foundry sheets, or from the vault's character notes when there's
  no Foundry. Tables level early; it changes every encounter after.
- Look in the chat log for level-up HP rolls, new spell/feature cards, and items appearing on
  sheets that Archivist never mentions — flag each one.
- If Archivist has **zero moments** for the sitting, say so and let chat-log highlights (with
  timestamps) stand in. Never invent moments.
- **If Archivist and the chat log disagree, say so in the recap** and cite the log for mechanics.

## 2. Write the recap
`<paths.recaps>/Session NN Recap.md`, following `log.template` if the vault has its own session
template (use its sections and frontmatter), otherwise the vault's `Templates/Session Recap.md`, or the plugin's `vault-template/Templates/Session Recap.md` if the vault has none — and the style of
the existing recaps. Update it if it exists. Rules:
- Bold beat headers; names, quotes and decisions; specific, not summarised.
- "What Was Planned But Didn't Happen" is a table against the prep file for that session (✅ landed,
  ❌ didn't, ⏩ moved to next, ⚠️ re-routed). The unplayed remainder rolls into the next session —
  normal, not a failure.
- "Open Threads" numbered and tagged: [IMMEDIATE] [OVERDUE] [DO NOT PAY OFF YET]. Anything deferred
  twice is [OVERDUE] and needs re-routing somewhere it cannot be skipped.
- PCs: use pronouns from `campaign.yaml`; otherwise they/them.

## 3. Update the memory
- **Plant ledger** (`paths.plants`): mark what paid off, move rows that slipped (strike the old session
  number, write the new one), add new plants the players created. Don't rewrite rows that didn't move.
- **Revelation Sequence** (skip if `paths.revelations` is empty): note anything the players learned early or that landed out of order.
- **Every note in `log.ledgers`** (clocks, reputation, loot, house rules…): bring each up to date from the
  evidence, in the ledger's own format.
- **`log.procedure`**, if set: follow that note's after-session steps in order (e.g. a system that levels
  by hours played, or rolls advancement for marked skills). Show every roll and every number you used.
- **Never overwrite the GM's own notes** — NPC/location files get edits only for facts established
  at the table, and say which in your report.

## 4. Report
Where the recap was written, the open threads (urgent ones named), bookkeeping flags (zero moments,
early level-up, unexplained items), and drift: player theories gaining traction, content deferred
twice, anything at risk of revealing out of order.

If the vault's drive is read-only, write the files to a staging folder mirroring vault paths and
give the GM one command to copy them in.

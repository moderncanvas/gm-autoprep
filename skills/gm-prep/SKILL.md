---
name: gm-prep
description: Next-session prep for a GM AutoPrep campaign — writes a scene-by-scene prep doc from the recap, the plant/payoff ledger and the revelation sequence, rebalances encounters for the party's real level, then builds everything the session needs straight into Foundry VTT (NPC stat blocks, portraits and tokens, handouts, battle maps with walls, doors, windows, lights and hidden tokens). Use for "prep next session", "gm-prep", "session prep", "build the NPCs", "make a map for", "make a handout". Args: doc-only, build-only, map <location>, npc <name>.
---

# /gm-prep — prepare the next session and build it into Foundry

Default: write the prep doc, then build every asset it needs, without stopping between steps.
`campaign.yaml` → `prep.build_automatically: false` means stop after the doc and offer the build.
**`foundry.enabled: false`** means there's nothing to build into: write the doc, put art and handouts in
`<paths.assets>` for the GM to use however they run the game, and skip step 2's Foundry parts.

**Guardrail:** before building, call `foundry_list_users`. If any user in
`campaign.yaml → foundry.player_users` (or any non-GM) is logged in, **a session may be live — stop
and ask.** Never build during play.

## 0. Load the campaign
Read `campaign.yaml` and everything it points to: the brief (`paths.brief`), the latest recap and prep
doc, the plant ledger (`paths.plants`), the revelation sequence (`paths.revelations`, if the vault has one), every `log.ledgers`
note, the current arc note, the planned session note if one exists (the latest prep doc beats an older
plan), and **the `system.reference` rules notes** — never assume D&D. If the last session hasn't been
logged, run `/gm-log` first.

Check the party's **actual level** — from the sheets (`foundry_list_actors {type:"character"}`), or the
vault's character notes when there's no Foundry.

## 1. Write the prep doc
`<paths.prep>/Session NN Prep.md` (create the folder if it's missing), following the vault's `Templates/Session Prep.md` — or, if the vault has none, the plugin's `vault-template/Templates/Session Prep.md`, and show it in the
conversation. What makes it good:

- **Open with what changed** since the last plan and why it reshapes this session.
- **Running order table** with a Foundry scene per row, a time budget that fits
  `prep.session_length_hours`, and a numbered **cut order**. Mark load-bearing scenes **NEVER**.
- **2–4 things that must land**, drawn from the ledger (due and overdue) and the arc.
- **Weave threads together.** The strongest move is one choice that closes several threads at once
  (the captive's family is the family the party saves, on the ally's street where the overdue clue
  lives). Look for it before writing scenes.
- **Re-route anything deferred twice** into a scene that cannot be cut.
- **Encounters at the party's real level** — size them the way *this system* does: `system.reference`
  and `system.encounters` first, the plugin's `references/<system>.md` (e.g. `dnd5e.md`) only if the vault
  says nothing. Under-tuned boss → retune it (HP, AC, attacks, regeneration) and give the fight an
  **objective** (someone to stop, a clock) plus a **clock rule** to end it early if time runs short.
- **Respect the Revelation Sequence and `prep.pacing_rules`.** List what must NOT be delivered, with
  the session it's due.
- Per scene: trigger, read-aloud, key lines in italics, one or two contingencies, where tokens stand.
- Quick NPC reference, assets list, Foundry readiness table, **the one thing that cannot go wrong**.

## 2. Build it (see references/build.md for the details)
1. **NPCs** — `foundry_list_actors` shows `shell: true` for empty sheets. Fill shells in place with
   `foundry_fill_actor_from_compendium`; create missing NPCs with `foundry_actor_from_compendium`
   (CR chosen for the NPC's *narrative* slot); retune bosses with `foundry_update_actor` /
   `foundry_update_actor_item`. **No bare shells, ever.**
2. **Art** per `campaign.yaml → art.provider` — see `references/art.md`. Portraits for every new or
   unportraited NPC, handouts with exact quoted text. **Look at every image before using it.**
   Upload with `foundry_upload_file`, attach with `foundry_update_actor {img, prototypeToken.texture.src}`,
   then `foundry_tokenize_actor` (one at a time).
3. **Maps** for every location the party fights or explores in that has no suitable scene (check
   `foundry_list_scenes`; a scene is unsuitable if it lacks the set-piece the encounter needs).
   Generate or take the map image, then `map_grid_crops` (and, for maps with many rooms,
   `map_detect_walls` for a numbered first draft to prune) → spec → `map_preview` (look, fix, repeat)
   → `map_import`. Never import a detected draft unreviewed. Place the session's tokens hidden. Method: the plugin's `docs/MAPS.md`.
4. **Handouts** — `foundry_create_journal` with an image page and a transcript + GM-note page.
5. **Sync and verify** — `foundry_sync_scene_tokens` on every scene whose actors got new tokens; then
   re-list actors and scenes and confirm counts, portraits and `shell: false`.
6. **Keep the art** — save sources to `<paths.assets>/` (Portraits, Handouts, Maps) and update the prep
   doc's scene names and readiness table to BUILT.

## 3. Report
The prep (running order, the change that makes it work, the one thing that cannot go wrong), what was
built with counts, anything skipped and why, and drift flags.

## Args
- `doc-only` — step 1 only. · `build-only` — step 2 from the latest prep doc.
- `map <location>` — one map end to end from the location note (Layout + Named Features); if the note
  is thin, ask for the two or three details that decide the layout instead of inventing them.
- `npc <name>` — one NPC end to end: stat block, portrait, token.

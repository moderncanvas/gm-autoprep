# Building into Foundry — details and gotchas

Everything here was learned building real sessions on Foundry v14 / dnd5e 5.3.

## NPCs
- **Clone, don't hand-author.** `foundry_actor_from_compendium` copies a complete stat block (items,
  attacks, spells, effects). Find chassis with `foundry_search_compendium`. Override identity, CR,
  HP, AC, size, speeds, senses, languages and biography through `overrides` (merged into `system`).
- **Fill empty shells in place** with `foundry_fill_actor_from_compendium` — it keeps the actor's id,
  portrait, folder and biography, so tokens already on scenes stay linked.
- **Bios:** a flavour paragraph, a rule, then a **GM note** in italics carrying the scene's lines,
  tactics and mechanics. Append ("RETUNED FOR SESSION NN …") rather than replacing.
- **Formulas live on item activities** (dnd5e 4+): regeneration, healing and damage are changed with
  `foundry_update_actor_item` on `system.activities.<id>.…`. Get activity ids from `foundry_get_actor`.
- Children and small creatures: `prototypeToken: {width: 0.8, height: 0.8}` and size `sm`.
- New NPCs go in the folder of the NPCs they belong with (`folder`).

## Tokens
- `foundry_tokenize_actor` takes ~60 s each — call them one at a time.
- Placed tokens keep their old art: run `foundry_sync_scene_tokens` on each affected scene afterwards.

## Handouts
- Image page + text page: `{name:"The Letter", type:"image", src, image:{caption}}` and
  `{name:"Transcript & GM note", type:"text", text:{format:1, content:"<blockquote>…</blockquote><hr><p><strong>GM note.</strong> …</p>"}}`.
- Hidden from players by default; the GM shares it at the table.

## Scenes
- Scenes are created **inactive** — never activate one; that moves the players.
- Tokens are placed **hidden**; the GM reveals them.
- Foundry v14 keeps the map on the scene's embedded level, not `scene.background` — the tools handle it.

## Safety
- Never build while players are logged in (`foundry_list_users`).
- Take a world backup before large builds if the GM's setup supports it (Foundry's own backups,
  or the host's snapshots).

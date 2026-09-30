# Art — portraits, handouts and maps

`campaign.yaml → art.provider`:
- **codex** — the plugin's `scripts/codex-image.sh <dir> <name> "<prompt>" [1536x1024]` uses ChatGPT's
  image model through the Codex CLI with the GM's own login. ~1 min each; run up to five in parallel
  and poll for the PNGs.
- **manual** — write the prompts into the prep doc under Assets, and the GM generates them. When the
  images come back, upload and attach them.
- **none** — skip art; build everything else.

**Always look at every image before using it.** Make a contact sheet if there are several. Re-roll
anything off-model; one bad portrait costs more at the table than a minute of generation.

## Prompts
Plain prose, no negative prompts, no `(weight:1.4)` syntax. Carry `art.style` from `campaign.yaml`.
Never use a word in `art.never_say` — spell out the anatomy instead (e.g. not "tortle", but "a
humanoid with a turtle's hooked beaked face and a massive domed shell behind his shoulders").

**Portrait:**
> A square portrait framed close on the head and shoulders, face filling the frame. *[who: age, build,
> anatomy, clothing, one telling detail]*. *[Expression and emotion — the thing that makes the NPC
> theirs: "unsettlingly serene", "weeping, not attacking"]*. *[Palette and light]*. *[art.style]*.

**Handout** — quote the exact text line by line; ChatGPT-class models render it legibly:
> A portrait-orientation image of a single physical prop *[letter/page/poster]* lying on *[surface]*:
> *[paper, ink, damage]*. It reads exactly, in this line order: "…" Candlelight from one side.
> Photographic prop quality, legible handwriting.

**Battle map** — see the plugin's `docs/MAPS.md` for the full template. Top-down orthographic, no grid,
no text, roofless cutaways, every set-piece the encounter needs named by compass position.

## Sizes
Portraits: upload as 1024² WebP. Handouts: keep the aspect. Maps go through `map_import`, which scales
them to the grid.

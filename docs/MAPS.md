# Maps: any image → a Foundry scene with walls, doors, windows and lights

GM AutoPrep turns a battle-map image into a ready-to-run scene. The map can come from an AI image
model, from a map you bought, or from your own art. The agent does the tedious part: it traces
every wall, door and window, places the lights, and puts the session's tokens down, hidden until
you reveal them.

It works in three MCP tools:

| Step | Tool | What happens |
|---|---|---|
| 1. Look | `map_grid_crops` | The map comes back as zoomed tiles with a labelled pixel grid, so the agent can read exact coordinates off the image. |
| 2. Trace + check | `map_preview` | The agent writes a spec. The tool draws it over the map (red walls, cyan windows, yellow doors, magenta secret doors, white light rings, green token squares) so both of you can check it. |
| 3. Import | `map_import` | The tool upscales the map to your grid, uploads it, and creates the scene with its walls, lights and hidden tokens. It does not activate the scene. |

Nothing touches your world until step 3.

## Getting a good map from an image model

Top-down maps with clearly drawn walls trace far better than pretty perspective art. A prompt that
works well with ChatGPT-class image models (1536×1024, landscape):

> A top-down orthographic tabletop RPG battle map (VTT map, straight down 90-degree view, no
> perspective, no grid lines, no text, no labels), painted in a detailed hand-painted style.
> *[Time of day, setting.]* Layout: *[describe it by compass position — "on the LEFT third",
> "in the CENTRE", "along the NORTH side" — and name every feature your scene needs: the doors
> that matter, the pool, the collapsed stair, where the lanterns hang]*. Buildings shown as
> ROOFLESS CUTAWAYS so interiors are visible, wooden doors, small glass windows set into thick
> dark walls. *[Lighting and palette.]* Clean readable layout suitable for tokens, walls clearly
> drawn as thick dark lines.

Tips that make a real difference:

- **Name the set pieces your encounter needs.** If the fight is about a sleepwalker reaching a
  pool, ask for the pool. If the scene is a trail of wet footprints, ask for it.
- **Say "roofless cutaway".** Otherwise you get rooftops and nowhere to put tokens.
- **Leave the grid out.** Foundry draws its own, and a baked-in grid rarely lines up.
- **Look at the image before tracing it.** Re-roll anything unreadable. It's cheaper than
  fixing walls.

## The spec

All coordinates are **original image pixels**, exactly what the crop labels show.

```json
{
  "name": "Coldwater Lane",
  "image": "/home/me/maps/coldwater-lane.png",
  "cols": 30, "grid": 96,
  "darkness": 0.35, "globalLight": true,
  "walls": [
    { "from": [28, 42], "to": [1338, 42],
      "openings": [ { "at": [135, 190], "type": "window" }, { "at": [660, 715], "type": "window" } ] },
    { "from": [28, 245], "to": [1338, 245],
      "openings": [ { "at": [150, 200], "type": "door" }, { "at": [580, 635], "type": "window" } ] },
    { "from": [1362, 505], "to": [1395, 880], "type": "window" }
  ],
  "lights": [
    { "at": [232, 282], "dim": 22, "bright": 8, "color": "#ff9b40", "alpha": 0.35, "animation": "torch" },
    { "at": [1385, 410], "dim": 30, "bright": 10, "color": "#2fe0c0", "alpha": 0.6, "animation": "pulse" }
  ],
  "tokens": [ { "actor": "Brenna", "at": [700, 280] } ]
}
```

- **`cols` × `grid`** sets the scene size. `cols` is how many squares wide the map should play,
  and `grid` is the pixels per square in Foundry. 30 × 96 turns a 1536 px-wide image into
  2880 px, which is comfortable for tokens.
- **Walls** are either a straight horizontal/vertical run with `openings` along it (spans on
  the run's axis), or a single segment at any angle with its own `type`.
- **Wall types:**
  - `wall`: blocks everything.
  - `window`: blocks movement; you can see and light passes through.
  - `door`: can be opened.
  - `secret`: a hidden door.
  - `invisible`: blocks movement only (railings, cliff edges).
  - `terrain`: limited sight (hedges, curtains).
- **Water, pits and pools get no walls.** They're terrain, and often the point of the fight.
- **Lights:** `dim`/`bright` are in grid units (feet on a 5 ft grid). Animations include
  `torch`, `pulse`, `fog`, `flame`, `wave` and `ghost`.
- **Tokens:** `at` is the token's *centre*, and the actor is matched by name or id. Tokens are
  hidden unless you say `"hidden": false`. A missing actor is reported, not fatal.

## Tracing well (for the agent, and for you checking its work)

- Trace the **centre-line** of each drawn wall, not its edge. Walls a few pixels off still work;
  doors a few pixels off look wrong, so line them up with the drawn door leaf.
- Use one long `from`/`to` run per wall line with `openings` for its doors and windows. It's
  faster to write and easier to fix than dozens of little segments.
- On the first preview, expect two or three doors or one wall line to be 10–15 px out. Fix
  them and preview again; that's normal.
- Lamps, braziers, hearths and glowing things painted on the map should each get a light.
  Candles get small lights (dim 10–12). A room-filling hearth gets a big one.
- Put tokens where the story needs them: the family in the doorway, the cultist in the drain.

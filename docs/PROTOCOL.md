# gm-autoprep protocol (v0)

Two hops:

```
 AI agent / MCP adapter / CLI                     Foundry GM client (the module)
        │  HTTP  POST /rpc                               ▲  WebSocket (outbound from Foundry)
        ▼  Authorization: Bearer <token>                 │  ws://<hub>/foundry
 ┌─────────────────────────── hub ───────────────────────┴──┐
 │ forwards each JSON-RPC request to the ONE active client   │
 └───────────────────────────────────────────────────────────┘
```

Only a Foundry *client* can write world documents, so the module runs in a GM client and
dials **out** to the hub — Foundry needs no extra inbound port. The client is normally a
headless "automation" GM, but can be the DM's own browser.

## Auth

One shared secret, the **hub token** (32 random bytes, hex). The hub reads it from
`AUTOPREP_TOKEN` or `<data dir>/token` (created on first start).

- API callers send `Authorization: Bearer <token>`.
- The module sends it in its `hello` frame. The module stores it in a **user-scoped**
  setting on the automation user, so player clients never receive it.

## Exactly one serving client

A world can have several GM clients open. If each connected, they would evict one another
forever (the failure mode of foundry-api-bridge). So:

1. The module only dials if `game.user` is the configured **automation user** — or, when
   none is configured, any GM.
2. The hub accepts the first valid `hello` as **active**. A second connection gets
   `{type:"busy"}` and close code **4009**. On 4009 the module retries silently every 60 s,
   so it takes over only when the active client goes away.
3. The module never shows connect/disconnect notifications. Status lives in the module
   settings panel and the console.

## Frames (WebSocket, JSON)

Module → hub, first frame:

```json
{ "type": "hello", "token": "…", "protocol": 0, "module": "0.1.0",
  "world": "my-campaign", "user": "Automation GM",
  "foundry": "14.365", "system": "dnd5e", "systemVersion": "5.3.3" }
```

Hub → module: `{ "type": "welcome" }` or `{ "type": "busy" }` / `{ "type": "denied" }` then close.

Requests and replies are JSON-RPC 2.0:

```json
{ "jsonrpc": "2.0", "id": 7, "method": "actors.list", "params": { "type": "npc" } }
{ "jsonrpc": "2.0", "id": 7, "result": [ … ] }
{ "jsonrpc": "2.0", "id": 7, "error": { "code": -32000, "message": "No actor named \"Bob\"" } }
```

Error codes: `-32601` unknown method, `-32602` bad params, `-32000` handler error,
`-32001` writes disabled in module settings, `-32010` (hub) no Foundry client connected,
`-32011` (hub) request timed out.

## HTTP API (hub)

| Route | Auth | Purpose |
|---|---|---|
| `GET /status` | none | `{ok, client: {world, user, foundry, system, since} \| null}` |
| `POST /rpc` | Bearer | body = `{method, params}` (a JSON-RPC envelope is also accepted) → the client's result, or HTTP 502/504 with the error |

## Methods (v0)

Actor references (`actor`) accept an id or an exact name. Everything returns plain JSON.

### system / world
| Method | Params | Result |
|---|---|---|
| `system.ping` | — | `{pong: true, time}` |
| `world.info` | — | world, versions, active modules, users (name, role, active) |
| `users.list` | — | `[{id, name, role, isGM, active}]` |

### actors
| Method | Params | Result |
|---|---|---|
| `actors.list` | `{type?, folder?, query?}` | `[{id, name, type, folder, cr, hp, ac, items, img, shell}]` — `shell: true` when an NPC has no items and no max HP |
| `actors.get` | `{actor}` | full `toObject()` |
| `actors.create` | `{data}` | `{id, name}` |
| `actors.update` | `{actor, data, options?}` | `{id}` |
| `actors.delete` | `{actor}` | `{deleted}` |
| `actors.fromCompendium` | `{pack?, source, overrides?, folder?, name}` | new actor built from a compendium stat block, with its items and effects |
| `actors.fillFromCompendium` | `{actor, pack?, source, overrides?, keepBio?}` | fills an existing actor **in place** (keeps id, image, folder, placed tokens) |
| `actors.updateItem` | `{actor, item, data}` | update one embedded item (e.g. an activity's healing formula) |

`pack` defaults to `dnd5e.actors24`. `source` is a compendium id or exact name.
`overrides` is merged into `system`.

### compendium
| `compendium.search` | `{pack?, query, limit?}` | `[{pack, id, name, cr}]` across Actor packs |

### scenes
| Method | Params | Result |
|---|---|---|
| `scenes.list` | — | `[{id, name, active, walls, lights, tokens, background}]` |
| `scenes.create` | `{data, background, tokens?: [{actor, x, y, hidden?}], replace?}` | creates the scene, puts the map on its SceneLevel (Foundry v14) or `background.src` (v11–13), places tokens, thumbnails |
| `scenes.delete` | `{scene}` | |
| `scenes.syncTokens` | `{scene}` | resets placed tokens' art/name to their actors' prototype tokens |

### journal
| `journal.list` | `{folder?}` | `[{id, name, folder, pages}]` |
| `journal.create` | `{name, folder?, pages, replace?}` | pages are Foundry page data (`image` / `text`) |
| `journal.delete` | `{journal}` | |

### files
| `files.upload` | `{path, name, base64, contentType?}` | uploads into `Data/<path>/<name>` through Foundry's FilePicker; returns the served path. Removes any need for shell access to the server |

### tokens
| `tokens.tokenize` | `{actor, size?}` | framed token via Tokenizer 2 if installed; returns the texture path |

### chat
| `chat.query` | `{since?, until?, limit?}` | messages in range: `{time, speaker, flavor, text, rolls:[total]}` — the table's mechanical record |

## Versioning

`protocol` in `hello` is an integer. The hub rejects clients with a different major.
Methods are additive; a method's result shape only ever gains fields.

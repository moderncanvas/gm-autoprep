# Pathfinder Second Edition (Foundry system `pf2e`)

Rules facts below are from the Pathfinder 2e core rules (available under the ORC license and on
Archives of Nethys). A campaign's own `system.reference` notes win over this file.

## Encounter budgets

Budgets assume **four PCs**. Adjust by the per-character amount (a quarter of the budget) for each PC above or below four.

| Threat | XP budget (4 PCs) | Per PC more / fewer |
|---|---|---|
| Trivial | 40 | 10 |
| Low | 60 | 15 |
| Moderate | 80 | 20 |
| Severe | 120 | 30 |
| Extreme | 160 | 40 |

A creature's XP depends on its level **relative to the party's level**:

| Creature level | Party −4 | −3 | −2 | −1 | = | +1 | +2 | +3 | +4 |
|---|---|---|---|---|---|---|---|---|---|
| XP | 10 | 15 | 20 | 30 | 40 | 60 | 80 | 120 | 160 |

- A single creature **at party level + 3 or + 4** is a boss fight (Severe / Extreme) — dangerous because its
  numbers outpace the party, not because of its HP. Solo boss + a couple of low-level minions is the classic
  shape.
- **Level beats headcount.** Six creatures at party −2 (120 XP) are Severe but rarely lethal; one at +4
  (160 XP) can kill a PC in a round. Prefer spreading a big budget across more, lower creatures unless the
  fight is meant to feel like a boss.
- Hazards use the same XP by level (simple hazards are worth a fifth of a creature of their level).
- Retune with the creature-level adjustments: **Elite** (+1 level: +2 AC, attacks, DCs, saves, damage,
  and more HP) and **Weak** (−1 level, the reverse). Prefer these over hand-editing numbers.

## Session pacing

PF2e parties level by XP — 1,000 XP per level; a Moderate encounter is worth 80 XP to each PC. Many
tables use milestone levelling instead; check `campaign.yaml → pacing_rules` or ask. The Foundry sheets
are the truth for current level.

## Stat block chassis in Foundry

Bestiaries ship as compendiums (e.g. `pf2e.pathfinder-monster-core`, `pf2e.pathfinder-bestiary`,
`pf2e.pathfinder-bestiary-2`, `…-3`). Find a chassis with `foundry_search_compendium {pack, query}`,
then `foundry_actor_from_compendium {pack, source, name, overrides}` — **always pass `pack`**; the tool's
default is the D&D pack.

**Before overriding anything, read one creature with `foundry_get_actor`** to confirm the system's data
paths on the GM's version. On recent versions they're typically:

- level `system.details.level.value` · HP `system.attributes.hp.{value,max}` · AC
  `system.attributes.ac.value` · size `system.traits.size.value` (`tiny sm med lg huge grg`) ·
  traits `system.traits.value` · rarity `system.traits.rarity`.

Prefer applying the Elite/Weak adjustments or picking a different-level chassis over editing individual
statistics — PF2e's maths is tightly tuned, and hand-edited creatures drift off it quickly.

## Content

Use rules and creatures the GM owns or that are published under the ORC license. Don't paste text from
paid adventures into shared material.

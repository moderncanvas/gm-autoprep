# D&D 5e (Foundry system `dnd5e`)

## Encounter budgets — 2024 DMG, XP per character
| Level | Low | Moderate | High |
|---|---|---|---|
| 1 | 50 | 75 | 100 |
| 2 | 100 | 150 | 200 |
| 3 | 150 | 225 | 400 |
| 4 | 250 | 375 | 500 |
| 5 | 500 | 750 | 1,100 |
| 6 | 600 | 1,000 | 1,400 |
| 7 | 750 | 1,300 | 1,700 |
| 8 | 1,000 | 1,700 | 2,100 |
| 9 | 1,300 | 2,000 | 2,600 |
| 10 | 1,600 | 2,300 | 3,100 |

Multiply by the number of PCs. XP by CR: 0 = 10, 1/8 = 25, 1/4 = 50, 1/2 = 100, 1 = 200, 2 = 450,
3 = 700, 4 = 1,100, 5 = 1,800, 6 = 2,300, 7 = 2,900, 8 = 3,900, 9 = 5,000, 10 = 5,900.

A single boss under the party's Low budget is a speed bump. Fix it with HP/AC/attacks, support
creatures, regeneration with a counter the party can find, and an objective that splits their actions.

## Stat block chassis
2024 stat blocks live in `dnd5e.actors24` with readable ids, e.g. `mmCommoner000000`,
`mmNoble000000000`, `mmPriest00000000`, `mmPriestAcolyte0`, `mmCultist0000000`, `mmCultistFanatic`,
`mmMage0000000000`, `mmArchmage000000`, `mmSpy00000000000`, `mmTough000000000`, `mmToughBoss00000`,
`mmGuard000000000`, `mmScout000000000`, `mmWarriorVeteran`, `mmTroll000000000`, `mmAboleth0000000`.
Older 2014 blocks are in `dnd5e.monsters`. Pick the chassis whose *mechanics* fit the role, then
reskin: a Troll is a fine regenerating sea-horror; a Mage is a fine aboleth-touched patriarch.

## Useful system paths
- CR `system.details.cr` · HP `system.attributes.hp.{value,max,formula}` · AC `system.attributes.ac.flat`
  with `calc: "flat"` · speeds `system.attributes.movement.{walk,swim,fly}` · size `system.traits.size`
  (`tiny sm med lg huge grg`) · languages `system.traits.languages.value` · creature type
  `system.details.type.{value,subtype}`.
- **Senses are `system.attributes.senses.ranges.darkvision`** on dnd5e 5.x (not `.darkvision`).

## Content
Ship and generate from SRD 5.2 content only. Never copy text from books the GM hasn't licensed into
shared material.

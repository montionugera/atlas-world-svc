# I-028 — research notes

Code-verified against `release/1.5` @ `2251aa3`. Every claim below cites a file:line
that was read, not inferred. **Three of the spec's claims are overstated and are
corrected here**; two live bugs were found that the spec does not mention.

---

## 1. Corrections to the spec

### 1.1 Per-entity element ALREADY exists and is already synced

The spec says Demon (Void affinity) and Immortal (Holy affinity) are `❌ no per-entity
element affinity` and calls per-element affinity "a new combat mechanic".

**Not true for the defensive half.** `colyseus-server/src/schemas/WorldLife.ts:41`:

```ts
@type('string') element: Element = DEFAULT_ELEMENT
```

It is a **synced** field on `WorldLife`, which `Player` inherits. `DamageCalculator`
already reads it (`modules/combat/DamageCalculator.ts` — `isElement(target.element)`)
and applies the 7×7 multiplier. `Mob` already sets it from config
(`schemas/Mob.ts:148`). **Player never sets it**, so every player is `neutral` today.

Consequence: "Demon leans Void" and "Immortal leans Holy" are a **one-line data
binding** on an existing, tested, synced mechanic — not new combat design. In RO terms
that gives Demon 2.0× incoming from Holy and 0.5× from Void, which is exactly the
canon shape.

What genuinely does *not* exist is the **offensive** half — nothing scales a player's
outgoing damage by their own element, so Dragon's "elemental magic power" still has no
mechanism. Revised lean audit:

| Race | Canon lean | Real status |
|---|---|---|
| Human | balanced | ✅ no-op |
| Ogre | physical + health | ✅ `str`/`vit` (but see §2.2) |
| Beastkin | agility | ✅ `agi` — the only stat the sim reads |
| Demon | Void affinity | ✅ **set `player.element = 'void'`** — mechanism exists |
| Immortal | Holy affinity | ✅ **set `player.element = 'holy'`** — mechanism exists |
| Dwarf | defense + craft | ⚠️ defence yes; no craft stat |
| Elf | mana + cast speed | ❌ no MP resource, no cast-speed stat |
| Dragon | elemental magic power | ❌ no per-element offensive scaling |

So it is **2 blocked, not 4**. That materially shrinks Phase C.

### 1.2 The migration scaffold exists — but it is a reset, not a migration

The spec says *"The migration story — currently missing entirely."* The hook is in fact
already built: `nakama/src/storage.ts` has `CURRENT_SCHEMA_VERSION`, a `migrateDoc()`
called on every `readDoc`, and a comment *"Extend this switch when schema v2 ships."*

**But the stub is a data-loss landmine.** `migrateDoc` is:

```ts
const version = typeof raw.schemaVersion === 'number' ? raw.schemaVersion : 0;
if (version >= CURRENT_SCHEMA_VERSION) return raw as CollectionDocs[K];
return defaultDoc(collection);          // <-- everything older is DISCARDED
```

Bumping `CURRENT_SCHEMA_VERSION` to `2` makes every existing v1 profile fail
`1 >= 2` and fall through to `defaultDoc(profile)` — **silently resetting every
player to level 1, 0 xp, 0 statPoints, all stats 1.** No error, no log, no CAS
conflict (the write path then persists the reset).

This is the single highest-risk line in Phase C and it is one `if` away from
firing. Any plan must replace the fall-through with a real v1→v2 upcast before
touching the version literal.

### 1.3 The zod schemas do not guard stored docs — they guard the wire

The spec lists `schemaVersion: z.literal(1)` + `.strict()` as blast-radius site #2 on
the assumption it validates stored profiles. It does not: **`profileDocSchema` is
referenced only from `contracts/src/meta/schemas.test.ts`.** The storage read path
(§1.2) uses an unchecked `as` cast and never calls zod.

The one production enforcement is `colyseus-server/src/meta/NakamaMetaBackend.ts:56`:

```ts
const parsed = loadoutSnapshotSchema.safeParse(body)
return parsed.success ? parsed.data : null
```

`loadoutSnapshotSchema` embeds `profileDocSchema`, so **changing the `PrimaryStats`
shape on one side of the wire makes `getLoadout` return `null`** → `loadPlayerLoadout`
sets `player.isEphemeral = true` and every player joins on default stats. The only
symptom is a `console.error('[meta] ephemeral join')` line.

So the risk is real but the failure mode is different from what the spec assumes: not a
crash or a rejected stored doc, but a **silent global stat-application outage** during
any window where contracts and the deployed Nakama build disagree. That makes
deploy *ordering* (contracts → Nakama → colyseus) a hard requirement, not a nicety.

---

## 2. New findings the spec does not have

### 2.1 LIVE BUG: `recalculateStats()` clobbers the applied loadout

Two stat pipelines write the same fields and the second one wins.

- `meta/applyLoadout.ts:19-30` sets `pAtk/mAtk/pDef/mDef/maxHealth/maxMoveSpeed` from
  `derivedStats(allocated)` and `player.stat.agi/str/vit` from `allocated`.
- `schemas/Player.ts:87-99` `recalculateStats()` then overwrites:
  ```ts
  this.pAtk = PLAYER_STATS.pAtk + wPAtk          // discards 10 + 2*str
  this.mAtk = PLAYER_STATS.mAtk + wMAtk          // discards 10 + 2*int
  this.stat.agi = clampPrimaryStat(PLAYER_STATS.baseStat.agi + this.agiFromEquipment)
  ```
  i.e. back to the flat config baseline (`agi = 10 + gear`), allocation erased.

**Reachable by the client.** `rooms/handlers/PlayerInputHandler.ts:147-157` handles a
`SWITCH_WEAPON` message → `player.equipWeapon(weaponId)` → `recalculateStats()`.
So any player who swaps weapons mid-match **loses every allocated stat point** until
rejoin. Attack timing (`meleeAttackSpeed.ts:105` reads `stat.agi`) changes with it.

This is independent of race/class, is arguably an I-027-class bug in its own right, and
Phase C cannot layer per-race leans on top of a pipeline that resets itself. Whoever
picks this up should decide early whether to fix it standalone first.

### 2.2 `dex` is not the only phantom — `str` and `vit` on `player.stat` are too

Grep over `colyseus-server/src` (tests excluded) for `stat.(agi|str|vit|dex|int)`:

| Field | Non-test consumers |
|---|---|
| `agi` | `meleeAttackSpeed.ts:105`, `MeleeAttackStrategy.ts:43`, `SpearThrowAttackStrategy.ts:58`, `MobCombatSystem.ts:43,52`, `Player.ts:99` |
| `str` | **only** the write in `applyLoadout.ts:29` |
| `vit` | **only** the write in `applyLoadout.ts:30` |
| `dex` | **only** its own declaration + clamp + defaults |
| `int` | absent from `BaseStat` entirely |

`str`/`vit` do reach combat, but via `derivedStats` → `pAtk`/`pDef`, **not** via
`player.stat`. So `BaseStat` is effectively a one-field struct (`agi`) with three
write-only companions. Deleting `dex` is therefore the small half of the cleanup; the
real question is whether `BaseStat` should exist at all rather than being derived from
`PrimaryStats` at the seam.

### 2.3 The two clamps disagree, and the unclamped value still reaches combat

- `nakama/src/rpc/allocateStats.ts` validates only *non-negative integer* and
  *≤ statPoints on hand*. **No upper bound.**
- `colyseus-server/src/config/combat/combatStats.ts:14-17` clamps 1–99.
- `contracts/src/meta/derivedStats.ts` consumes `allocated` **raw**.

So a player at `agi = 150` gets `maxMoveSpeed = 20 + 0.2*150 = 50` (uncapped, applied by
`applyLoadout`) while `player.stat.agi` is clamped to `99` for attack timing. The two
numbers describe the same stat and disagree. Any lean that adds to `agi` inherits this
split-brain.

### 2.4 The race/class vocabulary already exists — as art keys

`game-client/assets/art/art-manifest.json` holds exactly **64** `art:class-<race>-<class>`
entries (8×8, all pairings present) plus **7** `art:race-*` entries.

`art:race-human` is **missing** — the other seven races each have one. Likely deliberate
(Human = baseline) but it is an asymmetry any enum derived from this manifest will trip
over, and `scripts/check_asset_manifest.mjs` runs in CI (`.github/workflows/ci.yml:69`).

The kebab tokens (`human|demon|dwarf|immortal|elf|dragon|beastkin|ogre` ×
`swordsman|archer|assassin|spearman|mage|summoner|engineer|healer`) are the natural
canonical id set — they are already committed, already gated, and already match
`content/story/canon.md:341-345`.

### 2.5 No gate binds canon prose to runtime data today

`scripts/check_content.mjs` (wired into CI and into `scripts/integration.sh:81` as
`content_gate --require-complete`) contains **no reference to `content/story/canon.md`
or `style.md`**. The spec's "derive leans from canon with a gate so lore and runtime
cannot drift" is genuinely new work — but the harness to extend is there, and the
mob-types gate (F-013) is the precedent for the shape.

### 2.6 Blast-radius addendum

Beyond the spec's 10 sites, the C# client hardcodes the 4-stat set in **string
literals**, which no codegen or drift gate can catch:

```csharp
// game-client/src/UI/Panels/CharacterPanel.cs:133-136
"str" => "{\"str\":1,\"agi\":0,\"int\":0,\"vit\":0}",
```

plus the row table at `:20` and four `UpdateValue` calls at `:124-127`. `MetaTypes.cs`
regenerates from `contracts/src/meta/types.ts`; `CharacterPanel.cs` does not.

---

## 3. What this implies for scoping

1. **Two pre-existing bugs sit under Phase C** (§2.1 clobbering, §2.3 clamp split).
   Both are cheap standalone fixes and both make the lean work meaningless if left.
   Recommend hoisting them out as their own ideas rather than absorbing them.
2. **The stat decision is smaller than it looks.** `dex` has no consumers, `int` already
   flows to `mAtk`/`mDef` through `derivedStats`. Deleting `dex` from `BaseStat` touches
   no behaviour. The genuinely hard part is the **stored-doc migration** (§1.2), and that
   only bites if `PrimaryStats` itself changes — which deleting `dex` does not require.
   A Phase C that adds `race`/`class` **without** touching `PrimaryStats` avoids the
   `z.literal(1)` bump, the respec question, and the ephemeral-join hazard entirely.
3. **6 of 8 leans are expressible now** (§1.1). Elf and Dragon are the only ones needing
   new mechanics, and both are magic-system work that belongs with [[I-029]], not here.
4. **Class remains cosmetic** unless skills gain a gate — `contracts/content/skills.json`
   is 4 entries with `{id, name, maxLevel, requires}`, no class/element/damageType. This
   is still the scoping decision the spec correctly flags.

### Suggested split (owner call)

| Slice | Content | Risk |
|---|---|---|
| A | Fix §2.1 clobbering + §2.3 clamp split | low, standalone, no schema change |
| B | `race`/`class` on the profile + the 6 expressible leans (incl. `player.element`) | medium — no `PrimaryStats` change ⇒ no migration |
| C | Delete `dex` from `BaseStat` | low — zero consumers |
| D | MP/cast-speed/offensive-element (Elf, Dragon) | high — new mechanics, pairs with [[I-029]] |
| E | Skill `class` gate + `element` field | medium — makes class non-cosmetic |

Slice B is the actual "Phase C runtime spine" and is far cheaper than the spec's framing
implies, *provided* it does not touch `PrimaryStats`.

---

## 4. Open questions for the owner

1. **Does `race`/`class` need to be Colyseus-synced?** `player.element` already is
   (`WorldLife.ts:41`), so the Demon/Immortal lean replicates for free. Race/class
   themselves are only needed client-side to pick the `art:class-<race>-<class>` sprite —
   that could ride the existing welcome/equipment WS snapshot instead of state.
2. **Is `player.element` the right home for a race lean at all?** It is currently a
   *defensive* element. Binding race to it means race also determines what you resist —
   a real balance decision, not just flavour.
3. **§2.1 first or together?** Fixing the clobbering changes observable stat behaviour
   for existing players; doing it inside a race/class release makes attribution harder.
4. **`art:race-human` missing** — add it for symmetry, or treat Human as the
   no-art-needed baseline and make the gate tolerate the hole?
5. Still open from the spec, unchanged: the **two race rosters** (`style.md:151-152`
   deliberately does not say whether story-side `beast-blooded` == gameplay `Beastkin`).
   A playable-race feature must state which list it binds to; this is a canon question,
   not drift.

---

## Related

- [[I-027]] — `damageType` dropped on the queue path; same `DamageCalculator` seam
- [[I-029]] — element activation; owns the offensive-element half needed by Elf/Dragon
- Handoff `docs/superpowers/decisions/2026-07-27-world-wisdom-handoff.md` §5, §10
- Canon roster + leans `content/story/canon.md:341-359`

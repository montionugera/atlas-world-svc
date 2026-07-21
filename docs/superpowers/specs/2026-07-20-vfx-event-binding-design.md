---
title: "Transient VFX — event binding + sourcing policy"
feature: F-009
date: 2026-07-20
status: authoritative (policy + gate); runtime DEFERRED
---

# Transient VFX event binding + sourcing policy

> Transient VFX are one-shot, auto-freeing billboarded effects fired as a **pure
> client render reaction** to combat edges the client already derives from
> **synced** server state. **Server stays fully authoritative — VFX never drives
> gameplay, adds no synced field, and adds no network traffic.** This doc records
> the locked decisions + the CI gate that shipped now; the Godot runtime is
> explicitly deferred (see §6).

## 1. Keyspace decision (locked)

Transient VFX use the existing **`fx:*`** namespace as **client render
vocabulary, parallel to `sfx:*`** — it stays **OUT** of `render-spec.json`
`codegenReservedNamespaces` (unlike `projectile:`/`zone:`, which are
schema-derived). **No server schema or asset-keys codegen change.** The four
`fx:*` sheets already live in `catalog-manifest.json` (`render:spritesheet`,
CC0) with PNGs under `game-client/assets/vfx/`.

## 2. Single source of truth (no generated manifest)

**Decision (corrects the original plan):** do **NOT** generate a
`vfx-manifest.json` from the catalog and equality-gate it — that manufactures the
drift it then guards. The catalog IS the source. The (deferred) `VfxManifest.cs`
reads `catalog-manifest.json` directly, filtering `kind == "vfx"`. One file, no
generator, no third manifest.

Likewise, VFX asset validation is **not** duplicated into `check_content.mjs`
(the character/story/map content gate). `check_asset_manifest.mjs` already
validates catalog spritesheet `require` (license+source) and `oneOf` field-groups
for `fx:*`. The only genuinely new validation — pixel-grid divisibility — was
added there as **guard K** (§3), not re-implemented elsewhere.

## 3. Grid-divisibility gate (SHIPPED — guard K)

`check_asset_manifest.mjs` guard **(K)**: a `frame`+`animations` spritesheet must
tile its PNG on a uniform grid — `sheetW % frameW == 0`, `sheetH % frameH == 0`,
and every animation `count <= cols*rows` (a **partial final row is allowed**).

This is the correct formula. The original plan's "frame area × count == sheet
area" check would **wrongly reject** the valid `fx:fireball` sheet:

| fx key | PNG | frame | grid | frames | guard K |
|--------|-----|-------|------|--------|---------|
| explosion | 1024×1024 | 128 | 8×8=64 | 64 | ✅ exact |
| fireball | 2048×1792 | 256 | 8×7=**56** | **50** | ✅ partial last row |
| magic_rune | 512×512 | 128 | 4×4=16 | 16 | ✅ exact |
| barrier | 1280×1280 | 256 | 5×5=25 | 25 | ✅ exact |

PNG dims are read from the IHDR chunk (no image library). Verified: green on all
four; fails on a non-divisible frame size and on `count > cols*rows`.

## 4. Event → VFX binding contract (for the deferred runtime)

All edges derive from **already-synced** `WorldLife` fields — no new traffic:

| Edge | Synced source | SFX today | VFX co-fire |
|------|---------------|-----------|-------------|
| hit | `currentHealth` decrease (alive) | `sfx:hit` (`EntityView.ApplyLife`) | `fx:explosion` |
| death | `isAlive`→false | `sfx:death` (`AnimationController`) | `fx:fireball` |
| heal | `currentHealth` increase (alive) | — | `fx:heal_sparkle` (Phase 4 asset) |
| attack | `isAttacking` | `sfx:attack` | **UNBOUND — see below** |

**Correction (review):** `attack → fx:magic_rune` is rejected. `isAttacking` is
the basic-melee flag; binding a spinning rune circle to every swing at 20 FPS is
visually wrong and unrelated to "cast". The **attack edge stays VFX-unbound**;
`fx:magic_rune`/`fx:barrier` (cast-glow) are reserved for a **real skill/cast
event** — which needs a new server `RoomEventType` + client broadcast (today
`BATTLE_DAMAGE_PRODUCED` is room-internal, never broadcast). That is cross-domain
(server + registry-binding) and **deferred**, not invented on the attack edge.

## 5. Sourcing / expansion policy

CC0-preferred (CC-BY-4.0 tagged fallback via `scripts/lib/license-policy.mjs`);
**uniform-grid required** (guard K); every sheet ledgered in
`art-source/LICENSES.md`. Expansion is driven **only by events that exist** —
grow the 4-effect library toward hit-flash / blood-spurt / death-burst /
heal-sparkle as the real edges above are bound. `fx:fireball.png` (~3.0 MB, 2048²
class) should be downscaled/re-atlased for the 20 FPS budget before heavy reuse.

## 6. DEFERRED — the Godot runtime (needs Godot to verify)

The client runtime is **not built here** — it requires a Godot .NET binary to
verify (`ATLAS_VERIFY_VFX`), which is unavailable in this environment (same
constraint as F-006's `RegistryVerify`). Deferring it, stated honestly rather
than shipping unrun C#. Tracked as a follow-up. When built:

- `VfxRegistry.cs` autoload mirroring `AudioRegistry`, with a **single-path**
  `Spawn(VfxSpawnOptions {Key, WorldPos, Scale})` — an options object (this is
  *more* single-path-compliant than `AudioRegistry.Play(key, pos)`, not "exactly
  mirrored"). One-shot `AnimatedSprite3D`, **loop FORCED OFF** (catalog marks the
  sheets `loop:true`), `QueueFree()` on `AnimationFinished`; unknown key = warn +
  null no-op.
- **Slicing rule (must match guard K):** `cols = sheetW / frameW`; frame `i` at
  `(col = i % cols, row = startRow + Math.floor(i / cols))`, row-major, stop at
  `count`. Treat catalog `row` as a start offset. A runtime probe must assert
  derived `cols` and the first/last frame source-rect — frame *count* alone does
  not prove correct column slicing (the JS storybook slicer and the C# runtime
  slicer can otherwise silently diverge).
- Bind hit/death (and heal) per §4 at the existing SFX edge sites
  (`AnimationController.FireAudioForState`, `EntityView.ApplyLife`), additive and
  null-safe, with **zero** SFX regression (`AudioVerify` must stay green).

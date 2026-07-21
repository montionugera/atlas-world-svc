---
title: "Asset Registry Contract — the content→runtime binding spine"
feature: F-006
date: 2026-07-20
status: authoritative
supersedes_notes: "Single index for the pipeline first stood up under F-002."
---

# Asset Registry Contract

> **What this is.** The one authoritative description of how a **server type id**
> becomes a **rendered/audible asset on the client**, and the rules every content
> lane (maps, characters, sfx, vfx, ui, narrative) must bind against. It ties
> together five artifacts that already exist in the tree — the codegen key set,
> the render-spec renderer contract, the four manifests, the two gates, and the
> Godot `AssetRegistry` resolver — into **one contract with one set of guards**.
>
> If you are building a downstream content lane (F-007+), read this first: you
> bind to the contract here, you do not invent a parallel convention.

## 1. The spine at a glance

```
server config (mob/skill/projectile/zone types, synced schema)
      │  colyseus-server/scripts/codegen/gen-asset-keys.ts   (enumerate from REAL config, never hand-list)
      ▼
generated/asset-keys.json        { version, keys: [ { id, kind } ] }     ← single source of truth (SSOT)
      │
      ├──────────────► game-client/assets/render-spec.json   (declarative renderer contract)
      │                       renderers · kindDefaultRender · extRender · codegenReservedNamespaces
      │
      ▼
four manifests (game-client/assets/*.json)
   manifest.json          driftGated:true   ← codegen-keyed (guard: keys ↔ entries)
   audio-manifest.json    driftGated:false  ┐
   music-manifest.json    driftGated:false  ├ curated keyspaces (guard H: no reserved ns)
   catalog-manifest.json  driftGated:false  ┘
      │
      ├──────────────► scripts/check_asset_manifest.mjs   (CI drift-gate, guards A–J)
      ├──────────────► scripts/check_content.mjs          (content link-check)
      │
      ▼
game-client/src/Content/AssetRegistry.cs   Resolve(typeId) → PackedScene, three tiers:
      bespoke  →  CC0 seed  →  procedural capsule (never throws; missing = capsule + warn)
```

**One-file discipline.** `render-spec.json` is read by *three* consumers — the
`.mjs` gate, the C# `AssetRegistry.Resolve`, and the storybook JS
(`tools/asset-storybook/index.html`). They MUST agree byte-for-byte on render
resolution. **Any edit to `render-spec.json` is a change to all three** — verify
the gate **and** the Godot `RegistryVerify` probe after every such edit, never
just one.

## 2. Render-type resolution (the exact tiers)

`resolveRender(entry, spec)` — mirrored in `AssetRegistry.cs` and the storybook:

1. **`entry.render`** if present — explicit, authoritative.
2. **`spec.kindDefaultRender[entry.kind]`** — the kind's unambiguous default.
3. **`spec.extRender[ext]`** of the primary path (`scene ?? stream`) — extension sniff.
4. else `"unknown"` → guard failure.

Current `kindDefaultRender`: `character → model3d`, `audio → audio`. **These are
the only two kinds with a guaranteed default.** Everything else must resolve via
tier 1 (explicit) or tier 3 (ext), subject to the completeness rule in §3.

## 3. Taxonomy completeness (guard J — added by F-006)

**Invariant:** every `kind` the codegen can emit either has a
`kindDefaultRender`, **or** every mapped codegen key of that kind carries an
explicit `render`. A no-default kind may **not** lean on extension sniffing.

Why stricter than "does it resolve": it keeps a kind's keyspace open. Today the
codegen emits exactly two kinds:

| kind | keys | how it resolves | guard J status |
|------|------|-----------------|----------------|
| `character` | `mob:*`, `player`, `npc` (8) | `kindDefaultRender.character → model3d` (entries carry no `render`) | ✅ default |
| `vfx` | `projectile:*`, `zone:*` (11) | **explicit** `render: model3d` on every entry | ✅ explicit |

`vfx` intentionally has **no** `kindDefaultRender`. Adding `vfx → model3d` would
bake the current 3D-projectile assumption into the taxonomy and make a future
spritesheet/scene `vfx:` key silently mis-resolve to `model3d`. So the downstream
**vfx-events** lane adds `vfx:` keys by declaring explicit `render` per entry —
that is the sanctioned path, and guard J enforces it.

**Enforcement:** `scripts/check_asset_manifest.mjs` → `assertKindRenderable`.
Green today; a vfx key without explicit `render` fails with
`kind "vfx" has no render-spec kindDefaultRender, so the entry must declare an
explicit "render"`.

## 4. Audio taxonomy policy (decision)

`audio-manifest.json`'s 31 entries carry **no `kind` and no `render` field** —
and that is correct. They resolve via tier 3: `.ogg/.wav/.mp3 → audio` in
`extRender`, which is authoritative and working. There is **no "audio taxonomy
hole"**: the field is simply absent, ext-resolution handles it.

**Decision:** *document ext-based resolution as the sanctioned path for audio*;
do **not** add a soft guard that requires `kind: audio`. Such a guard would force
a 31-entry data migration for zero functional gain. If a future need makes an
explicit `kind: audio` worthwhile, it is a tracked backfill task, not an implicit
gate flip.

## 5. The guards (`check_asset_manifest.mjs`, lettering matches the code)

| Guard | Asserts |
|-------|---------|
| A | codegen-keyed (`driftGated:true`) entry resolves to a Godot-scene-loadable renderer |
| B | render's path field (`scene`/`stream`) is a `res://` path resolving to a real, non-zero file **and** its extension is in the renderer's `exts` allowlist |
| C | every field in the renderer's `require` list is non-empty |
| D | every `optionalPaths` field, if present, resolves |
| E | `oneOf` field-groups — exactly one group fully present (e.g. spritesheet `frame/frames` vs `atlas`) |
| F | `bakedPreview` staleness — baked types keep `preview` consistent with `previewHashOf` |
| G | keyspace disjointness across all manifest sources |
| H | curated (non-driftGated) entries may not use a reserved codegen namespace |
| I | tiered license/CC-BY policy — allowed set + attribution completeness |
| J | **AssetKind renderability completeness (§3)** — every codegen kind has a `kindDefaultRender` or every mapped key carries explicit `render` |

> The ext-allowlist check lives *inside* guard B in the code (not a separate
> letter); guard E is the `oneOf` group check. Guards A–F are per-entry
> (`validateEntry`); G/H/J are cross-file/whole-set; I is per-entry license.

`--require-complete` promotes UNMAPPED codegen keys from warning to failure
(Stage-0.5+). CLI flags are exempt from the options-object rule, but keep it a
single flag — if more modes are ever needed use `--mode <coverage|strict>`, not
stacked booleans.

## 6. Extension recipe (how to grow the pipeline safely)

- **New renderable/audible key type** → enumerate it from a **real config** in
  `gen-asset-keys.ts` (never hand-list). Regenerate `asset-keys.json`.
- **New renderer or kind default** → edit `render-spec.json` **only**, then
  re-run the gate **and** the Godot `RegistryVerify` probe (all three consumers).
  A no-default kind must give its keys explicit `render` (guard J).
- **New curated keyspace** (icons, audio, catalog) → must be **disjoint** (guard
  G) and **non-reserved** (guard H), license-clean.

## 7. Event → asset-key binding contract (F-006 Phase 3)

The forms `gen-asset-keys.ts` emits, and `AssetRegistry` consumes, from
**server-authoritative synced schema only** (never client input):

| Synced field | Key form | kind | `KindFromTypeId` → capsule kind |
|--------------|----------|------|--------------------------------|
| `Mob.mobTypeId` | `mob:<id>` | character | `Mob` |
| `Projectile.type` | `projectile:<Type>` | vfx | `Projectile` |
| `ZoneEffect.type` | `zone:<type>` | vfx | `ZoneEffect` |
| (fixed) | `player` | character | `Player` |
| (fixed) | `npc` | character | `Npc` |

**Contract-checked** by `colyseus-server/src/tests/codegen/event-asset-key-contract.test.ts`
(7 cases): the committed `asset-keys.json` deep-equals `genAssetKeys()` (single
source), every config value space maps to a key, and no key lacks a backing
config value (no orphans).

**Accepted forms ↔ reserved namespaces (verified 2026-07-20).**
`AssetRegistry.KindFromTypeId` handles `mob:`/`projectile:`/`zone:`/`npc`/`player`
— exactly the forms the codegen emits. `render-spec.codegenReservedNamespaces`
additionally reserves **`item:`**, which the codegen does not yet emit and
`KindFromTypeId` does not special-case (any `item:` id resolves to the `Player`
capsule — graceful, never throws). `item:` is a *reserved-for-future* namespace,
not a live binding; a future item lane adds both the codegen emission and the
`KindFromTypeId` arm together.

Downstream sfx/vfx lanes add `sfx:`/`vfx:` key forms against this same contract.

> **Client-side probe (`RegistryVerify`) status:** the Godot headless probe
> (`ATLAS_VERIFY_REGISTRY=1`) exercises `AssetRegistry.Resolve` against
> `res://assets/tests/registry_fixture.json` (bespoke/seed/broken/unknown/player
> cases). It requires a Godot .NET binary, which is **not available in this
> environment** — so it was **not run** for F-006 Phase 3. The server-side
> contract above is fully verified by jest; the client probe run is deferred to
> the CI Godot job (Phase 4) / local manual verification. This is stated, not
> papered over.

## 8. Local verify matrix

*(CI wiring is F-006 Phase 4; today these run locally.)*

| Probe | Command | Checks |
|-------|---------|--------|
| Manifest gate | `node scripts/check_asset_manifest.mjs` | guards A–J |
| Content gate | `node scripts/check_content.mjs` | content link-check |
| Registry (Godot) | `ATLAS_VERIFY_REGISTRY=1 godot --headless` | resolve forms match reserved ns |
| Manifest (Godot) | `ATLAS_VERIFY_MANIFEST=1 godot --headless` | client reads render-spec identically |
| EntityView (Godot) | `ATLAS_VERIFY_ENTITYVIEW=1 godot --headless` | entity render wiring |

## 9. Content → server binding seam & ownership boundary (F-006 Phase 5)

The **content → server** direction is deliberately scoped to a **v1 boundary**:

- **`content/` owns** design/identity/enum-stats: a character's `assetKey`, its
  `kind`, `tier`, lore, visual brief. These bind to the codegen keyspace.
- **`src/config/` owns** the balance **NUMBERS** (hp, damage, speed, cooldowns).
  These stay authoritative on the server and are **not** emitted from content.
- **Number-emitting content→server codegen is DEFERRED** (roadmap #2, a future
  stats-codegen). F-006 does **not** build or mutate any server config.

**The seam is already enforced** by `scripts/check_content.mjs` (no new code was
needed — this is reconciliation):

| Check | Behavior |
|-------|----------|
| character sheet `assetKey` not in `asset-keys.json` | **hard fail** |
| `assetKey` kind ≠ `character` | **hard fail** |
| forged/shipped sheet `tier` ≠ manifest tier | **hard fail** |
| a `character` codegen key with no sheet | warn today; **hard fail** under `--require-complete` |

Covered by `scripts/tests/check_content.test.mjs` (11 cases incl. unknown key,
non-character kind, tier mismatch, `--require-complete` escalation). The
`--require-complete` flag is the single sanctioned mode escalation (no stacked
boolean flags — §5).

**Extension directions** (see §6): a new **content type** adds a schema +
gate-branch in `check_content.mjs`; server **numbers** wait for stats-codegen and
never leak into `content/`.

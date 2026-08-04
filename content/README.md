# Content Authoring — Characters, Story, Maps

This directory holds character sheets, map specs, and asset-forge workflows. **The creative source of truth is `content/story/canon.md`** — `content/story/bible.md` is superseded and retained only for seed-region texture.

## Overview

`content/` is the **authoring interface** between designers and the server. Character sheets stay here as markdown frontmatter + prose; the server consumes validated schemas and asset manifests. See `docs/superpowers/specs/2026-07-19-content-pipeline-design.md` for design rationale.

## Character Sheet Lifecycle

```
concept (design) → forged (asset + manifest) → shipped (live)
```

- **concept**: Lore + visual brief; no asset yet. Gate allows this.
- **forged**: Asset exists in manifest at declared tier. Gate validates tier match.
- **shipped**: Live in game. Treat as immutable; create new sheets for variants.

## Authoring Workflow

The full pipeline (spec: "Authoring workflow" diagram):

```
1 AUTHOR  →  2 GATE  →  3 FORGE  →  4 GATE (re-run)  →  5 VERIFY  →  6 SHIP
```

1. **AUTHOR** — copy `_template.md` → sheet, `status: concept`
2. **GATE** — `check_content.mjs` green
3. **FORGE** (F-003) — Visual Brief → kitbash/rig → bake → validate → intake; `status: forged`
4. **GATE (re-run)** — tier/status × manifest cross-check
5. **VERIFY** — storybook eyeball (idle + walk + attack) + headless probes
6. **SHIP** — ps-release-workflow ship; `status: shipped`

Authoring a sheet in detail:

1. **Copy the template**
   ```bash
   cp content/characters/_template.md content/characters/my-character.md
   ```

2. **Fill frontmatter** (YAML between `---` markers)
   - `id`: must match filename (without `.md`)
   - `assetKey`: reference to `colyseus-server/generated/asset-keys.json`
   - `role`, `status`, `tier`: enums from schema
   - `stats`: design intent only (descriptive enums, not balance numbers)
   - `links.story`: array of story-node ids (e.g., `[faction-ashfang]`) — these
     must resolve against `content/story/*.json`, and a character's `region-*`
     link must match that character's `region` in `content/story/characters.json`

3. **Write lore + visual brief** (markdown body)
   - Anchor to nouns that already exist in `content/story/canon.md`; don't
     invent new ones. Amend `canon.md` deliberately, in the same commit, if
     the content genuinely needs one
   - Visual brief is the forge's input (silhouette, palette, scale, donor rig)

4. **Run the gate**
   ```bash
   node scripts/check_content.mjs                    # validate all sheets
   node scripts/check_content.mjs --require-complete # fail if status != shipped
   ```

5. **Source of truth boundary**
   - **Enums (here)**: role, status, tier, archetype, durability, speed, threat
   - **Numbers (server-side)**: HP, damage, cooldowns, balance knobs
   - Character sheets declare design intent; server owns tuning.

## Mob References (maps + story)

Every mob reference in authored content is a **hard gate FAIL** if it isn't a
real server mob id (F-013): map `mobSpawnAreas[].mobType`, story
`faction.mobFamily[]`, and quest `objectives[].targetId` of form `mob:*`.
Valid ids live in the committed `colyseus-server/generated/mob-types.json`,
emitted from the live server `MOB_TYPES` config.

Adding or renaming a mob definition:

1. Edit `colyseus-server/src/config/mobs/definitions/`
2. `bash colyseus-server/scripts/codegen/gen-mob-types.sh` (and
   `gen-asset-keys.sh` — the render keys change too)
3. Commit the refreshed `generated/*.json` — local `check_content.mjs` runs
   FAIL against a stale file. CI regenerates both before the gates as a
   backstop.

## Canon (and the superseded bible)

**`content/story/canon.md` is the source of truth** — setting, chronology, characters, geography, magic. Read it first; `content/story/style.md` second for voice.

`content/story/bible.md` is **superseded**. It describes one era and three regions against canon's five acts and ten regions, and must not be used to judge new content — keep it only for meadow / icefield / Thornveil texture.

Character sheets link to story-node ids via `links.story`. Note the gate only checks that those ids **resolve**, not that a sheet's `region-*` agrees with the same character's `region` in `content/story/characters.json` — keep them in sync by hand.

## File Structure

- `characters/` — character sheets (`.md` with frontmatter). Files starting with `_` are templates/ignored by the gate.
- `story/` — world bible and lore documents.
- `maps/` — map specs (reserved for future use).
- `schemas/` — JSON Schema v7 for validation (character, story, map).

## Gates & CI

The validation gate reads `content/schemas/character.schema.json` and ensures:
- Frontmatter is valid YAML + conforms to schema
- All referenced asset keys exist
- Status → tier coherence: sheet tier must match the manifest tier once status is forged/shipped (hard fail)

Planned (roadmap #3): validate that story links point to real bible section ids.

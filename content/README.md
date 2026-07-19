# Content Authoring — Characters, Story, Maps

This directory holds the creative source of truth: character sheets, world bible, map specs, and asset-forge workflows.

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
   - `links.story`: array of bible section ids (e.g., `[faction-ashfang]`)

3. **Write lore + visual brief** (markdown body)
   - Anchor to world bible nouns; don't invent new ones
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

## World Bible

`content/story/bible.md` is the creative seed: setting, tone, factions, regions, timeline. Character sheets link to section ids via `links.story`. Formal schema and versioning land with roadmap #3.

## File Structure

- `characters/` — character sheets (`.md` with frontmatter). Files starting with `_` are templates/ignored by the gate.
- `story/` — world bible and lore documents.
- `maps/` — map specs (reserved for future use).
- `schemas/` — JSON Schema v7 for validation (character, story, map).

## Gates & CI

The validation gate reads `content/schemas/character.schema.json` and ensures:
- Frontmatter is valid YAML + conforms to schema
- All referenced asset keys exist
- All story links point to real bible section ids (roadmap #3)
- Status → tier coherence: sheet tier must match the manifest tier once status is forged/shipped (hard fail)

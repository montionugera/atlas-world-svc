# RO-Themed CC0 Seed Asset Library — Design

> **Status:** Approved (design) · **Theme:** classic MMORPG, Ragnarok-inspired · **Art direction:** low-poly 3D (Godot `.glb` pipeline) · **Scope:** complete-coverage *vertical slice*, not full-game asset count.

## 1. Goal

Source a coherent **CC0 low-poly 3D** asset set that covers **every asset class**, enough to build one **A-tier-quality playable zone** (a vertical slice: a town, a handful of monsters, a playable class, core UI/SFX/music), and pull it into the **asset store** (`game-client/assets/` + `catalog-manifest.json`) so it renders in the storybook and passes the drift gate. The same pipeline scales to the full game later — this spec does **not** attempt the full game's thousands of assets.

**Non-goal:** literal Ragnarok Online 2D sprites (art-direction decision: 3D). No wiring into gameplay/Godot entity system here — that is a separate follow-on (assets land in the *curated* catalog for preview/QA; runtime consumption via `manifest.json` is out of scope).

## 2. Coverage matrix (the "is it enough?" acceptance target)

Each class must reach its target count with CC0 assets that load in the storybook. This matrix **is** the verification checklist.

| Class | Keyspace | RO analog | Primary CC0 source | Target | Have |
|---|---|---|---|---|---|
| Monsters | `creature:*` | Poring, Orc, Wolf, Skeleton, Goblin | Quaternius Ultimate Monsters (50, CC0) | 8–12 | 1 (slime) |
| Class avatars | `class:*` | Swordsman, Mage, Archer, Acolyte, Merchant | Quaternius Modular Characters; Kenney Mini | 4–6 | 8 chars (generic) |
| Town / environment | `env:*` | Prontera props: buildings, fountain, lamp, tree, fence | Kenney Fantasy Town Kit, Nature Kit | 10–15 | 3 (tree/fence/mtn) |
| Dungeon | `env:dungeon_*` | Payon cave, tombs | Kenney Modular Dungeon / Graveyard Kit | 6–10 | 0 |
| Weapons / equip | `weapon:*` | sword, staff, bow, shield, dagger, axe | Quaternius LowPoly Medieval Weapons | 6–8 | vfx projectiles only |
| Item icons (2D) | `icon:*` | potion, herb, ore, card, equip, coin | Kenney Generic Items, Board Game Icons | 10–15 | 2 (potions) |
| UI kit | `ui:*` | RO windows, buttons, HP/SP bars | Kenney UI Pack (RPG Expansion) | 1 set | 1 (panel) |
| Music / ambience | `music:*` | field & dungeon BGM | OpenGameArt CC0 fantasy music | 2–3 | 0 |
| SFX | `sfx:*` | attack/hit/UI | Kenney RPG Audio | ✅ | 51 |
| Font | `font:*` | UI font | Kenney Fonts | 1 | 0 |

## 3. Acquisition method (proven this session)

- **Poly Pizza (no login):** model page `<model-viewer>` src = `https://static.poly.pizza/<uuid>.glb.br`; search-thumbnail uuid == glb uuid, so glb URLs come straight from search results. `curl -s --compressed -o x.glb <url>` → server `Content-Encoding: br` → curl yields raw glTF. **Filter creator to Quaternius / Kenney (CC0); skip "Poly by Google" (CC-BY).**
- **Kenney packs** (Fantasy Town Kit, Modular Dungeon, UI Pack, Fonts): zip-gated → if a direct curl fails, list the pack + URL for a human download rather than scraping.
- Every asset gets a **`LICENSES.md`** provenance row (source, pack, license, author) at intake.

## 4. Wiring into the asset store

Each asset → a curated `catalog-manifest.json` entry: `{ scene: "res://assets/<dir>/<file>.glb", render: "model3d" | "image", kind: "<class>", source: "market", license: "CC0 (<pack>)", tier: "seed", label }`. New `kind` values auto-create storybook sections via `groupKeyFor` (add a `RENDER_LABELS` entry for a clean section name). Keyspace stays curated (`item:*` remains reserved for codegen).

## 5. Fan-out + verify (execution)

- **Fan-out:** parallel agents, one per class-family (monsters / environment+dungeon / weapons / class-avatars / item-icons / UI+font / music). Each: research the best CC0 pack → pull assets via §3 → drop files + `catalog-manifest.json` entries + `LICENSES.md` rows. Isolated (each writes distinct files/dirs; catalog edits reconciled in a merge step to avoid JSON conflicts).
- **Verify (gated):**
  1. **Gate:** `node scripts/check_asset_manifest.mjs` exit 0 (every entry: file exists, license present, ext matches render type).
  2. **Render:** storybook loads each new asset in the foreground (glb served 200 + `model-viewer.loaded`).
  3. **License audit:** every asset is CC0 (or CC-BY explicitly logged) with a provenance row.
  4. **Coverage critic:** confirm every §2 class hits its target count; produce a coverage report and **loudly flag any class that fell short** (no silent partial).

## 6. Acceptance criteria

"Enough for an A-tier vertical slice" = **every class in §2 meets its target**, all assets CC0-cleared and provenance-logged, gate green, and each renders in the storybook. Shortfalls are reported, not hidden.

## 7. Risks

- Some classes have thin CC0 coverage (monsters, weapons: Quaternius is strong; UI/skill-icons: weaker — may need Kenney UI only). Coverage critic surfaces these.
- Kenney zip-gating may require a couple of human-assisted downloads (flagged, not scraped).
- Style consistency: mixing Quaternius + Kenney low-poly is acceptable (both flat-shaded low-poly) but the critic notes any jarring outliers.

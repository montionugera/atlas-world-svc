---
title: "World structure merge v1: owner decisions, encounter bands, town roles and a portal-vs-route gate (new geography as the core axis)"
id: I-320
status: idea
---

# World structure merge v1

Owner request, verbatim (2026-11-18): "เราจะ merge กันยังไงดี อยากเอา ข้อดีมารวมกัน แต่อ้างอิงแกนหลักเป็นของ ใหม่ ไปปรึกษา GPT
Discuss กันว่าจะวางแผนวางโครงสร้างยังไง ให้ไม่เละ สนุก สมเหตุผล scale มีมิติไหนที่ต้องคิดบ้าง เช่น เก็บเวล ฟาม Party เมืองหลวง"
(merge the good parts of both with the NEW geography as the core axis; structure it so it is not a mess, is fun,
makes sense and scales).

**The owner will confirm this by** opening the Hearthbloom Basin record on `http://atlas-edit.joymify.local.com/`
and a district such as Terracotta Wind-Chime Ridge, and reading: its starter band and main hunting band, what its
town is for, and for each old portal whether it stays, becomes transport, or is to be removed.

## Source

- ChatGPT reply "World Structure Merge Proposal v1", saved at
  `~/.local/state/atlas-lane/gpt-capture-2026-11-18/merge-reply-1.txt` (proposal, not canon). Brief sent:
  `merge-brief-to-gpt.md` in the same folder.
- Owner decisions, 2026-11-18, answered directly to the agent:
  1. After each race prologue (Lv 10) the first trip to Kilnwatch is a one-way guided caravan; walking stays possible.
  2. Fixed monster levels with real danger; no world-wide level scaling.
  3. First content target is Lv 1-15, chapter 0 (Maro Bell + Kilnwatch), then expand.
- Already chosen earlier (glossary `world_model`): hybrid seamless regions; polycentric hub, not a capital.

## Problem (measured on release/1.34)

- 62 node portals cross a district border; on continent 01 they join 9 district pairs plus one portal to continent 02.
  Only 2 pairs match the 18 `district_links` (teacup-kilnfire, cinnamon-ginger). 7 pairs contradict the geography.
  16 of the 18 routes have no portal. Nothing checks either direction.
- District `level_range` is one narrow band; five of six race home districts start above Lv 10, so the canon
  Lv 1-10 prologue per race cannot happen there.
- Towns carry no statement of what they are for.

## Sketch (frozen data contract). All new values `status: "proposed"` unless a decision above covers them.

1. `content/studio/canon/decisions.json`: the three owner decisions with status `decided`.
2. `glossary.json` `world_model.rules`: add `structure_layers` (geography = new layer is authoritative; playable maps
   = existing content; progression and narrative are separate layers), `danger_model` (chosen), `convergence_travel`
   (chosen), `first_content_target` (chosen), `walk_minutes_meaning` (proposed: relative distance until measured on
   one playable route), `enforced_rules` (the three automatic rules).
3. `glossary.json` `towns[]` gains `service_role: {primary, purpose, status, source}` for the seven canon towns;
   the three mixed towns (Ginger-Bathhouse Haven, Glaze-Barge Quay, Saffron-Press Village) get the same on their
   district `geography.town_role` because they are not canon towns.
4. Each continent-01 district `geography` gains
   `encounter_bands: {starter: [min,max] | "safe" | null, main: [min,max], identity, chapter, status}` from the
   reply's 11-district table. The old `level_range` is NOT changed (runtime and INV-05 read it).
5. Continent file: each `district_links[]` entry gains `priority: "P0"|"P1"|"P2"` (reply section 4.2; the two that
   already have portals are `"built"`); new `transport_links[]`:
   `{id, a, b, mode: caravan|boat|duct_route, note, status}` for the three old pairs the reply keeps as transport
   (ondo-linde, silme-delta as transport; daro-kilnwatch as an underground duct route, since the district text
   already says its air is ducted under the basin to Kilnfire); new `legacy_portals[]`:
   `{from_node_id, to_node_id, district_pair, ruling: "remove"|"becomes_transport"|"keep", reason}` listing every
   existing cross-district node portal on the continent that is not covered by a `district_links` pair.
6. Gate GEO-09 in `scripts/validate_studio_hierarchy.py` (active for continents with `district_links`): every node
   portal whose target is in another district must be covered by a `district_links` pair, a `transport_links` pair,
   or a `legacy_portals` entry with the same endpoints; and every `legacy_portals` entry must still exist as a
   portal (so the list shrinks, it cannot rot). GEO-10: `priority` present on every link; `encounter_bands.main`
   present on every district; a district holding a race home town has `starter: [1, 10]`.
7. Game DB (`catalog_index.py`): relation "Transport to" for `transport_links`; tags for link priority and for
   `encounter_bands.main`; district summary shows the bands. Continent record lists the legacy portal rulings count.

## Non-goals

- Changing any playable map, node portal, `level_range`, mob placement or the runtime manifest. This feature
  records the plan and makes drift visible; rewiring portals and retuning levels for Lv 1-15 is the next feature.
- World bosses, events, economy numbers, fast-travel unlock rules, continents 02 and 03.

## Acceptance criteria

- [ ] `decisions.json` holds the three owner decisions as `decided`, dated 2026-11-18.
- [ ] 11 of 11 continent-01 districts have `encounter_bands`; the six race home districts have `starter: [1, 10]`.
- [ ] 18 of 18 `district_links` have `priority`; `transport_links` has 3 entries; `legacy_portals` covers every uncovered cross-district portal with a ruling.
- [ ] `python3 scripts/validate_studio_hierarchy.py --check` passes; GEO-09 and GEO-10 each fail on a fixture that breaks them, including an unlisted cross-district portal and a `legacy_portals` entry whose portal no longer exists.
- [ ] After a DB rebuild, the Terracotta Wind-Chime Ridge record summary shows starter 1-10 and main 25-35, and a "Transport to" relation exists.
- [ ] `./scripts/precheck.sh --no-install` is green.

---
title: "Four-Level Perspective Switcher (World History and Concept to Continent) in Observatory Web Studio"
id: F-087
status: refined
epic: E-010
from_idea: I-194
---

# Four-Level Perspective Switcher (World History and Concept to Continent) in Observatory Web Studio

## Summary

Upgrade `scripts/catalog_explorer_web.py` with the unabbreviated **Four-Level Perspective Switcher** (`World History and Concept -> Continent -> District -> Town or Hunting Area`), URL hash routing (`#perspective=world-history-and-concept`, `#perspective=continent&continent=<id>`, `#perspective=district&district=<id>`, `#perspective=town-or-hunting-area&map=<id>&monster=<id>`), the **World History and Concept** view (Primordial Gods, Great War Scars, Starter Town bindings, and 90 to 120 centimeter Character Scale Visualizer), and the **Continent** Macro Atlas view with `Canon`, `Draft`, and `Mystery (Fog of Lore)` visual treatments.

## Acceptance criteria

- [ ] `scripts/catalog_explorer_web.py` loads `content/studio/` (`world_history_and_concept.json`, `continents/*.json`, `districts/**/*.json`, `nodes/**/*.json`, and `content/maps/_manifest.runtime.json`) into a unified `studioHierarchy` payload exposed via `GET /api/studio/perspectives` and embedded in `GET /api/bundle`.
- [ ] The Observatory Web Studio renders the sticky unabbreviated **Top-Down Perspective Bar** (`#perspectiveBar`) with buttons for `World History and Concept`, `Continent`, `District`, and `Town or Hunting Area`, plus status filters (`All`, `Canon`, `Draft`, `Mystery`) and URL hash state synchronization.
- [ ] Selecting **World History and Concept** renders the Primordial Gods cards, Historical Epochs & Great War Scars timeline (with 1-click drill-down to spawned Continents), Starter Town Arrival Bindings, and the interactive **90 to 120 Centimeter Cute Toddler and Kid Character Scale Visualizer** (`1.05m` reference vs `0.35m` grass, `0.65m` bush, `0.60m` shop counter, `2.00m` doorway).
- [ ] Selecting **Continent** renders the Continent selector and Macro Continent Atlas with distinct visual treatments for `Canon`, `Draft`, and `Mystery (Fog of Lore)` Continents and child Districts, including parent World History War Scar provenance, climate and architecture scale adaptation cards, inter-continent travel links, and `Mystery Hook` rumor cards.

---
title: "Human-in-the-Loop Core Rationale, Quality Checklist Gate, Mystery Toggle, and Top-Down Generation Drawer"
id: F-089
status: refined
epic: E-010
from_idea: I-196
---

# Human-in-the-Loop Core Rationale, Quality Checklist Gate, Mystery Toggle, and Top-Down Generation Drawer

## Summary

Add the persistent right-hand **Core Rationale, Five-Pillar Quality Checklist, and Mystery Approval Drawer** and backend mutation endpoints (`GET /api/studio/perspectives`, `POST /api/studio/rationale/update`, and `POST /api/studio/generate-children`) to `scripts/catalog_explorer_web.py`, enforcing parent-Canon and 5-pillar checklist preconditions before promoting a node to `Canon` or generating child layers, and add an end-to-end automated test suite `tests/test_studio_web_perspectives.py` plus `scripts/epic-check.sh`.

## Acceptance criteria

- [ ] `GET /api/studio/perspectives` returns `200 OK` with the full 4-tier `World History and Concept -> Continent -> District -> Town or Hunting Area` hierarchy, per-node `core_rationale`, `status`, `mystery_hook`, and `quality_checklist`.
- [ ] `POST /api/studio/rationale/update` updates a studio node's `core_rationale`, `mystery_hook`, `quality_checklist` pillar toggles, and `status` (`canon | draft | mystery`) with automatic undo snapshots under `build/studio-snapshots/`, while returning `400` if promoting to `canon` when the parent node is not `canon` or when any of the 5 `quality_checklist` pillars is unchecked.
- [ ] `POST /api/studio/generate-children` enforces the top-down precondition: returns `400` if the parent node is not `canon` or has incomplete `quality_checklist` pillars, and returns `200` creating a rationalized `draft` or `mystery` child node when the parent is `canon` with all 5 checklist pillars verified.
- [ ] The right-hand **Core Rationale, Five-Pillar Quality Checklist, and Mystery Approval Drawer** in `scripts/catalog_explorer_web.py` lets the human designer inspect parent connection, edit `core_rationale` and `mystery_hook`, toggle the 5 quality checklist pillars, switch `Canon / Draft / Mystery` status, and trigger downward child generation.
- [ ] `python3 -m unittest tests/test_studio_web_perspectives.py` passes all API, perspective rendering, checklist gating, and downward generation tests.

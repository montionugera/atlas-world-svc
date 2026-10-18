---
title: "Autonomous Product Owner Multi-Agent Studio Pipeline, Self-Evaluation Telemetry, and Kilnfire Terraces Increment"
id: I-197
status: idea
---

# Autonomous Product Owner Multi-Agent Studio Pipeline, Self-Evaluation Telemetry, and Kilnfire Terraces Increment

## Summary

Upgrade the Multi-Agent Studio Director skill (`.agents/skills/world-studio-director/SKILL.md`), the 4 specialized studio role contracts (`.claude/agents/*.md`), and the master pipeline (`scripts/run_world_pipeline.py`) into an autonomous **Increment -> Validate -> Verify -> Measure & Self-Evaluate -> Auto-Tune -> Brainstorm** system with incremental hash-caching (`--fast`), turn-speed and quality scoring (`build/studio_self_evaluation.json`), and execute a concrete top-down content increment (`dungeon-kiln-cellar` promoted to `canon` + `district-kilnfire-terraces` expanded with `town-kilnwatch-bastion` [`canon`], `hunting-area-cinder-apron` [`canon`], and `hunting-area-slag-chasm` [`mystery`]).

## Acceptance criteria

- [ ] `.agents/skills/world-studio-director/SKILL.md` and `.claude/agents/{world-lore-architect,map-biome-engineer,asset-forge-director,qa-gatekeeper}.md` share the unified Product Owner Charter: Four-Level Top-Down Hierarchy (`World History and Concept -> Continent -> District -> Town or Hunting Area`), Zero Abbreviations, Five-Pillar Quality Checklist, 90 to 120 Centimeter Character Scale Law, Intentional Mystery / Fog of Lore discipline, and the `Increment -> Validate -> Verify -> Self-Evaluate -> Auto-Tune -> Brainstorm` loop.
- [ ] `python3 scripts/run_world_pipeline.py` runs all Studio Hierarchy (`INV-01`..`INV-07`), Map Compiler, SQLite Catalog, Observatory Bundle, and Unit Test gates, supports `--fast` hash-cached execution and `--auto-tune` drift healing, and outputs `build/studio_self_evaluation.json` with per-stage latency (`elapsedMs`), quality checklist pass rate, scale compliance score, and ranked Next-Increment Brainstorm Queue.
- [ ] `dungeon-kiln-cellar` is promoted from `draft` to `canon` with all 5 quality checklist pillars verified, and `district-kilnfire-terraces` is promoted to `canon` with 3 connected child nodes (`town-kilnwatch-bastion` [`canon`], `hunting-area-cinder-apron` [`canon`], and `hunting-area-slag-chasm` [`mystery`]).
- [ ] `scripts/catalog_explorer_web.py` exposes `GET /api/studio/self-evaluation` and renders a live **Product Owner Self-Evaluation, Turn-Speed Telemetry, and Next-Increment Queue** bar inside the Top-Down World Studio tab.

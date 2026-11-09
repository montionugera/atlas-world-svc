---
title: "POC-06: Player Impression Validation and Scorecard Gate (ATLAS_VERIFY_POC_MARO_10M probe, telemetry, 7-metric scorecard)"
id: I-293
status: idea
epic: E-011
---

# I-293 POC-06: Player Impression Validation & Scorecard Gate

## Goal
Verify that the integrated 10-minute Maro Bell POC (`POC-00..POC-05`) runs end-to-end without blockers and instrument it for the 7-metric **POC Success Scorecard** and human playtest observation.

## Player-Facing Experience
A complete, seamless 10-minute play session from arrival on the lantern road through The Great Bell reveal, Pip, Amber's lantern, the Soot Muncher delivery recovery, Bram's Old Lantern (`first_trace`), and Edda + the Time-Wound climax (`time_wound`), observed with minimal facilitator intervention and followed by a structured debrief.

## Scope In vs Out
- **Scope In:** Headless end-to-end Godot + `server-rs` verification probe (`ATLAS_VERIFY_POC_MARO_10M`), runtime telemetry capture (scene readiness, beat timestamps, NPC interactions, combat completion, FPS/frame-time), 7-metric POC Evaluation Scorecard & playtest observation sheet (`docs/superpowers/specs/2026-11-09-atlas-roadmap-and-maro-bell-10m-poc.md`), and `scripts/epic-check.sh` integration for `E-011`.
- **Scope Out:** Live-service retention forecasting, monetization experiments, or large-scale A/B analytics infrastructure.

## Acceptance criteria
- [ ] End-to-end probe `scripts/godot-verify.sh ATLAS_VERIFY_POC_MARO_10M '^\[PocMaro10mVerify\] VERDICT PASS$'` exercises all 6 beats (`POC-00..POC-05`) against `server-rs` and exits 0.
- [ ] Session telemetry records beat completion timestamps, frame-time p95, and zero progression blockers or save corruption.
- [ ] Playtest observation template and 7-metric POC Success Scorecard are wired and verified by `psrw epic verify E-011`.

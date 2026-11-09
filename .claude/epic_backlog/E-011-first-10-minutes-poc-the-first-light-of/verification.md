---
title: "First 10 Minutes POC — The First Light of Maro Bell"
id: E-011
---

# How we will know E-011 works

Prose for humans. `scripts/epic-check.sh` implements these assertions; the
toolkit never parses this file.

## Assertions

1. **Technical Gate (`POC-00`):** Launching the client and `server-rs` with the `maro-bell` POC profile loads `content/maps/maro-bell.json` (`80×160 m`, `unitContract: "metres-v1"`) on both sides with no fallback to `map-for-play`, enforces 2.5D height and `35°` slope limits under Rust authority, and resets cleanly to a reproducible initial state via `RustMetaEngine`.
2. **Wonder & Warmth Gate (`POC-01`..`POC-02`):** A player walking the arrival road sees the Great Bell landmark reveal, interacts with **Pip** (`q-maro-01` beat) and **Amber** (`q-maro-02` beat) with **Reed** and **Tovin** present in town, and triggers an authoritative, non-duplicable lantern state transition (unlit → lit).
3. **Playfulness Combat Gate (`POC-03`):** The **Soot Muncher** encounter on the shared **Lantern Vermin** rig runs under `server-rs` combat authority (range, damage, defeat, parcel recovery for `q-maro-03` beat) with aligned Godot hit/defeat animations and repeatable reset.
4. **First Trace & Time-Wound Mystery Gate (`POC-04`..`POC-05`):** Inspecting **Bram's** repaired lantern (`first_trace` beat) and witnessing **Edda's** bell-timing mismatch + the **Time-Wound** rapid lantern oil drain (`time_wound` beat) execute deterministically without revealing the Last Cala Knight's identity or polluting canonical Lv4–7 save completion outside the POC scenario.
5. **End-to-End 10-Minute POC Probe & Scorecard (`POC-06`):** Automated verification probe (`ATLAS_VERIFY_POC_MARO_10M`) and the 7-metric POC Evaluation Scorecard (landmark discovery ≥80%, movement ≥90%, warmth recall ≥70%, combat clarity ≥80%, mystery comprehension ≥80%, curiosity to continue ≥70%, technical stability 100%) are wired and green.

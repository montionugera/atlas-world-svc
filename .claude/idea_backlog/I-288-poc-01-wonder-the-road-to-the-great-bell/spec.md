---
title: "POC-01: Wonder — The Road to the Great Bell (00:00-02:30 reveal composition, Pip greeting, ambient Reed & Tovin)"
id: I-288
status: idea
epic: E-011
---

# I-288 POC-01: Wonder — The Road to the Great Bell (00:00–02:30)

## Goal
Make the player perceive Atlas's signature *Tiny Human, Massive World* scale within the first 60–90 seconds while enjoying movement without instructional overload.

## Player-Facing Experience (00:00–02:30)
The player begins on a lantern-lit road (`maro-bell`). **The Great Bell** (ระฆังใหญ่) is partially framed by cliffs and architecture, then opens into a deliberate scenic reveal with foreground brass lanterns, village road, suspended Great Bell, and distant porcelain ribs. **Pip** (Spark/traveller, 19) greets the traveller (`q-maro-01` beat) and invites them into the village, with **Reed** (gatekeeper, 38) and **Tovin** (shrine/kiln-record keeper, 65) present in ambient roles.

## Scope In vs Out
- **Scope In:** Spawn-to-Bell route on `maro-bell`, landmark framing (cliffs, suspended Great Bell, porcelain ribs, foreground lanterns), camera reveal framing & occlusion handling, environmental SFX (brass resonance, wind, footsteps), **Pip** interaction prompt & greeting, ambient **Reed** & **Tovin** placement, and a compact onboarding objective that does not cover the screen.
- **Scope Out:** Character customization, mounts, fast travel, cinematic cutscenes, full village interiors, or branching dialogue trees.

## Acceptance criteria
- [ ] Spawn-to-Bell route frames foreground lanterns -> village road -> The Great Bell -> distant porcelain ribs without collision, camera, or streaming blockers.
- [ ] **Pip** is placed along the arrival route with idle/talk animation and discoverable interaction (`q-maro-01` POC beat), alongside ambient **Reed** and **Tovin**.
- [ ] Environmental audio (bell resonance, wind, footsteps) and non-intrusive objective UI are active.
- [ ] Automated check verifies arrival spawn, camera reveal line-of-sight to The Great Bell, and Pip interaction availability.

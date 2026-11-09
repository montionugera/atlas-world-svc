---
title: "POC-02: Warmth — A Small Kindness (02:30-04:15 Amber lantern errand and authoritative unlit->lit state change)"
id: F-207
status: refined
epic: E-011
from_idea: I-289
---

# I-289 POC-02: Warmth — A Small Kindness (02:30–04:15)

## Goal
Demonstrate Atlas's central emotional identity — ordinary people solving ordinary problems, where small kindnesses visibly improve the world.

## Player-Facing Experience (02:30–04:15)
**Amber** (lantern-oil seller, 34) asks for help with a practical lantern errand (abbreviated POC beat inspired by `q-maro-02` *Light for Tonight*). The player performs a short collection/delivery interaction, a village lantern visibly transitions from unlit to repaired/lit, and Amber responds warmly.

## Scope In vs Out
- **Scope In:** Amber NPC presentation & interaction, one reusable interactable supply/lantern object, authoritative POC beat completion in `server-rs`, visible lantern state transition (unlit -> repaired/filled -> lit), optional compact Daymarks acknowledgment, and EN/TH-ready dialogue structure.
- **Scope Out:** Full economy balancing, crafting system, player trading, complex inventory management, or requiring the full 5-herb/3-lantern canonical Lv2 grind.

## Acceptance criteria
- [ ] **Amber** interaction starts and completes the `q-maro-02` POC errand beat authoritatively in `server-rs`.
- [ ] Completing the errand cannot be duplicated or grant double rewards on retry/reconnect.
- [ ] Target village lantern visibly transitions from unlit to lit in the 3D scene upon completion.
- [ ] Emotional NPC reaction is surfaced clearly without heavy reward-popup clutter.

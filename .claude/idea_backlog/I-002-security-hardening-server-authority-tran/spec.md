---
title: "Security hardening: server-authority, transport, client deterrence, anti-abuse"
id: I-002
status: idea
---

# Security hardening

## Problem

The game is online + server-authoritative (Colyseus sim, Nakama storage), and any client (Unity today, possibly Godot) is assumed compromised — it runs on hardware the attacker controls and is reverse-engineerable (Godot especially: unencrypted PCK + decompilable GDScript). Real protection must live on the server. The F-001 review already caught real holes (auth bypass, wrong-identity event attribution, fail-open response parsing) — this idea makes hardening a deliberate, tiered, ongoing discipline rather than ad-hoc.

## Why now

Meta-systems (F-001) just added durable player state + economy (xp, items, quests) — i.e. things worth cheating for. Harden before scale/launch, while the surface is small.

## Sketch (prioritized tiers — do in order; 80/20 is Tiers 1–2)

**Tier 1 — Server authority (highest ROI):**
- Validate everything server-side: movement bounds/speed, all mutations via RPC (done), input sanity; never trust client-reported outcomes.
- Server-*derived* events, not client-claimed (Colyseus sim observes kills itself — keep it that way).
- Rate-limit every RPC (per-user, per-window); idempotency/dedupe on event batches (done — prevents replay dupes).
- Anti-cheat detectors: speed/teleport, impossible-state, economy sanity (xp/item deltas within plausible bounds).
- Keep the adversarial-review gate on every feature (it already caught the F-001 criticals).

**Tier 2 — Transport & session:**
- TLS/WSS on Colyseus + Nakama (encrypt wire; kills sniffing/MITM).
- Short-lived Nakama tokens + refresh; rate-limit auth; device/account abuse detection.
- Optional cert pinning in client (deterrence, bypassable on rooted devices).

**Tier 3 — Client deterrence (diminishing returns — cheap ones only):**
- Encrypt game package at export (Godot PCK AES / Unity equivalent) — stops casual asset ripping.
- Any genuinely secret client logic → native module (Godot C++ GDExtension) — but prefer: no secrets in client at all.
- No API keys / no S2S `http_key` / no server-authority logic in the client bundle (http_key already server-only — keep it that way).
- Root/emulator/tamper detection = signals, not walls. Don't over-invest.

**Tier 4 — Abuse & ops:**
- Behavioral bot detection (inhuman timing/patterns), account/device fingerprinting, ban tooling.
- Wire anomaly alerts into existing Prometheus/Grafana (spike in an RPC, impossible economy delta).
- CAPTCHA / step-up on suspicious flows.

## Non-goals / guidance
- Do NOT pour effort into client anti-tamper for a server-authoritative game — the server is the wall. Client hardening is deterrence only.
- Revisit if/when the client platform changes (see the Godot-migration decision) — Tier 3 specifics are engine-dependent; Tiers 1–2 are engine-agnostic and carry over.

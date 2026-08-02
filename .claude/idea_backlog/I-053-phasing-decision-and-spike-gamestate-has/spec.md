---
title: "Phasing policy decision + the InterestManager predicate hook (rider on I-058 Stage 1)"
id: I-053
status: idea
wave: 2
order: 1
sequence_why: "phasing: the un-retrofittable part is the Stage 1 predicate hook, not the StateView itself"
supersedes_title: "Phasing decision and spike: GameState has zero @filter/filterChildren/StateView, so two clients in one room cannot see different world contents - cheapest to build now at 28 quests, cannot be retrofitted at 560"
---

# Phasing policy decision + the InterestManager predicate hook

## Triage verdict — **rider on I-058 Stage 1**, not a duplicate

`I-048` spec §7 routed this to backlog triage: *"I-053 (phasing / StateView) appears to overlap I-058 stage 1 and may be a duplicate."* Verified against the tree on `release/1.6`:

- **Not a duplicate.** I-058 Stage 1 installs per-client `StateView` for *distance*-based AOI. Phasing is a different predicate (progression / quest state) over the same mechanism, plus work Stage 1 does not do.
- **Not independent.** `StateView` is predicate-agnostic — `add(obj: Ref, tag?: number)` (`@colyseus/schema` `build/encoder/StateView.d.ts:51`) takes any ref and nothing in the API is distance-aware. One view per client can carry both predicates by intersection: `visible = nearby(x, y, r) ∩ phaseVisible(player)`.

The original title's framing — *"GameState has zero @filter/filterChildren/StateView"* — is now **fully owned by I-058** and should not be tracked twice. That observation is confirmed (`grep` over `colyseus-server/src` → 0 hits; `GameState.ts:21-25` uses plain `@type`), it is just no longer this idea's job.

## Problem

Two things, one urgent and one not.

**1. The predicate hook is genuinely un-retrofittable (urgent, and it lands inside someone else's stage).**
I-058 Stage 1 as drafted has `InterestManager` recompute each client's visible set from a spatial hash every tick and apply `add`/`remove` deltas. If it owns the view authoritatively with a hard-wired `query(x, y, aoiRadius)`, then **any phase-driven `view.add()` is silently removed on the next tick**. Retrofitting means rewriting `InterestManager`'s core loop after it has consumers. Designing the visible-set computation to take a **pluggable per-client predicate** costs almost nothing today.

**2. The phasing policy call itself (not urgent as code, urgent as a content convention).**
The idea's original claim — *"cheapest now at 28 quests, cannot be retrofitted at 560"* — is **half right, for the wrong reason**. The *code* is retrofittable: `StateView` is server-side and per-entity, and `content/story/quests.json` holds 28 quests today. What is not retrofittable is the **authoring convention** — quests written assuming one shared mutable world cannot be cheaply re-phased later. So the decision is urgent; the implementation is not.

## Why now

I-058 Stage 1 is the next engine work in the queue. The hook has to be designed in before `InterestManager` is written, or it is a rewrite instead of a parameter. The policy call has to be made before Season 1's quest bulk is authored (`DR-003` targets 90 act-independent quests against 8 today).

## Sketch

### In scope for this idea

- **Decide**: is phasing in Season 1 at all? Owner call, informed by the quest-authoring convention it implies. Recorded as a `DR-` decision doc.
- **Require** of I-058 Stage 1: `InterestManager`'s visible-set computation takes a per-client predicate, not a hard-wired radius query. Already written into `docs/superpowers/specs/2026-08-01-seamless-large-world-scaling-design.md` → *Stage 1 → The phasing hook (I-053)*.

### Two hard limits, recorded so nothing over-promises

- **A view can hide a field; it cannot give client A value X and client B value Y for the same ref+field.** `Encoder` holds a single `state` tree (`build/encoder/Encoder.d.ts:11`) and `encodeView` encodes from it (`:20`). Divergent world *content* must be modelled as **two entity instances**, not one field with two values.
- **Physics is not view-filtered.** Two phase-variants of an NPC means two dynamic Planck bodies in one world; a phase-A player would physically collide with the phase-B body. No stage of I-058 addresses this — it needs a Planck collision-filter category per phase.

### Out of scope, but blocking any real implementation

The room has **no progression state at all**. `GameRoom.onJoin` fetches only a `LoadoutSnapshot` (`src/rooms/GameRoom.ts:185` → `src/meta/applyLoadout.ts`); quest state lives entirely in Nakama (`nakama/src/questEngine.ts`, `nakama/src/rpc/quests.ts`, `nakama/src/questCatalog.ts`). The phase predicate has **no input** in the room today. A new Nakama RPC + join-time fetch + a per-player phase field is its own piece of work — file it as a separate idea if the policy call comes back "yes".

## Verification

Evidence required before this is called done:

1. The phasing policy decision exists as a committed `DR-` doc under `docs/worldbuilding/`, with an explicit yes/no and the authoring convention that follows from it.
2. I-058's design carries the predicate-hook requirement in Stage 1's components and its files-touched appendix. ✅ *done — committed with this triage.*
3. If the answer is "yes": a follow-on idea exists for the Nakama progression fetch and the per-phase Planck collision filter, both named and linked.
4. `_catalog.json`'s title for I-053 matches this spec's title (no drift between the backlog listing and the spec).

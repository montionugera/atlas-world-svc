---
title: "GameSimulationSystem's single try/catch silently drops the rest of a tick on any throw"
id: I-070
status: idea
---

# One throw silently skips the rest of the tick

## Problem

`GameSimulationSystem.update()` wraps its entire ordered pass — physics, projectiles, players, AI, mob lifecycle, mobs, NPCs, projectile cleanup, zone effects, interest, battle-message processing — in a **single** `try { ... } catch (error) { console.error(...) }`.

Any throw in an early stage therefore skips **every later stage** for that tick, including `processBattleMessages()`. The simulation keeps running. Nothing surfaces except a console line.

This is not hypothetical. During F-027, a `TypeError` in a newly added stage produced **12 test failures across three suites**, every one presenting as "damage never applied" / "mob never died" — assertions about combat, with the real cause an unrelated undefined property several stages earlier. Diagnosing it took a full investigation. In production the same shape would look like intermittent combat failure with no error attributable to it.

## Why now

The ordered pass is growing. F-027 added one stage; the seamless-world design (F-027 stages 2-5) adds ghost sync, handoff, and cross-shard combat stages to the same loop. Every stage added widens the blast radius of a single throw, and the symptom always appears in whatever runs last rather than where the fault is.

## Sketch

- Wrap each stage in its own `try/catch` that logs the **stage name**, so a fault is attributable and later stages still run.
- Increment a Prometheus counter per stage failure (`sim_stage_error_total{stage}`) — a silent `console.error` is not observable in production.
- Decide deliberately which stages are safe to continue past and which should abort the tick; a physics failure is not the same as a zone-effect failure.
- Add a test that forces a throw in an early stage and asserts later stages still ran.

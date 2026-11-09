---
title: "Game and playtest sandbox windows get different Dock/window icons and titles so the owner can tell them apart: a runtime WindowBadge sets DisplayServer icon + title per scene"
id: I-282
status: idea
---

# Game and playtest sandbox windows get different Dock/window icons and titles so the owner can tell them apart: a runtime WindowBadge sets DisplayServer icon + title per scene

## Problem

The main game window and the playtest sandbox window look identical in the Dock and the window bar, so the owner cannot tell which one is which.

## Sketch

A static `WindowBadge.Apply(label, colour)` in `game-client/src/World/`, called once from `VerticalSliceRoot._Ready` and `PlaytestSandboxRoot._Ready`. It sets the window title and a generated 128x128 icon via `DisplayServer.SetIcon` (game = blue, sandbox = orange, each with a letter-free bold shape).

## Acceptance criteria

- [ ] The game window title is "Atlas - GAME" and the sandbox title is "Atlas - SANDBOX".
- [ ] The two windows get icons whose average colours differ, checked by a probe that builds both icons and asserts they are not equal.
- [ ] Windows opened with the Dock/window list show two visibly different icons (owner looks).

# I-257 Combat stance wiki: shield covers the body

## Goal
Owner 2026-11-07: in combat a raised shield or weapon covering the body is correct ("Sheild / or weapon raise / cover make sense"). The wiki "Fighting stance" text in `content/studio/game-systems.json` says the shield comes forward "to the side, so you still see the fighter", which is false for the shipped sergeant combat_idle (F-175, 1.26).

## Change
Reword the `system-combat-stances` "Fighting stance" body: the guard comes up, the shield comes forward and covers the body, the face stays visible over the shield rim. No other text changes.

## Acceptance criteria
- [ ] `content/studio/game-systems.json` no longer contains "so you still see the fighter"; the new body says the shield covers the body and the face stays visible.
- [ ] JSON parses; content/wiki tests that read game-systems.json pass (Gate 1).
- [ ] Edit host wiki page (`?tab=lore&chapter=systems&ref=system-combat-stances`) shows the new text.

## Out of scope
Gate changes for combat clips live in the private character pipeline (~/.claude/skills/game-character-3d), not this repo.

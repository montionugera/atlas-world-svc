---
title: "Quests at runtime"
id: F-146
status: refined
from_idea: I-162
---

# Quests at runtime

## Acceptance criteria

- [ ] `RuntimeQuestCatalog` loads all 28 authored story quests from `content/story/quests.json` (plus contract quests) and `QuestTracker` advances kill/collect/visit objectives at runtime, granting idempotent XP, gold, and item rewards upon completion (`server-rs/tests/quests_at_runtime_test.rs`).

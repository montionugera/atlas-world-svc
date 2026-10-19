---
title: "Idempotent server-only grants"
id: I-157
status: idea
---

# Idempotent server-only grants

## Acceptance criteria

- [ ] `GrantLedger` (`server-rs/src/systems/progression.rs`) enforces idempotent server-only grants keyed by grant ID (`kill:<mob_instance_id>`, `pickup:<drop_id>`): two players racing for the same `LootDrop` in the same tick yield at most one owner, and replaying a mob kill event grants experience and currency at most once (`server-rs/tests/idempotent_grants_test.rs`).

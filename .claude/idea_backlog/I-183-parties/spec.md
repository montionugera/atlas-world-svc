---
title: "Parties"
id: I-183
status: idea
---

# Parties

## Acceptance criteria

- [ ] Two or more players can form a party (`create_party`, `invite_to_party`, `accept_party_invite`) and query live party member snapshots (`sync_party_member_snapshots`) containing each member's current health, max health, level, position, and region ID.
- [ ] When a party member kills a mob (`grant_party_kill_rewards`), all alive party members in the same region within party XP-share range (`PARTY_SHARE_RADIUS = 300.0`) receive shared experience and kill credit idempotently.

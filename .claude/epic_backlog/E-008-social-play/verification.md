---
title: "Social play"
id: E-008
---

# How we will know E-008 works

Prose for humans. `scripts/epic-check.sh` implements these assertions; the
toolkit never parses this file.

## Assertions

1. Two signed-in players within 50 units exchange a chat message, and sending more than 5 messages per second triggers rate limiting.
2. A friend request is sent, accepted, and the friend shows as online in the client.
3. Two players form a party, share live health and position updates, and both get credit when one kills a mob.
4. A player uses find friend to navigate and transition into the region instance where their party friend is located.

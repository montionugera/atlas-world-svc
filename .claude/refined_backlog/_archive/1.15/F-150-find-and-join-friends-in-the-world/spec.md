---
title: "Find and join friends in the world"
id: F-150
status: refined
from_idea: I-184
---

# Find and join friends in the world

## Acceptance criteria

- [ ] A signed-in player can locate an online friend or party member (`locate_friend_in_world`) to retrieve their active region instance ID and world coordinates.
- [ ] Calling `join_friend_in_world` transitions an alive player into their friend's or party member's region instance near their friend's coordinates, and rejects requests when the target is neither an accepted friend nor a party member (or is offline).

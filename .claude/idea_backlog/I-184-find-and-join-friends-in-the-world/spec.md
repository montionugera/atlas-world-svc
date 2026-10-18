---
title: "Find and join friends in the world"
id: I-184
status: idea
---

# Find and join friends in the world

## Acceptance criteria

- [ ] A signed-in player can locate an online friend or party member (`locate_friend_in_world`) to retrieve their active region instance ID and world coordinates.
- [ ] Calling `join_friend_in_world` transitions an alive player into their friend's or party member's region instance near their friend's coordinates, and rejects requests when the target is neither an accepted friend nor a party member (or is offline).

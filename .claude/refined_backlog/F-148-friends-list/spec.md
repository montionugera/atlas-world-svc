---
title: "Friends list"
id: F-148
status: refined
from_idea: I-182
---

# Friends list

## Acceptance criteria

- [ ] A player can send a friend request to another player ID (`send_friend_request`), the recipient sees it in pending requests and accepts it (`accept_friend_request`), creating a bidirectional friendship.
- [ ] Querying a player's friends list (`list_friends_with_presence`) returns each accepted friend's online status and active region ID based on live session presence.

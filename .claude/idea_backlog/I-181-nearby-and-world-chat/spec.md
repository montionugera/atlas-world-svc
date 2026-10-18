---
title: "Nearby and world chat"
id: I-181
status: idea
---

# Nearby and world chat

## Acceptance criteria

- [ ] Two signed-in players within `50.0` world units (`NEARBY_CHAT_RADIUS = 50.0`) exchange a `Nearby` proximity chat message, while a third player outside `50.0` units does not receive the `Nearby` message; `World` channel messages are delivered to all signed-in players in the world.
- [ ] Per-sender token-bucket rate limiting (`MAX_CHAT_MESSAGES_PER_SECOND = 5`) rejects a 6th chat message sent within the same 1-second window without delivering it to recipients.

---
title: "Godot client on the Rust server"
id: E-009
---

# How we will know E-009 works

Prose for humans. `scripts/epic-check.sh` implements these assertions; the
toolkit never parses this file.

## Assertions

1. The Godot client joins a `server-rs` region and sees the same entities as the React test client.
2. Walking and stopping reconcile on the server's acknowledged input.
3. A fight can be played start to finish in the Godot client.

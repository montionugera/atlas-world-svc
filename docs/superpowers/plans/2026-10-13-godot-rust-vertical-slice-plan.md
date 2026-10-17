# Implementation Plan: Godot 4 + server-rs (Rust) Vertical Slice

> **Date:** 2026-10-13  
> **Spec Reference:** [`docs/superpowers/specs/2026-10-13-godot-rust-vertical-slice-spec.md`](file:///Users/pasitnusso/workspace/repos/atlas-world-svc/docs/superpowers/specs/2026-10-13-godot-rust-vertical-slice-spec.md)  
> **Status:** Pending Execution  

---

## Tasks Breakdown

### Task 1: FlatBuffers Codegen & Protocol Seam
* **Goal:** Generate C# FlatBuffers classes from `schemas/game_protocol.fbs`, add `Google.FlatBuffers` package to `GameClient.csproj`, and ensure clean compilation.
* **Outputs:**
  * `game-client/src/Protocol/` containing generated FlatBuffers C# bindings (`WorldSnapshot.cs`, `EntityDelta.cs`, etc.).
  * `scripts/codegen/gen_flatbuffers_csharp.sh` automated generation script.
  * Updated `GameClient.csproj` with `Google.FlatBuffers 25.2.10`.
* **Verification:** `dotnet build game-client/GameClient.csproj` builds green with 0 errors.

### Task 2: Native Godot WebSocket Client (`ServerRsConnection.cs`)
* **Goal:** Create a clean, event-driven network client using Godot's built-in `WebSocketPeer` that connects to `server-rs`, parses binary `WorldSnapshot` messages, and sends `ClientInput`.
* **Outputs:**
  * `game-client/src/Net/ServerRsConnection.cs`
  * `game-client/src/Net/PacketCodec.cs` (FlatBuffers byte buffer builder & reader helper)
* **Verification:** Unit/integration test verifying binary encoding of `ClientInput` and decoding of `WorldSnapshot`.

### Task 3: Anime Cel-Shader & Inverted-Hull Outlines
* **Goal:** Implement the Genshin Impact-style toon shader in Godot shading language (`.gdshader`) with step light bands and an inverted-hull black outline next_pass.
* **Outputs:**
  * `game-client/assets/shaders/cel_shader.gdshader`
  * `game-client/assets/shaders/outline.gdshader`
  * `game-client/assets/shaders/cel_material.tres`
* **Verification:** Compile and validate shaders via Godot headless runner.

### Task 4: Responsive Form & Chat Box UI
* **Goal:** Build the cross-platform Chat Box component with focus suppression in `PlayerController.cs` and mobile virtual keyboard offset handling.
* **Outputs:**
  * `game-client/src/UI/Widgets/ChatBox.cs`
  * `game-client/src/UI/Widgets/ChatBox.tscn`
  * Updated `game-client/src/Input/PlayerController.cs` with UI focus guard.
* **Verification:** Programmatic test checking focus state and movement suppression.

### Task 5: Integration & Verification
* **Goal:** Assemble the vertical slice scene (`VerticalSlice.tscn`) combining `ServerRsConnection`, 3D cel-shaded avatar, camera rig, and `ChatBox`.
* **Outputs:**
  * `game-client/scenes/VerticalSlice.tscn`
  * `game-client/scripts/tests/VerifyVerticalSlice.cs` (Headless runner test)
* **Verification:** Run `godot --headless --script ...` and `dotnet test/build` to verify complete green pass.

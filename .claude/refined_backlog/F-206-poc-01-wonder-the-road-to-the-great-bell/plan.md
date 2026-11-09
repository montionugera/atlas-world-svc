# F-206 (I-288) Implementation Plan — POC-01: Wonder — The Road to the Great Bell (00:00–02:30)

## Goal
Deliver the `00:00–02:30` **Wonder** pillar of `E-011` in `maro-bell`: framing *Tiny Human, Massive World* scale from the South Gate arrival (`(0, 0, 71)`) along the lantern road toward **The Great Bell** (`(0, 14, -66)`), placing **Pip** (`(-3, 0, 60)`) with discoverable greeting interaction alongside ambient **Reed** (`(3, 0, 62)`) and **Tovin** (`(4.5, 0, -50)`), wiring environmental audio (`sfx:bell_resonance`, `sfx:wind_ambient`, `sfx:footstep`), and showing a compact non-intrusive objective pill.

## Tasks

### Task 1: Environmental Audio Manifest Entries
- **Files:**
  - `game-client/assets/audio-manifest.json`
- **Changes:**
  - Add `"sfx:bell_resonance"`, `"sfx:bell_toll"`, `"sfx:wind_ambient"`, and `"sfx:footstep"` entries pointing to committed CC0 `.ogg` streams so `AudioRegistry` resolves and plays them in headless and windowed runs.

### Task 2: `MaroBellPocController` (Reveal Framing, Pip/Reed/Tovin NPCs, Audio & Objective UI)
- **Files:**
  - `game-client/src/World/MaroBellPocController.cs`
  - `game-client/src/VerticalSliceRoot.cs`
  - `game-client/src/World/PlaytestSandboxRoot.cs`
- **Changes:**
  - Create `MaroBellPocController : Node3D` managing the `maro-bell` POC experience:
    - `EvaluateGreatBellRevealComposition(UnifiedMapDocument doc, Vector3 spawnPos)`: validates foreground lanterns (`lantern-01`, `lantern-02`), unobstructed road path from `(0, 71)` to `(0, 60)`, Great Bell skyline sightline (`(0, 14, -66)` above village roofs), and flanking porcelain ribs (`porcelain-rib-01..06`).
    - Spawns **Pip** (`npc-pip` at `(-3, 0, 60)`), **Reed** (`npc-reed` at `(3, 0, 62)`), and **Tovin** (`npc-tovin` at `(4.5, 0, -50)`) with `EntityView` / `AnimationController` idle animations and overhead `Label3D` prompts.
    - Implements `TryInteractNearest(Vector3 playerPos)` / `InteractWithPip()` transitioning `ActiveBeat` from `"POC-00"` to `"POC-01"`, setting `PipGreeted = true`, displaying Pip's `q-maro-01` greeting line in a non-intrusive bottom dialogue toast, updating the compact objective pill (`ObjectiveText`), and syncing with `MaroBellPocDiagnosticsHud`.
    - Plays environmental audio (`sfx:bell_resonance`, `sfx:wind_ambient`, and walking `sfx:footstep` cadence).
  - Attach `MaroBellPocController` in `VerticalSliceRoot` and `PlaytestSandboxRoot` when on `maro-bell` and bind `Key.F` to `TryInteractNearest`.

### Task 3: Automated Verification (`MaroBellVerify` + `poc-maro-wonder.test.mjs`)
- **Files:**
  - `game-client/src/World/MaroBellVerify.cs`
  - `scripts/tests/poc-maro-wonder.test.mjs`
- **Changes:**
  - Extend `MaroBellVerify.cs` to instantiate `MaroBellPocController` and assert all 4 `POC-01` acceptance criteria (reveal composition, Pip/Reed/Tovin placement & animation, environmental audio & objective UI, and Pip greeting interaction advancing beat to `POC-01`).
  - Add `scripts/tests/poc-maro-wonder.test.mjs` testing the `POC-01` contract.

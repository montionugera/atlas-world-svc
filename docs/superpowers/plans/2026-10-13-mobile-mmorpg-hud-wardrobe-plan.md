# Implementation Plan: Mobile MMORPG HUD, Wardrobe & Equipment System

> **Date:** 2026-10-13  
> **Spec Reference:** [`docs/superpowers/specs/2026-10-13-mobile-mmorpg-hud-wardrobe-spec.md`](file:///Users/pasitnusso/workspace/repos/atlas-world-svc/docs/superpowers/specs/2026-10-13-mobile-mmorpg-hud-wardrobe-spec.md)  
> **Target:** Godot 4.7 (C# / .NET 8 NativeAOT) Client on iOS / iPad mini  
> **Status:** Completed & Deployed to Hardware  

---

## 1. File Structure & Responsibilities

| File Path | Responsibility | Status |
|:---|:---|:---|
| `game-client/src/UI/Widgets/PlayerFrame.cs` | Top-left player portrait, Level 90 badge, HP/SP progress bars with value labels. | Completed |
| `game-client/src/UI/Widgets/PlayerFrame.tscn` | Node scene for Player Frame with anchors and styling. | Completed |
| `game-client/src/UI/Widgets/TopBar.cs` | Top-right quick menu (`[🎒 Bag]`, `[👗 Wardrobe]`) + Minimap radar widget. | Completed |
| `game-client/src/UI/Widgets/TopBar.tscn` | TopBar scene anchored top-right. | Completed |
| `game-client/src/UI/Widgets/ChatBox.cs` | Dual-state mobile chat box: compact 1-line ticker + expandable full modal. | Completed |
| `game-client/src/UI/Widgets/ChatBox.tscn` | Dual-state chat scene anchored bottom-center. | Completed |
| `game-client/src/UI/Widgets/WardrobeModal.cs` | Split-screen Wardrobe & Equip modal: 3D interactive viewport + tabbed item grid. | Completed |
| `game-client/src/UI/Widgets/WardrobeModal.tscn` | Fullscreen modal scene with SubViewport and tabbed card container. | Completed |
| `game-client/src/VerticalSliceRoot.cs` | Master scene coordinator wiring HUD, Wardrobe modal, and Touch input. | Completed |
| `game-client/scenes/VerticalSlice.tscn` | Assembled vertical slice scene with layered CanvasLayers. | Completed |
| `README.md` | Architecture documentation update for Mobile MMORPG UI. | Completed |

---

## 2. Tasks Breakdown

### Task 1: Player Frame Component (`PlayerFrame.cs` & `.tscn`) - [x] Done
* **Files:**
  * `game-client/src/UI/Widgets/PlayerFrame.cs`
  * `game-client/src/UI/Widgets/PlayerFrame.tscn`
* **Details:**
  * Circular portrait background with avatar icon.
  * Level badge (`Lv. 90`) anchored to avatar border.
  * Dual ProgressBar controls:
    * HP Bar (Green `#48C774`) with text `14,850 / 14,850`.
    * SP Bar (Blue `#3273DC`) with text `3,200 / 3,200`.
  * Public method `SetStats(int hp, int maxHp, int sp, int maxSp, int level)`.
* **Verification:** Verified via zero-reflection NativeAOT compilation and Godot headless instantiation probe.

---

### Task 2: Minimap & Quick Actions TopBar (`TopBar.cs` & `.tscn`) - [x] Done
* **Files:**
  * `game-client/src/UI/Widgets/TopBar.cs`
  * `game-client/src/UI/Widgets/TopBar.tscn`
* **Details:**
  * Circular Minimap frame with location name (`"Atlas Spar"`) and coordinates (`"120, 240"`).
  * Quick-access icon buttons:
    * `[🎒 Bag]` (Inventory)
    * `[👗 Wardrobe]` (Equipment)
    * `[📜 Quests]`
  * Emits signals `BagPressed`, `WardrobePressed`, `QuestsPressed`.
* **Verification:** Verified via zero-reflection NativeAOT compilation and signal hookup in `VerticalSliceRoot`.

---

### Task 3: Dual-State Compact Mobile Chat Bar - [x] Done
* **Files:**
  * `game-client/src/UI/Widgets/ChatBox.cs`
  * `game-client/src/UI/Widgets/ChatBox.tscn`
* **Details:**
  * Added compact bottom ticker mode:
    * Translucent background pill (`offset_left=400, offset_bottom=-16, width=480, height=44`).
    * Fading preview with channel badge (`[System]`).
    * Tap to expand into full chat window with tabs (`[All]`, `[World]`, `[Party]`, `[System]`).
    * Close button `[✕]` collapses back to mini ticker.
* **Verification:** Verified state transitions and message submission via headless test probe.

---

### Task 4: Split-Screen Wardrobe & Equipment Modal - [x] Done
* **Files:**
  * `game-client/src/UI/Widgets/WardrobeModal.cs`
  * `game-client/src/UI/Widgets/WardrobeModal.tscn`
* **Details:**
  * Left 45%: `SubViewportContainer` + `SubViewport` containing a 3D avatar on a showcase pedestal with camera and omni lighting.
  * Dragging across the viewport triggers `avatar.RotateY(drag.Relative.X * 0.015f)` for 360° inspection.
  * Right 55%: Card grid with tabs:
    * `Weapons`, `Armor`, `Hair`, `Sets`.
    * Cards display item thumbnail, rarity border, name, and level requirement.
  * Bottom detail panel: Item stats (e.g. `+140 M.ATK`, `+65 P.ATK`), **[Try On]**, and **[Equip]** button.
  * Tapping **[Equip]** fires `EquipChanged` signal to update player avatar in real time.
* **Verification:** Verified interactive 360° touch rotation and tab switching via headless test probe.

---

### Task 5: Master Integration in `VerticalSlice.tscn` - [x] Done
* **Files:**
  * `game-client/src/VerticalSliceRoot.cs`
  * `game-client/scenes/VerticalSlice.tscn`
* **Details:**
  * Integrated `PlayerFrame`, `TopBar`, and `WardrobeModal` to CanvasLayer.
  * Wired `TopBar.BagPressed` and `TopBar.WardrobePressed` to open `WardrobeModal`.
  * Movement suppression when typing in chat or inspecting wardrobe.
  * Retained mobile touch action cluster (`[ATK]`, `[DASH]`, `[S1]`, `[S2]`) in bottom-right.
* **Verification:** Full compilation check with `dotnet build game-client/GameClient.csproj` (0 errors, 0 warnings).

---

### Task 6: Build, Pack, Sign & Deploy to iPad mini - [x] Done
* **Files:**
  * `AtlasWorld.pck`
  * `AtlasWorld.app`
  * `README.md`
* **Details:**
  * Packed `AtlasWorld.pck` via Godot headless CLI.
  * Published NativeAOT `GameClient.dylib` (`ExportRelease-ios-arm64`).
  * Built Xcode project targeting physical **Mont iPad mini** (`C495582C-FBA5-5944-BA03-85752117C2C5`).
  * Embedded and re-signed `GameClient.dylib` and `AtlasWorld.app` with Apple Development identity.
  * Installed via `xcrun devicectl device install app` and launched via `xcrun devicectl device process launch`.
  * Process confirmed running (PID 4794).
* **Verification:** App successfully installed, launched, and running on physical iPad mini hardware.

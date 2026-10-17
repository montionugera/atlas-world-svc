# Implementation Plan: Joymify Design System Integration for Mobile MMORPG UI

> **Date:** 2026-10-13  
> **Spec Reference:** [`docs/superpowers/specs/2026-10-13-joy-design-system-integration-spec.md`](file:///Users/pasitnusso/workspace/repos/atlas-world-svc/docs/superpowers/specs/2026-10-13-joy-design-system-integration-spec.md)  
> **Target:** Godot 4.7 / .NET 8 NativeAOT on iOS / iPad mini  
> **Status:** Completed & Deployed to Hardware  

---

## Tasks

### Task 1: Update `Design.cs` Tokens & Variants - [x] Done
* **File:** `game-client/src/UI/Design.cs`
* **Changes:**
  * Added resource bar colors (`HpFill`, `SpFill`, `ExpFill`).
  * Added mobile touch controls colors (`JoystickBase`, `JoystickBorder`, `JoystickHandle`, `SkillButtonBase`, `SkillButtonBorder`, `SkillButtonPrimary`).
  * Added modal & chat colors (`ModalOverlayBg`, `ChatTickerBg`).
  * Added variants (`HpBar`, `SpBar`, `ModalDialog`, `ChatTicker`, `ItemCard`).

### Task 2: Extend `ThemeBuilder.cs` & Register Variants - [x] Done
* **File:** `game-client/src/UI/ThemeBuilder.cs`
* **Changes:**
  * Added stylebox registrations for `HpBar` (Success fill) & `SpBar` (Info fill).
  * Added `ModalDialog` (Surface bg, Bronze500 border, R3 radius).
  * Added `ChatTicker` (ChatTickerBg, Border, R3 radius).
  * Added `ItemCard` (Well bg, Border, R2 radius).

### Task 3: Refactor Mobile UI Widgets to Joymify Design Tokens - [x] Done
* **Files:**
  * `game-client/src/UI/Widgets/PlayerFrame.cs`
  * `game-client/src/UI/Widgets/TopBar.cs`
  * `game-client/src/UI/Widgets/ChatBox.cs` & `.tscn`
  * `game-client/src/UI/Widgets/WardrobeModal.cs` & `.tscn`
  * `game-client/src/UI/Widgets/VirtualJoystick.cs`
  * `game-client/src/UI/Widgets/SkillButton.cs`
* **Changes:**
  * Eliminated all hardcoded hex strings and ad-hoc StyleBox overrides.
  * Bound all widget backgrounds, borders, labels, and buttons to `Design.Colors`, `Design.Space`, `Design.Radius`, `Design.Variants`, and `Design.RarityColor`.

### Task 4: Connect Theme in `VerticalSliceRoot.cs` - [x] Done
* **File:** `game-client/src/VerticalSliceRoot.cs`
* **Changes:**
  * Built runtime theme via `ThemeBuilder.Build()` and assigned it to all CanvasLayer UI controls during `_Ready()`.

### Task 5: Verify, Pack, Sign & Deploy to iPad Mini - [x] Done
* **Changes:**
  * Compiled C# project with `dotnet build` (0 errors).
  * Exported `AtlasWorld.pck` via Godot headless CLI.
  * Published NativeAOT `GameClient.dylib` (`ExportRelease-ios-arm64`).
  * Built Xcode project with `xcodebuild`.
  * Ran `scripts/deploy_ios.py` to embed and sign dylibs and bundle with Apple Development certificate.
  * Installed on Mont iPad mini via `xcrun devicectl device install app`.
  * Launched via `xcrun devicectl device process launch`.
  * Verified running process: PID 5731.

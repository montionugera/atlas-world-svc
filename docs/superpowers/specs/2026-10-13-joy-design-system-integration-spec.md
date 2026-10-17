# Spec: Joymify Design System Integration for Mobile MMORPG UI

> **Date:** 2026-10-13  
> **Author:** Antigravity  
> **Status:** Draft -> Approved  
> **Scope:** `game-client/src/UI/Design.cs`, `ThemeBuilder.cs`, and mobile widgets (`PlayerFrame`, `TopBar`, `ChatBox`, `WardrobeModal`, `MobileControlsOverlay`, `VirtualJoystick`, `SkillButton`)

---

## 1. Objective & Principles

Unify all mobile MMORPG UI components into the official **Joymify Design System** (`Design.cs` and `ThemeBuilder.cs`).

### Core Design Laws:
1. **Zero Hardcoded Colors:** All UI elements MUST draw colors exclusively from `Design.Colors`, `Design.Palette`, or `Design.RarityColor`. No ad-hoc hex values (`#...`) or raw `Color.FromHtml(...)` inside widget classes.
2. **Standard Spacing Scale (4px Base):** All margins, paddings, and separations MUST use `Design.Space` constants (`S1=4`, `S2=8`, `S3=12`, `S4=16`, `S5=24`, `S6=32`).
3. **Harmonized Radius Scale:** All rounded borders MUST conform to `Design.Radius` (`R1=6`, `R2=10`, `R3=16`).
4. **Theme Variation Binding:** Utilize Godot Theme variations (`ThemeTypeVariation`) for buttons (`PrimaryButton`, `GhostButton`, `DangerButton`), panels (`Card`, `Well`, `ModalDialog`, `ChatTicker`), and progress bars (`HpBar`, `SpBar`).
5. **100% NativeAOT Safe:** Pure compile-time constants and strongly-typed styling without reflection or dynamic assemblies.

---

## 2. Token Architecture (`Design.cs`)

### 2.1 Color Additions to `Design.Colors`
- **Resource Bars:**
  - `HpFill`: `Palette.Success` (`#4ADE80`)
  - `SpFill`: `Palette.Info` (`#60A5FA`)
  - `ExpFill`: `Palette.Warn` (`#FBBF24`)
- **Touch Controls:**
  - `JoystickBase`: `new Color(Palette.Navy900, 0.60f)`
  - `JoystickBorder`: `Palette.Bronze500` (`#CD7F32`)
  - `JoystickHandle`: `Palette.Gold500` (`#FFD700`)
  - `SkillButtonPrimary`: `Palette.Bronze500` (`#CD7F32`)
  - `SkillButtonBorder`: `Palette.Gold500` (`#FFD700`)
  - `SkillButtonBase`: `new Color(Palette.Navy700, 0.85f)`
- **Modals & Overlays:**
  - `ModalOverlayBg`: `new Color(Palette.Navy900, 0.82f)`
  - `ChatTickerBg`: `new Color(Palette.Navy900, 0.72f)`

### 2.2 Variation Names (`Design.Variants`)
- `HpBar = "HpBar"` (variation of `ProgressBar`)
- `SpBar = "SpBar"` (variation of `ProgressBar`)
- `ModalDialog = "ModalDialog"` (variation of `PanelContainer`)
- `ChatTicker = "ChatTicker"` (variation of `PanelContainer`)
- `ItemCard = "ItemCard"` (variation of `PanelContainer`)

---

## 3. Theme Extensions (`ThemeBuilder.cs`)

`ThemeBuilder.Build()` will register:
1. `HpBar` & `SpBar` styleboxes on `ProgressBar`:
   - Background: `Filled(Design.Colors.Well, Design.Radius.R1, Design.Colors.Border, 1)`
   - Fill: `Filled(Design.Colors.HpFill, Design.Radius.R1)` / `Filled(Design.Colors.SpFill, Design.Radius.R1)`
2. `ModalDialog` on `PanelContainer`:
   - `Filled(Design.Colors.Surface, Design.Radius.R3, Design.Colors.BorderStrong, 2)`
3. `ChatTicker` on `PanelContainer`:
   - `Filled(Design.Colors.ChatTickerBg, Design.Radius.R3, Design.Colors.Border, 1)`

---

## 4. Component Refactoring Plan

| Component | Current State | Target Joymify Design State |
|:---|:---|:---|
| `PlayerFrame` | Hardcoded colors & sizes | `Design.Colors.TextPrimary`, `Design.Colors.Primary` for Level, `HpBar` / `SpBar` theme variations. |
| `TopBar` | Ad-hoc radar styling | `Design.Colors.Well` radar backdrop, `Design.Colors.BorderStrong` gold/bronze outer ring, `GhostButton` navigation buttons. |
| `ChatBox` | Ad-hoc StyleBoxFlat & colors | `ChatTicker` theme stylebox, `Design.Colors.TextPrimary`/`TextMuted`, `LineEdit` inheriting theme, `PrimaryButton` for Send. |
| `WardrobeModal` | Inline StyleBoxes & raw hex tints | `ModalDialog` panel, `Design.RarityColor` for item borders, `Design.Colors.Well` item card background, `Design.Space` margins. |
| `VirtualJoystick` | Hardcoded RGBA colors | Defaults set to `Design.Colors.JoystickBase`, `JoystickBorder`, `JoystickHandle`. |
| `SkillButton` | Hardcoded RGBA colors | Defaults set to `Design.Colors.SkillButtonPrimary`, `SkillButtonBorder`. |
| `VerticalSliceRoot` | No theme applied to root | Generates `ThemeBuilder.Build()` and assigns it to all CanvasLayer UI controls at `_Ready()`. |

---

## 5. Verification Gate
1. `dotnet build game-client/GameClient.csproj` with zero warnings / errors.
2. Run `GenerateTheme.tscn` to regenerate `res://ui/atlas_theme.tres`.
3. Headless probe verifies that widgets render using Joymify design tokens without fallback warnings.
4. Export `.pck`, publish NativeAOT, build Xcode, deploy and launch on Mont iPad mini (`C495582C-FBA5-5944-BA03-85752117C2C5`).

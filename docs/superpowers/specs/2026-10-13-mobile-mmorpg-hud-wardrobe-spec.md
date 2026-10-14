# Specification: Mobile MMORPG HUD, Wardrobe & Equipment System

> **Date:** 2026-10-13  
> **Status:** Draft / Ready for Implementation  
> **Target:** Godot 4.7 (C# / .NET 8 NativeAOT) Client on iOS / iPad mini  
> **Reference Aesthetic:** Ragnarok Origin / ROX / Genshin Impact Mobile MMORPG UI  

---

## 1. Executive Summary

This specification outlines the architecture, layout, and visual components for the **Atlas World Mobile MMORPG UI**, directly modeled after modern anime mobile MMORPG conventions (Ragnarok Origin / ROX style):

1. **In-Game HUD:**
   - **Top-Left:** Player portrait frame, Level badge, Green HP bar, Blue SP/MP bar.
   - **Top-Right:** Circular minimap with location coordinates + Top Quick Action Bar (`[🎒 Bag]`, `[👗 Wardrobe]`, `[📜 Quests]`).
   - **Left-Center:** Compact transparent Quest Tracker card.
   - **Bottom-Left:** Streamlined dual-state Chat Bar (compact horizontal ticker that expands into full channel chat on tap).
   - **Bottom-Right:** Mobile radial skill wheel with large primary attack button, orbiting skill buttons, and numerical cooldown sweeps.
2. **Split-Screen Wardrobe & Equipment Modal (Screenshot 3 Reference):**
   - **Left 45%:** Interactive 3D Character SubViewport with 360° touch rotation preview.
   - **Right 55%:** Tabbed equipment cards (`[ชุดเซ็ต Sets]`, `[ทรงผม Hair]`, `[อาวุธ Weapons]`, `[ชุด Armor]`, `[ประดับ Acc]`) with rarity styling, stat diffs, and instant **[Equip]** / **[Try On]** buttons.
3. **Core Architectural Standards:**
   - Decoupled, signal-driven architecture (`Controller -> Service -> Widget`).
   - 100% NativeAOT safe (zero reflection, zero dynamic emit).
   - Responsive canvas scaling with `mode="canvas_items"` and `aspect="expand"` to preserve crispness across iPad mini and high-DPI displays.
   - Offline fallback: Fully interactive with catalog presets even when offline or disconnected.

---

## 2. Visual Architecture & Layout

```mermaid
flowchart TD
    subgraph HUD ["Main In-Game HUD (CanvasLayer 5)"]
        PL_FRAME["Top-Left: Player Frame\n(Avatar, Lv. 90, HP/SP Bars)"]
        MINIMAP["Top-Right: Minimap & Quick Menu\n([🎒 Bag], [👗 Wardrobe], [📜 Quests])"]
        QUEST_BOX["Mid-Left: Quest Tracker\n([Journey] Objective)"]
        CHAT_TICKER["Bottom-Left: Mini Chat Ticker\n(Translucent 2-line log + Expand button)"]
        V_JOY["Bottom-Left: Virtual Joystick\n(Clamped Touch Thumbstick)"]
        SKILL_CLUSTER["Bottom-Right: Radial Action Cluster\n([ATK], [DASH], [S1], [S2], Cooldowns)"]
    end

    subgraph WARDROBE ["Wardrobe & Equipment Modal (CanvasLayer 15)"]
        MODAL_SCRIM["Translucent Scrim Backdrop"]
        CURRENCY_BAR["Top Bar: Currencies & Close [✕]"]
        VIEWPORT_3D["Left Panel: 3D Character SubViewport\n(Touch Drag to Rotate Avatar)"]
        TAB_BAR["Right Panel: Category Tabs\n(Weapons, Armor, Hair, Sets)"]
        ITEM_GRID["Item Card Grid\n(Rarity borders, thumbnails)"]
        DETAIL_TRAY["Bottom Details Tray\n(Stats diff, [Try On], [Equip])"]
    end

    subgraph CHAT_FULL ["Full Chat Modal (CanvasLayer 12)"]
        CHAT_TABS["Channel Tabs: [All] [World] [Party] [System]"]
        CHAT_MSGS["RichTextLabel Message History"]
        CHAT_INPUT["LineEdit + Virtual Keyboard Adapter"]
    end

    MINIMAP -->|Tap [🎒 Bag] / [👗 Wardrobe]| WARDROBE
    CHAT_TICKER -->|Tap Chat Ticker| CHAT_FULL
```

---

## 3. Component Specifications

### 3.1 Player Frame (`PlayerFrame.cs` & `.tscn`)
- **Avatar Circle:** Stylized circular frame with inner portrait thumbnail and golden rim.
- **Level Badge:** Golden badge positioned at top-left corner (`Lv. 90`).
- **Resource Bars:**
  - **HP Bar:** Custom stylized green fill (`#48C774`) with white highlight sheen, displaying `14,850 / 14,850`.
  - **SP/MP Bar:** Cyan/blue fill (`#3273DC`) displaying `3,200 / 3,200`.
- **Signal API:**
  - `UpdateStats(int currentHp, int maxHp, int currentSp, int maxSp, int level)`

### 3.2 Dual-State Mobile Chat (`ChatWidget.cs`)
- **Collapsed Mode:**
  - Size: 340px width × 54px height.
  - Background: Semi-transparent dark pill container (`rgba(16, 20, 30, 0.65)`).
  - Content: 2-line fading message ticker with channel pill (`[World]`, `[System]`).
  - Tap detector: Tapping anywhere on the ticker expands the full chat.
- **Expanded Mode:**
  - Size: 440px width × 280px height.
  - Channel tabs: `[All]`, `[World]`, `[Party]`, `[System]`.
  - Input field with iOS virtual keyboard detection (`DisplayServer.VirtualKeyboardGetHeight()`).
  - Movement suppression active while expanded or focused.

### 3.3 Wardrobe & Equipment Modal (`WardrobeModal.cs` & `.tscn`)
- **SubViewport 3D Rig:**
  - Standalone `SubViewport` containing a focused `Camera3D`, directional key light, fill light, and a clone of the player avatar mesh standing on a subtle pedestal.
  - `_GuiInput` on the viewport container tracks `InputEventScreenDrag` (X-axis delta) and rotates the character avatar Y-axis (`avatar.RotateY(deltaX * 0.01f)`).
- **Item Grid:**
  - Tab buttons: `Sets`, `Hair`, `Weapons`, `Armor`, `Accessories`.
  - Populated with items from `Catalog.cs`.
  - Rarity borders:
    - Common: `#A0AEC0`
    - Uncommon: `#48BB78`
    - Rare: `#4299E1`
    - Epic: `#9F7AEA`
    - Legendary: `#ECC94B`
- **Equip Action:**
  - Tapping an item highlights the card and updates the 3D character in the SubViewport immediately (live try-on).
  - Tapping **[Equip]** persists the selection to the active equipment slot and updates the player avatar in the live game world.

---

## 4. Technical Constraints & Good Practice

1. **NativeAOT & iOS Compliance:**
   - All models and structs must avoid reflection, `Type.GetType()`, or runtime code emit.
   - Use strongly typed signals and explicit serialization.
2. **Touch Ergonomics:**
   - Minimum touch target for any interactive button is 44×44 pt.
   - Clustered buttons (radial skill buttons) must have spacing to prevent mis-taps.
3. **Responsive Viewport Support:**
   - Layout anchors must use Godot's fractional presets (`anchors_preset`) with container sizing flags, ensuring flawless rendering on iPad mini (8.3" Retina, 3:2 ratio) as well as 16:9 phones.

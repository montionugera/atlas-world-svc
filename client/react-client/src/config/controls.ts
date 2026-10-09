import type { DebugToggles } from "../utils/debugTools";
import { PLAYER_WEAPON_OPTIONS } from "./playerWeapons";
import { SKILL_DEFINITIONS, SkillConfig } from "./skills";

export interface LegendEntry {
  group: "base" | "skill" | "weapon" | "debug";
  keys: string;
  action: string;
}

/** Bindings hard-wired in useKeyboardControls / the canvas mouse handlers. */
export const BASE_BINDINGS: readonly LegendEntry[] = [
  { group: "base", keys: "WASD / Arrows", action: "Move" },
  { group: "base", keys: "Space / L-Click", action: "Attack" },
  { group: "base", keys: "Space / Click (dead)", action: "Respawn" },
];

export interface DebugBinding {
  /** Lower-case `KeyboardEvent.key`. */
  key: string;
  keyLabel: string;
  action: string;
  toggle: keyof DebugToggles;
}

export const DEBUG_BINDINGS: readonly DebugBinding[] = [
  { key: "`", keyLabel: "`", action: "Debug readout", toggle: "overlay" },
  { key: "g", keyLabel: "G", action: "World debug draw", toggle: "world" },
  { key: "t", keyLabel: "T", action: "Terrain overlay", toggle: "terrain" },
  {
    key: "p",
    keyLabel: "P",
    action: "Local prediction",
    toggle: "prediction",
  },
  { key: "m", keyLabel: "M", action: "Minimap", toggle: "minimap" },
  { key: "h", keyLabel: "H", action: "Play mode (hide UI)", toggle: "focus" },
];

export function debugToggleForKey(key: string): keyof DebugToggles | null {
  const k = key.toLowerCase();
  return DEBUG_BINDINGS.find((d) => d.key === k)?.toggle ?? null;
}

/** True when a modifier is held, so a debug key must not fire (Shift also dashes). */
export function hasModifierKey(e: {
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}): boolean {
  return e.ctrlKey || e.metaKey || e.altKey || e.shiftKey;
}

/** Every control the tester has, generated from the live skill / weapon / debug config. */
export function buildControlsLegend(
  skills: Record<string, SkillConfig> = SKILL_DEFINITIONS,
): LegendEntry[] {
  return [
    ...BASE_BINDINGS,
    ...Object.values(skills)
      .sort((a, b) => a.slot - b.slot)
      .map((s): LegendEntry => ({
        group: "skill",
        keys: s.keyLabel,
        action: s.name,
      })),
    ...PLAYER_WEAPON_OPTIONS.map((w): LegendEntry => ({
      group: "weapon",
      keys: w.hotkey,
      action: w.label,
    })),
    ...DEBUG_BINDINGS.map((d): LegendEntry => ({
      group: "debug",
      keys: d.keyLabel,
      action: d.action,
    })),
  ];
}

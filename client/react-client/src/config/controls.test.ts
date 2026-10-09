import { renderHook } from "@testing-library/react";
import { useKeyboardControls } from "../hooks/useKeyboardControls";
import {
  BASE_BINDINGS,
  DEBUG_BINDINGS,
  buildControlsLegend,
  debugToggleForKey,
} from "./controls";
import { PLAYER_WEAPON_OPTIONS } from "./playerWeapons";
import { SKILL_DEFINITIONS } from "./skills";

const press = (k: string) =>
  window.dispatchEvent(new KeyboardEvent("keydown", { key: k }));

describe("buildControlsLegend", () => {
  const legend = buildControlsLegend();

  it("lists every skill with its configured key", () => {
    for (const skill of Object.values(SKILL_DEFINITIONS)) {
      expect(legend).toContainEqual({
        group: "skill",
        keys: skill.keyLabel,
        action: skill.name,
      });
    }
  });

  it("lists every weapon hotkey and every debug toggle", () => {
    for (const w of PLAYER_WEAPON_OPTIONS) {
      expect(legend).toContainEqual({
        group: "weapon",
        keys: w.hotkey,
        action: w.label,
      });
    }
    for (const d of DEBUG_BINDINGS) {
      expect(legend).toContainEqual({
        group: "debug",
        keys: d.keyLabel,
        action: d.action,
      });
    }
  });

  it("starts with movement and attack", () => {
    expect(legend.slice(0, BASE_BINDINGS.length)).toEqual([...BASE_BINDINGS]);
  });

  it("gives debug toggles keys nothing else is bound to", () => {
    const taken = [
      ..."wasdf".split(""),
      " ",
      "shift",
      ...Object.values(SKILL_DEFINITIONS).map((s) => s.keyLabel.toLowerCase()),
      ...PLAYER_WEAPON_OPTIONS.map((w) => w.hotkey),
    ];
    for (const d of DEBUG_BINDINGS) expect(taken).not.toContain(d.key);
    expect(new Set(DEBUG_BINDINGS.map((d) => d.key)).size).toBe(
      DEBUG_BINDINGS.length,
    );
  });
});

describe("debugToggleForKey", () => {
  it("maps each debug key (any case) to its toggle and ignores the rest", () => {
    for (const d of DEBUG_BINDINGS) {
      expect(debugToggleForKey(d.key)).toBe(d.toggle);
      expect(debugToggleForKey(d.key.toUpperCase())).toBe(d.toggle);
    }
    expect(debugToggleForKey("w")).toBeNull();
    expect(debugToggleForKey("1")).toBeNull();
  });
});

// The legend is only trustworthy if the keys it prints really drive the input hook.
describe("legend keys match the real key handler", () => {
  function setup() {
    const sendPlayerAction = jest.fn();
    const switchWeapon = jest.fn();
    renderHook(() =>
      useKeyboardControls({
        updatePlayerInput: jest.fn(),
        sendPlayerAction,
        switchWeapon,
      }),
    );
    return { sendPlayerAction, switchWeapon };
  }

  it.each(Object.values(SKILL_DEFINITIONS).map((s) => [s.keyLabel, s.id]))(
    "key %s triggers %s",
    (keyLabel, skillId) => {
      const { sendPlayerAction } = setup();
      press(keyLabel);
      expect(sendPlayerAction).toHaveBeenCalledWith(
        "useSkill",
        true,
        expect.objectContaining({ skillId }),
      );
    },
  );

  it.each(PLAYER_WEAPON_OPTIONS.map((w) => [w.hotkey, w.id]))(
    "key %s equips %s",
    (hotkey, weaponId) => {
      const { switchWeapon } = setup();
      press(hotkey);
      expect(switchWeapon).toHaveBeenCalledWith(weaponId);
    },
  );

  it("debug keys trigger no gameplay action", () => {
    const { sendPlayerAction, switchWeapon } = setup();
    for (const d of DEBUG_BINDINGS) press(d.key);
    expect(sendPlayerAction).not.toHaveBeenCalled();
    expect(switchWeapon).not.toHaveBeenCalled();
  });
});

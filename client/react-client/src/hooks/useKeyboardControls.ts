import { useEffect, useRef } from "react";

interface UseKeyboardControlsProps {
  updatePlayerInput: (vx: number, vy: number) => void;
  sendPlayerAction?: (action: string, pressed: boolean, options?: any) => void;
  switchWeapon?: (weaponId: string) => void;
  mousePositionRef?: React.MutableRefObject<{ x: number; y: number }>;
  respawn?: () => void;
  isDead?: boolean;
}

export const useKeyboardControls = ({
  updatePlayerInput,
  sendPlayerAction,
  switchWeapon,
  mousePositionRef,
  respawn,
  isDead,
}: UseKeyboardControlsProps) => {
  const pressedKeysRef = useRef<Set<string>>(new Set());
  const latestPropsRef = useRef({
    updatePlayerInput,
    sendPlayerAction,
    switchWeapon,
    mousePositionRef,
    respawn,
    isDead,
  });

  useEffect(() => {
    latestPropsRef.current = {
      updatePlayerInput,
      sendPlayerAction,
      switchWeapon,
      mousePositionRef,
      respawn,
      isDead,
    };
  }, [
    updatePlayerInput,
    sendPlayerAction,
    switchWeapon,
    mousePositionRef,
    respawn,
    isDead,
  ]);

  useEffect(() => {
    const updateMovement = () => {
      let vx = 0,
        vy = 0;
      const keys = pressedKeysRef.current;

      // Check all currently pressed keys
      // Note: Keys are normalized to lowercase in handleKeyDown/Up
      if (keys.has("arrowup") || keys.has("w")) {
        vy = -1;
      }
      if (keys.has("arrowdown") || keys.has("s")) {
        vy = 1;
      }
      if (keys.has("arrowleft") || keys.has("a")) {
        vx = -1;
      }
      if (keys.has("arrowright") || keys.has("d")) {
        vx = 1;
      }

      // Normalize vector if moving diagonally
      if (vx !== 0 && vy !== 0) {
        const length = Math.sqrt(vx * vx + vy * vy);
        vx /= length;
        vy /= length;
      }

      latestPropsRef.current.updatePlayerInput(vx * 2, vy * 2); // Apply speed multiplier here
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase(); // Normalize!
      const props = latestPropsRef.current;

      // Prevent page scrolling on arrow keys or space
      if (
        ["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)
      ) {
        event.preventDefault();
      }

      // Clear stuck modifier keys if browser reports them inactive
      if (!event.metaKey) pressedKeysRef.current.delete("meta");
      if (!event.ctrlKey) pressedKeysRef.current.delete("control");
      if (!event.shiftKey) pressedKeysRef.current.delete("shift");
      if (!event.altKey) pressedKeysRef.current.delete("alt");

      if (event.repeat) return; // Ignore repeat events to prevent spamming

      pressedKeysRef.current.add(key);
      updateMovement();

      // Handle attack or respawn input
      if (event.code === "Space" || event.key === " ") {
        if (props.isDead && props.respawn) {
          props.respawn();
        } else if (props.sendPlayerAction) {
          props.sendPlayerAction("attack", true);
        }
      }

      // Handle Skill 1 (Key 1)
      if (
        (key === "1" || event.code === "Digit1" || event.code === "Numpad1") &&
        props.sendPlayerAction
      ) {
        (window as any).__lastSkillPressed = "skill_1";
        const mousePos = props.mousePositionRef?.current;
        props.sendPlayerAction("useSkill", true, {
          skillId: "skill_1",
          x: mousePos?.x,
          y: mousePos?.y,
        });
      }

      // Handle Skill 2 (Key 2)
      if (
        (key === "2" || event.code === "Digit2" || event.code === "Numpad2") &&
        props.sendPlayerAction
      ) {
        (window as any).__lastSkillPressed = "skill_2";
        const mousePos = props.mousePositionRef?.current;
        props.sendPlayerAction("useSkill", true, {
          skillId: "skill_2",
          x: mousePos?.x,
          y: mousePos?.y,
        });
      }

      // Handle Skill 3 (Key 3)
      if (
        (key === "3" || event.code === "Digit3" || event.code === "Numpad3") &&
        props.sendPlayerAction
      ) {
        (window as any).__lastSkillPressed = "skill_3";
        const mousePos = props.mousePositionRef?.current;
        props.sendPlayerAction("useSkill", true, {
          skillId: "skill_3",
          x: mousePos?.x,
          y: mousePos?.y,
        });
      }

      // Handle Skill 4 (Key 4)
      if (
        (key === "4" || event.code === "Digit4" || event.code === "Numpad4") &&
        props.sendPlayerAction
      ) {
        (window as any).__lastSkillPressed = "skill_4";
        const mousePos = props.mousePositionRef?.current;
        props.sendPlayerAction("useSkill", true, {
          skillId: "skill_4",
          x: mousePos?.x,
          y: mousePos?.y,
        });
      }

      // Weapons 5–9 (skills use 1–4)
      if (props.switchWeapon) {
        if (key === "5" || event.code === "Digit5")
          props.switchWeapon("basic_sword");
        if (key === "6" || event.code === "Digit6")
          props.switchWeapon("magic_staff");
        if (key === "7" || event.code === "Digit7")
          props.switchWeapon("great_bow");
        if (key === "8" || event.code === "Digit8")
          props.switchWeapon("scythe");
        if (key === "9" || event.code === "Digit9")
          props.switchWeapon("dagger");
      }

      // Handle Dash (Shift) -> Now triggers skill_dash
      if (
        (key === "shift" ||
          event.code === "ShiftLeft" ||
          event.code === "ShiftRight") &&
        props.sendPlayerAction
      ) {
        (window as any).__lastSkillPressed = "skill_dash";
        props.sendPlayerAction("useSkill", true, { skillId: "skill_dash" });
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase(); // Normalize!
      const props = latestPropsRef.current;
      pressedKeysRef.current.delete(key);

      if (!event.metaKey) pressedKeysRef.current.delete("meta");
      if (!event.ctrlKey) pressedKeysRef.current.delete("control");
      if (!event.shiftKey) pressedKeysRef.current.delete("shift");
      if (!event.altKey) pressedKeysRef.current.delete("alt");

      updateMovement();

      // Handle attack release
      if (
        (event.code === "Space" || event.key === " ") &&
        props.sendPlayerAction
      ) {
        props.sendPlayerAction("attack", false);
      }

      // Handle trap release
      if (key === "f" && props.sendPlayerAction) {
        props.sendPlayerAction("useItem", false);
      }
    };

    const handleBlur = () => {
      const props = latestPropsRef.current;
      // Clear all keys when window loses focus to prevent "stuck" keys
      pressedKeysRef.current.clear();
      updateMovement();
      if (props.sendPlayerAction) {
        props.sendPlayerAction("attack", false);
        props.sendPlayerAction("useItem", false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleBlur);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleBlur);
    };
  }, []);

  // Return debug info
  return {
    pressedKeys: pressedKeysRef,
  };
};

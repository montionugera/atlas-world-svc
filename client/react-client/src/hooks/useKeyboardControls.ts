import { useEffect, useRef } from 'react';

interface UseKeyboardControlsProps {
  updatePlayerInput: (vx: number, vy: number) => void;
  sendPlayerAction?: (action: string, pressed: boolean, options?: any) => void;
  switchWeapon?: (weaponId: string) => void;
  mousePositionRef?: React.MutableRefObject<{ x: number, y: number }>;
}

export const useKeyboardControls = ({ updatePlayerInput, sendPlayerAction, switchWeapon, mousePositionRef }: UseKeyboardControlsProps) => {
  const pressedKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const updateMovement = () => {
      let vx = 0, vy = 0;
      const keys = pressedKeysRef.current;
      
      // Check all currently pressed keys
      // Note: Keys are normalized to lowercase in handleKeyDown/Up
      if (keys.has('arrowup') || keys.has('w')) {
        vy = -1;
      }
      if (keys.has('arrowdown') || keys.has('s')) {
        vy = 1;
      }
      if (keys.has('arrowleft') || keys.has('a')) {
        vx = -1;
      }
      if (keys.has('arrowright') || keys.has('d')) {
        vx = 1;
      }
      
      // Normalize vector if moving diagonally
      if (vx !== 0 && vy !== 0) {
        const length = Math.sqrt(vx * vx + vy * vy);
        vx /= length;
        vy /= length;
      }
      
      updatePlayerInput(vx * 2, vy * 2); // Apply speed multiplier here
    };
    
    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase(); // Normalize!

      // Prevent page scrolling on arrow keys or space
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key)) {
        event.preventDefault();
      }

      // Clear stuck modifier keys if browser reports them inactive
      if (!event.metaKey) pressedKeysRef.current.delete('meta');
      if (!event.ctrlKey) pressedKeysRef.current.delete('control');
      if (!event.shiftKey) pressedKeysRef.current.delete('shift');
      if (!event.altKey) pressedKeysRef.current.delete('alt');

      if (event.repeat) return; // Ignore repeat events to prevent spamming
      
      pressedKeysRef.current.add(key);
      updateMovement();
      
      // Handle attack input
      if ((event.code === 'Space' || event.key === ' ') && sendPlayerAction) {
        sendPlayerAction('attack', true);
      }

      // Handle Skill 1 (Key 1)
      if (key === '1' && sendPlayerAction) {
        const mousePos = mousePositionRef?.current;
        sendPlayerAction('useSkill', true, { 
            skillId: 'skill_1',
            x: mousePos?.x,
            y: mousePos?.y
        });
      }

      // Handle Skill 2 (Key 2)
      if (key === '2' && sendPlayerAction) {
        const mousePos = mousePositionRef?.current;
        sendPlayerAction('useSkill', true, { 
            skillId: 'skill_2',
            x: mousePos?.x,
            y: mousePos?.y
        });
      }
      
      // Handle Skill 3 (Key 3)
      if (key === '3' && sendPlayerAction) {
        const mousePos = mousePositionRef?.current;
        sendPlayerAction('useSkill', true, { 
            skillId: 'skill_3',
            x: mousePos?.x,
            y: mousePos?.y
        });
      }

      // Handle Skill 4 (Key 4)
      if (key === '4' && sendPlayerAction) {
        const mousePos = mousePositionRef?.current;
        sendPlayerAction('useSkill', true, { 
            skillId: 'skill_4',
            x: mousePos?.x,
            y: mousePos?.y
        });
      }

      // Weapons 5–9 (skills use 1–4)
      if (switchWeapon) {
        if (key === '5') switchWeapon('basic_sword');
        if (key === '6') switchWeapon('magic_staff');
        if (key === '7') switchWeapon('great_bow');
        if (key === '8') switchWeapon('scythe');
        if (key === '9') switchWeapon('dagger');
      }

      // Handle Dash (Shift) -> Now triggers skill_dash
      if (key === 'shift' && sendPlayerAction) {
         sendPlayerAction('useSkill', true, { skillId: 'skill_dash' })
      }
    };
    
    const handleKeyUp = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase(); // Normalize!
      pressedKeysRef.current.delete(key);

      if (!event.metaKey) pressedKeysRef.current.delete('meta');
      if (!event.ctrlKey) pressedKeysRef.current.delete('control');
      if (!event.shiftKey) pressedKeysRef.current.delete('shift');
      if (!event.altKey) pressedKeysRef.current.delete('alt');

      updateMovement();
      
      // Handle attack release
      if ((event.code === 'Space' || event.key === ' ') && sendPlayerAction) {
        sendPlayerAction('attack', false);
      }
      
      // Handle trap release
      if ((key === 'f') && sendPlayerAction) {
        sendPlayerAction('useItem', false);
      }
    };
    
    const handleBlur = () => {
      // Clear all keys when window loses focus to prevent "stuck" keys
      pressedKeysRef.current.clear();
      updateMovement();
      if (sendPlayerAction) {
          sendPlayerAction('attack', false);
          sendPlayerAction('useItem', false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleBlur);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleBlur);
    };
  }, [updatePlayerInput, sendPlayerAction, switchWeapon, mousePositionRef]);

  // Return debug info
  return {
    pressedKeys: pressedKeysRef
  };
};

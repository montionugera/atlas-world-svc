import { useEffect, useRef } from 'react';

interface UseKeyboardControlsProps {
  updatePlayerInput: (vx: number, vy: number) => void;
  sendPlayerAction?: (action: string, pressed: boolean, options?: any) => void;
  mousePositionRef?: React.MutableRefObject<{ x: number, y: number }>;
}

export const useKeyboardControls = ({ updatePlayerInput, sendPlayerAction, mousePositionRef }: UseKeyboardControlsProps) => {
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
      if (event.repeat) return; // Ignore repeat events to prevent spamming
      
      const key = event.key.toLowerCase(); // Normalize!
      pressedKeysRef.current.add(key);
      updateMovement();
      
      
      // Handle attack input
      if ((event.code === 'Space' || event.key === ' ') && sendPlayerAction) {
        event.preventDefault(); // Prevent page scroll
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

      // Handle Dash (Shift) -> Now triggers skill_dash
      if (key === 'shift' && sendPlayerAction) {
         sendPlayerAction('useSkill', true, { skillId: 'skill_dash' })
      }
    };
    
    const handleKeyUp = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase(); // Normalize!
      pressedKeysRef.current.delete(key);
      updateMovement();
      
      // Handle attack release
      if ((event.code === 'Space' || event.key === ' ') && sendPlayerAction) {
        sendPlayerAction('attack', false);
      }
      
      // Handle trap release
      if ((key === 'f') && sendPlayerAction) {
        sendPlayerAction('useItem', false);
      }

      // Handle Dash release (Shift)
      // Skills generally don't need release, but we can send false if needed by system
      // For now, removing the deprecated 'dash' action call
      /*
      if (key === 'shift' && sendPlayerAction) {
         sendPlayerAction('dash', false)
      }
      */
    };
    
    const handleBlur = () => {
      // Clear all keys when window loses focus to prevent "stuck" keys
      pressedKeysRef.current.clear();
      updateMovement();
      if (sendPlayerAction) {
          sendPlayerAction('attack', false);
          // sendPlayerAction('dash', false); // deprecated
          sendPlayerAction('useItem', false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, [updatePlayerInput, sendPlayerAction, mousePositionRef]);

  // Return debug info
  return {
    pressedKeys: pressedKeysRef
  };
};

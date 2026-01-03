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
      if (keys.has('ArrowUp') || keys.has('w') || keys.has('W')) {
        vy = -1;
      }
      if (keys.has('ArrowDown') || keys.has('s') || keys.has('S')) {
        vy = 1;
      }
      if (keys.has('ArrowLeft') || keys.has('a') || keys.has('A')) {
        vx = -1;
      }
      if (keys.has('ArrowRight') || keys.has('d') || keys.has('D')) {
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
      console.log('🔽 KeyDown:', event.key);
      pressedKeysRef.current.add(event.key);
      updateMovement();
      
      
      // Handle attack input
      if ((event.code === 'Space' || event.key === ' ') && sendPlayerAction) {
        event.preventDefault(); // Prevent page scroll
        sendPlayerAction('attack', true);
      }

      // Handle Skill 1 (Key 1)
      if (event.key === '1' && sendPlayerAction) {
        const mousePos = mousePositionRef?.current;
        sendPlayerAction('useSkill', true, { 
            skillId: 'skill_1',
            x: mousePos?.x,
            y: mousePos?.y
        });
      }

      // Handle Skill 2 (Key 2)
      if (event.key === '2' && sendPlayerAction) {
        const mousePos = mousePositionRef?.current;
        sendPlayerAction('useSkill', true, { 
            skillId: 'skill_2',
            x: mousePos?.x,
            y: mousePos?.y
        });
      }
      
      // Handle Skill 3 (Key 3)
      if (event.key === '3' && sendPlayerAction) {
        const mousePos = mousePositionRef?.current;
        sendPlayerAction('useSkill', true, { 
            skillId: 'skill_3',
            x: mousePos?.x,
            y: mousePos?.y
        });
      }

      // Handle Skill 4 (Key 4)
      if (event.key === '4' && sendPlayerAction) {
        const mousePos = mousePositionRef?.current;
        sendPlayerAction('useSkill', true, { 
            skillId: 'skill_4',
            x: mousePos?.x,
            y: mousePos?.y
        });
      }
    };
    
    const handleKeyUp = (event: KeyboardEvent) => {
      pressedKeysRef.current.delete(event.key);
      updateMovement();
      
      // Handle attack release
      if ((event.code === 'Space' || event.key === ' ') && sendPlayerAction) {
        sendPlayerAction('attack', false);
      }
      
      // Handle trap release
      if ((event.key === 'f' || event.key === 'F') && sendPlayerAction) {
        sendPlayerAction('useItem', false);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [updatePlayerInput, sendPlayerAction, mousePositionRef]);
};

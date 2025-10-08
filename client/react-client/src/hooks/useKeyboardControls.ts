import { useEffect } from 'react';

interface UseKeyboardControlsProps {
  updatePlayerInput: (vx: number, vy: number) => void;
}

export const useKeyboardControls = ({ updatePlayerInput }: UseKeyboardControlsProps) => {
  useEffect(() => {
    const pressedKeys = new Set<string>();
    const speed = 2;
    
    const updateMovement = () => {
      let vx = 0, vy = 0;
      
      // Check all currently pressed keys
      if (pressedKeys.has('ArrowUp') || pressedKeys.has('w') || pressedKeys.has('W')) {
        vy = -speed;
      }
      if (pressedKeys.has('ArrowDown') || pressedKeys.has('s') || pressedKeys.has('S')) {
        vy = speed;
      }
      if (pressedKeys.has('ArrowLeft') || pressedKeys.has('a') || pressedKeys.has('A')) {
        vx = -speed;
      }
      if (pressedKeys.has('ArrowRight') || pressedKeys.has('d') || pressedKeys.has('D')) {
        vx = speed;
      }
      
      updatePlayerInput(vx, vy);
    };
    
    const handleKeyDown = (event: KeyboardEvent) => {
      pressedKeys.add(event.key);
      updateMovement();
    };
    
    const handleKeyUp = (event: KeyboardEvent) => {
      pressedKeys.delete(event.key);
      updateMovement();
    };
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [updatePlayerInput]);
};

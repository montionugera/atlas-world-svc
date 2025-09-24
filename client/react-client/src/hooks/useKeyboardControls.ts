import { useEffect } from 'react';

interface UseKeyboardControlsProps {
  updatePlayerInput: (vx: number, vy: number) => void;
}

export const useKeyboardControls = ({ updatePlayerInput }: UseKeyboardControlsProps) => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const speed = 2;
      let vx = 0, vy = 0;
      
      switch (event.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
          vy = -speed;
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          vy = speed;
          break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
          vx = -speed;
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          vx = speed;
          break;
      }
      
      if (vx !== 0 || vy !== 0) {
        updatePlayerInput(vx, vy);
      }
    };
    
    const handleKeyUp = () => {
      updatePlayerInput(0, 0);
    };
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [updatePlayerInput]);
};

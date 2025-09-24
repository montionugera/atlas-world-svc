import React, { useEffect, useRef } from 'react';
import { GameState } from '../types/game';
import { calculateScale, clearCanvas } from '../utils/drawingUtils';
import { drawMap } from '../renderers/mapRenderer';
import { drawMobs } from '../renderers/mobRenderer';
import { drawPlayers } from '../renderers/playerRenderer';
import { drawHUD } from '../renderers/hudRenderer';

interface GameRendererProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  gameState: GameState | null;
  updateCount: number;
  fps: number;
  updateRate: number;
  roomId: string | null;
  playerId: string;
  trackFrame: () => void;
}

export const GameRenderer: React.FC<GameRendererProps> = ({
  canvasRef,
  gameState,
  updateCount,
  fps,
  updateRate,
  roomId,
  playerId,
  trackFrame
}) => {
  const animationFrameRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const animate = () => {
      trackFrame();
      
      // Clear canvas
      clearCanvas(ctx, canvas);
      
      if (gameState) {
        const scale = calculateScale(gameState, canvas);
        drawMap(ctx, gameState, scale);
        drawMobs(ctx, gameState.mobs, scale);
        drawPlayers(ctx, gameState.players, playerId, scale);
        drawHUD(ctx, gameState, updateCount, fps, updateRate, roomId);
      }
      
      animationFrameRef.current = requestAnimationFrame(animate);
    };
    
    animate();
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [gameState, updateCount, fps, updateRate, roomId, playerId, trackFrame]);

  return null; // This component only handles rendering
};
import React, { useEffect, useRef } from 'react';
import { GameState } from '../types/game';

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
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      if (gameState) {
        drawMap(ctx, gameState);
        drawMobs(ctx, gameState.mobs);
        drawPlayers(ctx, gameState.players, playerId);
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

// Drawing functions
const drawMap = (ctx: CanvasRenderingContext2D, gameState: GameState) => {
  ctx.strokeStyle = '#00ff00';
  ctx.lineWidth = 3;
  ctx.strokeRect(0, 0, gameState.width, gameState.height);
};

const drawMobs = (ctx: CanvasRenderingContext2D, mobs: any[]) => {
  ctx.fillStyle = '#ff6b6b';
  mobs.forEach(mob => {
    ctx.beginPath();
    ctx.arc(mob.x, mob.y, 8, 0, Math.PI * 2);
    ctx.fill();
    
    // Draw velocity vector
    ctx.strokeStyle = '#ff6b6b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(mob.x, mob.y);
    ctx.lineTo(mob.x + mob.vx * 5, mob.y + mob.vy * 5);
    ctx.stroke();
  });
};

const drawPlayers = (ctx: CanvasRenderingContext2D, players: Map<string, any>, currentPlayerId: string) => {
  ctx.fillStyle = '#4ecdc4';
  players.forEach((player, sessionId) => {
    ctx.beginPath();
    ctx.arc(player.x, player.y, 10, 0, Math.PI * 2);
    ctx.fill();
    
    // Draw player name
    ctx.fillStyle = '#fff';
    ctx.font = '12px Arial';
    ctx.fillText(player.name, player.x - 20, player.y - 15);
    ctx.fillStyle = '#4ecdc4';
    
    // Highlight current player
    if (sessionId === currentPlayerId) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  });
};

const drawHUD = (
  ctx: CanvasRenderingContext2D, 
  gameState: GameState, 
  updateCount: number, 
  fps: number, 
  updateRate: number, 
  roomId: string | null
) => {
  // Draw game info with better contrast
  ctx.fillStyle = '#000';
  ctx.fillRect(5, 5, 200, 180);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 16px Arial';
  ctx.fillText(`Map: ${gameState.mapId}`, 10, 25);
  ctx.fillText(`Players: ${gameState.players.size}`, 10, 45);
  ctx.fillText(`Mobs: ${gameState.mobs.length}`, 10, 65);
  ctx.fillText(`Tick: ${gameState.tick}`, 10, 85);
  ctx.fillText(`Updates: ${updateCount}`, 10, 105);
  ctx.fillText(`FPS: ${fps}`, 10, 125);
  ctx.fillText(`Rate: ${updateRate}/s`, 10, 145);
  
  if (roomId) {
    ctx.fillText(`Room: ${roomId}`, 10, 165);
  }
};

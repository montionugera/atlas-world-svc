import { useRef, useEffect } from "react";
import { GameState } from '../types/game';
import { calculateScale, clearCanvas } from '../utils/drawingUtils';
import { drawGrid } from '../utils/gridUtils';
import { drawMap } from '../renderers/mapRenderer';
import { drawMobs } from '../renderers/mobRenderer';
import { drawProjectiles } from '../renderers/projectileRenderer';
import { drawPlayers } from '../renderers/playerRenderer';

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
        // --- 1. Main Camera View ---
        const viewportSize = 50; // 50x50 units visible
        const scale = calculateScale(gameState, canvas, viewportSize);
        
        // Find player to center camera
        const player = gameState.players.get(playerId);
        let cameraX = gameState.width / 2;
        let cameraY = gameState.height / 2;
        
        if (player) {
           cameraX = player.x;
           cameraY = player.y;
        }

        ctx.save();
        
        // Center the view on the canvas
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.scale(scale, scale);
        ctx.translate(-cameraX, -cameraY);

        // Draw Game World (Clipped to viewport logically by canvas bounds)
        // Note: drawMap might act weird if it just fills rect 0,0,width,height. 
        // We might want to draw a massive rect for background or grid.
        
        // Draw World Boundaries
        ctx.strokeStyle = '#ff0000';
        ctx.lineWidth = 2 / scale; // Inverse scale line width for boundary
        ctx.strokeRect(0, 0, gameState.width, gameState.height);

        drawGrid(ctx, gameState.width, gameState.height, 1, scale); // Pass viewScale
        drawMobs(ctx, gameState.mobs, 1, scale);
        drawPlayers(ctx, gameState.players, playerId, 1, scale);
        if (gameState.projectiles) {
          drawProjectiles(ctx, gameState.projectiles, 1, scale);
        }
        
        ctx.restore();

        // --- 2. Mini Map Overlay ---
        const miniMapSize = 150;
        const padding = 20;
        const miniMapX = canvas.width - miniMapSize - padding;
        const miniMapY = padding;
        const miniMapScale = miniMapSize / Math.max(gameState.width, gameState.height);

        ctx.save();
        ctx.translate(miniMapX, miniMapY);
        
        // Background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(0, 0, miniMapSize, miniMapSize);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.strokeRect(0, 0, miniMapSize, miniMapSize);

        // Entities
        // Simple dots for mini-map
        ctx.scale(miniMapScale, miniMapScale);

        // Mobs (Red dots)
        ctx.fillStyle = '#ff4444';
        gameState.mobs.forEach(mob => {
            if (!mob.isAlive) return;
            ctx.beginPath();
            ctx.arc(mob.x, mob.y, mob.radius * 2, 0, Math.PI * 2); // Larger dots
            ctx.fill();
        });

        // Other Players (Blue dots)
        ctx.fillStyle = '#4444ff';
        gameState.players.forEach(p => {
            if (p.id === playerId || !p.isAlive) return;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
            ctx.fill();
        });

        // Current Player (Green/White dot)
        if (player && player.isAlive) {
            ctx.fillStyle = '#00ff00';
            ctx.beginPath();
            ctx.arc(player.x, player.y, 6, 0, Math.PI * 2);
            ctx.fill();
            // Optional: View cone
        }

        ctx.restore();
        
        // HUD is now rendered outside the canvas
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
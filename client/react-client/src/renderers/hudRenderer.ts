import { GameState } from '../types/game';
import { RENDER_CONFIG, COLORS } from '../config/gameConfig';
import { drawText } from '../utils/drawingUtils';

/**
 * Draw the game HUD with statistics
 */
export const drawHUD = (
  ctx: CanvasRenderingContext2D, 
  gameState: GameState, 
  updateCount: number, 
  fps: number, 
  updateRate: number, 
  roomId: string | null
): void => {
  // Draw HUD background
  ctx.fillStyle = RENDER_CONFIG.hudBackground;
  ctx.fillRect(
    RENDER_CONFIG.hudPadding, 
    RENDER_CONFIG.hudPadding, 
    RENDER_CONFIG.hudWidth, 
    RENDER_CONFIG.hudHeight
  );
  
  // Prepare HUD data
  const hudData = [
    `Map: ${gameState.mapId}`,
    `Players: ${gameState.players.size}`,
    `Mobs: ${gameState.mobs.length}`,
    `Tick: ${gameState.tick}`,
    `Updates: ${updateCount}`,
    `FPS: ${fps}`,
    `Rate: ${updateRate}/s`,
    ...(roomId ? [`Room: ${roomId}`] : [])
  ];
  
  // Draw HUD text
  hudData.forEach((text, index) => {
    drawText(
      ctx,
      text,
      RENDER_CONFIG.hudPadding + 5,
      RENDER_CONFIG.hudPadding + 20 + (index * RENDER_CONFIG.hudLineSpacing),
      COLORS.hudText,
      RENDER_CONFIG.hudFont
    );
  });
};

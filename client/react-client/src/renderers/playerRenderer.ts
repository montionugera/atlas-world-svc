import { RENDER_CONFIG, COLORS } from '../config/gameConfig';
import { drawCircle, drawText } from '../utils/drawingUtils';

/**
 * Draw all players with their names and highlight current player
 */
export const drawPlayers = (
  ctx: CanvasRenderingContext2D, 
  players: Map<string, any>, 
  currentPlayerId: string, 
  scale: number
): void => {
  players.forEach((player, sessionId) => {
    const x = player.x * scale;
    const y = player.y * scale;
    
    // Draw player circle
    drawCircle(ctx, x, y, RENDER_CONFIG.playerRadius, COLORS.player);
    
    // Draw player name
    drawText(
      ctx,
      player.name,
      x - 20,
      y - 15,
      COLORS.hudText,
      RENDER_CONFIG.playerNameFont
    );
    
    // Highlight current player
    if (sessionId === currentPlayerId) {
      ctx.strokeStyle = COLORS.playerHighlight;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  });
};

import { RENDER_CONFIG, COLORS } from '../config/gameConfig';
import { drawCircle, drawText, drawHealthBar } from '../utils/drawingUtils';

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
    
    // Draw player circle (scaled to match world/canvas ratio)
    const radius = RENDER_CONFIG.playerRadius * scale;
    drawCircle(ctx, x, y, radius, COLORS.player);

    // Always draw a visible outline so players stand out
    ctx.beginPath();
    ctx.arc(x, y, radius + 1, 0, Math.PI * 2);
    ctx.strokeStyle = COLORS.playerHighlight;
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Draw health bar (smaller for players)
    if (player.maxHealth && player.currentHealth !== undefined) {
      drawHealthBar(
        ctx,
        x,
        y,
        player.currentHealth,
        player.maxHealth,
        radius * 0.8, // 20% smaller than mob health bars
        scale,
        '#ff0000', // red background
        '#00ff00', // green health
        '#000000'  // black border
      );
    }
    
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
      // Stronger highlight for the local player
      ctx.beginPath();
      ctx.arc(x, y, radius + 3, 0, Math.PI * 2);
      ctx.strokeStyle = COLORS.playerHighlight;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  });
};

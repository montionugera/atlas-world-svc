import { RENDER_CONFIG, COLORS } from '../config/gameConfig';
import { drawCircle, drawText, drawHealthBar, drawHeading } from '../utils/drawingUtils';

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
    
    // Draw health bar (same size as mobs)
    if (player.maxHealth && player.currentHealth !== undefined) {
      drawHealthBar(
        ctx,
        x,
        y,
        player.currentHealth,
        player.maxHealth,
        radius,
        scale,
        '#ff0000', // red background
        '#00ff00', // green health
        '#000000', // black border
        {
          minWidth: 8,
          maxWidth: 40, // same as mobs
          minHeight: 2,
          maxHeight: 6, // same as mobs
          minOffset: 4,
          maxOffset: 16,
          widthMultiplier: 2.0, // same as mobs
          heightMultiplier: 0.25
        }
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
    
    // Draw heading indicator
    if (player.heading !== undefined) {
      drawHeading(
        ctx,
        x,
        y,
        player.heading,
        radius,
        scale,
        '#ffffff', // white arrow
        3 // thicker line
      );
    }
    
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

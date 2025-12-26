import { RENDER_CONFIG, COLORS } from '../config/gameConfig';
import { drawCircle, drawText, drawHealthBar, drawHeading, drawAttackCone, drawAttackSlash } from '../utils/drawingUtils';

/**
 * Draw all players with their names and highlight current player
 */
export const drawPlayers = (
  ctx: CanvasRenderingContext2D, 
  players: Map<string, any>, 
  currentPlayerId: string, 
  scale: number,
  viewScale: number = 1 // New parameter
): void => {
  const inverseScale = 1 / viewScale;

  players.forEach((player, sessionId) => {
    const x = player.x * scale;
    const y = player.y * scale;
    
    // Draw player circle (scaled to match world/canvas ratio)
    const radius = player.radius * scale;
    drawCircle(ctx, x, y, radius, COLORS.player);

    // Always draw a visible outline so players stand out
    ctx.beginPath();
    ctx.arc(x, y, radius + (1 * inverseScale), 0, Math.PI * 2);
    ctx.strokeStyle = COLORS.playerHighlight;
    ctx.lineWidth = 2 * inverseScale;
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
        },
        viewScale // Pass viewScale for inverse scaling
      );
    }
    
    // Draw player name
    const fontSize = 12 * inverseScale;
    drawText(
      ctx,
      player.name,
      x - (20 * inverseScale),
      y - (15 * inverseScale),
      COLORS.hudText,
      `${fontSize}px Arial`
    );

    // Draw BOT label if in bot mode
    if (player.isBotMode) {
      drawText(
        ctx,
        '[BOT]',
        x - (15 * inverseScale),
        y - (30 * inverseScale),
        '#ff9f43',
        `${10 * inverseScale}px Arial`
      );
    }
    
    // Draw heading indicator (smaller for player) - always show heading
    if (player.heading !== undefined) {
      drawHeading(
        ctx,
        x,
        y,
        player.heading,
        radius,
        scale,
        '#ffffff', // white arrow
        2, // thicker line will be inversely scaled inside this function
        0.3, // smaller arrow (30% of radius)
        viewScale
      );
    }
    
    // Draw attack visualization if player is attacking
    if (player.isAttacking && player.heading !== undefined) {
      // Draw attack cone
      drawAttackCone(
        ctx,
        x,
        y,
        player.heading,
        player.attackRange || 3,
        scale,
        '#ff4444', // red cone
        0.4, // semi-transparent
        // Attack cone does not need inverse scaling as it represents physical area
      );
      
      // Draw attack slash effect
      drawAttackSlash(
        ctx,
        x,
        y,
        player.heading,
        radius,
        '#ffff00', // yellow slash
        7, // thicker line for slash
        viewScale
      );
    }
    
    // Highlight current player
    if (sessionId === currentPlayerId) {
      // Stronger highlight for the local player
      ctx.beginPath();
      ctx.arc(x, y, radius + (3 * inverseScale), 0, Math.PI * 2);
      ctx.strokeStyle = COLORS.playerHighlight;
      ctx.lineWidth = 3 * inverseScale;
      ctx.stroke();
    }
  });
};

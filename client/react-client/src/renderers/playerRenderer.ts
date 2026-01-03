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
  const now = Date.now();

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
    
    // UI Vertical Offset stacking
    // Start strictly above the player radius
    let uiYOffset = y - radius; 

    // 1. Health Bar (Bottom of stack)
    if (player.maxHealth && player.currentHealth !== undefined) {
      // Pass PIXEL values for dimensions. drawHealthBar handles the inverse scaling conversion to world units.
      const healthBarHeight = 10; // pixels
      const healthBarMargin = 10; // pixels above radius
      
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
          minWidth: 24,
          maxWidth: 64, // Fixed pixel width (larger)
          minHeight: 4,
          maxHeight: healthBarHeight, // Fixed pixel height
          minOffset: healthBarMargin,
          maxOffset: 500, // Large enough so it doesn't clamp inside the player radius
          widthMultiplier: 2.6, 
          heightMultiplier: 0.35
        },
        viewScale 
      );
      
      // Update Y offset for next elements
      // Health bar is from (y - offset) downwards
      // We want next element above (y - offset).
      // Effective offset used by util is roughly (radius + margin).
      uiYOffset -= ((healthBarMargin + healthBarHeight + 4) * inverseScale);
    } else {
        // Base margin if no health bar
        uiYOffset -= (10 * inverseScale);
    }

    // 2. Casting Bar (Above Health Bar if present)
    if (player.castingUntil && player.castingUntil > now) {
        const remaining = player.castingUntil - now;
        const total = player.castDuration || 500; 
        const progress = Math.min(1, Math.max(0, remaining / total)); // Clamp to 0-1
        const fillPct = 1 - progress; 

        const barWidth = 40 * inverseScale;
        const barHeight = 5 * inverseScale;
        
        // Draw centered above previous UI element
        // uiYOffset is the bottom line for this element
        const castBarBottom = uiYOffset;
        const castBarTop = castBarBottom - barHeight;
        
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(x - barWidth/2, castBarTop, barWidth, barHeight);
        
        ctx.fillStyle = '#ffffff'; // White cast bar
        ctx.fillRect(x - barWidth/2, castBarTop, barWidth * fillPct, barHeight);
        
        // Shift stack up
        uiYOffset -= (barHeight + 4 * inverseScale); 
    }
    
    // 3. Name Label (Top of stack)
    const fontSize = 12 * inverseScale;
    
    // Position name based on accumulated offset
    const nameY = uiYOffset - (2 * inverseScale); 
    
    drawText(
      ctx,
      player.name,
      x - (25 * inverseScale), // Rough centering offset (text width dependent)
      nameY,
      COLORS.hudText,
      `${fontSize}px Arial`
    );

    // Draw BOT label if in bot mode
    if (player.isBotMode) {
      drawText(
        ctx,
        '[BOT]',
        x - (15 * inverseScale),
        nameY - (14 * inverseScale),
        '#ff9f43',
        `${10 * inverseScale}px Arial`
      );
    }
    
    // Draw Status Effects (Freeze/Stun)
    if (player.battleStatuses) {
        if (player.battleStatuses.has('freeze')) {
            ctx.fillStyle = 'rgba(100, 200, 255, 0.4)';
            ctx.beginPath();
            ctx.arc(x, y, radius + (6 * inverseScale), 0, Math.PI * 2);
            ctx.fill();
            drawText(ctx, "❄️", x - (4*inverseScale), y - (radius + 25*inverseScale), '#fff', `${12 * inverseScale}px Arial`);
        }
        if (player.battleStatuses.has('stun')) {
            drawText(ctx, "💫", x - (4*inverseScale), y - (radius + 25*inverseScale), '#fff', `${12 * inverseScale}px Arial`);
        }
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

import { RENDER_CONFIG, COLORS } from '../config/gameConfig';
import { drawCircle, drawLine, drawText, drawHealthBar, drawHeading, drawAttackCone, drawAttackSlash } from '../utils/drawingUtils';
import { getMobDisplayName, getMobStatusText } from '../utils/mobUtils';

/**
 * Draw all mobs with their velocity vectors
 */
/**
 * Draw all mobs with their velocity vectors
 */
export const drawMobs = (
  ctx: CanvasRenderingContext2D, 
  mobs: Map<string, any>, 
  scale: number,
  viewScale: number = 1 // New parameter
): void => {
  const inverseScale = 1 / viewScale;

  mobs.forEach(mob => {
    const x = mob.x * scale;
    const y = mob.y * scale;
    
    // Draw wind-up animation if mob is winding up
    if (mob.isWindingUp) {
      // Draw pulsing glow effect
      const pulseTime = Date.now() % 1000; // 1 second pulse cycle
      const pulseAlpha = 0.3 + (Math.sin(pulseTime / 1000 * Math.PI * 2) * 0.2);
      ctx.fillStyle = `rgba(255, 200, 0, ${pulseAlpha})`; // Yellow glow
      ctx.beginPath();
      ctx.arc(x, y, (mob.radius + 2) * scale, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // Draw mob circle using server-provided radius (scale already applied to position)
    drawCircle(ctx, x, y, mob.radius * scale, COLORS.mob);
    
    // Draw health bar for mobs
    if (mob.maxHealth && mob.currentHealth !== undefined) {
      drawHealthBar(
        ctx,
        x,
        y,
        mob.currentHealth,
        mob.maxHealth,
        mob.radius, // use mob radius for proportional sizing
        scale,
        '#ff4444', // darker red background
        '#44ff44', // brighter green for health
        '#000000', // black border
        {
          minWidth: 25,
          maxWidth: 40, // larger max width for mobs
          minHeight: 4,
          maxHeight: 8, // larger max height for mobs
          minOffset: 4,
          maxOffset: 16,
          widthMultiplier: 2.0, // standard multiplier for mobs
          heightMultiplier: 0.25
        },
        viewScale // Pass viewScale
      );
    }
    
    // Draw mob name and status
    const fontSize = 12 * inverseScale;
    const name = getMobDisplayName(mob);
    const status = getMobStatusText(mob);
    
    // Draw Name
    drawText(
      ctx,
      name,
      x - (12 * inverseScale),
      y - (mob.radius * scale) - (18 * inverseScale), // Higher up
      COLORS.hudText,
      `${fontSize}px Arial`
    );

    // Draw Status (if any)
    if (status) {
        drawText(
          ctx,
          status,
          x - (12 * inverseScale),
          y - (mob.radius * scale) - (6 * inverseScale),
          '#ff4444', // Red for status/behavior
          `${fontSize * 0.9}px Arial` // Slightly smaller
        );
    }

    // Draw heading indicator (same as player)
    if (mob.heading !== undefined) {
      drawHeading(
        ctx,
        x,
        y,
        mob.heading,
        mob.radius+2,
        scale,
        '#ffffff', // white arrow for mobs
        3, // thicker line
        0.6,
        viewScale
      );
    }
    
    // Draw attack visualization if mob is attacking
    if (mob.isAttacking && mob.heading !== undefined) {
      // Draw attack cone
      drawAttackCone(
        ctx,
        x,
        y,
        mob.heading,
        mob.attackRange || 1.5,
        scale,
        '#ff4444', // red cone
        0.4, // semi-transparent
      );
      
      // Draw attack slash effect
      drawAttackSlash(
        ctx,
        x,
        y,
        mob.heading,
        mob.radius * scale,
        '#ffff00', // yellow slash
        7, // thicker line for slash
        viewScale
      );
    }

    // Draw velocity vector
    ctx.lineWidth = 2 * inverseScale;
    drawLine(
      ctx,
      x,
      y,
      x + mob.vx * RENDER_CONFIG.velocityVectorScale,
      y + mob.vy * RENDER_CONFIG.velocityVectorScale,
      COLORS.mob,
      2 * inverseScale
    );
  });
};

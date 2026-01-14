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
    
    // Draw wind-up animation if mob is casting (winding up)
    if (mob.isCasting) {
      // Draw pulsing glow effect (Blinking)
      const pulseTime = Date.now() % 500; // 0.5 second pulse cycle (faster)
      const pulsePhase = pulseTime / 500; // 0 to 1
      
      // Flash between transparent and semi-transparent yellow
      // Sine wave for smooth but fast pulse
      const pulseAlpha = 0.2 + (Math.sin(pulsePhase * Math.PI * 2) * 0.3);
      
      ctx.save();
      ctx.fillStyle = `rgba(255, 220, 50, ${pulseAlpha})`; // Bright Yellow glow
      ctx.beginPath();
      // Radius slightly pulsating too
      const radiusPulse = 1 + (Math.sin(pulsePhase * Math.PI * 2) * 0.1);
      ctx.arc(x, y, (mob.radius + 4) * scale * radiusPulse, 0, Math.PI * 2);
      ctx.fill();
      
      // Add a stroke ring that expands
      ctx.strokeStyle = `rgba(255, 200, 0, ${1 - pulsePhase})`; // Fades out as it expands
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, (mob.radius + 2 + (pulsePhase * 10)) * scale, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
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

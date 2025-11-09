import { RENDER_CONFIG, COLORS } from '../config/gameConfig';
import { drawCircle, drawLine, drawText, drawHealthBar, drawHeading } from '../utils/drawingUtils';

/**
 * Draw all mobs with their velocity vectors
 */
export const drawMobs = (ctx: CanvasRenderingContext2D, mobs: Map<string, any>, scale: number): void => {
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
        }
      );
    }
    
    // Draw mob id/name and behavior tag above the circle
    drawText(
      ctx,
      `${mob.id || 'mob'} (${mob.tag || 'idle'})`,
      x - 12,
      y - (mob.radius * scale) - 6,
      COLORS.hudText,
      RENDER_CONFIG.playerNameFont
    );

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
        3 // thicker line
      );
    }
    
    // Draw velocity vector
    drawLine(
      ctx,
      x,
      y,
      x + mob.vx * RENDER_CONFIG.velocityVectorScale,
      y + mob.vy * RENDER_CONFIG.velocityVectorScale,
      COLORS.mob
    );
  });
};

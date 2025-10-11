import { RENDER_CONFIG, COLORS } from '../config/gameConfig';
import { drawCircle, drawLine, drawText, drawHealthBar, drawHeading } from '../utils/drawingUtils';

/**
 * Draw all mobs with their velocity vectors
 */
export const drawMobs = (ctx: CanvasRenderingContext2D, mobs: Map<string, any>, scale: number): void => {
  mobs.forEach(mob => {
    const x = mob.x * scale;
    const y = mob.y * scale;
    
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
          minWidth: 8,
          maxWidth: 40, // larger max width for mobs
          minHeight: 2,
          maxHeight: 6, // larger max height for mobs
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

    // Draw heading indicator
    if (mob.angle !== undefined) {
      drawHeading(
        ctx,
        x,
        y,
        mob.angle,
        mob.radius,
        scale,
        '#ff6666', // red arrow for mobs
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

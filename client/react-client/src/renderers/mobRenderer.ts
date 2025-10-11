import { RENDER_CONFIG, COLORS } from '../config/gameConfig';
import { drawCircle, drawLine, drawText, drawHealthBarCustom } from '../utils/drawingUtils';

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
      drawHealthBarCustom(
        ctx,
        x,
        y,
        mob.currentHealth,
        mob.maxHealth,
        mob.radius, // use mob radius for proportional sizing
        scale,
        '#ff4444', // darker red background
        '#44ff44', // brighter green for health
        '#000000'  // black border
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

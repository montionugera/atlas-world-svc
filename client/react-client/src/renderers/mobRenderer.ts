import { RENDER_CONFIG, COLORS } from '../config/gameConfig';
import { drawCircle, drawLine } from '../utils/drawingUtils';

/**
 * Draw all mobs with their velocity vectors
 */
export const drawMobs = (ctx: CanvasRenderingContext2D, mobs: any[], scale: number): void => {
  mobs.forEach(mob => {
    const x = mob.x * scale;
    const y = mob.y * scale;
    
    // Draw mob circle
    drawCircle(ctx, x, y, RENDER_CONFIG.mobRadius, COLORS.mob);
    
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

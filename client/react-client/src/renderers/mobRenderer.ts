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

    // Draw AI direction arrow (like player but for mobs)
    if (mob.heading !== undefined) {
      const arrowLength = (mob.radius * scale) * 0.3; // 30% of mob radius
      const arrowX = x + Math.cos(mob.heading) * arrowLength;
      const arrowY = y + Math.sin(mob.heading) * arrowLength;
      
      // Draw main arrow line
      ctx.strokeStyle = '#ff6666'; // red for mobs
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(arrowX, arrowY);
      ctx.stroke();
      
      // Draw arrow head (triangle)
      const headSize = (mob.radius * scale) * 0.1;
      const headAngle1 = mob.heading - Math.PI * 0.3;
      const headAngle2 = mob.heading + Math.PI * 0.3;
      
      const head1X = arrowX + Math.cos(headAngle1) * headSize;
      const head1Y = arrowY + Math.sin(headAngle1) * headSize;
      const head2X = arrowX + Math.cos(headAngle2) * headSize;
      const head2Y = arrowY + Math.sin(headAngle2) * headSize;
      
      ctx.fillStyle = '#ff6666';
      ctx.beginPath();
      ctx.moveTo(arrowX, arrowY);
      ctx.lineTo(head1X, head1Y);
      ctx.lineTo(head2X, head2Y);
      ctx.closePath();
      ctx.fill();
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

import { RENDER_CONFIG, COLORS } from '../config/gameConfig';
import { drawCircle, drawLine } from '../utils/drawingUtils';

/**
 * Draw all projectiles (spears)
 */
export const drawProjectiles = (ctx: CanvasRenderingContext2D, projectiles: Map<string, any>, scale: number): void => {
  projectiles.forEach(projectile => {
    if (projectile.isStuck) {
      // Draw stuck projectile as a small circle (semi-transparent)
      const x = projectile.x * scale;
      const y = projectile.y * scale;
      ctx.save();
      ctx.globalAlpha = 0.5; // Semi-transparent
      drawCircle(ctx, x, y, projectile.radius * scale, '#888888');
      ctx.restore();
      return;
    }

    // Draw flying projectile as a line/arrow pointing in direction of velocity
    const x = projectile.x * scale;
    const y = projectile.y * scale;
    
    // Calculate angle from velocity
    const angle = Math.atan2(projectile.vy, projectile.vx);
    const length = projectile.radius * scale * 3; // Spear length
    
    // Draw spear as a line
    const endX = x + Math.cos(angle) * length;
    const endY = y + Math.sin(angle) * length;
    
    // Draw spear body
    ctx.strokeStyle = '#ffaa00'; // Orange/yellow for spear
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    
    // Draw spear tip (small triangle)
    const tipSize = projectile.radius * scale * 1.5;
    ctx.fillStyle = '#ff6600'; // Darker orange for tip
    ctx.beginPath();
    ctx.moveTo(endX, endY);
    ctx.lineTo(
      endX - Math.cos(angle) * tipSize + Math.cos(angle + Math.PI / 2) * tipSize * 0.3,
      endY - Math.sin(angle) * tipSize + Math.sin(angle + Math.PI / 2) * tipSize * 0.3
    );
    ctx.lineTo(
      endX - Math.cos(angle) * tipSize + Math.cos(angle - Math.PI / 2) * tipSize * 0.3,
      endY - Math.sin(angle) * tipSize + Math.sin(angle - Math.PI / 2) * tipSize * 0.3
    );
    ctx.closePath();
    ctx.fill();
  });
};


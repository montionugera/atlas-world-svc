import { RENDER_CONFIG, COLORS } from '../config/gameConfig';
import { drawCircle, drawLine } from '../utils/drawingUtils';

/**
 * Draw all projectiles (spears)
 */
const ENABLE_PROJECTILE_DEBUG_LOG = false
// Enable temporary projectile debug logs (console) for deflection visibility debugging.
// Throttled to avoid console spam (logs every N frames, max few per frame).
const PROJECTILE_DEBUG_LOG_EVERY_N_FRAMES = 15
const PROJECTILE_DEBUG_LOG_MAX_PER_FRAME = 3

let debugDrawFrame = 0
const lastProjectileDebugLogFrameById = new Map<string, number>()

export const drawProjectiles = (
  ctx: CanvasRenderingContext2D,
  projectiles: Map<string, { id: string; x: number; y: number; vx: number; vy: number; radius: number; ownerId: string; isStuck: boolean; teamId?: string }>,
  scale: number,
  viewScale: number = 1
): void => {
  const inverseScale = 1 / viewScale;
  debugDrawFrame += 1
  const shouldThrottle = ENABLE_PROJECTILE_DEBUG_LOG && debugDrawFrame % PROJECTILE_DEBUG_LOG_EVERY_N_FRAMES !== 0
  let loggedThisFrame = 0

  projectiles.forEach(projectile => {
    if (ENABLE_PROJECTILE_DEBUG_LOG) {
      const canLog =
        !shouldThrottle && loggedThisFrame < PROJECTILE_DEBUG_LOG_MAX_PER_FRAME

      if (canLog) {
        const lastFrame = lastProjectileDebugLogFrameById.get(projectile.id)
        // Also prevent noisy repeats when projectiles persist for a long time.
        if (
          lastFrame === undefined ||
          debugDrawFrame - lastFrame >= PROJECTILE_DEBUG_LOG_EVERY_N_FRAMES
        ) {
          lastProjectileDebugLogFrameById.set(projectile.id, debugDrawFrame)

          // Lightweight debug hook to inspect projectile state client-side
          console.log(
            `[Projectile] id=${projectile.id} owner=${projectile.ownerId} team=${
              projectile.teamId ?? 'none'
            } stuck=${projectile.isStuck} pos=(${projectile.x.toFixed(2)},${projectile.y.toFixed(
              2
            )}) vel=(${projectile.vx.toFixed(2)},${projectile.vy.toFixed(2)})`
          )
          loggedThisFrame += 1
        }
      }
    }
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
    ctx.lineWidth = 2 * inverseScale;
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

    // Draw collision radius for debugging
    ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)'; // Semi-transparent red
    ctx.lineWidth = inverseScale;
    ctx.beginPath();
    ctx.arc(x, y, projectile.radius * scale, 0, Math.PI * 2);
    ctx.stroke();
  });
};


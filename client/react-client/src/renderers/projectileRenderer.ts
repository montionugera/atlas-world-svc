import { drawCircle } from "../utils/drawingUtils";

/**
 * Draw all projectiles (spears)
 */
const ENABLE_PROJECTILE_DEBUG_LOG = false;
// Enable temporary projectile debug logs (console) for deflection visibility debugging.
// Throttled to avoid console spam (logs every N frames, max few per frame).
const PROJECTILE_DEBUG_LOG_EVERY_N_FRAMES = 15;
const PROJECTILE_DEBUG_LOG_MAX_PER_FRAME = 3;

let debugDrawFrame = 0;
const lastProjectileDebugLogFrameById = new Map<string, number>();

export const drawProjectiles = (
  ctx: CanvasRenderingContext2D,
  projectiles: Map<
    string,
    {
      id: string;
      x: number;
      y: number;
      vx: number;
      vy: number;
      radius: number;
      ownerId: string;
      isStuck: boolean;
      type?: string;
      teamId?: string;
    }
  >,
  scale: number,
  viewScale: number = 1,
): void => {
  const inverseScale = 1 / viewScale;
  debugDrawFrame += 1;
  const shouldThrottle =
    ENABLE_PROJECTILE_DEBUG_LOG &&
    debugDrawFrame % PROJECTILE_DEBUG_LOG_EVERY_N_FRAMES !== 0;
  let loggedThisFrame = 0;

  projectiles.forEach((projectile) => {
    if (ENABLE_PROJECTILE_DEBUG_LOG) {
      const canLog =
        !shouldThrottle && loggedThisFrame < PROJECTILE_DEBUG_LOG_MAX_PER_FRAME;

      if (canLog) {
        const lastFrame = lastProjectileDebugLogFrameById.get(projectile.id);
        // Also prevent noisy repeats when projectiles persist for a long time.
        if (
          lastFrame === undefined ||
          debugDrawFrame - lastFrame >= PROJECTILE_DEBUG_LOG_EVERY_N_FRAMES
        ) {
          lastProjectileDebugLogFrameById.set(projectile.id, debugDrawFrame);

          // Lightweight debug hook to inspect projectile state client-side
          console.log(
            `[Projectile] id=${projectile.id} owner=${projectile.ownerId} team=${
              projectile.teamId ?? "none"
            } stuck=${projectile.isStuck} pos=(${projectile.x.toFixed(2)},${projectile.y.toFixed(
              2,
            )}) vel=(${projectile.vx.toFixed(2)},${projectile.vy.toFixed(2)})`,
          );
          loggedThisFrame += 1;
        }
      }
    }
    if (projectile.isStuck) {
      // Draw stuck projectile as a small circle (semi-transparent)
      const x = projectile.x * scale;
      const y = projectile.y * scale;
      ctx.save();
      ctx.globalAlpha = 0.5; // Semi-transparent
      drawCircle(ctx, x, y, projectile.radius * scale, "#888888");
      ctx.restore();
      return;
    }

    // Draw flying projectile based on type (elemental skills vs spears)
    const x = projectile.x * scale;
    const y = projectile.y * scale;
    const angle = Math.atan2(projectile.vy, projectile.vx);
    const pType = (projectile.type || "spear").toLowerCase();

    if (pType.includes("skill_1") || pType.includes("meteor")) {
      // Blazing Meteor Strike: molten fireball with trailing flame
      const radius = Math.max(8, projectile.radius * scale * 1.5);
      ctx.save();
      const tailLength = radius * 3.5;
      const tailX = x - Math.cos(angle) * tailLength;
      const tailY = y - Math.sin(angle) * tailLength;
      const grad = ctx.createLinearGradient(x, y, tailX, tailY);
      grad.addColorStop(0, "rgba(255, 200, 50, 0.9)");
      grad.addColorStop(0.4, "rgba(255, 80, 0, 0.6)");
      grad.addColorStop(1, "rgba(200, 0, 0, 0)");
      ctx.strokeStyle = grad;
      ctx.lineWidth = radius * 1.2;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(tailX, tailY);
      ctx.stroke();

      // Outer fireball
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = "#ff4500";
      ctx.shadowColor = "#ff3838";
      ctx.shadowBlur = 14 * inverseScale;
      ctx.fill();

      // Inner intense core
      ctx.beginPath();
      ctx.arc(x, y, radius * 0.5, 0, Math.PI * 2);
      ctx.fillStyle = "#fff7d6";
      ctx.fill();
      ctx.restore();
    } else if (pType.includes("skill_3") || pType.includes("blizzard")) {
      // Freezing Blizzard: icy cyan crystal with frosty mist
      const radius = Math.max(7, projectile.radius * scale * 1.3);
      ctx.save();
      const tailLength = radius * 2.8;
      const tailX = x - Math.cos(angle) * tailLength;
      const tailY = y - Math.sin(angle) * tailLength;
      const grad = ctx.createLinearGradient(x, y, tailX, tailY);
      grad.addColorStop(0, "rgba(160, 230, 255, 0.9)");
      grad.addColorStop(1, "rgba(0, 150, 255, 0)");
      ctx.strokeStyle = grad;
      ctx.lineWidth = radius * 1.1;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(tailX, tailY);
      ctx.stroke();

      // Frost orb
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = "#00d2d3";
      ctx.shadowColor = "#54a0ff";
      ctx.shadowBlur = 12 * inverseScale;
      ctx.fill();

      // Core
      ctx.beginPath();
      ctx.arc(x, y, radius * 0.45, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.restore();
    } else if (pType.includes("skill_4") || pType.includes("thunder")) {
      // Thunder Strike: crackling electric bolt
      const radius = Math.max(6, projectile.radius * scale * 1.2);
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = "#feca57";
      ctx.shadowColor = "#ff9f43";
      ctx.shadowBlur = 12 * inverseScale;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(x, y, radius * 0.5, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();

      // Electric arc
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2 * inverseScale;
      ctx.beginPath();
      ctx.moveTo(x, y);
      const midX =
        x + Math.cos(angle) * radius * 1.4 + (Math.random() - 0.5) * radius;
      const midY =
        y + Math.sin(angle) * radius * 1.4 + (Math.random() - 0.5) * radius;
      const endForkX = x + Math.cos(angle) * radius * 2.5;
      const endForkY = y + Math.sin(angle) * radius * 2.5;
      ctx.lineTo(midX, midY);
      ctx.lineTo(endForkX, endForkY);
      ctx.stroke();
      ctx.restore();
    } else {
      // Standard projectile / Spear: line pointing with arrowhead
      const length = projectile.radius * scale * 3;
      const endX = x + Math.cos(angle) * length;
      const endY = y + Math.sin(angle) * length;

      // Draw spear body
      ctx.strokeStyle = "#ffaa00"; // Orange/yellow for spear
      ctx.lineWidth = 2 * inverseScale;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(endX, endY);
      ctx.stroke();

      // Draw spear tip (small triangle)
      const tipSize = projectile.radius * scale * 1.5;
      ctx.fillStyle = "#ff6600"; // Darker orange for tip
      ctx.beginPath();
      ctx.moveTo(endX, endY);
      ctx.lineTo(
        endX -
          Math.cos(angle) * tipSize +
          Math.cos(angle + Math.PI / 2) * tipSize * 0.3,
        endY -
          Math.sin(angle) * tipSize +
          Math.sin(angle + Math.PI / 2) * tipSize * 0.3,
      );
      ctx.lineTo(
        endX -
          Math.cos(angle) * tipSize +
          Math.cos(angle - Math.PI / 2) * tipSize * 0.3,
        endY -
          Math.sin(angle) * tipSize +
          Math.sin(angle - Math.PI / 2) * tipSize * 0.3,
      );
      ctx.closePath();
      ctx.fill();

      // Draw collision radius (synced `Projectile.radius` from server)
      ctx.strokeStyle = "rgba(255, 0, 0, 0.5)"; // Semi-transparent red
      ctx.lineWidth = inverseScale;
      ctx.beginPath();
      ctx.arc(x, y, projectile.radius * scale, 0, Math.PI * 2);
      ctx.stroke();
    }
  });
};

import { RENDER_CONFIG, COLORS } from '../config/gameConfig';
import { drawCircle, drawLine, drawText, drawHealthBar, drawHeading, drawAttackCone, drawAttackSlash } from '../utils/drawingUtils';
import { Companion } from '../types/game';

const NPC_PURPLE = '#9b59b6';
const NPC_PURPLE_LIGHT = '#a569bd';

/**
 * Draw all NPCs/companions (player-like: HP, attack status) with purple theme.
 */
export const drawCompanions = (
  ctx: CanvasRenderingContext2D,
  companions: Map<string, Companion>,
  scale: number,
  viewScale: number = 1
): void => {
  const inverseScale = 1 / viewScale;

  companions.forEach(comp => {
    const x = comp.x * scale;
    const y = comp.y * scale;

    if (comp.isCasting) {
      const pulseTime = Date.now() % 500;
      const pulsePhase = pulseTime / 500;
      const pulseAlpha = 0.2 + (Math.sin(pulsePhase * Math.PI * 2) * 0.3);

      ctx.save();
      ctx.fillStyle = `rgba(155, 89, 182, ${pulseAlpha})`;
      ctx.beginPath();
      const radiusPulse = 1 + (Math.sin(pulsePhase * Math.PI * 2) * 0.1);
      ctx.arc(x, y, (comp.radius + 4) * scale * radiusPulse, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = `rgba(142, 68, 173, ${1 - pulsePhase})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, (comp.radius + 2 + (pulsePhase * 10)) * scale, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    if (!comp.isAlive) {
      if (comp.diedAt > 0) {
        const timeRemaining = Math.max(0, comp.respawnTimeMs - (Date.now() - comp.diedAt)) / 1000;
        const fontSize = 12 * inverseScale;
        drawText(
          ctx,
          `Respawning... ${timeRemaining.toFixed(1)}s`,
          x - (25 * inverseScale),
          y,
          NPC_PURPLE_LIGHT,
          `${fontSize}px Arial`
        );
      }
      return;
    }

    drawCircle(ctx, x, y, comp.radius * scale, NPC_PURPLE);

    if (comp.maxHealth && comp.currentHealth !== undefined) {
      drawHealthBar(
        ctx, x, y, comp.currentHealth, comp.maxHealth, comp.radius, scale,
        '#ff4444', NPC_PURPLE, '#000000',
        { minWidth: 20, maxWidth: 30, minHeight: 3, maxHeight: 6, minOffset: 4, maxOffset: 12, widthMultiplier: 1.5, heightMultiplier: 0.2 },
        viewScale
      );
    }

    const fontSize = 10 * inverseScale;
    drawText(
      ctx,
      'NPC',
      x - (12 * inverseScale),
      y - (comp.radius * scale) - (14 * inverseScale),
      COLORS.hudText,
      `${fontSize}px Arial`
    );

    if (comp.tag) {
      drawText(
        ctx,
        comp.tag,
        x - (12 * inverseScale),
        y - (comp.radius * scale) - (4 * inverseScale),
        NPC_PURPLE_LIGHT,
        `${fontSize * 0.9}px Arial`
      );
    }

    if (comp.heading !== undefined) {
      drawHeading(
        ctx, x, y, comp.heading, comp.radius + 2, scale, '#ffffff', 2, 0.6, viewScale
      );
    }

    if (comp.isAttacking && comp.heading !== undefined) {
      drawAttackCone(ctx, x, y, comp.heading, comp.attackRange || 1.5, scale, NPC_PURPLE_LIGHT, 0.4);
      drawAttackSlash(ctx, x, y, comp.heading, comp.radius * scale, '#ffffff', 5, viewScale);
    }

    if (comp.vx || comp.vy) {
      ctx.lineWidth = 2 * inverseScale;
      drawLine(ctx, x, y, x + comp.vx * RENDER_CONFIG.velocityVectorScale, y + comp.vy * RENDER_CONFIG.velocityVectorScale, NPC_PURPLE, 2 * inverseScale);
    }
  });
};

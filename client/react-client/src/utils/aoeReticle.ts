import { SKILL_DEFINITIONS } from "../config/skills";

/** Mirrors server-rs skill_execution.rs `max_cast_range`. */
export const MAX_CAST_RANGE = 200;

export interface AoeReticle {
  x: number;
  y: number;
  radius: number;
}

/** Ground-targeted AoE indicator for a skill, or null if it has none. */
export function getAoeReticle(
  skillId: string,
  aim: { x: number; y: number },
  caster: { x: number; y: number },
): AoeReticle | null {
  const radius = SKILL_DEFINITIONS[skillId]?.aoeRadius;
  if (!radius || !Number.isFinite(aim.x) || !Number.isFinite(aim.y)) {
    return null;
  }
  const dx = aim.x - caster.x;
  const dy = aim.y - caster.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= MAX_CAST_RANGE) return { x: aim.x, y: aim.y, radius };
  return {
    x: caster.x + (dx / dist) * MAX_CAST_RANGE,
    y: caster.y + (dy / dist) * MAX_CAST_RANGE,
    radius,
  };
}

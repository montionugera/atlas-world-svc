export interface Vec2 { x: number; y: number }

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function applyFriction(v: number, friction: number): number {
  const nv = v * friction;
  return Math.abs(nv) < 0.1 ? 0 : nv;
}

export function stepPlayer(
  pos: Vec2,
  vel: Vec2,
  dt: number,
  bounds: { min: number; max: number },
  friction = 0.95
): { pos: Vec2; vel: Vec2 } {
  const nx = clamp(pos.x + vel.x * dt, bounds.min, bounds.max);
  const ny = clamp(pos.y + vel.y * dt, bounds.min, bounds.max);
  const vx = applyFriction(vel.x, friction);
  const vy = applyFriction(vel.y, friction);
  return { pos: { x: nx, y: ny }, vel: { x: vx, y: vy } };
}

export function processInput(input: { move?: Vec2 }, maxSpeed = 10): Vec2 {
  const mx = clamp(input?.move?.x ?? 0, -maxSpeed, maxSpeed);
  const my = clamp(input?.move?.y ?? 0, -maxSpeed, maxSpeed);
  return { x: mx, y: my };
}



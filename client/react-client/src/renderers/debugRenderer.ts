/**
 * Debug-only world-space drawing. Call inside the camera transform, with the same
 * extrapolated entity maps the sprites are drawn from. All sizes are world units;
 * `viewScale` only keeps line widths and text a constant size on screen.
 */
import { StaticBlock, TERRAIN_TYPES, TerrainZone } from "../config/terrain";
import { speedOf } from "../utils/debugTools";

/** A velocity vector reaches where the entity will be this many seconds from now. */
export const VELOCITY_VECTOR_SECONDS = 0.25;

interface DebugEntity {
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  radius?: number;
  attackRange?: number;
  isAlive?: boolean;
}

export interface WorldDebugInput {
  players: Map<string, DebugEntity>;
  mobs: Map<string, DebugEntity>;
  projectiles?: Map<string, DebugEntity>;
  playerId: string;
  viewScale: number;
  /** Smoothed local-player speed (u/s) for the on-canvas label. */
  localSpeed: number;
}

const FULL_CIRCLE = Math.PI * 2;

const ring = (
  ctx: CanvasRenderingContext2D,
  e: DebugEntity,
  radius: number,
  color: string,
  dash: number[],
): void => {
  ctx.setLineDash(dash);
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.arc(e.x, e.y, radius, 0, FULL_CIRCLE);
  ctx.stroke();
};

const velocityVector = (
  ctx: CanvasRenderingContext2D,
  e: DebugEntity,
): void => {
  if (speedOf(e.vx, e.vy) < 1) return;
  ctx.beginPath();
  ctx.moveTo(e.x, e.y);
  ctx.lineTo(
    e.x + (e.vx ?? 0) * VELOCITY_VECTOR_SECONDS,
    e.y + (e.vy ?? 0) * VELOCITY_VECTOR_SECONDS,
  );
  ctx.stroke();
};

export function drawWorldDebug(
  ctx: CanvasRenderingContext2D,
  input: WorldDebugInput,
): void {
  const { players, mobs, projectiles, playerId, viewScale } = input;
  const px = 1 / viewScale;
  const dash = [5 * px, 4 * px];

  ctx.save();
  ctx.lineWidth = 1.5 * px;

  // Rings: body radius (solid) and attack reach (dashed).
  mobs.forEach((mob) => {
    if (mob.isAlive === false) return;
    if (mob.radius) ring(ctx, mob, mob.radius, "#ff9f43", []);
    if (mob.attackRange) ring(ctx, mob, mob.attackRange, "#ff9f43", dash);
  });
  const local = players.get(playerId);
  players.forEach((p) => {
    if (p.isAlive === false) return;
    if (p.radius) ring(ctx, p, p.radius, "#00e5ff", []);
  });
  if (local && local.isAlive !== false && local.attackRange) {
    ring(ctx, local, local.attackRange, "#ff5252", dash);
  }

  // Velocity vectors: tip = position in VELOCITY_VECTOR_SECONDS at current velocity.
  ctx.setLineDash([]);
  ctx.strokeStyle = "#ff4dff";
  ctx.lineWidth = 2 * px;
  const vector = (e: DebugEntity) => {
    if (e.isAlive !== false) velocityVector(ctx, e);
  };
  players.forEach(vector);
  mobs.forEach(vector);
  projectiles?.forEach(vector);

  // Speed label under the local player.
  if (local && local.isAlive !== false) {
    const label = `${Math.round(input.localSpeed)} u/s`;
    const y = local.y + (local.radius ?? 0) + 16 * px;
    ctx.font = `700 ${13 * px}px monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 3 * px;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.9)";
    ctx.strokeText(label, local.x, y);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(label, local.x, y);
  }

  ctx.restore();
}

export interface WorldRect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

type Rect = { x: number; y: number; width: number; height: number };

/** `a` minus `b`, as up to four non-overlapping rects. */
function subtractRect(a: Rect, b: Rect): Rect[] {
  const ax2 = a.x + a.width;
  const ay2 = a.y + a.height;
  const bx1 = Math.max(a.x, b.x);
  const by1 = Math.max(a.y, b.y);
  const bx2 = Math.min(ax2, b.x + b.width);
  const by2 = Math.min(ay2, b.y + b.height);
  if (bx1 >= bx2 || by1 >= by2) return [a];
  const out: Rect[] = [];
  if (by1 > a.y)
    out.push({ x: a.x, y: a.y, width: a.width, height: by1 - a.y });
  if (by2 < ay2)
    out.push({ x: a.x, y: by2, width: a.width, height: ay2 - by2 });
  if (bx1 > a.x)
    out.push({ x: a.x, y: by1, width: bx1 - a.x, height: by2 - by1 });
  if (bx2 < ax2)
    out.push({ x: bx2, y: by1, width: ax2 - bx2, height: by2 - by1 });
  return out;
}

// Zones are static per map, so the later-wins pieces are computed once per array.
const visiblePiecesCache = new WeakMap<readonly TerrainZone[], Rect[][]>();

/** Per zone, the part not covered by any LATER zone (later zones win, as in terrainAt). */
function visiblePieces(zones: readonly TerrainZone[]): Rect[][] {
  let cached = visiblePiecesCache.get(zones);
  if (!cached) {
    cached = zones.map((z, i) =>
      zones
        .slice(i + 1)
        .reduce<Rect[]>(
          (pieces, later) => pieces.flatMap((p) => subtractRect(p, later)),
          [z],
        ),
    );
    visiblePiecesCache.set(zones, cached);
  }
  return cached;
}

/**
 * Tint terrain zones. With `labelView` (the world rect on screen) each visible zone is
 * also labelled at the top-centre of its visible part, so big zones stay labelled.
 */
export function drawTerrainZones(
  ctx: CanvasRenderingContext2D,
  zones: readonly TerrainZone[],
  viewScale: number,
  opts: { fillAlpha: number; labelView?: WorldRect },
): void {
  const px = 1 / viewScale;
  ctx.save();
  const pieces = visiblePieces(zones);
  zones.forEach((z, i) => {
    const def = TERRAIN_TYPES[z.terrain];
    ctx.globalAlpha = opts.fillAlpha;
    ctx.fillStyle = def.color;
    for (const p of pieces[i]) ctx.fillRect(p.x, p.y, p.width, p.height);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = def.color;
    ctx.lineWidth = 2 * px;
    ctx.strokeRect(z.x, z.y, z.width, z.height);
  });
  const view = opts.labelView;
  if (view) {
    ctx.font = `700 ${11 * px}px monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (const z of zones) {
      const left = Math.max(z.x, view.minX);
      const right = Math.min(z.x + z.width, view.maxX);
      const top = Math.max(z.y, view.minY);
      if (left >= right || top >= Math.min(z.y + z.height, view.maxY)) continue;
      const def = TERRAIN_TYPES[z.terrain];
      const label = `${def.label.toUpperCase()} x${def.speedMultiplier.toFixed(2)}`;
      const x = (left + right) / 2;
      const y = top + 4 * px;
      ctx.lineWidth = 3 * px;
      ctx.strokeStyle = "rgba(0, 0, 0, 0.9)";
      ctx.strokeText(label, x, y);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(label, x, y);
    }
  }
  ctx.restore();
}

/** Solid obstacles of a plain test map. */
export function drawStaticBlocks(
  ctx: CanvasRenderingContext2D,
  blocks: readonly StaticBlock[],
  viewScale: number,
): void {
  if (blocks.length === 0) return;
  ctx.save();
  ctx.fillStyle = "#1f2933";
  ctx.strokeStyle = "#f5f5f5";
  ctx.lineWidth = 2 / viewScale;
  for (const b of blocks) {
    ctx.fillRect(b.x, b.y, b.width, b.height);
    ctx.strokeRect(b.x, b.y, b.width, b.height);
  }
  ctx.restore();
}

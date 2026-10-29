// Game types for Colyseus client
import type { PosSample, SnapshotClock } from "../utils/snapshotInterpolation";

export interface Position {
  x: number;
  y: number;
}

export interface BattleStatus {
  id: string;
  type: string;
  expiresAt: number;
  sourceId: string;
  value: number;
  interval: number;
  lastTick: number;
}

export interface ZoneEffect {
  id: string;
  x: number;
  y: number;

  ownerId: string;
  skillId?: string; // Synced from server
  radius: number;
  effects: { type: string; value: number; chance?: number }[];

  // Timing
  castTime: number;
  duration: number;
  tickRate: number;

  // State
  isActive: boolean;
  createdAt: number;
  activatedAt: number;
}

export interface Mob {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** performance.now() when the snapshot carrying x/y/vx/vy arrived. */
  receivedAt?: number;
  /** Recent server positions on the simulation timeline (snapshot interpolation). */
  samples?: PosSample[];
  radius: number; // Receive radius from server
  tag: string; // Current behavior tag
  mobTypeId?: string; // Synced from server for UI display
  isAlive?: boolean;
  isCasting?: boolean; // Synced: casting state for client animation
  // Status Effects
  // Status Effects
  battleStatuses?: Map<string, BattleStatus>; // Synced: Status Type -> BattleStatus Object

  // Combat and Visuals
  currentHealth?: number;
  maxHealth?: number;
  heading?: number;
  isAttacking?: boolean;
  attackRange?: number;

  // Resistances
  freezeResist?: number;
  stunResist?: number;
}

export interface Companion extends Mob {
  ownerId: string;
  respawnTimeMs: number;
  diedAt: number;
}

export interface Player {
  id: string;
  sessionId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** performance.now() when the snapshot carrying x/y/vx/vy arrived. */
  receivedAt?: number;
  /** Recent server positions on the simulation timeline (snapshot interpolation). */
  samples?: PosSample[];
  radius?: number;
  name: string;
  isBotMode?: boolean; // Synced from server
  /** server-rs: `client_tick` of the last input this player's tick ran on (0: none). */
  inputAck?: number;
  currentBehavior?: string;
  currentAttackTarget?: string;
  isAlive?: boolean;
  health?: number;
  currentHealth?: number;
  maxHealth?: number;
  castingUntil?: number; // Synced from server
  castDuration?: number; // Synced from server
  cooldowns?: Map<string, number>; // Synced Action ID -> Timestamp
  globalCooldownUntil?: number; // Synced Timestamp
  // Status Effects
  // Status Effects
  battleStatuses?: Map<string, BattleStatus>; // Synced: Status Type -> BattleStatus Object

  // Resistances
  resistances?: Map<string, number>; // Synced: Type -> Value (0-1)

  // Combat and Visuals
  heading?: number;
  isAttacking?: boolean;
  attackRange?: number;
  level?: number;
  xp?: number;
  race?: number;
  enchantGlow?: number;
}

export interface Projectile {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** performance.now() when the snapshot carrying x/y/vx/vy arrived. */
  receivedAt?: number;
  /** Recent server positions on the simulation timeline (snapshot interpolation). */
  samples?: PosSample[];
  radius: number;
  ownerId: string;
  isStuck: boolean;
  /** Synced from server `Projectile.type` (e.g. melee, smallMeelee, largeMeelee). */
  type?: string;
  teamId?: string;
  /** server-rs: simulation time of its last position, once it has left the snapshot. */
  endsAt?: number;
}

/** server-rs combat event (wire `GameEvent`); kind 0 = hit, 1 = kill. */
export interface GameEventInfo {
  kind: number;
  sourceId: number;
  targetId: number;
  amount: number;
}

export interface GameState {
  players: Map<string, Player>;
  mobs: Map<string, Mob>;
  /** Server sends npcs (MapSchema). Use this for companion/NPC list. */
  npcs?: Map<string, Companion>;
  /** @deprecated Prefer npcs. Kept for backward compat. */
  companions?: Map<string, Companion>;
  projectiles?: Map<string, Projectile>;
  zoneEffects?: Map<string, ZoneEffect>;
  /** server-rs: maps performance.now() onto the snapshot timeline for rendering. */
  renderClock?: SnapshotClock;
  /** server-rs: combat events (hit / kill) carried by the latest snapshot. */
  events?: GameEventInfo[];
  tick: number;
  mapId: string;
  roomId?: string;
  width: number;
  height: number;
  /** World units visible across the camera (default 50 = legacy Colyseus scale). */
  viewportSize?: number;
}

// Game types for Colyseus client

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
  effects: { type: string, value: number, chance?: number }[];
  
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
  radius: number; // Receive radius from server
  tag: string; // Current behavior tag
  isAlive?: boolean;
  // Status Effects
  // Status Effects
  battleStatuses?: Map<string, BattleStatus>; // Synced: Status Type -> BattleStatus Object
  
  // Resistances
  freezeResist?: number;
  stunResist?: number;
}

export interface Player {
  id: string;
  sessionId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  name: string;
  isBotMode?: boolean; // Synced from server
  currentBehavior?: string;
  currentAttackTarget?: string;
  isAlive?: boolean;
  health?: number;
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
}

export interface Projectile {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  ownerId: string;
  isStuck: boolean;
}

export interface GameState {
  players: Map<string, Player>;
  mobs: Map<string, Mob>;
  projectiles?: Map<string, Projectile>;
  zoneEffects?: Map<string, ZoneEffect>; // Changed from traps
  tick: number;
  mapId: string;
  roomId?: string; // Room ID from server (synced via Colyseus)
  width: number;
  height: number;
}

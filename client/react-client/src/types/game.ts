// Game types for Colyseus client

export interface Position {
  x: number;
  y: number;
}

export interface Trap {
  id: string;
  x: number;
  y: number;
  ownerId: string;
  effectType: 'damage' | 'freeze' | 'stun';
  effectValue: number;
  triggerRadius: number;
  isArmed: boolean;
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
  isFrozen?: boolean;
  isStunned?: boolean;
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
  // Status Effects
  isFrozen?: boolean;
  isStunned?: boolean;
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
  traps?: Map<string, Trap>;
  tick: number;
  mapId: string;
  roomId?: string; // Room ID from server (synced via Colyseus)
  width: number;
  height: number;
}

// Game types for Colyseus client

export interface Position {
  x: number;
  y: number;
}

export interface Mob {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number; // Receive radius from server
  tag: string; // Current behavior tag
}

export interface Player {
  id: string;
  sessionId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  name: string;
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
  tick: number;
  mapId: string;
  width: number;
  height: number;
}

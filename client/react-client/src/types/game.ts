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

export interface GameState {
  players: Map<string, Player>;
  mobs: Map<string, Mob>;
  tick: number;
  mapId: string;
  width: number;
  height: number;
}

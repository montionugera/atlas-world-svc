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
  mobs: Mob[];
  tick: number;
  mapId: string;
  width: number;
  height: number;
}

// Game data types and interfaces

export interface Position {
  x: number;
  y: number;
}

export interface Velocity {
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
  position: Position;
  joinedAt: number;
}

export interface MatchState {
  id: string;
  tick: number;
  players: Record<string, Player>;
  mobs: Mob[];
  createdAt: number;
}

export interface RpcResponse {
  success: boolean;
  error?: string;
}

export interface CreateMatchResponse extends RpcResponse {
  matchId?: string;
  type?: string;
}

export interface JoinMatchResponse extends RpcResponse {
  matchId?: string;
  playerCount?: number;
  snapshot?: { mobs: Mob[] };
}

export interface UpdatePositionResponse extends RpcResponse {
  tick?: number;
  players?: Player[];
  mobs?: Mob[];
}

export interface GetMatchStateResponse extends RpcResponse {
  matchId?: string;
  tick?: number;
  players?: Player[];
  mobs?: Mob[];
  playerCount?: number;
}

export interface UpdateMobsResponse extends RpcResponse {
  matchId?: string;
  tick?: number;
  mobs?: Mob[];
}

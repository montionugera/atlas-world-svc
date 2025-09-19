// Game types for React client

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
  position: Position;
  joinedAt: number;
}

export interface MatchState {
  id: string;
  tick: number;
  players: Record<string, Player>;
  mobs: Mob[];
  createdAt: number;
  playerCount: number;
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

export interface ClientConfig {
  serverHost: string;
  serverPort: number;
  serverKey: string;
  useSSL: boolean;
}

// Map-based types (MMO map flow)
export interface MapStateResponse extends RpcResponse {
  mapId?: string;
  tick?: number;
  players?: Player[];
  mobs?: Mob[];
  playerCount?: number;
  snapshot?: { mobs: Mob[]; players: Player[] };
}

export interface EnterMapResponse extends RpcResponse {
  mapId?: string;
  tick?: number;
  snapshot?: { mobs: Mob[]; players: Player[] };
}

export interface UpdateMapResponse extends RpcResponse {
  mapId?: string;
  tick?: number;
  mobs?: Mob[];
}

export interface UpdatePlayerInputResponse extends RpcResponse {
  tick?: number;
  players?: Player[];
  mobs?: Mob[];
}

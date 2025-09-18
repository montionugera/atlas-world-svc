// Nakama TypeScript type definitions for server-side runtime
// Based on Nakama 3.15.0 API

export interface nkruntime {
  // Logging
  logger: Logger;
  
  // Match operations
  matchCreate(module: string, params?: any): string;
  matchGet(matchId: string): Match | null;
  matchList(limit?: number, authoritative?: boolean, label?: string, minSize?: number, maxSize?: number, query?: string): Match[];
  registerMatch(name: string, handler: any): void;
  // User operations
  usersGetId(userIds: string[]): User[];
  usersGetUsername(usernames: string[]): User[];
  
  // Storage operations
  storageRead(reads: StorageReadRequest[]): StorageObject[];
  storageWrite(writes: StorageWriteRequest[]): StorageWriteAck[];
  storageDelete(deletes: StorageDeleteRequest[]): void;
  
  // Wallet operations
  walletUpdate(userId: string, changeset: { [key: string]: number }, metadata?: { [key: string]: any }): WalletUpdateResult;
  
  // Notifications
  notificationSend(userId: string, subject: string, content: { [key: string]: any }, code: number, senderId?: string, persistent?: boolean): void;
  
  // Registration methods (for runtime context)
  rpcRegister?: (id: string, fn: Function) => void;
  matchmakerMatched?: Function;
  afterAuthenticate?: Function;
  beforeSessionDisconnect?: Function;
}

export interface Logger {
  debug(message: string, ...args: any[]): void;
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
}

export interface Match {
  matchId: string;
  authoritative: boolean;
  label?: string;
  size: number;
  tickRate: number;
  handlerName: string;
  createdAt: number;
}

export interface User {
  userId: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  langTag?: string;
  location?: string;
  timezone?: string;
  metadata?: { [key: string]: any };
  createTime?: number;
  updateTime?: number;
}

export interface Presence {
  userId: string;
  sessionId: string;
  username: string;
  node: string;
}

export interface MatchData {
  matchId: string;
  presence: Presence;
  opCode: number;
  data: Uint8Array;
  reliable: boolean;
  receiveTime: number;
}

export interface MatchDispatcher {
  broadcastMessage(opCode: number, data: Uint8Array | string, presences?: Presence[], sender?: Presence, reliable?: boolean): void;
  matchKick(presences: Presence[]): void;
  matchLabelUpdate(label: string): void;
}

export interface MatchState {
  [key: string]: any;
}

// Match handler interface
export interface MatchHandler {
  matchInit(ctx: nkruntime, logger: Logger, nk: nkruntime, params: { [key: string]: any }): { state: MatchState; tickRate: number; label: string };
  matchJoinAttempt(ctx: nkruntime, logger: Logger, nk: nkruntime, dispatcher: MatchDispatcher, tick: number, state: MatchState, presence: Presence, metadata: { [key: string]: any }): { state: MatchState; accept: boolean; rejectMessage?: string } | null;
  matchJoin(ctx: nkruntime, logger: Logger, nk: nkruntime, dispatcher: MatchDispatcher, tick: number, state: MatchState, presences: Presence[]): { state: MatchState } | null;
  matchLeave(ctx: nkruntime, logger: Logger, nk: nkruntime, dispatcher: MatchDispatcher, tick: number, state: MatchState, presences: Presence[]): { state: MatchState } | null;
  matchLoop(ctx: nkruntime, logger: Logger, nk: nkruntime, dispatcher: MatchDispatcher, tick: number, state: MatchState, messages: MatchData[]): { state: MatchState } | null;
  matchTerminate(ctx: nkruntime, logger: Logger, nk: nkruntime, dispatcher: MatchDispatcher, tick: number, state: MatchState, graceSeconds: number): { state: MatchState } | null;
  matchSignal(ctx: nkruntime, logger: Logger, nk: nkruntime, dispatcher: MatchDispatcher, tick: number, state: MatchState, data: string): { state: MatchState; data?: string } | null;
}

// Storage types
export interface StorageReadRequest {
  collection: string;
  key: string;
  userId?: string;
}

export interface StorageWriteRequest {
  collection: string;
  key: string;
  userId?: string;
  value: any;
  version?: string;
  permissionRead?: number;
  permissionWrite?: number;
}

export interface StorageDeleteRequest {
  collection: string;
  key: string;
  userId?: string;
  version?: string;
}

export interface StorageObject {
  collection: string;
  key: string;
  userId?: string;
  value: any;
  version: string;
  permissionRead: number;
  permissionWrite: number;
  createTime: number;
  updateTime: number;
}

export interface StorageWriteAck {
  collection: string;
  key: string;
  userId?: string;
  version: string;
}

export interface WalletUpdateResult {
  updated: { [key: string]: number };
  previous: { [key: string]: number };
}

// Global declarations for Nakama runtime
declare global {
  // Nakama injects this at runtime; not re-declared in TS to avoid conflicts
  // We purposely do not declare a const here to prevent redeclaration issues.
}

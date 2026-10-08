// React hook for Atlas World high-density Rust game server (server-rs) client
// Replaces Colyseus with zero-allocation FlatBuffers binary streaming over WebSockets

import { useState, useCallback, useRef, useEffect } from 'react';
import * as flatbuffers from 'flatbuffers';
import { GameState, Player, Mob } from '../types/game';
import {
  emptyEquipmentSnapshot,
  type EquipmentSnapshot,
} from '../config/equipmentSlots';
import { BinaryDeltaDecoder, EntityType } from '../protocol/BinaryDeltaDecoder';
import { ClientInput } from '../protocol/generated/atlas/protocol/client-input';

export interface ServerRsClientConfig {
  serverHost: string;
  serverPort: number;
  useSSL: boolean;
  token?: string;
}

export interface UseServerRsClientReturn {
  // State
  isConnected: boolean;
  roomId: string | null;
  playerId: string;
  gameState: GameState | null;
  updateCount: number;
  isSimulating: boolean;
  fps: number;
  updateRate: number;
  equipment: EquipmentSnapshot;
  equipmentRequestPending: boolean;
  equippedWeaponId: string;

  // Actions
  connect: () => Promise<void>;
  joinRoom: (mapId?: string) => Promise<void>;
  updatePlayerInput: (vx: number, vy: number) => void;
  sendPlayerAction: (action: string, pressed: boolean, options?: any) => void;
  switchWeapon: (weaponId: string) => void;
  requestEquipment: () => void;
  requestLoadout: () => void;
  toggleBotMode: (enabled: boolean) => void;
  respawn: () => void;
  startSimulation: () => void;
  stopSimulation: () => void;

  // Utilities
  disconnect: () => void;
  trackFrame: () => void;
  debugTeleport: (x: number, y: number) => void;
  debugSpawnMob: (x: number, y: number) => void;
  forceDie: () => void;
}

export function fnv1a32(s: string): number {
  let hash = 2166136261;
  for (let i = 0; i < s.length; i++) {
    hash ^= s.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash;
}

/**
 * server-rs world scale: 1000×1000 arena, player speed ≈ 200 units/s (10× the legacy
 * Colyseus units). The camera must show a matching span or a 0.1s tap moves 40% of
 * a 50-unit screen and the follow-camera makes movement look frozen.
 */
export const SERVER_RS_VIEWPORT = 400;
export const SERVER_RS_PLAYER_RADIUS = 12;
export const SERVER_RS_MOB_RADIUS = 14;

/** Skill id → server-rs skill slot (see server-rs/src/systems/skill_execution.rs). */
const SKILL_SLOTS: Record<string, number> = {
  skill_1: 1,
  skill_2: 2,
  skill_3: 3,
  skill_4: 4,
  skill_dash: 5,
};

export function skillSlotFor(options?: { skillId?: string; skillSlot?: number }): number {
  if (options?.skillId && SKILL_SLOTS[options.skillId] !== undefined) return SKILL_SLOTS[options.skillId];
  return options?.skillSlot ?? 0;
}

export const useServerRsClient = (config: ServerRsClientConfig): UseServerRsClientReturn => {
  // State
  const [isConnected, setIsConnected] = useState(false);
  const [roomId, setRoomId] = useState<string | null>(null);
  const sessionName = config.token?.startsWith('dev-token:')
    ? config.token.replace('dev-token:', '')
    : config.token && config.token !== 'dev-token'
      ? config.token
      : 'dev-player';
  const initialPlayerId = String(fnv1a32(sessionName));
  const [playerId, setPlayerId] = useState(initialPlayerId);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [updateCount, setUpdateCount] = useState(0);
  const [isSimulating, setIsSimulating] = useState(false);
  const [fps, setFps] = useState(0);
  const [updateRate, setUpdateRate] = useState(0);
  const [equipment, setEquipment] = useState<EquipmentSnapshot>(() => emptyEquipmentSnapshot());
  const [equipmentRequestPending, setEquipmentRequestPending] = useState(false);

  // Refs
  const wsRef = useRef<WebSocket | null>(null);
  const clientTickRef = useRef<number>(0);
  const isConnectingRef = useRef<boolean>(false);
  // Currently-held input, re-sent with every packet (server input is full-state).
  const moveRef = useRef<{ vx: number; vy: number }>({ vx: 0, vy: 0 });
  const attackHeldRef = useRef<boolean>(false);
  const simulationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const frameCountRef = useRef<number>(0);
  const lastFpsTimeRef = useRef<number>(performance.now());
  const updateTimesRef = useRef<number[]>([]);
  const stateRef = useRef<GameState>({
    players: new Map(),
    mobs: new Map(),
    tick: 0,
    mapId: 'map-01-sector-a',
    roomId: 'server-rs-room',
    width: 1000,
    height: 1000,
    viewportSize: SERVER_RS_VIEWPORT,
  });

  // Track frame for FPS calculation
  const trackFrame = useCallback(() => {
    const now = performance.now();
    frameCountRef.current++;
    if (now - lastFpsTimeRef.current >= 1000) {
      setFps(Math.round((frameCountRef.current * 1000) / (now - lastFpsTimeRef.current)));
      frameCountRef.current = 0;
      lastFpsTimeRef.current = now;
    }
  }, []);

  // Disconnect WebSocket
  const disconnect = useCallback(() => {
    if (simulationIntervalRef.current) {
      clearInterval(simulationIntervalRef.current);
      simulationIntervalRef.current = null;
    }
    setIsSimulating(false);

    if (wsRef.current) {
      const ws = wsRef.current;
      wsRef.current = null;
      ws.close();
    }
    // Reset held input and the replicated-entity cache so a reconnect starts clean.
    moveRef.current = { vx: 0, vy: 0 };
    attackHeldRef.current = false;
    stateRef.current.players.clear();
    stateRef.current.mobs.clear();

    setIsConnected(false);
    setRoomId(null);
    setGameState(null);
    setUpdateCount(0);
    localStorage.removeItem('atlas-world-server-rs-connected');
  }, []);

  // Connect to server-rs WebSocket gateway
  const connect = useCallback(async () => {
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    return new Promise<void>((resolve, reject) => {
      try {
        isConnectingRef.current = true;
        const protocol = config.useSSL ? 'wss' : 'ws';
        const token = config.token || 'dev-token';
        const sessionName = token.startsWith('dev-token:')
          ? token.replace('dev-token:', '')
          : token !== 'dev-token'
            ? token
            : 'dev-player';
        const localPlayerId = String(fnv1a32(sessionName));
        setPlayerId(localPlayerId);
        const url = `${protocol}://${config.serverHost}:${config.serverPort}?token=${token}`;

        const ws = new WebSocket(url);
        ws.binaryType = 'arraybuffer';
        // Track immediately so a disconnect() during CONNECTING (e.g. React
        // StrictMode double-mount) closes this socket instead of leaking it.
        wsRef.current = ws;
        // Settle the connect() promise exactly once, whatever happens first.
        let settled = false;
        const settle = (err?: unknown) => {
          if (settled) return;
          settled = true;
          if (err === undefined) resolve();
          else reject(err);
        };

        ws.onopen = () => {
          if (wsRef.current !== ws) {
            // Superseded (StrictMode remount / disconnect during CONNECTING): not an error.
            ws.close();
            settle();
            return;
          }
          setIsConnected(true);
          setRoomId('server-rs-room');
          isConnectingRef.current = false;
          localStorage.setItem('atlas-world-server-rs-connected', 'true');

          // Send initial input frame so avatar spawns immediately
          const builder = new flatbuffers.Builder(64);
          const offset = ClientInput.createClientInput(
            builder,
            clientTickRef.current++,
            0,
            0,
            false,
            0,
            0
          );
          builder.finish(offset);
          ws.send(builder.asUint8Array());
          settle();
        };

        ws.onmessage = async (event: MessageEvent) => {
          // Frames still in flight on a superseded socket must not resurrect state.
          if (wsRef.current !== ws) return;
          let buffer: ArrayBuffer;
          if (event.data instanceof ArrayBuffer) {
            buffer = event.data;
          } else if (event.data instanceof Blob) {
            buffer = await event.data.arrayBuffer();
          } else {
            return;
          }

          try {
            if (wsRef.current !== ws) return; // superseded while awaiting a Blob
            const snapshot = BinaryDeltaDecoder.decode(buffer);
            const current = stateRef.current;
            current.tick = snapshot.tick;

            for (const entity of snapshot.entities) {
              const idStr = String(entity.id);
              if (entity.entityType === EntityType.Player) {
                const existing = current.players.get(idStr);
                const isLocalPlayer = idStr === localPlayerId;
                const updated: Player = {
                  ...existing,
                  id: idStr,
                  sessionId: idStr,
                  x: entity.x,
                  y: entity.y,
                  vx: entity.vx,
                  vy: entity.vy,
                  radius: SERVER_RS_PLAYER_RADIUS,
                  name: isLocalPlayer ? 'Player (YOU)' : (existing?.name || `Player-${idStr}`),
                  health: entity.health,
                  currentHealth: entity.health,
                  maxHealth: entity.maxHealth,
                  isAlive: entity.health > 0,
                  isBotMode: !isLocalPlayer,
                };
                current.players.set(idStr, updated);
              } else if (entity.entityType === EntityType.Mob) {
                const existing = current.mobs.get(idStr);
                const updated: Mob = {
                  ...existing, // first: fresh snapshot fields must win
                  id: idStr,
                  x: entity.x,
                  y: entity.y,
                  vx: entity.vx,
                  vy: entity.vy,
                  radius: SERVER_RS_MOB_RADIUS,
                  tag: 'mob',
                  currentHealth: entity.health,
                  maxHealth: entity.maxHealth,
                  isAlive: entity.health > 0,
                };
                current.mobs.set(idStr, updated);
              }
            }

            for (const removedId of snapshot.removedIds) {
              const idStr = String(removedId);
              current.players.delete(idStr);
              current.mobs.delete(idStr);
            }

            const nextState: GameState = {
              ...current,
              players: new Map(current.players),
              mobs: new Map(current.mobs),
            };
            setGameState(nextState);
            // Expose for quick debug / e2e (parity with useColyseusClient)
            (window as any).__gameState = nextState;
            (window as any).__playerId = localPlayerId;
            setUpdateCount((prev) => prev + 1);

            // Calculate update rate over a sliding 10s window
            const now = Date.now();
            updateTimesRef.current.push(now);
            const tenSecondsAgo = now - 10000;
            updateTimesRef.current = updateTimesRef.current.filter((t) => t > tenSecondsAgo);
            if (updateTimesRef.current.length > 1) {
              const span = updateTimesRef.current[updateTimesRef.current.length - 1] - updateTimesRef.current[0];
              if (span > 0) {
                setUpdateRate(Math.round(((updateTimesRef.current.length - 1) * 1000) / span));
              }
            }
          } catch (decodeErr) {
            console.error('Failed to decode FlatBuffers snapshot:', decodeErr);
          }
        };

        ws.onerror = (err) => {
          if (wsRef.current !== ws) return settle();
          console.error('WebSocket error:', err);
          isConnectingRef.current = false;
          settle(err);
        };

        ws.onclose = () => {
          // A superseded socket (StrictMode remount, reconnect) must not wipe the live session's state.
          if (wsRef.current !== ws) {
            // Superseded, or deliberately disconnect()ed (wsRef already null): not an error.
            settle();
            if (wsRef.current !== null) return;
          } else {
            wsRef.current = null;
            settle(new Error('WebSocket closed before it opened'));
          }
          setIsConnected(false);
          setRoomId(null);
          setGameState(null);
          isConnectingRef.current = false;
        };
      } catch (err) {
        isConnectingRef.current = false;
        reject(err);
      }
    });
  }, [config]);

  // Send binary input frame
  const sendInput = useCallback((vx: number, vy: number, attack: boolean = false, skillSlot: number = 0, targetId: number = 0) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }

    const builder = new flatbuffers.Builder(64);
    const offset = ClientInput.createClientInput(
      builder,
      clientTickRef.current++,
      vx,
      vy,
      attack,
      skillSlot,
      targetId
    );
    builder.finish(offset);
    const bytes = builder.asUint8Array();
    wsRef.current.send(bytes);
  }, []);

  // Join room (maps seamlessly to server-rs ready connection)
  const joinRoom = useCallback(async (mapId: string = 'map-01-sector-a') => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      await connect();
    }
    const targetRoomId = `server-rs-${mapId}`;
    setRoomId(targetRoomId);
    stateRef.current.mapId = mapId;
    stateRef.current.roomId = targetRoomId;
    setGameState((prev) =>
      prev
        ? { ...prev, mapId, roomId: targetRoomId }
        : {
            players: new Map(),
            mobs: new Map(),
            tick: 0,
            mapId,
            roomId: targetRoomId,
            width: 1000,
            height: 1000,
            viewportSize: SERVER_RS_VIEWPORT,
          }
    );
    sendInput(moveRef.current.vx, moveRef.current.vy, attackHeldRef.current, 0, 0);
  }, [connect, sendInput]);

  // server-rs treats every ClientInput as the FULL input state (it overwrites
  // PlayerInputState), so each packet must carry the currently-held movement and
  // attack. Sending (0,0) with an action would cancel movement.
  const updatePlayerInput = useCallback((vx: number, vy: number) => {
    moveRef.current = { vx, vy };
    sendInput(vx, vy, attackHeldRef.current, 0, 0);
  }, [sendInput]);

  const sendPlayerAction = useCallback((action: string, pressed: boolean, options?: any) => {
    if (action === 'attack') attackHeldRef.current = pressed;
    const skillSlot = pressed ? skillSlotFor(options) : 0;
    const targetId = options?.targetId ?? 0;
    sendInput(moveRef.current.vx, moveRef.current.vy, attackHeldRef.current, skillSlot, targetId);
  }, [sendInput]);

  const switchWeapon = useCallback((weaponId: string) => {
    setEquipment((prev) => ({
      ...prev,
      mainHand: weaponId,
    }));
  }, []);

  const requestEquipment = useCallback(() => {
    setEquipmentRequestPending(false);
  }, []);

  const requestLoadout = useCallback(() => {
    requestEquipment();
  }, [requestEquipment]);

  const toggleBotMode = useCallback((_enabled: boolean) => {
    // No-op for headless simulation
  }, []);

  const respawn = useCallback(() => {
    sendInput(moveRef.current.vx, moveRef.current.vy, attackHeldRef.current, 0, 0);
  }, [sendInput]);

  const startSimulation = useCallback(() => {
    if (isSimulating) return;
    setIsSimulating(true);

    simulationIntervalRef.current = setInterval(() => {
      const movements = [
        { vx: 1, vy: 0 },
        { vx: 0, vy: 1 },
        { vx: -1, vy: 0 },
        { vx: 0, vy: -1 },
      ];
      const step = Math.floor(updateCount / 2) % movements.length;
      const movement = movements[step];
      updatePlayerInput(movement.vx, movement.vy);
    }, 2000);
  }, [isSimulating, updateCount, updatePlayerInput]);

  const stopSimulation = useCallback(() => {
    setIsSimulating(false);
    if (simulationIntervalRef.current) {
      clearInterval(simulationIntervalRef.current);
      simulationIntervalRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    isConnected,
    roomId,
    playerId,
    gameState,
    updateCount,
    isSimulating,
    fps,
    updateRate,
    equipment,
    equipmentRequestPending,
    equippedWeaponId: equipment.mainHand,

    connect,
    joinRoom,
    updatePlayerInput,
    sendPlayerAction,
    switchWeapon,
    requestEquipment,
    requestLoadout,
    toggleBotMode,
    respawn,
    startSimulation,
    stopSimulation,

    disconnect,
    trackFrame,
    debugTeleport: (_x: number, _y: number) => {},
    debugSpawnMob: (_x: number, _y: number) => {},
    forceDie: () => {},
  };
};

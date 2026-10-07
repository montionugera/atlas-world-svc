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
      wsRef.current.close();
      wsRef.current = null;
    }

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
        setPlayerId(String(fnv1a32(sessionName)));
        const url = `${protocol}://${config.serverHost}:${config.serverPort}?token=${token}`;

        const ws = new WebSocket(url);
        ws.binaryType = 'arraybuffer';

        ws.onopen = () => {
          wsRef.current = ws;
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
          resolve();
        };

        ws.onmessage = async (event: MessageEvent) => {
          let buffer: ArrayBuffer;
          if (event.data instanceof ArrayBuffer) {
            buffer = event.data;
          } else if (event.data instanceof Blob) {
            buffer = await event.data.arrayBuffer();
          } else {
            return;
          }

          try {
            const snapshot = BinaryDeltaDecoder.decode(buffer);
            const current = stateRef.current;
            current.tick = snapshot.tick;

            for (const entity of snapshot.entities) {
              const idStr = String(entity.id);
              if (entity.entityType === EntityType.Player) {
                const existing = current.players.get(idStr);
                const updated: Player = {
                  id: idStr,
                  sessionId: idStr,
                  x: entity.x,
                  y: entity.y,
                  vx: entity.vx,
                  vy: entity.vy,
                  name: `Player-${idStr}`,
                  health: entity.health,
                  maxHealth: entity.maxHealth,
                  isAlive: entity.health > 0,
                  ...existing,
                };
                current.players.set(idStr, updated);
              } else if (entity.entityType === EntityType.Mob) {
                const existing = current.mobs.get(idStr);
                const updated: Mob = {
                  id: idStr,
                  x: entity.x,
                  y: entity.y,
                  vx: entity.vx,
                  vy: entity.vy,
                  radius: 14,
                  tag: 'mob',
                  currentHealth: entity.health,
                  maxHealth: entity.maxHealth,
                  isAlive: entity.health > 0,
                  ...existing,
                };
                current.mobs.set(idStr, updated);
              }
            }

            for (const removedId of snapshot.removedIds) {
              const idStr = String(removedId);
              current.players.delete(idStr);
              current.mobs.delete(idStr);
            }

            setGameState({
              ...current,
              players: new Map(current.players),
              mobs: new Map(current.mobs),
            });
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
          console.error('WebSocket error:', err);
          isConnectingRef.current = false;
          reject(err);
        };

        ws.onclose = () => {
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
    setRoomId('server-rs-room');
    stateRef.current.mapId = mapId;
    sendInput(0, 0, false, 0, 0);
  }, [connect, sendInput]);

  const updatePlayerInput = useCallback((vx: number, vy: number) => {
    sendInput(vx, vy, false, 0, 0);
  }, [sendInput]);

  const sendPlayerAction = useCallback((action: string, pressed: boolean, options?: any) => {
    const isAttack = action === 'attack' && pressed;
    let skillSlot = options?.skillSlot ?? 0;
    if (options?.skillId === 'skill_1') skillSlot = 1;
    if (options?.skillId === 'skill_2') skillSlot = 2;
    if (options?.skillId === 'skill_3') skillSlot = 3;
    if (options?.skillId === 'skill_4') skillSlot = 4;
    const targetId = options?.targetId ?? 0;
    sendInput(0, 0, isAttack, skillSlot, targetId);
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
    sendInput(0, 0, false, 0, 0);
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

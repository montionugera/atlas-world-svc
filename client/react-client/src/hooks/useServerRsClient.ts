// React hook for Atlas World high-density Rust game server (server-rs) client
// Replaces Colyseus with zero-allocation FlatBuffers binary streaming over WebSockets

import { useState, useCallback, useRef, useEffect } from "react";
import * as flatbuffers from "flatbuffers";
import { GameState, Player, Mob, Projectile } from "../types/game";
import {
  emptyEquipmentSnapshot,
  type EquipmentSnapshot,
} from "../config/equipmentSlots";
import { mapDef } from "../config/maps";
import {
  SNAPSHOT_INTERVAL_MS,
  observeSnapshot,
  pushSample,
} from "../utils/snapshotInterpolation";
import {
  BinaryDeltaDecoder,
  EntityType,
  STATE_FLAG_ALIVE,
  STATE_FLAG_BOT,
} from "../protocol/BinaryDeltaDecoder";
import { ClientInput } from "../protocol/generated/atlas/protocol/client-input";

export interface ServerRsClientConfig {
  serverHost: string;
  serverPort: number;
  useSSL: boolean;
  token?: string;
}

export interface LatencyMetrics {
  pingMs: number;
  snapshotIntervalMs: number;
  /** Median / worst gap over the last 20 snapshots. */
  snapshotP50Ms: number;
  snapshotMaxMs: number;
  jitterMs: number;
  serverTimeDeltaMs: number;
  fps: number;
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
  latencyMetrics: LatencyMetrics;
  equipment: EquipmentSnapshot;
  equipmentRequestPending: boolean;
  equippedWeaponId: string;

  // Actions
  connect: () => Promise<void>;
  joinRoom: (mapId?: string) => Promise<void>;
  updatePlayerInput: (vx: number, vy: number) => void;
  sendPlayerAction: (action: string, pressed: boolean, options?: any) => void;
  /** Last non-zero target sent to the server (it holds this for AoE impact). */
  sentTargetRef: React.MutableRefObject<{ x: number; y: number }>;
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
/** Drawn projectile radius (the wire carries no radius). */
export const SERVER_RS_PROJECTILE_RADIUS = 4;

/** Skill id → server-rs skill slot (see server-rs/src/systems/skill_execution.rs). */
const SKILL_SLOTS: Record<string, number> = {
  skill_1: 1,
  skill_2: 2,
  skill_3: 3,
  skill_4: 4,
  skill_dash: 5,
};

export function skillSlotFor(options?: {
  skillId?: string;
  skillSlot?: number;
}): number {
  if (options?.skillId && SKILL_SLOTS[options.skillId] !== undefined)
    return SKILL_SLOTS[options.skillId];
  return options?.skillSlot ?? 0;
}

export const useServerRsClient = (
  config: ServerRsClientConfig,
): UseServerRsClientReturn => {
  // State
  const [isConnected, setIsConnected] = useState(false);
  const [roomId, setRoomId] = useState<string | null>(null);
  const sessionName = config.token?.startsWith("dev-token:")
    ? config.token.replace("dev-token:", "")
    : config.token && config.token !== "dev-token"
      ? config.token
      : "dev-player";
  const initialPlayerId = String(fnv1a32(sessionName));
  const [playerId, setPlayerId] = useState(initialPlayerId);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [updateCount, setUpdateCount] = useState(0);
  const [isSimulating, setIsSimulating] = useState(false);
  const [fps, setFps] = useState(0);
  const [updateRate, setUpdateRate] = useState(0);
  const [equipment, setEquipment] = useState<EquipmentSnapshot>(() =>
    emptyEquipmentSnapshot(),
  );
  const [equipmentRequestPending, setEquipmentRequestPending] = useState(false);

  // Refs
  const wsRef = useRef<WebSocket | null>(null);
  const clientTickRef = useRef<number>(0);
  const isConnectingRef = useRef<boolean>(false);
  // Currently-held input, re-sent with every packet (server input is full-state).
  const moveRef = useRef<{ vx: number; vy: number }>({ vx: 0, vy: 0 });
  const attackHeldRef = useRef<boolean>(false);
  const aimRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const targetIdRef = useRef<number>(0);
  const simulationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const frameCountRef = useRef<number>(0);
  const lastFpsTimeRef = useRef<number>(performance.now());
  const updateTimesRef = useRef<number[]>([]);
  const currentMapRef = useRef<string>("map-for-play");
  const lastSnapshotReceivedTimeRef = useRef<number>(performance.now());
  const snapshotIntervalsRef = useRef<number[]>([]);
  const [latencyMetrics, setLatencyMetrics] = useState<LatencyMetrics>({
    pingMs: 0,
    snapshotIntervalMs: 50,
    snapshotP50Ms: 50,
    snapshotMaxMs: 50,
    jitterMs: 0,
    serverTimeDeltaMs: 0,
    fps: 0,
  });

  const stateRef = useRef<GameState>({
    players: new Map(),
    mobs: new Map(),
    tick: 0,
    mapId: "map-for-play",
    roomId: "server-rs-map-for-play",
    width: 1000,
    height: 1000,
    viewportSize: SERVER_RS_VIEWPORT,
  });

  // Track frame for FPS calculation
  const trackFrame = useCallback(() => {
    const now = performance.now();
    frameCountRef.current++;
    if (now - lastFpsTimeRef.current >= 1000) {
      setFps(
        Math.round(
          (frameCountRef.current * 1000) / (now - lastFpsTimeRef.current),
        ),
      );
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
    stateRef.current.renderClock = undefined;

    setIsConnected(false);
    setRoomId(null);
    setGameState(null);
    setUpdateCount(0);
    localStorage.removeItem("atlas-world-server-rs-connected");
  }, []);

  // Connect to server-rs WebSocket gateway
  const connect = useCallback(
    async (mapIdOverride?: string) => {
      if (mapIdOverride) {
        currentMapRef.current = mapIdOverride;
      }
      const activeMap = currentMapRef.current;

      if (
        wsRef.current &&
        (wsRef.current.readyState === WebSocket.OPEN ||
          wsRef.current.readyState === WebSocket.CONNECTING)
      ) {
        return;
      }

      return new Promise<void>((resolve, reject) => {
        try {
          isConnectingRef.current = true;
          const protocol = config.useSSL ? "wss" : "ws";
          const token = config.token || "dev-token";
          const sessionName = token.startsWith("dev-token:")
            ? token.replace("dev-token:", "")
            : token !== "dev-token"
              ? token
              : "dev-player";
          const localPlayerId = String(fnv1a32(sessionName));
          setPlayerId(localPlayerId);
          const url = `${protocol}://${config.serverHost}:${config.serverPort}?token=${token}&map=${activeMap}`;

          const ws = new WebSocket(url);
          ws.binaryType = "arraybuffer";
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
            setRoomId(`server-rs-${activeMap}`);
            isConnectingRef.current = false;
            localStorage.setItem("atlas-world-server-rs-connected", "true");

            // Send initial input frame so avatar spawns immediately
            const builder = new flatbuffers.Builder(64);
            const offset = ClientInput.createClientInput(
              builder,
              clientTickRef.current++,
              0,
              0,
              false,
              0,
              0,
              0,
              0,
              false,
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
              const arrivalTime = performance.now();
              const prevArrivalTime = lastSnapshotReceivedTimeRef.current;
              lastSnapshotReceivedTimeRef.current = arrivalTime;
              const interval = arrivalTime - prevArrivalTime;
              snapshotIntervalsRef.current.push(interval);
              if (snapshotIntervalsRef.current.length > 20) {
                snapshotIntervalsRef.current.shift();
              }
              const jitter = Math.abs(interval - 50);
              const sortedIntervals = [...snapshotIntervalsRef.current].sort(
                (a, b) => a - b,
              );
              const serverDelta = snapshot.serverTimeMs
                ? Date.now() - Number(snapshot.serverTimeMs)
                : 0;

              const nextMetrics: LatencyMetrics = {
                pingMs: Math.max(0, Math.round(serverDelta)),
                snapshotIntervalMs: Math.round(interval * 10) / 10,
                snapshotP50Ms: Math.round(
                  sortedIntervals[sortedIntervals.length >> 1],
                ),
                snapshotMaxMs: Math.round(
                  sortedIntervals[sortedIntervals.length - 1],
                ),
                jitterMs: Math.round(jitter * 10) / 10,
                serverTimeDeltaMs: serverDelta,
                fps: frameCountRef.current || 60,
              };
              setLatencyMetrics(nextMetrics);
              (window as any).__latencyMetrics = nextMetrics;

              const current = stateRef.current;
              current.tick = snapshot.tick;
              // Entities are drawn on the server timeline, not at arrival time.
              const simTime = snapshot.tick * SNAPSHOT_INTERVAL_MS;
              current.renderClock = observeSnapshot(
                current.renderClock,
                simTime,
                arrivalTime,
              );
              const sampleOf = (e: {
                x: number;
                y: number;
                vx: number;
                vy: number;
              }) => ({
                t: simTime,
                x: e.x,
                y: e.y,
                vx: e.vx,
                vy: e.vy,
              });
              // Snapshots are full state: projectiles are ephemeral, so rebuild the set each
              // frame (they never go through removed_ids).
              const projectiles = new Map<string, Projectile>();

              for (const entity of snapshot.entities) {
                const idStr = String(entity.id);
                const isAlive = (entity.stateFlags & STATE_FLAG_ALIVE) !== 0;
                if (entity.entityType === EntityType.Player) {
                  const existing = current.players.get(idStr);
                  const isLocalPlayer = idStr === localPlayerId;
                  const isAttacking = isLocalPlayer
                    ? attackHeldRef.current
                    : entity.targetId > 0;
                  let heading: number | undefined;
                  if (entity.vx !== 0 || entity.vy !== 0) {
                    heading = Math.atan2(entity.vy, entity.vx);
                  } else if (
                    isLocalPlayer &&
                    isAttacking &&
                    (aimRef.current.x !== 0 || aimRef.current.y !== 0)
                  ) {
                    const dx = aimRef.current.x - entity.x;
                    const dy = aimRef.current.y - entity.y;
                    if (dx * dx + dy * dy > 1) {
                      heading = Math.atan2(dy, dx);
                    }
                  } else {
                    heading = existing?.heading;
                  }

                  const updated: Player = {
                    ...existing,
                    id: idStr,
                    sessionId: idStr,
                    x: entity.x,
                    y: entity.y,
                    vx: entity.vx,
                    vy: entity.vy,
                    receivedAt: arrivalTime,
                    samples: pushSample(existing?.samples, sampleOf(entity)),
                    radius: SERVER_RS_PLAYER_RADIUS,
                    name: isLocalPlayer
                      ? "Player (YOU)"
                      : existing?.name || `Player-${idStr}`,
                    health: entity.health,
                    currentHealth: entity.health,
                    maxHealth: entity.maxHealth,
                    isAlive,
                    isAttacking,
                    heading,
                    attackRange: 40,
                    // Only server-driven BotAgents are bots; other humans are not.
                    isBotMode: (entity.stateFlags & STATE_FLAG_BOT) !== 0,
                    currentAttackTarget: entity.targetId
                      ? String(entity.targetId)
                      : undefined,
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
                    receivedAt: arrivalTime,
                    samples: pushSample(existing?.samples, sampleOf(entity)),
                    radius: SERVER_RS_MOB_RADIUS,
                    tag: isAlive ? "mob" : "dead",
                    // Older servers send no mob_type: keep whatever we already had.
                    mobTypeId: entity.mobType || existing?.mobTypeId,
                    currentHealth: entity.health,
                    maxHealth: entity.maxHealth,
                    isAlive,
                  };
                  current.mobs.set(idStr, updated);
                } else if (entity.entityType === EntityType.Projectile) {
                  projectiles.set(idStr, {
                    id: idStr,
                    x: entity.x,
                    y: entity.y,
                    vx: entity.vx,
                    vy: entity.vy,
                    receivedAt: arrivalTime,
                    samples: pushSample(
                      current.projectiles?.get(idStr)?.samples,
                      sampleOf(entity),
                    ),
                    radius: SERVER_RS_PROJECTILE_RADIUS,
                    ownerId: String(entity.ownerId),
                    isStuck: false,
                    type: entity.mobType || "spear",
                  });
                }
              }

              for (const removedId of snapshot.removedIds) {
                const idStr = String(removedId);
                current.players.delete(idStr);
                current.mobs.delete(idStr);
              }

              current.projectiles = projectiles;
              const nextState: GameState = {
                ...current,
                players: new Map(current.players),
                mobs: new Map(current.mobs),
                events: snapshot.events,
              };
              setGameState(nextState);
              // Expose for quick debug / e2e (parity with useColyseusClient)
              (window as any).__gameState = nextState;
              (window as any).__playerId = localPlayerId;
              (window as any).__respawn = respawn;
              (window as any).__sendPlayerAction = sendPlayerAction;
              if (projectiles.size > 0) {
                const w = window as any;
                w.__seenProjectiles = [
                  ...(w.__seenProjectiles ?? []),
                  ...Array.from(projectiles.values()),
                ].slice(-1000);
              }
              if (snapshot.events.length > 0) {
                // Rolling buffer so debug tools / e2e can see events between polls.
                const w = window as any;
                w.__gameEvents = [
                  ...(w.__gameEvents ?? []),
                  ...snapshot.events,
                ].slice(-500);
              }
              setUpdateCount((prev) => prev + 1);

              // Calculate update rate over a sliding 10s window
              const now = Date.now();
              updateTimesRef.current.push(now);
              const tenSecondsAgo = now - 10000;
              updateTimesRef.current = updateTimesRef.current.filter(
                (t) => t > tenSecondsAgo,
              );
              if (updateTimesRef.current.length > 1) {
                const span =
                  updateTimesRef.current[updateTimesRef.current.length - 1] -
                  updateTimesRef.current[0];
                if (span > 0) {
                  setUpdateRate(
                    Math.round(
                      ((updateTimesRef.current.length - 1) * 1000) / span,
                    ),
                  );
                }
              }
            } catch (decodeErr) {
              console.error(
                "Failed to decode FlatBuffers snapshot:",
                decodeErr,
              );
            }
          };

          ws.onerror = (err) => {
            if (wsRef.current !== ws) return settle();
            console.error("WebSocket error:", err);
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
              settle(new Error("WebSocket closed before it opened"));
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
    },
    [config],
  );

  // Last non-zero target we actually sent (mirrors the target the server holds)
  const sentTargetRef = useRef({ x: 0, y: 0 });

  // Send binary input frame
  const sendInput = useCallback(
    (
      vx: number,
      vy: number,
      attack: boolean = false,
      skillSlot: number = 0,
      targetId: number = 0,
      targetX: number = 0,
      targetY: number = 0,
      respawnFlag: boolean = false,
    ) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        return;
      }

      // The server overwrites its held target on any non-zero target packet.
      if (targetX !== 0 || targetY !== 0) {
        sentTargetRef.current = { x: targetX, y: targetY };
      }

      const builder = new flatbuffers.Builder(64);
      const offset = ClientInput.createClientInput(
        builder,
        clientTickRef.current++,
        vx,
        vy,
        attack,
        skillSlot,
        targetId,
        targetX,
        targetY,
        respawnFlag,
      );
      builder.finish(offset);
      const bytes = builder.asUint8Array();
      wsRef.current.send(bytes);
    },
    [],
  );

  // Join room (maps seamlessly to server-rs ready connection)
  const joinRoom = useCallback(
    async (mapId: string = "map-for-play") => {
      const isSwitchingMap = mapId !== currentMapRef.current;
      currentMapRef.current = mapId;
      const targetRoomId = `server-rs-${mapId}`;
      setRoomId(targetRoomId);

      const {
        width,
        height,
        viewportSize = SERVER_RS_VIEWPORT,
      } = mapDef(mapId);

      stateRef.current.mapId = mapId;
      stateRef.current.roomId = targetRoomId;
      stateRef.current.width = width;
      stateRef.current.height = height;
      stateRef.current.viewportSize = viewportSize;

      if (isSwitchingMap) {
        // Nothing from the old room may leak into the new one.
        stateRef.current.players.clear();
        stateRef.current.mobs.clear();
        stateRef.current.renderClock = undefined;
        targetIdRef.current = 0;
        aimRef.current = { x: 0, y: 0 };
        sentTargetRef.current = { x: 0, y: 0 };
        const oldWs = wsRef.current;
        if (
          oldWs &&
          (oldWs.readyState === WebSocket.OPEN ||
            oldWs.readyState === WebSocket.CONNECTING)
        ) {
          // Detach first: handlers are guarded by wsRef identity, so the abandoned
          // socket's late open/message/close cannot write state or reconnect.
          wsRef.current = null;
          oldWs.close();
        }
      }
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        await connect(mapId);
      }
      // A newer joinRoom took over while we awaited: it owns the state now.
      if (currentMapRef.current !== mapId) return;

      setGameState((prev) =>
        prev && !isSwitchingMap
          ? {
              ...prev,
              mapId,
              roomId: targetRoomId,
              width,
              height,
              viewportSize,
            }
          : {
              players: new Map(),
              mobs: new Map(),
              tick: 0,
              mapId,
              roomId: targetRoomId,
              width,
              height,
              viewportSize,
            },
      );
      sendInput(
        moveRef.current.vx,
        moveRef.current.vy,
        attackHeldRef.current,
        0,
        0,
        0,
        0,
        false,
      );
    },
    [connect, sendInput],
  );

  // server-rs treats every ClientInput as the FULL input state (it overwrites
  // PlayerInputState), so each packet must carry the currently-held movement and
  // attack. Sending (0,0) with an action would cancel movement.
  const updatePlayerInput = useCallback(
    (vx: number, vy: number) => {
      moveRef.current = { vx, vy };
      sendInput(
        vx,
        vy,
        attackHeldRef.current,
        0,
        targetIdRef.current,
        aimRef.current.x,
        aimRef.current.y,
        false,
      );
    },
    [sendInput],
  );

  const sendPlayerAction = useCallback(
    (action: string, pressed: boolean, options?: any) => {
      if (action === "attack") {
        attackHeldRef.current = pressed;
      }
      const skillSlot = pressed ? skillSlotFor(options) : 0;
      if (options?.targetId !== undefined) {
        targetIdRef.current = options.targetId;
      }
      if (options?.x !== undefined && options?.y !== undefined) {
        aimRef.current = { x: options.x, y: options.y };
      }
      sendInput(
        moveRef.current.vx,
        moveRef.current.vy,
        attackHeldRef.current,
        skillSlot,
        targetIdRef.current,
        aimRef.current.x,
        aimRef.current.y,
        false,
      );
    },
    [sendInput],
  );

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
    sendInput(
      moveRef.current.vx,
      moveRef.current.vy,
      attackHeldRef.current,
      0,
      0,
      0,
      0,
      true,
    );
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
    latencyMetrics,
    equipment,
    equipmentRequestPending,
    equippedWeaponId: equipment.mainHand,

    connect,
    joinRoom,
    updatePlayerInput,
    sendPlayerAction,
    sentTargetRef,
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

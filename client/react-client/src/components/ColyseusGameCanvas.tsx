import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { UseColyseusClientReturn } from "../hooks/useColyseusClient";
import { useKeyboardControls } from "../hooks/useKeyboardControls";
import { GameRenderer } from "./GameRenderer";
import { CANVAS_CONFIG } from "../config/gameConfig";
import { useGameStateContext } from "../contexts/GameStateContext";
import { GameState } from "../types/game";
import { calculateScale } from "../utils/drawingUtils";
import { SKILL_DEFINITIONS } from "../config/skills";
import { getAoeReticle } from "../utils/aoeReticle";
import {
  CanvasView,
  backingSize,
  clientToWorld,
  fitCanvasSize,
} from "../utils/canvasLayout";
import {
  SNAPSHOT_INTERVAL_MS,
  renderTimeAt,
  samplePosition,
} from "../utils/snapshotInterpolation";
import {
  createPrediction,
  lockMovement,
  noteDash,
  observeServer,
  setHeldInput,
  unlockMovement,
} from "../utils/localPrediction";
import { debugToggleForKey, hasModifierKey } from "../config/controls";
import {
  REFERENCE_RUN_SPEED,
  terrainAt,
  terrainZonesFor,
} from "../config/terrain";
import {
  DebugToggles,
  DebugTracker,
  EMPTY_TRACKER,
  ReadoutInput,
  advanceTracker,
  isTextEntryTarget,
  loadDebugToggles,
  saveDebugToggles,
} from "../utils/debugTools";
import {
  ControlsLegend,
  DebugReadout,
  DebugToolbar,
  HeldKeys,
  TerrainLegend,
} from "./DebugPanels";

/** Where the debug dock is drawn when the page provides it (see App.tsx). */
export const DEBUG_DOCK_ID = "debug-dock";
const ROOT_PADDING = 8;
const ROOT_GAP = 10;

interface ColyseusGameCanvasProps {
  client: UseColyseusClientReturn;
}

export const ColyseusGameCanvas: React.FC<ColyseusGameCanvasProps> = ({
  client,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mousePositionRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 }); // Track mouse world position
  const { setGameState } = useGameStateContext();

  const [cooldowns, setCooldowns] = React.useState<Record<string, number>>({});
  const localCastRef = React.useRef<{ until: number; duration: number } | null>(
    null,
  );
  const [activeCast, setActiveCast] = React.useState<{
    skillId: string;
    name: string;
    icon: string;
    startTime: number;
    durationMs: number;
    aim: { x: number; y: number };
  } | null>(null);
  const [, setTickCounter] = React.useState(0);

  const {
    isConnected: clientConnected,
    roomId,
    playerId,
    gameState,
    gameStateRef,
    onSnapshot,
    updateCount,
    fps,
    updateRate,
    updatePlayerInput,
    sendPlayerAction,
    sentTargetRef,
    drainEvents,
    switchWeapon,
    trackFrame,
    respawn,
  } = client;

  // `gameState` is React state and follows the server at HUD pace (server-rs publishes
  // it a few times a second). Input handling and the frame loop need the newest
  // snapshot, which server-rs keeps in a ref; the legacy client has only the state.
  const stateFallbackRef = useRef(gameState);
  stateFallbackRef.current = gameState;
  const liveStateRef = gameStateRef ?? stateFallbackRef;

  // Prediction of the local player (server-rs only): fed with the keys and each
  // snapshot here, advanced by the frame loop, which draws its position.
  const [prediction] = React.useState(createPrediction);
  const predicts = !!gameStateRef && !!onSnapshot;
  const movePlayer = React.useCallback(
    (vx: number, vy: number) => {
      setHeldInput(prediction, performance.now(), vx, vy);
      updatePlayerInput(vx, vy);
    },
    [prediction, updatePlayerInput],
  );
  useEffect(() => {
    if (!predicts) return;
    return onSnapshot((state) => {
      const me = state.players.get(playerId);
      if (!me || !state.renderClock) return;
      observeServer(
        prediction,
        {
          simTime: state.tick * SNAPSHOT_INTERVAL_MS,
          x: me.x,
          y: me.y,
          vx: me.vx,
          vy: me.vy,
          alive: me.isAlive !== false,
        },
        state.renderClock.offsets,
        terrainZonesFor(state.mapId),
      );
    });
  }, [predicts, onSnapshot, playerId, prediction]);
  /** `p` at the position the local player is drawn at this frame. */
  const atDrawnPosition = React.useCallback(
    <T extends { x: number; y: number }>(p: T | undefined): T | undefined => {
      return p && prediction.enabled && prediction.ready
        ? { ...p, x: prediction.x, y: prediction.y }
        : p;
    },
    [prediction],
  );

  // Local player state
  const localPlayer = gameState?.players.get(playerId);
  const isDead = localPlayer
    ? !localPlayer.isAlive || (localPlayer.health ?? 1) <= 0
    : false;

  // Ground-target indicator while an AoE skill is being cast (null otherwise)
  const livePlayer = atDrawnPosition(
    liveStateRef.current?.players.get(playerId),
  );
  const aoeReticle =
    activeCast && livePlayer && !isDead
      ? getAoeReticle(
          activeCast.skillId,
          sentTargetRef?.current ?? activeCast.aim,
          livePlayer,
        )
      : null;

  // Resolve aim towards mouse, or fallback to nearest mob / movement direction
  const resolveAimCoordinates = React.useCallback(
    (
      rawX: number,
      rawY: number,
      player?: { x: number; y: number; vx?: number; vy?: number },
      mobs?: Map<string, any>,
    ): { x: number; y: number } => {
      if ((rawX !== 0 || rawY !== 0) && player) {
        return { x: rawX, y: rawY };
      }
      if (!player) return { x: rawX, y: rawY };

      if (mobs && mobs.size > 0) {
        let nearestMob: { x: number; y: number } | null = null;
        let minDistanceSq = 350 * 350;
        mobs.forEach((mob) => {
          if (mob.isAlive === false) return;
          const dSq = (mob.x - player.x) ** 2 + (mob.y - player.y) ** 2;
          if (dSq < minDistanceSq) {
            minDistanceSq = dSq;
            nearestMob = { x: mob.x, y: mob.y };
          }
        });
        if (nearestMob) {
          return nearestMob;
        }
      }

      const vx = player.vx || 0;
      const vy = player.vy || 0;
      if (Math.hypot(vx, vy) > 0.1) {
        const len = Math.hypot(vx, vy);
        return {
          x: player.x + (vx / len) * 150,
          y: player.y + (vy / len) * 150,
        };
      }

      return { x: player.x + 150, y: player.y };
    },
    [],
  );

  const handleTriggerSkill = React.useCallback(
    (skillId: string) => {
      if (isDead) return;
      const def = SKILL_DEFINITIONS[skillId];
      if (!def) return;

      const now = Date.now();
      const cdEnd = cooldowns[skillId] || 0;
      const gcdEnd = cooldowns["gcd"] || 0;
      if (now < cdEnd || now < gcdEnd || activeCast !== null) {
        return;
      }

      const mousePos = mousePositionRef.current;
      const live = liveStateRef.current;
      const me = atDrawnPosition(live?.players.get(playerId));
      const aim = resolveAimCoordinates(mousePos.x, mousePos.y, me, live?.mobs);

      const newCooldowns = { ...cooldowns };
      if (def.cooldown > 0) {
        newCooldowns[skillId] = now + def.cooldown * 1000;
      }
      if (def.gcd > 0) {
        newCooldowns["gcd"] = now + def.gcd * 1000;
      }
      setCooldowns(newCooldowns);

      if (def.castTime > 0) {
        const castDurationMs = def.castTime * 1000;
        setActiveCast({
          skillId: def.id,
          name: def.name,
          icon: def.icon,
          startTime: now,
          durationMs: castDurationMs,
          aim,
        });

        localCastRef.current = {
          until: now + castDurationMs,
          duration: castDurationMs,
        };
        // The server ignores movement keys for the length of the cast.
        const castAt = performance.now();
        lockMovement(prediction, castAt, castAt + castDurationMs);
      }
      if (def.id === "skill_dash") {
        noteDash(prediction, performance.now());
      }

      if (sendPlayerAction) {
        sendPlayerAction("useSkill", true, {
          skillId: def.id,
          x: aim.x,
          y: aim.y,
        });
      }
    },
    [
      isDead,
      cooldowns,
      activeCast,
      liveStateRef,
      playerId,
      resolveAimCoordinates,
      sendPlayerAction,
      atDrawnPosition,
      prediction,
    ],
  );

  const wrappedSendPlayerAction = React.useCallback(
    (action: string, pressed: boolean, options?: any) => {
      if (action === "useSkill" && options?.skillId && pressed) {
        handleTriggerSkill(options.skillId);
        return;
      }
      if (sendPlayerAction) {
        sendPlayerAction(action, pressed, options);
      }
    },
    [handleTriggerSkill, sendPlayerAction],
  );

  // Debug toggles (persisted) and the per-snapshot feed for the readout / speed label
  const [debug, setDebug] = React.useState<DebugToggles>(() =>
    loadDebugToggles(),
  );
  const toggleDebug = React.useCallback((toggle: keyof DebugToggles) => {
    setDebug((prev) => {
      const next = { ...prev, [toggle]: !prev[toggle] };
      saveDebugToggles(next);
      return next;
    });
  }, []);
  // The server clears cooldowns on reset; drop the client's cast bar and gate too.
  const resetToSpawn = React.useCallback(() => {
    setActiveCast(null);
    setCooldowns({});
    respawn();
  }, [respawn]);
  const debugTrackerRef = useRef<DebugTracker>(EMPTY_TRACKER);
  const readoutInputRef = useRef<Omit<ReadoutInput, "latency"> | null>(null);
  const castingSkill = activeCast?.name ?? null;
  // The cast ring is drawn from this ref, so it is on the frame the cast starts.
  useEffect(() => {
    if (!activeCast) {
      localCastRef.current = null;
      unlockMovement(prediction, performance.now());
    }
  }, [activeCast, prediction]);
  // A new room starts with no cast in flight and no speed/position history.
  const currentMapId = gameState?.mapId;
  useEffect(() => {
    setActiveCast(null);
    debugTrackerRef.current = EMPTY_TRACKER;
  }, [currentMapId]);
  const feedDebug = React.useCallback(
    (state: GameState | null) => {
      if (!state) {
        debugTrackerRef.current = EMPTY_TRACKER;
        readoutInputRef.current = null;
        return;
      }
      const player = state.players.get(playerId);
      if (player) {
        debugTrackerRef.current = advanceTracker(
          debugTrackerRef.current,
          player,
        );
      }
      const zones = terrainZonesFor(state.mapId);
      readoutInputRef.current = {
        mapId: state.mapId,
        tick: state.tick,
        player,
        tracker: debugTrackerRef.current,
        terrain: player && zones ? terrainAt(zones, player.x, player.y) : null,
        referenceRunSpeed: REFERENCE_RUN_SPEED,
        counts: {
          players: state.players.size,
          mobs: state.mobs.size,
          projectiles: state.projectiles?.size ?? 0,
        },
        castingSkill,
        attackHeld: player?.isAttacking ?? false,
        prediction: predicts ? prediction : undefined,
      };
    },
    [playerId, castingSkill, predicts, prediction],
  );
  // Fed by every snapshot where the client says when one lands (server-rs), so the
  // snapshot rate and speed readings do not depend on how often React renders...
  useEffect(() => {
    if (!onSnapshot) return;
    feedDebug(liveStateRef.current);
    return onSnapshot(feedDebug);
  }, [onSnapshot, feedDebug, liveStateRef]);
  // ...otherwise by every state change; either way a lost state resets it.
  useEffect(() => {
    if (!onSnapshot || !gameState) feedDebug(gameState);
  }, [gameState, onSnapshot, feedDebug]);

  // Debug keys, and keep keyboard focus on the game: a clicked button must not hold
  // focus, or Space/Enter would re-press it instead of attacking.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || hasModifierKey(e)) return;
      if (isTextEntryTarget(e.target)) return;
      const toggle = debugToggleForKey(e.key);
      if (toggle) toggleDebug(toggle);
    };
    const releaseButtonFocus = () => {
      const active = document.activeElement;
      if (active instanceof HTMLButtonElement) active.blur();
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("click", releaseButtonFocus);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("click", releaseButtonFocus);
    };
  }, [toggleDebug]);

  // A dead player's cast is over: drop the cast bar and reticle.
  useEffect(() => {
    if (isDead) setActiveCast(null);
  }, [isDead]);

  // Ticking effect for cooldowns and cast bar progress; idle when nothing counts down.
  const countingDown =
    activeCast !== null ||
    Object.values(cooldowns).some((end) => end > Date.now());
  useEffect(() => {
    if (!countingDown) return;
    const timer = setInterval(() => {
      const now = Date.now();
      if (activeCast && now >= activeCast.startTime + activeCast.durationMs) {
        setActiveCast(null);
      }
      setTickCounter((c) => c + 1);
    }, 50);

    return () => clearInterval(timer);
  }, [activeCast, countingDown]);

  // Update context when gameState or roomId changes
  useEffect(() => {
    setGameState(gameState, roomId, clientConnected);
  }, [gameState?.tick, gameState, roomId, clientConnected, setGameState]);

  // Handle keyboard controls
  const { pressedKeys } = useKeyboardControls({
    updatePlayerInput: movePlayer,
    sendPlayerAction: wrappedSendPlayerAction,
    switchWeapon,
    mousePositionRef,
    respawn,
    isDead,
  });

  // Track the latest player id for mouse handlers without re-binding listeners
  const latestStateRef = useRef({ playerId });
  useEffect(() => {
    latestStateRef.current = { playerId };
  }, [playerId]);

  // The canvas takes all the room its column has left above the skill bar, and
  // follows the window; in play mode that column is the whole window.
  const rootRef = useRef<HTMLDivElement>(null);
  const belowRef = useRef<HTMLDivElement>(null);
  const [view, setView] = React.useState<CanvasView>(() =>
    fitCanvasSize(CANVAS_CONFIG.width, CANVAS_CONFIG.height, 1),
  );
  const viewRef = useRef(view);
  viewRef.current = view;
  const backing = backingSize(view);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const measure = () => {
      const below = belowRef.current?.offsetHeight ?? 0;
      const next = fitCanvasSize(
        root.clientWidth - 2 * ROOT_PADDING,
        // A column with no height of its own (stacked narrow layout): the window's.
        (root.clientHeight || window.innerHeight) -
          2 * ROOT_PADDING -
          ROOT_GAP -
          below,
        window.devicePixelRatio,
      );
      setView((prev) =>
        prev.width === next.width &&
        prev.height === next.height &&
        prev.pixelRatio === next.pixelRatio
          ? prev
          : next,
      );
    };
    measure();
    window.addEventListener("resize", measure);
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    observer?.observe(root);
    if (belowRef.current) observer?.observe(belowRef.current);
    return () => {
      window.removeEventListener("resize", measure);
      observer?.disconnect();
    };
  }, []);

  // Play mode is a class on <body>: App.css hides the header and side column.
  useEffect(() => {
    document.body.classList.toggle("play-focus", debug.focus);
    return () => document.body.classList.remove("play-focus");
  }, [debug.focus]);

  // The debug dock is drawn into the side column (App renders the mount point).
  const [dock, setDock] = React.useState<HTMLElement | null>(null);
  useEffect(() => setDock(document.getElementById(DEBUG_DOCK_ID)), []);

  // Mouse move tracking (single listener)
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const canvas = canvasRef.current;
      const currentGameState = liveStateRef.current;
      const { playerId: currentPid } = latestStateRef.current;

      if (!canvas || !currentGameState) return;

      const view = viewRef.current;
      const viewportSize = currentGameState.viewportSize ?? 50;
      const scale = calculateScale(currentGameState, view, viewportSize);

      let cameraX = currentGameState.width / 2;
      let cameraY = currentGameState.height / 2;

      const player = currentGameState.players.get(currentPid);
      if (player) {
        // Same position the renderer centres the camera on: predicted, else
        // interpolated.
        const pos =
          prediction.enabled && prediction.ready
            ? prediction
            : samplePosition(
                player,
                renderTimeAt(currentGameState.renderClock, performance.now()),
              );
        cameraX = pos.x;
        cameraY = pos.y;
      }

      mousePositionRef.current = clientToWorld(
        e.clientX,
        e.clientY,
        canvas.getBoundingClientRect(),
        view,
        scale,
        { x: cameraX, y: cameraY },
      );
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [liveStateRef, prediction]);

  // Global mouseup listener to release attack if mouse is released outside canvas
  useEffect(() => {
    const handleGlobalMouseUp = (e: MouseEvent) => {
      if (e.button === 0 && sendPlayerAction) {
        sendPlayerAction("attack", false, {
          x: mousePositionRef.current.x,
          y: mousePositionRef.current.y,
        });
      }
    };
    window.addEventListener("mouseup", handleGlobalMouseUp);
    return () => window.removeEventListener("mouseup", handleGlobalMouseUp);
  }, [sendPlayerAction]);

  // Handle mouse down on canvas (click-to-attack / click-to-target / click-to-respawn)
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDead) {
      if (respawn) respawn();
      return;
    }

    if (e.button === 0 && sendPlayerAction) {
      const { x: wx, y: wy } = mousePositionRef.current;
      let targetMobId: number | undefined;

      const live = liveStateRef.current;
      if (live) {
        const renderTime = renderTimeAt(live.renderClock, performance.now());
        live.mobs.forEach((mob) => {
          if (mob.isAlive === false || targetMobId !== undefined) return;
          // Pick against the interpolated position that is drawn on screen.
          const pos = samplePosition(mob, renderTime);
          const dist = Math.hypot(pos.x - wx, pos.y - wy);
          if (dist <= (mob.radius || 14) + 16) {
            targetMobId = Number(mob.id);
          }
        });
      }

      sendPlayerAction("attack", true, {
        x: wx,
        y: wy,
        targetId: targetMobId,
      });
    }
  };

  const handleCanvasMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button === 0 && sendPlayerAction) {
      const { x: wx, y: wy } = mousePositionRef.current;
      sendPlayerAction("attack", false, { x: wx, y: wy });
    }
  };

  const containerStyle: React.CSSProperties = {
    position: "relative",
    display: "inline-block",
    flexShrink: 0,
    borderRadius: debug.focus ? 0 : CANVAS_CONFIG.borderRadius,
    overflow: "hidden",
    boxShadow: "0 20px 50px rgba(0,0,0,0.5)",
  };

  const actionBtnStyle = (color: string): React.CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "8px 14px",
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    border: `1px solid ${color}`,
    borderRadius: "8px",
    color: "#fff",
    cursor: isDead ? "not-allowed" : "pointer",
    opacity: isDead ? 0.4 : 1,
    fontSize: "0.9rem",
    transition: "all 0.15s ease",
    userSelect: "none",
  });

  // Everything about debugging lives here, beside the canvas, never on it.
  const debugDock = (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <DebugToolbar
        toggles={debug}
        onToggle={toggleDebug}
        onRespawn={resetToSpawn}
      />
      {debug.overlay && <DebugReadout inputRef={readoutInputRef} />}
      {debug.overlay && <HeldKeys pressedKeysRef={pressedKeys} />}
      {debug.terrain && <TerrainLegend />}
      <ControlsLegend />
    </div>
  );

  return (
    <div
      ref={rootRef}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: ROOT_GAP,
        padding: ROOT_PADDING,
        width: "100%",
        height: "100%",
        boxSizing: "border-box",
      }}
    >
      <div style={containerStyle}>
        <canvas
          ref={canvasRef}
          width={backing.width}
          height={backing.height}
          onMouseDown={handleCanvasMouseDown}
          onMouseUp={handleCanvasMouseUp}
          onContextMenu={(e) => e.preventDefault()}
          style={{
            backgroundColor: CANVAS_CONFIG.backgroundColor,
            cursor: isDead ? "pointer" : "crosshair",
            display: "block",
            width: view.width,
            height: view.height,
          }}
        />

        {/* Death Overlay */}
        {isDead && (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              backgroundColor: "rgba(0, 0, 0, 0.8)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              color: "#e74c3c",
              zIndex: 100,
              backdropFilter: "blur(4px)",
              cursor: "pointer",
            }}
            onClick={() => respawn && respawn()}
          >
            <h1
              style={{
                fontSize: "3rem",
                margin: "0 0 10px 0",
                textShadow: "0 0 20px rgba(231,76,60,0.8)",
              }}
            >
              💀 YOU DIED
            </h1>
            <p
              style={{
                color: "#ecf0f1",
                fontSize: "1.2rem",
                marginBottom: "24px",
              }}
            >
              Click anywhere or press{" "}
              <kbd
                style={{
                  background: "#34495e",
                  padding: "4px 8px",
                  borderRadius: "4px",
                }}
              >
                SPACE
              </kbd>{" "}
              to Respawn
            </p>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (respawn) respawn();
              }}
              style={{
                backgroundColor: "#27ae60",
                color: "#fff",
                border: "none",
                padding: "12px 28px",
                fontSize: "1.2rem",
                fontWeight: "bold",
                borderRadius: "8px",
                cursor: "pointer",
                boxShadow: "0 4px 15px rgba(39, 174, 96, 0.4)",
                transition: "transform 0.1s ease",
              }}
              onMouseOver={(e) =>
                (e.currentTarget.style.transform = "scale(1.05)")
              }
              onMouseOut={(e) => (e.currentTarget.style.transform = "scale(1)")}
            >
              ♻️ Respawn Now
            </button>
          </div>
        )}

        {/* Active Casting Bar: on the canvas, only while a cast is in flight */}
        {activeCast && (
          <div
            style={{
              position: "absolute",
              bottom: 12,
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 60,
              pointerEvents: "none",
              width: "min(360px, 90%)",
              backgroundColor: "rgba(15, 23, 42, 0.9)",
              borderRadius: "10px",
              border: "1px solid rgba(243, 156, 18, 0.6)",
              boxShadow: "0 0 15px rgba(243, 156, 18, 0.4)",
              padding: "8px 14px",
              display: "flex",
              flexDirection: "column",
              gap: "6px",
              userSelect: "none",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: "0.85rem",
                fontWeight: "bold",
                color: "#f1c40f",
              }}
            >
              <span>
                {activeCast.icon} Casting {activeCast.name}...
              </span>
              <span>
                {Math.max(
                  0,
                  (activeCast.startTime + activeCast.durationMs - Date.now()) /
                    1000,
                ).toFixed(1)}
                s
              </span>
            </div>
            <div
              style={{
                width: "100%",
                height: "8px",
                backgroundColor: "rgba(255, 255, 255, 0.15)",
                borderRadius: "4px",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${Math.min(
                    100,
                    Math.max(
                      0,
                      ((Date.now() - activeCast.startTime) /
                        activeCast.durationMs) *
                        100,
                    ),
                  )}%`,
                  background: "linear-gradient(90deg, #e67e22, #f1c40f)",
                  boxShadow: "0 0 8px #f1c40f",
                  transition: "width 0.05s linear",
                }}
              />
            </div>
          </div>
        )}

        {debug.focus && (
          <button
            type="button"
            onClick={() => toggleDebug("focus")}
            title="Show the panels again"
            style={{
              position: "absolute",
              top: 6,
              left: 6,
              padding: "2px 6px",
              border: "none",
              borderRadius: 4,
              background: "rgba(0, 0, 0, 0.35)",
              color: "rgba(255, 255, 255, 0.7)",
              font: '11px "Fira Code", monospace',
              cursor: "pointer",
            }}
          >
            [H] show UI
          </button>
        )}

        <GameRenderer
          canvasRef={canvasRef}
          gameState={gameState}
          gameStateRef={liveStateRef}
          updateCount={updateCount}
          fps={fps}
          updateRate={updateRate}
          roomId={roomId}
          playerId={playerId}
          trackFrame={trackFrame}
          drainEvents={drainEvents}
          localCastRef={localCastRef}
          aoeReticle={aoeReticle}
          debug={debug}
          debugTrackerRef={debugTrackerRef}
          prediction={predicts ? prediction : undefined}
          view={view}
        />
      </div>

      {/* Interactive Action / Skill Bar */}
      <div
        ref={belowRef}
        style={{
          display: "flex",
          flexShrink: 0,
          gap: "10px",
          alignItems: "center",
          justifyContent: "center",
          padding: "8px 16px",
          backgroundColor: "#1a252f",
          borderRadius: "12px",
          border: "1px solid rgba(255, 255, 255, 0.1)",
          boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
        }}
      >
        {/* Attack button */}
        <button
          disabled={isDead}
          onMouseDown={() =>
            sendPlayerAction &&
            sendPlayerAction("attack", true, {
              x: mousePositionRef.current.x,
              y: mousePositionRef.current.y,
            })
          }
          onMouseUp={() =>
            sendPlayerAction &&
            sendPlayerAction("attack", false, {
              x: mousePositionRef.current.x,
              y: mousePositionRef.current.y,
            })
          }
          style={actionBtnStyle("#e74c3c")}
          title="Melee Attack (Space or Left-Click)"
        >
          <span style={{ fontSize: "1.2rem" }}>⚔️</span>
          <div style={{ textAlign: "left" }}>
            <div style={{ fontWeight: "bold" }}>Attack</div>
            <div style={{ fontSize: "0.75rem", opacity: 0.8 }}>
              Space / L-Click
            </div>
          </div>
        </button>

        {/* Dynamic Skill Action Buttons */}
        {Object.values(SKILL_DEFINITIONS).map((skill) => {
          const cdEnd = Math.max(
            cooldowns[skill.id] || 0,
            skill.gcd > 0 ? cooldowns["gcd"] || 0 : 0,
          );
          const remainingSec = Math.max(0, (cdEnd - Date.now()) / 1000);
          const isOnCooldown = remainingSec > 0;
          const isCastingThis = activeCast?.skillId === skill.id;
          const isDisabled =
            isDead ||
            isOnCooldown ||
            (activeCast !== null && skill.castTime > 0);

          return (
            <button
              key={skill.id}
              disabled={isDisabled}
              onClick={() => handleTriggerSkill(skill.id)}
              style={{
                ...actionBtnStyle(skill.color),
                position: "relative",
                overflow: "hidden",
                opacity: isDisabled ? 0.6 : 1,
                borderColor: isCastingThis ? "#f1c40f" : skill.color,
                boxShadow: isCastingThis ? "0 0 10px #f1c40f" : "none",
              }}
              title={`${skill.name} (Key [${skill.keyLabel}]) - ${skill.description}`}
            >
              <span style={{ fontSize: "1.2rem" }}>{skill.icon}</span>
              <div style={{ textAlign: "left" }}>
                <div style={{ fontWeight: "bold" }}>{skill.name}</div>
                <div style={{ fontSize: "0.75rem", opacity: 0.8 }}>
                  Key [{skill.keyLabel}]
                </div>
              </div>
              {isOnCooldown && (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    backgroundColor: "rgba(0, 0, 0, 0.75)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: "bold",
                    color: "#f1c40f",
                    fontSize: "0.95rem",
                    textShadow: "0 1px 3px rgba(0,0,0,0.9)",
                  }}
                >
                  {remainingSec.toFixed(1)}s
                </div>
              )}
            </button>
          );
        })}
      </div>

      {!debug.focus &&
        (dock ? createPortal(debugDock, dock) : <div>{debugDock}</div>)}
    </div>
  );
};

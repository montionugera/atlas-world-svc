import { useRef, useEffect } from "react";
import {
  GameEventInfo,
  GameState,
  Mob,
  Player,
  Projectile,
} from "../types/game";
import { calculateScale, clearCanvas } from "../utils/drawingUtils";
import { drawGridCoordinates } from "../utils/gridUtils";
import type { AoeReticle } from "../utils/aoeReticle";
import {
  interpolateEntities,
  renderTimeAt,
} from "../utils/snapshotInterpolation";
import { drawMap } from "../renderers/mapRenderer";
import { drawMobs } from "../renderers/mobRenderer";
import { drawCompanions } from "../renderers/companionRenderer";
import { drawProjectiles } from "../renderers/projectileRenderer";
import { drawZoneEffects } from "../renderers/zoneEffectRenderer";
import { drawPlayers } from "../renderers/playerRenderer";
import {
  drawTerrainRiver,
  drawFloatingTexts,
  FloatingText,
} from "../renderers/terrainRenderer";
import {
  drawTerrainZoneLabels,
  drawWorldDebug,
} from "../renderers/debugRenderer";
import { drawStaticOver, drawStaticUnder } from "../renderers/staticLayers";
import { mapDef } from "../config/maps";
import { terrainZonesFor } from "../config/terrain";
import {
  Timings,
  TimingKey,
  perfTimings,
  recordTiming,
  timingGate,
} from "../utils/frameTiming";
import {
  DEFAULT_DEBUG_TOGGLES,
  DebugToggles,
  DebugTracker,
} from "../utils/debugTools";
import { CanvasView, snapToDevicePixel } from "../utils/canvasLayout";
import { cullInto, visibleWorldRect } from "../utils/viewport";
import {
  PredictionState,
  PredictionWorld,
  advancePrediction,
  resetPrediction,
} from "../utils/localPrediction";

interface GameRendererProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  gameState: GameState | null;
  /** When given, the frame loop draws its value instead of `gameState` (which may lag). */
  gameStateRef?: React.RefObject<GameState | null>;
  updateCount: number;
  fps: number;
  updateRate: number;
  roomId: string | null;
  playerId: string;
  trackFrame: () => void;
  /** The local player's cast in flight, read per frame so its ring never lags a snapshot. */
  localCastRef?: React.RefObject<{ until: number; duration: number } | null>;
  /** Combat events not yet shown (server-rs); called once per drawn frame. */
  drainEvents?: () => GameEventInfo[];
  aoeReticle?: AoeReticle | null;
  debug?: DebugToggles;
  /** Live speed tracker for the local player (read per frame, never triggers renders). */
  debugTrackerRef?: React.RefObject<DebugTracker>;
  /**
   * Local-player prediction, advanced here once per frame. Its position replaces the
   * interpolated one for everything drawn from the local player (sprite, camera,
   * rings); the canvas reads the same object for mouse and aim.
   */
  prediction?: PredictionState;
  /**
   * Logical size of the canvas and its device-pixel ratio. Everything is drawn in
   * logical pixels; omitted = the backing store is the logical size.
   */
  view?: CanvasView;
}

/** World units past the view edge still drawn: name plates, bars and rings overhang. */
const CULL_MARGIN = 64;

interface BlastEffect {
  id: string;
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  color: string;
  createdAt: number;
  durationMs: number;
}

export const GameRenderer: React.FC<GameRendererProps> = (props) => {
  const { canvasRef, trackFrame, debugTrackerRef } = props;
  // The frame loop reads the newest props from here, so a snapshot (20/s) neither
  // restarts the loop nor paints an extra off-vsync frame.
  const latestRef = useRef(props);
  latestRef.current = props;
  const animationFrameRef = useRef<number | undefined>(undefined);
  const floatingTextsRef = useRef<FloatingText[]>([]);
  const blastEffectsRef = useRef<BlastEffect[]>([]);
  // Last frame's drawn projectiles, as the raw snapshot objects.
  const prevProjectilesRef = useRef<Map<string, Projectile>>(new Map());
  // Interpolated views, reused every frame (see interpolateEntities).
  const renderPlayersRef = useRef<Map<string, Player>>(new Map());
  const renderMobsRef = useRef<Map<string, Mob>>(new Map());
  const renderProjectilesRef = useRef<Map<string, Projectile>>(new Map());
  // The on-screen subset of each, reused every frame (see cullInto).
  const visiblePlayersRef = useRef<Map<string, Player>>(new Map());
  const visibleMobsRef = useRef<Map<string, Mob>>(new Map());
  const visibleProjectilesRef = useRef<Map<string, Projectile>>(new Map());
  const mapIdRef = useRef<string | undefined>(undefined);
  const predictionWorldRef = useRef<PredictionWorld>({
    zones: null,
    width: 0,
    height: 0,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Stage timing for the debug readout; off (one null check per stage) without it.
    let timings: Timings | null = null;
    let lapStart = 0;
    let lastFrameStart = 0;
    const lap = (stage: TimingKey) => {
      if (!timings) return;
      const now = performance.now();
      recordTiming(timings, stage, now - lapStart);
      lapStart = now;
    };

    const animate = () => {
      const {
        gameStateRef,
        playerId,
        drainEvents,
        localCastRef,
        aoeReticle,
        debug = DEFAULT_DEBUG_TOGGLES,
        prediction,
      } = latestRef.current;
      // Draw in logical pixels whatever the density of the backing store.
      const view = latestRef.current.view ?? canvas;
      const ratioX = canvas.width / view.width;
      const ratioY = canvas.height / view.height;
      ctx.setTransform(ratioX, 0, 0, ratioY, 0, 0);
      const gameState = gameStateRef
        ? gameStateRef.current
        : latestRef.current.gameState;
      const renderStartTime = performance.now();
      timings = debug.overlay ? perfTimings : null;
      timingGate.on = debug.overlay;
      if (timings && lastFrameStart > 0) {
        recordTiming(timings, "interval", renderStartTime - lastFrameStart);
      }
      lastFrameStart = renderStartTime;
      lapStart = renderStartTime;
      trackFrame();

      // Clear canvas
      clearCanvas(ctx, view);

      if (gameState) {
        // A new room starts with no projectiles: the old room's must not blast here.
        if (mapIdRef.current !== gameState.mapId) {
          mapIdRef.current = gameState.mapId;
          prevProjectilesRef.current.clear();
          blastEffectsRef.current = [];
          floatingTextsRef.current = [];
          predictionWorldRef.current = {
            zones: terrainZonesFor(gameState.mapId),
            width: gameState.width,
            height: gameState.height,
          };
          if (prediction) resetPrediction(prediction, renderStartTime);
        }
        // Draw the server timeline slightly in the past, between real snapshots.
        const renderTime = renderTimeAt(
          gameState.renderClock,
          performance.now(),
        );
        // Copies are reused only where snapshots replace entities (server-rs); the
        // legacy client mutates them in place, so those are copied afresh.
        const reuse = !!gameStateRef;
        const renderPlayers = interpolateEntities(
          gameState.players,
          renderTime,
          reuse ? renderPlayersRef.current : undefined,
        );
        const localCopy = localCastRef && renderPlayers.get(playerId);
        if (localCopy) {
          localCopy.castingUntil = localCastRef.current?.until ?? 0;
          localCopy.castDuration = localCastRef.current?.duration;
        }
        // The local player is drawn where its own input puts it now, not on the
        // delayed timeline; every use of its position below takes this one.
        if (prediction) {
          const me = gameState.players.get(playerId);
          const drawn = renderPlayers.get(playerId);
          prediction.enabled = debug.prediction;
          if (!debug.prediction || !me || !drawn) {
            prediction.ready = false;
          } else {
            advancePrediction(
              prediction,
              renderStartTime,
              me,
              predictionWorldRef.current,
            );
            drawn.x = prediction.x;
            drawn.y = prediction.y;
            const input = prediction.history[prediction.history.length - 1];
            if (!prediction.yielding && input && (input.mx || input.my)) {
              drawn.heading = Math.atan2(input.my, input.mx);
            }
          }
        }
        const renderMobs = interpolateEntities(
          gameState.mobs,
          renderTime,
          reuse ? renderMobsRef.current : undefined,
        );
        const renderProjectiles = gameState.projectiles
          ? interpolateEntities(
              gameState.projectiles,
              renderTime,
              reuse ? renderProjectilesRef.current : undefined,
            )
          : undefined;
        // One that left the snapshot flies on until the picture reaches its last
        // position; the blast below then appears exactly where it vanished.
        renderProjectiles?.forEach((p, id) => {
          if (p.endsAt !== undefined && renderTime >= p.endsAt) {
            renderProjectiles.delete(id);
          }
        });
        // Detect detonated projectiles to spawn AoE blast shockwaves
        const prevProjs = prevProjectilesRef.current;
        prevProjs.forEach((p, id) => {
          if (!renderProjectiles?.has(id)) {
            prevProjs.delete(id);
            const pType = (p.type || "").toLowerCase();
            let maxRadius = 15;
            let color = "255, 170, 0";
            let durationMs = 450;
            if (pType.includes("skill_1") || pType.includes("meteor")) {
              maxRadius = 60; // 60.0 server AoE
              color = "255, 69, 0";
              durationMs = 700;
            } else if (
              pType.includes("skill_3") ||
              pType.includes("blizzard")
            ) {
              maxRadius = 50; // 50.0 server AoE
              color = "0, 210, 211";
              durationMs = 800;
            } else if (pType.includes("skill_4") || pType.includes("thunder")) {
              maxRadius = 40; // 40.0 server AoE
              color = "254, 202, 87";
              durationMs = 600;
            }
            blastEffectsRef.current.push({
              id: `${id}-${Date.now()}`,
              x: p.x,
              y: p.y,
              radius: 4,
              maxRadius,
              color,
              createdAt: Date.now(),
              durationMs,
            });
          }
        });
        // Raw snapshot x/y: blasts must land where the server detonated.
        gameState.projectiles?.forEach((p, id) => {
          if (renderProjectiles?.has(id)) prevProjs.set(id, p);
        });
        // Process new combat events into floating damage/kill texts. Drained from a
        // queue: several snapshots can land between two frames.
        for (const ev of drainEvents?.() ?? []) {
          const victimId = String(ev.targetId);
          const victim =
            renderMobs.get(victimId) ?? renderPlayers.get(victimId);
          if (!victim) continue;
          if (ev.kind === 1 /* Hit */ && ev.amount > 0) {
            floatingTextsRef.current.push({
              id: `${ev.targetId}-${ev.amount}-${Date.now()}-${Math.random()}`,
              text: `-${Math.round(ev.amount)}`,
              x: victim.x + (Math.random() - 0.5) * 8,
              y: victim.y - 12,
              createdAt: Date.now(),
              durationMs: 800,
              color: "#ff4d4f",
            });
          } else if (ev.kind === 2 /* Kill */) {
            floatingTextsRef.current.push({
              id: `kill-${ev.targetId}-${Date.now()}`,
              text: "DEFEATED",
              x: victim.x,
              y: victim.y - 18,
              createdAt: Date.now(),
              durationMs: 1200,
              color: "#f39c12",
              isCrit: true,
            });
          }
        }

        lap("interp");

        // --- 1. Main Camera View ---
        const viewportSize = gameState.viewportSize ?? 50;
        const scale = calculateScale(gameState, view, viewportSize);

        // Find player to center camera
        const player = renderPlayers.get(playerId);
        let cameraX = gameState.width / 2;
        let cameraY = gameState.height / 2;

        if (player) {
          cameraX = player.x;
          cameraY = player.y;
        }

        ctx.save();

        // Centre the camera, with the world origin on a whole device pixel so the
        // cached terrain blits sharp and sprites do not shimmer against it.
        ctx.translate(
          snapToDevicePixel(view.width / 2 - cameraX * scale, ratioX),
          snapToDevicePixel(view.height / 2 - cameraY * scale, ratioY),
        );
        ctx.scale(scale, scale);

        // 1. Terrain, biomes, roads and town; 2. world boundaries; 3. grid overlay.
        // All static, so blitted from cached layers; only the river is drawn live.
        const map = mapDef(gameState.mapId);
        const visible = visibleWorldRect({
          camera: { x: cameraX, y: cameraY },
          view,
          scale,
        });
        const gridSize = Math.max(10, Math.round(viewportSize / 5));
        const staticSpec = {
          mapId: gameState.mapId,
          width: gameState.width,
          height: gameState.height,
          scale,
          pixelRatio: ratioX,
          terrainTint: debug.terrain,
          gridSize: debug.world ? gridSize : 0,
          visible,
        };
        drawStaticUnder(ctx, staticSpec);
        if (map.art === "frontier") {
          drawTerrainRiver(ctx, 1, scale, performance.now());
        }
        lap("terrain");
        drawStaticOver(ctx, staticSpec);
        // Zone labels follow the camera (top-centre of the visible part of a zone).
        const terrainZones = terrainZonesFor(gameState.mapId);
        if (terrainZones && debug.terrain) {
          drawTerrainZoneLabels(ctx, terrainZones, scale, visible);
        }
        lap("tint+grid");
        if (gameState.zoneEffects) {
          drawZoneEffects(ctx, gameState.zoneEffects, scale);
        }
        // Every entity in the room is on the wire (no area of interest): draw only
        // those on screen. The minimap below still shows them all.
        const visibleMobs = cullInto({
          source: renderMobs,
          into: visibleMobsRef.current,
          rect: visible,
          margin: CULL_MARGIN,
        });
        const visiblePlayers = cullInto({
          source: renderPlayers,
          into: visiblePlayersRef.current,
          rect: visible,
          margin: CULL_MARGIN,
        });
        const visibleProjectiles =
          renderProjectiles &&
          cullInto({
            source: renderProjectiles,
            into: visibleProjectilesRef.current,
            rect: visible,
            margin: CULL_MARGIN,
          });
        drawMobs(ctx, visibleMobs, 1, scale);

        const npcsMap = gameState.npcs ?? gameState.companions;
        if (npcsMap && npcsMap.size > 0) {
          drawCompanions(ctx, npcsMap, 1, scale);
        }

        drawPlayers(ctx, visiblePlayers, playerId, 1, scale);
        if (visibleProjectiles) {
          drawProjectiles(ctx, visibleProjectiles, 1, scale);
        }

        lap("entities");

        // Debug rings / velocity vectors, on the same interpolated positions as the sprites
        if (debug.world) {
          drawWorldDebug(ctx, {
            players: visiblePlayers,
            mobs: visibleMobs,
            projectiles: visibleProjectiles,
            roomPlayers: renderPlayers,
            playerId,
            viewScale: scale,
            localSpeed: debugTrackerRef?.current?.smoothedSpeed ?? 0,
          });
        }

        lap("debug");

        // Ground-target AoE reticle (world units, so it scales with the view)
        if (aoeReticle) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(
            aoeReticle.x,
            aoeReticle.y,
            aoeReticle.radius,
            0,
            Math.PI * 2,
          );
          ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
          ctx.fill();
          ctx.setLineDash([6 / scale, 4 / scale]);
          ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
          ctx.lineWidth = 2 / scale;
          ctx.stroke();
          ctx.restore();
        }

        // Draw AoE blast shockwaves
        const now = Date.now();
        blastEffectsRef.current.forEach((blast) => {
          const elapsed = now - blast.createdAt;
          const progress = Math.min(1, elapsed / blast.durationMs);
          const currentRadius =
            blast.radius + (blast.maxRadius - blast.radius) * progress;
          const alpha = 1 - progress;
          ctx.save();
          ctx.beginPath();
          ctx.arc(blast.x, blast.y, currentRadius, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${blast.color}, ${alpha * 0.25})`;
          ctx.fill();
          ctx.strokeStyle = `rgba(${blast.color}, ${alpha * 0.85})`;
          ctx.lineWidth = Math.max(1, (3 * (1 - progress) + 1) / scale);
          ctx.stroke();
          ctx.restore();
        });
        blastEffectsRef.current = blastEffectsRef.current.filter(
          (b) => now - b.createdAt < b.durationMs,
        );

        // 4. Floating Combat Numbers
        drawFloatingTexts(ctx, floatingTextsRef.current, 1, scale, now);
        floatingTextsRef.current = floatingTextsRef.current.filter(
          (t) => now - t.createdAt < t.durationMs,
        );

        ctx.restore();

        // Draw HUD-style Grid Coordinates
        if (debug.world) {
          drawGridCoordinates(
            ctx,
            cameraX,
            cameraY,
            scale,
            view.width,
            view.height,
            gameState.width,
            gameState.height,
            gridSize,
          );
        }

        // --- 2. Mini Map Overlay: small and see-through, so it hides no play ---
        if (debug.minimap) {
          const miniMapSize = 96;
          const padding = 8;
          const miniMapX = view.width - miniMapSize - padding;
          const miniMapY = padding;
          const miniMapScale =
            miniMapSize / Math.max(gameState.width, gameState.height);

          ctx.save();
          ctx.globalAlpha = 0.6;
          ctx.translate(miniMapX, miniMapY);

          // Background
          ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
          ctx.fillRect(0, 0, miniMapSize, miniMapSize);
          ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
          ctx.strokeRect(0, 0, miniMapSize, miniMapSize);

          // Entities
          // Simple dots for mini-map
          ctx.scale(miniMapScale, miniMapScale);
          // Smallest dot radius in world units: one that is still seen in a big room.
          const minDot = 1.5 / miniMapScale;

          // Mobs (Red dots)
          ctx.fillStyle = "#ff4444";
          renderMobs.forEach((mob) => {
            if (!mob.isAlive) return;
            ctx.beginPath();
            ctx.arc(
              mob.x,
              mob.y,
              Math.max(mob.radius * 2, minDot),
              0,
              Math.PI * 2,
            );
            ctx.fill();
          });

          // NPCs / Companions (Purple dots)
          const npcsForMinimap = gameState.npcs ?? gameState.companions;
          if (npcsForMinimap) {
            ctx.fillStyle = "#9b59b6";
            npcsForMinimap.forEach(
              (comp: {
                x: number;
                y: number;
                radius: number;
                isAlive?: boolean;
              }) => {
                if (!comp.isAlive) return;
                ctx.beginPath();
                ctx.arc(
                  comp.x,
                  comp.y,
                  Math.max(comp.radius * 2, minDot),
                  0,
                  Math.PI * 2,
                );
                ctx.fill();
              },
            );
          }

          // Other Players (Blue dots)
          ctx.fillStyle = "#4444ff";
          renderPlayers.forEach((p) => {
            if (p.id === playerId || !p.isAlive) return;
            ctx.beginPath();
            ctx.arc(p.x, p.y, Math.max(4, minDot), 0, Math.PI * 2);
            ctx.fill();
          });

          // Current Player (Green/White dot)
          if (player && player.isAlive) {
            ctx.fillStyle = "#00ff00";
            ctx.beginPath();
            ctx.arc(player.x, player.y, Math.max(6, minDot), 0, Math.PI * 2);
            ctx.fill();
          }

          // The part of the world on the main view.
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 1 / miniMapScale;
          ctx.strokeRect(
            visible.minX,
            visible.minY,
            visible.maxX - visible.minX,
            visible.maxY - visible.minY,
          );

          ctx.restore();
        }
        lap("hud");
        if (timings) {
          recordTiming(timings, "total", performance.now() - renderStartTime);
        }
      }

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [canvasRef, trackFrame, debugTrackerRef]);

  return null; // This component only handles rendering
};

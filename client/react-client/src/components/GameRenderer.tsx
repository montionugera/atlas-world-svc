import { useRef, useEffect } from "react";
import { GameState } from "../types/game";
import { calculateScale, clearCanvas } from "../utils/drawingUtils";
import { drawGrid, drawGridCoordinates } from "../utils/gridUtils";
import type { AoeReticle } from "../utils/aoeReticle";
import { extrapolateEntities } from "../utils/deadReckoning";
import { drawMap } from "../renderers/mapRenderer";
import { drawMobs } from "../renderers/mobRenderer";
import { drawCompanions } from "../renderers/companionRenderer";
import { drawProjectiles } from "../renderers/projectileRenderer";
import { drawZoneEffects } from "../renderers/zoneEffectRenderer";
import { drawPlayers } from "../renderers/playerRenderer";
import {
  drawTerrain,
  drawFloatingTexts,
  FloatingText,
} from "../renderers/terrainRenderer";

interface GameRendererProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  gameState: GameState | null;
  updateCount: number;
  fps: number;
  updateRate: number;
  roomId: string | null;
  playerId: string;
  trackFrame: () => void;
  aoeReticle?: AoeReticle | null;
}

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

export const GameRenderer: React.FC<GameRendererProps> = ({
  canvasRef,
  gameState,
  updateCount,
  fps,
  updateRate,
  roomId,
  playerId,
  trackFrame,
  aoeReticle,
}) => {
  const animationFrameRef = useRef<number | undefined>(undefined);
  const floatingTextsRef = useRef<FloatingText[]>([]);
  const blastEffectsRef = useRef<BlastEffect[]>([]);
  const prevProjectilesRef = useRef<
    Map<string, { x: number; y: number; type?: string }>
  >(new Map());
  const lastEventTickRef = useRef<number>(-1);
  const lastRenderDurationRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const animate = () => {
      const renderStartTime = performance.now();
      trackFrame();

      // Clear canvas
      clearCanvas(ctx, canvas);

      if (gameState) {
        // Dead-reckon between snapshots (velocity is units/second).
        const frameNow = performance.now();
        const renderPlayers = extrapolateEntities(gameState.players, frameNow);
        const renderMobs = extrapolateEntities(gameState.mobs, frameNow);
        const renderProjectiles = gameState.projectiles
          ? extrapolateEntities(gameState.projectiles, frameNow)
          : undefined;
        // Detect detonated projectiles to spawn AoE blast shockwaves
        const prevProjs = prevProjectilesRef.current;
        const currentProjs = renderProjectiles || new Map();
        prevProjs.forEach((p, id) => {
          if (!currentProjs.has(id)) {
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
        const nextPrev = new Map<
          string,
          { x: number; y: number; type?: string }
        >();
        // Raw snapshot x/y: blasts must land where the server detonated.
        gameState.projectiles?.forEach((p, id) => {
          nextPrev.set(id, { x: p.x, y: p.y, type: p.type });
        });
        prevProjectilesRef.current = nextPrev;
        // Process new combat events into floating damage/kill texts
        if (
          gameState.events &&
          gameState.events.length > 0 &&
          gameState.tick !== lastEventTickRef.current
        ) {
          for (const ev of gameState.events) {
            const victimId = String(ev.targetId);
            const victim =
              renderMobs.get(victimId) ?? renderPlayers.get(victimId);
            if (victim) {
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
          }
          lastEventTickRef.current = gameState.tick;
        }

        // --- 1. Main Camera View ---
        const viewportSize = gameState.viewportSize ?? 50;
        const scale = calculateScale(gameState, canvas, viewportSize);

        // Find player to center camera
        const player = renderPlayers.get(playerId);
        let cameraX = gameState.width / 2;
        let cameraY = gameState.height / 2;

        if (player) {
          cameraX = player.x;
          cameraY = player.y;
        }

        ctx.save();

        // Center the view on the canvas
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.scale(scale, scale);
        ctx.translate(-cameraX, -cameraY);

        // 1. Draw Terrain, Biomes, Roads, River, and Town Buildings
        drawTerrain(
          ctx,
          gameState.width,
          gameState.height,
          1,
          scale,
          performance.now(),
        );

        // 2. World Boundaries
        ctx.strokeStyle = "#ff3838";
        ctx.lineWidth = 3 / scale;
        ctx.strokeRect(0, 0, gameState.width, gameState.height);

        // 3. Coordinate Grid Overlay
        const gridSize = Math.max(10, Math.round(viewportSize / 5));
        drawGrid(ctx, gameState.width, gameState.height, 1, scale, gridSize);
        if (gameState.zoneEffects) {
          drawZoneEffects(ctx, gameState.zoneEffects, scale);
        }
        drawMobs(ctx, renderMobs, 1, scale);

        const npcsMap = gameState.npcs ?? gameState.companions;
        if (npcsMap && npcsMap.size > 0) {
          drawCompanions(ctx, npcsMap, 1, scale);
        }

        drawPlayers(ctx, renderPlayers, playerId, 1, scale);
        if (renderProjectiles) {
          drawProjectiles(ctx, renderProjectiles, 1, scale);
        }

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
        drawGridCoordinates(
          ctx,
          cameraX,
          cameraY,
          scale,
          canvas.width,
          canvas.height,
          gameState.width,
          gameState.height,
          gridSize,
        );

        // --- 2. Mini Map Overlay ---
        const miniMapSize = 150;
        const padding = 20;
        const miniMapX = canvas.width - miniMapSize - padding;
        const miniMapY = padding;
        const miniMapScale =
          miniMapSize / Math.max(gameState.width, gameState.height);

        ctx.save();
        ctx.translate(miniMapX, miniMapY);

        // Background
        ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
        ctx.fillRect(0, 0, miniMapSize, miniMapSize);
        ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
        ctx.strokeRect(0, 0, miniMapSize, miniMapSize);

        // Entities
        // Simple dots for mini-map
        ctx.scale(miniMapScale, miniMapScale);

        // Mobs (Red dots)
        ctx.fillStyle = "#ff4444";
        renderMobs.forEach((mob) => {
          if (!mob.isAlive) return;
          ctx.beginPath();
          ctx.arc(mob.x, mob.y, mob.radius * 2, 0, Math.PI * 2); // Larger dots
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
              ctx.arc(comp.x, comp.y, comp.radius * 2, 0, Math.PI * 2);
              ctx.fill();
            },
          );
        }

        // Other Players (Blue dots)
        ctx.fillStyle = "#4444ff";
        renderPlayers.forEach((p) => {
          if (p.id === playerId || !p.isAlive) return;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
          ctx.fill();
        });

        // Current Player (Green/White dot)
        if (player && player.isAlive) {
          ctx.fillStyle = "#00ff00";
          ctx.beginPath();
          ctx.arc(player.x, player.y, 6, 0, Math.PI * 2);
          ctx.fill();
          // Optional: View cone
        }

        ctx.restore();

        // --- 3. Diagnostic Telemetry HUD (Top-Left) ---
        const renderDuration = performance.now() - renderStartTime;
        lastRenderDurationRef.current = renderDuration;
        const lm = (window as any).__latencyMetrics;

        ctx.save();
        ctx.fillStyle = "rgba(10, 15, 25, 0.85)";
        ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
        ctx.lineWidth = 1;
        const hudX = 14;
        const hudY = 14;
        const hudW = 280;
        const hudH = 92;
        if (typeof (ctx as any).roundRect === "function") {
          (ctx as any).roundRect(hudX, hudY, hudW, hudH, 8);
        } else {
          ctx.rect(hudX, hudY, hudW, hudH);
        }
        ctx.fill();
        ctx.stroke();

        ctx.font = 'bold 11px "Fira Code", monospace';
        ctx.fillStyle = "#ecf0f1";
        ctx.fillText("⚡ DIAGNOSTIC TELEMETRY", hudX + 10, hudY + 18);

        // Client FPS & Render Time
        ctx.font = '10px "Fira Code", monospace';
        ctx.fillStyle =
          fps >= 55 ? "#2ecc71" : fps >= 30 ? "#f1c40f" : "#e74c3c";
        ctx.fillText(`FPS: ${fps}`, hudX + 10, hudY + 36);

        ctx.fillStyle =
          renderDuration < 8
            ? "#2ecc71"
            : renderDuration < 16
              ? "#f1c40f"
              : "#e74c3c";
        ctx.fillText(
          `Render: ${renderDuration.toFixed(1)}ms`,
          hudX + 110,
          hudY + 36,
        );

        // Ping / Net RTT
        const ping = lm?.pingMs ?? 0;
        ctx.fillStyle =
          ping < 40 ? "#2ecc71" : ping < 100 ? "#f1c40f" : "#e74c3c";
        ctx.fillText(`Net RTT: ${ping}ms`, hudX + 10, hudY + 54);

        // Snapshot Interval & Jitter
        const snapInterval = lm?.snapshotIntervalMs ?? 50;
        const jitter = lm?.jitterMs ?? 0;
        ctx.fillStyle = jitter < 15 ? "#2ecc71" : "#f1c40f";
        ctx.fillText(
          `Snap: ${snapInterval.toFixed(0)}ms (±${jitter.toFixed(0)}ms)`,
          hudX + 110,
          hudY + 54,
        );

        // Entities
        ctx.fillStyle = "#95a5a6";
        ctx.fillText(
          `Entities: ${gameState.players.size}P | ${gameState.mobs.size}M | ${gameState.projectiles?.size || 0}Proj`,
          hudX + 10,
          hudY + 74,
        );
        ctx.restore();
      }

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [
    gameState,
    updateCount,
    fps,
    updateRate,
    roomId,
    playerId,
    trackFrame,
    aoeReticle,
  ]);

  return null; // This component only handles rendering
};

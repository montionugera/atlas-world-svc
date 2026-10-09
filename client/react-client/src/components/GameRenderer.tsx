import { useRef, useEffect } from "react";
import { GameState } from "../types/game";
import { calculateScale, clearCanvas } from "../utils/drawingUtils";
import { drawGrid, drawGridCoordinates } from "../utils/gridUtils";
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
}) => {
  const animationFrameRef = useRef<number | undefined>(undefined);
  const floatingTextsRef = useRef<FloatingText[]>([]);
  const lastEventTickRef = useRef<number>(-1);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const animate = () => {
      trackFrame();

      // Clear canvas
      clearCanvas(ctx, canvas);

      if (gameState) {
        // Process new combat events into floating damage/kill texts
        if (
          gameState.events &&
          gameState.events.length > 0 &&
          gameState.tick !== lastEventTickRef.current
        ) {
          for (const ev of gameState.events) {
            const victimId = String(ev.targetId);
            const victim =
              gameState.mobs.get(victimId) ?? gameState.players.get(victimId);
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
        const player = gameState.players.get(playerId);
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
        drawMobs(ctx, gameState.mobs, 1, scale);

        const npcsMap = gameState.npcs ?? gameState.companions;
        if (npcsMap && npcsMap.size > 0) {
          drawCompanions(ctx, npcsMap, 1, scale);
        }

        drawPlayers(ctx, gameState.players, playerId, 1, scale);
        if (gameState.projectiles) {
          drawProjectiles(ctx, gameState.projectiles, 1, scale);
        }

        // 4. Floating Combat Numbers
        const now = Date.now();
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
        gameState.mobs.forEach((mob) => {
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
        gameState.players.forEach((p) => {
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

        // HUD is now rendered outside the canvas
      }

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [gameState, updateCount, fps, updateRate, roomId, playerId, trackFrame]);

  return null; // This component only handles rendering
};

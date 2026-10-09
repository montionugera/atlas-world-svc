/**
 * The parts of the world that look the same every frame, drawn once to two offscreen
 * canvases and blitted: one UNDER the animated river (the ground), one OVER it (town,
 * terrain tint, blocks, world bounds, grid). They are repainted only when the room,
 * the world size, the scale or a debug overlay changes.
 */
import { mapDef } from "../config/maps";
import { staticBlocksFor, terrainZonesFor } from "../config/terrain";
import { drawGrid } from "../utils/gridUtils";
import { drawStaticBlocks, drawTerrainZones } from "./debugRenderer";
import { drawTerrainGround, drawTerrainTown } from "./terrainRenderer";

export interface StaticLayerSpec {
  mapId: string;
  width: number;
  height: number;
  /** Screen pixels per world unit. */
  scale: number;
  /** Debug tint of the terrain speed zones over the world art. */
  terrainTint: boolean;
  /** Debug grid cell in world units; 0 = no grid. */
  gridSize: number;
}

/** Border (px) around a layer, so strokes along the world edge are not cut off. */
const PAD_PX = 4;
/** A bigger world is drawn directly instead of being held as two canvases. */
const MAX_LAYER_PIXELS = 4096 * 4096;

type Paint = (ctx: CanvasRenderingContext2D, spec: StaticLayerSpec) => void;

const paintUnder: Paint = (ctx, { mapId, width, height, scale }) => {
  if (mapDef(mapId).art === "frontier") {
    drawTerrainGround(ctx, width, height, 1, scale);
  } else {
    // Plain test map: uncovered ground is grass.
    drawTerrainZones(
      ctx,
      [{ terrain: "grass", x: 0, y: 0, width, height }],
      scale,
      { fillAlpha: 0.85 },
    );
  }
};

const paintOver: Paint = (ctx, spec) => {
  const { mapId, width, height, scale } = spec;
  const plain = mapDef(mapId).art === "plain";
  if (!plain) drawTerrainTown(ctx, 1, scale);
  // Terrain speed zones: the map itself on plain maps, a debug tint over the art.
  const zones = terrainZonesFor(mapId);
  if (zones && (plain || spec.terrainTint)) {
    drawTerrainZones(ctx, zones, scale, { fillAlpha: plain ? 0.85 : 0.3 });
  }
  if (plain) drawStaticBlocks(ctx, staticBlocksFor(mapId), scale);

  // World boundaries
  ctx.strokeStyle = "#ff3838";
  ctx.lineWidth = 3 / scale;
  ctx.strokeRect(0, 0, width, height);

  if (spec.gridSize > 0) {
    drawGrid(ctx, width, height, 1, scale, spec.gridSize);
  }
};

type Layers = [under: HTMLCanvasElement, over: HTMLCanvasElement];

/** The layers of the one room on screen; `layers` is null when they cannot be held. */
let cache: { spec: StaticLayerSpec; layers: Layers | null } | undefined;

const sameSpec = (a: StaticLayerSpec, b: StaticLayerSpec): boolean =>
  a.mapId === b.mapId &&
  a.width === b.width &&
  a.height === b.height &&
  a.scale === b.scale &&
  a.terrainTint === b.terrainTint &&
  a.gridSize === b.gridSize;

function paintLayer(
  paint: Paint,
  spec: StaticLayerSpec,
  width: number,
  height: number,
): HTMLCanvasElement | null {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.translate(PAD_PX, PAD_PX);
  ctx.scale(spec.scale, spec.scale);
  paint(ctx, spec);
  return canvas;
}

function layersFor(spec: StaticLayerSpec): Layers | null {
  if (cache && sameSpec(cache.spec, spec)) return cache.layers;
  const width = Math.ceil(spec.width * spec.scale) + 2 * PAD_PX;
  const height = Math.ceil(spec.height * spec.scale) + 2 * PAD_PX;
  let layers: Layers | null = null;
  if (width * height <= MAX_LAYER_PIXELS) {
    const under = paintLayer(paintUnder, spec, width, height);
    const over = under && paintLayer(paintOver, spec, width, height);
    if (under && over) layers = [under, over];
  }
  cache = { spec: { ...spec }, layers };
  return layers;
}

/** Layer pixels map 1:1 onto screen pixels: the caller's transform is `spec.scale`. */
function blit(
  ctx: CanvasRenderingContext2D,
  layer: HTMLCanvasElement,
  scale: number,
): void {
  ctx.drawImage(
    layer,
    -PAD_PX / scale,
    -PAD_PX / scale,
    layer.width / scale,
    layer.height / scale,
  );
}

/** Draw the ground. Call inside the camera transform (world units). */
export function drawStaticUnder(
  ctx: CanvasRenderingContext2D,
  spec: StaticLayerSpec,
): void {
  const layers = layersFor(spec);
  if (layers) blit(ctx, layers[0], spec.scale);
  else paintUnder(ctx, spec);
}

/** Draw everything static above the river. Call inside the camera transform. */
export function drawStaticOver(
  ctx: CanvasRenderingContext2D,
  spec: StaticLayerSpec,
): void {
  const layers = layersFor(spec);
  if (layers) blit(ctx, layers[1], spec.scale);
  else paintOver(ctx, spec);
}

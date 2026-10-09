/**
 * The parts of the world that look the same every frame, drawn once to two offscreen
 * canvases and blitted: one UNDER the animated river (the ground), one OVER it (town,
 * terrain tint, blocks, world bounds, grid). They are repainted only when the room,
 * the world size, the scale or a debug overlay changes. A world too big to hold whole
 * is cached as the region around the camera and repainted when the camera leaves it.
 */
import { mapDef } from "../config/maps";
import { staticBlocksFor, terrainZonesFor } from "../config/terrain";
import { drawGrid } from "../utils/gridUtils";
import {
  PixelRegion,
  WorldRect,
  cacheRegion,
  regionCovers,
} from "../utils/viewport";
import { drawStaticBlocks, drawTerrainZones } from "./debugRenderer";
import { drawTerrainGround, drawTerrainTown } from "./terrainRenderer";

export interface StaticLayerSpec {
  mapId: string;
  width: number;
  height: number;
  /** Logical screen pixels per world unit (the caller's transform). */
  scale: number;
  /** Device pixels per logical pixel; the layers are painted at this density. */
  pixelRatio?: number;
  /** Debug tint of the terrain speed zones over the world art. */
  terrainTint: boolean;
  /** Debug grid cell in world units; 0 = no grid. */
  gridSize: number;
  /** World rectangle on screen; a world too big to hold whole is cached around it. */
  visible?: WorldRect;
}

/** Border (px) around a layer, so strokes along the world edge are not cut off. */
const PAD_PX = 4;
/** A bigger world is not held whole: only the region around the camera is. */
const MAX_LAYER_PIXELS = 4096 * 4096;
/** Layer pixels kept around the visible region: camera travel between repaints. */
const REGION_MARGIN_PX = 256;

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

/**
 * The layers of the one room on screen and the part of the world they hold; `layers`
 * is null when they cannot be held.
 */
let cache:
  | { spec: StaticLayerSpec; region: PixelRegion; layers: Layers | null }
  | undefined;

const sameSpec = (a: StaticLayerSpec, b: StaticLayerSpec): boolean =>
  a.mapId === b.mapId &&
  a.width === b.width &&
  a.height === b.height &&
  a.scale === b.scale &&
  (a.pixelRatio ?? 1) === (b.pixelRatio ?? 1) &&
  a.terrainTint === b.terrainTint &&
  a.gridSize === b.gridSize;

/** Layer pixels per world unit. */
const layerScale = (spec: StaticLayerSpec) =>
  spec.scale * (spec.pixelRatio ?? 1);

/** Paint `region` of the world onto `canvas` (a new one when none is given). */
function paintLayer(
  paint: Paint,
  spec: StaticLayerSpec,
  region: PixelRegion,
  canvas: HTMLCanvasElement = document.createElement("canvas"),
): HTMLCanvasElement | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  if (canvas.width !== region.width || canvas.height !== region.height) {
    canvas.width = region.width;
    canvas.height = region.height;
  } else {
    // Same size: resizing would reallocate the backing store, so wipe it instead.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, region.width, region.height);
  }
  ctx.translate(-region.x, -region.y);
  ctx.scale(layerScale(spec), layerScale(spec));
  paint(ctx, spec);
  return canvas;
}

function layersFor(spec: StaticLayerSpec): typeof cache {
  const scale = layerScale(spec);
  const whole: PixelRegion = {
    x: -PAD_PX,
    y: -PAD_PX,
    width: Math.ceil(spec.width * scale) + 2 * PAD_PX,
    height: Math.ceil(spec.height * scale) + 2 * PAD_PX,
  };
  const fits = whole.width * whole.height <= MAX_LAYER_PIXELS;
  const reusable = cache && sameSpec(cache.spec, spec) ? cache : undefined;
  if (
    reusable &&
    (fits ||
      !reusable.layers ||
      !spec.visible ||
      regionCovers({
        region: reusable.region,
        visible: spec.visible,
        layerScale: scale,
      }))
  ) {
    return reusable;
  }
  let region = whole;
  if (!fits && spec.visible) {
    region = cacheRegion({
      visible: spec.visible,
      layerScale: scale,
      marginPx: REGION_MARGIN_PX,
    });
  }
  let layers: Layers | null = null;
  if (region.width * region.height <= MAX_LAYER_PIXELS) {
    // A moved region has the size of the last one: repaint the same two canvases.
    const [oldUnder, oldOver] = reusable?.layers ?? [];
    const under = paintLayer(paintUnder, spec, region, oldUnder);
    const over = under && paintLayer(paintOver, spec, region, oldOver);
    if (under && over) layers = [under, over];
  }
  cache = { spec: { ...spec }, region, layers };
  return cache;
}

/** Layer pixels map 1:1 onto device pixels: `scale` is layer pixels per world unit. */
function blit(
  ctx: CanvasRenderingContext2D,
  layer: HTMLCanvasElement,
  region: PixelRegion,
  scale: number,
): void {
  ctx.drawImage(
    layer,
    region.x / scale,
    region.y / scale,
    layer.width / scale,
    layer.height / scale,
  );
}

/** Draw the ground. Call inside the camera transform (world units). */
export function drawStaticUnder(
  ctx: CanvasRenderingContext2D,
  spec: StaticLayerSpec,
): void {
  const held = layersFor(spec);
  if (held?.layers) blit(ctx, held.layers[0], held.region, layerScale(spec));
  else paintUnder(ctx, spec);
}

/** Draw everything static above the river. Call inside the camera transform. */
export function drawStaticOver(
  ctx: CanvasRenderingContext2D,
  spec: StaticLayerSpec,
): void {
  const held = layersFor(spec);
  if (held?.layers) blit(ctx, held.layers[1], held.region, layerScale(spec));
  else paintOver(ctx, spec);
}

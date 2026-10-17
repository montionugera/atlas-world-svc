/**
 * What part of the world is on screen, and the two things a big room needs from it:
 * which entities to draw, and which piece of the static world to keep cached.
 */

/** An axis-aligned rectangle in world units. */
export interface WorldRect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** World rectangle seen through a view centred on `camera`; `scale` = pixels per unit. */
export function visibleWorldRect({
  camera,
  view,
  scale,
}: {
  camera: { x: number; y: number };
  view: { width: number; height: number };
  scale: number;
}): WorldRect {
  const halfW = view.width / 2 / scale;
  const halfH = view.height / 2 / scale;
  return {
    minX: camera.x - halfW,
    minY: camera.y - halfH,
    maxX: camera.x + halfW,
    maxY: camera.y + halfH,
  };
}

/**
 * Fill `into` with the entities of `source` within `margin` world units of `rect`
 * (centre plus radius), and return it. `into` is emptied first, so one map can be
 * reused every frame.
 */
export function cullInto<T extends { x: number; y: number; radius?: number }>({
  source,
  into,
  rect,
  margin,
}: {
  source: ReadonlyMap<string, T>;
  into: Map<string, T>;
  rect: WorldRect;
  margin: number;
}): Map<string, T> {
  into.clear();
  source.forEach((entity, id) => {
    const reach = margin + (entity.radius ?? 0);
    if (
      entity.x >= rect.minX - reach &&
      entity.x <= rect.maxX + reach &&
      entity.y >= rect.minY - reach &&
      entity.y <= rect.maxY + reach
    ) {
      into.set(id, entity);
    }
  });
  return into;
}

/** A rectangle in whole layer pixels, measured from the world origin. */
export interface PixelRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Region of the world to cache around what is visible: the visible rectangle plus
 * `marginPx` on every side, so the camera can travel that far before a repaint.
 * `layerScale` is layer pixels per world unit. The size depends only on the size of
 * the visible rectangle, so the same canvases serve every repaint.
 */
export function cacheRegion({
  visible,
  layerScale,
  marginPx,
}: {
  visible: WorldRect;
  layerScale: number;
  marginPx: number;
}): PixelRegion {
  return {
    x: Math.floor(visible.minX * layerScale) - marginPx,
    y: Math.floor(visible.minY * layerScale) - marginPx,
    width:
      Math.round((visible.maxX - visible.minX) * layerScale) + 2 * marginPx + 1,
    height:
      Math.round((visible.maxY - visible.minY) * layerScale) + 2 * marginPx + 1,
  };
}

/** True while everything visible still lies inside a cached region. */
export function regionCovers({
  region,
  visible,
  layerScale,
}: {
  region: PixelRegion;
  visible: WorldRect;
  layerScale: number;
}): boolean {
  return (
    visible.minX * layerScale >= region.x &&
    visible.minY * layerScale >= region.y &&
    visible.maxX * layerScale <= region.x + region.width &&
    visible.maxY * layerScale <= region.y + region.height
  );
}

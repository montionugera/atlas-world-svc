/**
 * Size of the game canvas and the mapping from a mouse position to the world.
 *
 * The canvas fills the space its column gives it. Everything is drawn in LOGICAL
 * pixels (CSS pixels); the backing store holds `pixelRatio` device pixels for each,
 * and the frame loop applies that ratio as the base transform, so drawing code never
 * sees it and a high-density screen is sharp.
 */

/** Logical size of the canvas and device pixels per logical pixel. */
export interface CanvasView {
  width: number;
  height: number;
  pixelRatio: number;
}

/** Narrowest and widest shape the canvas takes; the view is scaled by its short side. */
const MIN_ASPECT = 4 / 3;
const MAX_ASPECT = 2;
const MIN_WIDTH = 320;
/**
 * Most device pixels along the short side. The cached terrain layers are the whole
 * world at screen scale (see staticLayers.ts); this keeps a 1000-unit world seen
 * through a 400-unit viewport within their 4096 px limit.
 */
const MAX_BACKING_SHORT_SIDE = 1600;

/** Largest canvas that fits `availWidth` x `availHeight` logical pixels. */
export function fitCanvasSize(
  availWidth: number,
  availHeight: number,
  devicePixelRatio: number,
): CanvasView {
  let width = Math.max(MIN_WIDTH, Math.floor(availWidth) || 0);
  let height = Math.max(MIN_WIDTH / MAX_ASPECT, Math.floor(availHeight) || 0);
  if (width > height * MAX_ASPECT) width = Math.floor(height * MAX_ASPECT);
  if (width < height * MIN_ASPECT) height = Math.floor(width / MIN_ASPECT);
  const density = Number.isFinite(devicePixelRatio) ? devicePixelRatio : 1;
  const pixelRatio = Math.min(
    Math.max(density, 1),
    MAX_BACKING_SHORT_SIDE / Math.min(width, height),
  );
  return { width, height, pixelRatio };
}

/** Backing-store size (whole device pixels) for a view. */
export function backingSize(view: CanvasView): {
  width: number;
  height: number;
} {
  return {
    width: Math.round(view.width * view.pixelRatio),
    height: Math.round(view.height * view.pixelRatio),
  };
}

/**
 * World point under a mouse position. `rect` is the canvas element's bounding rect
 * (it may be CSS-scaled away from the logical size), `scale` is logical pixels per
 * world unit and the camera is the world point at the centre of the view.
 */
export function clientToWorld(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  view: { width: number; height: number },
  scale: number,
  camera: { x: number; y: number },
): { x: number; y: number } {
  const px = ((clientX - rect.left) * view.width) / (rect.width || view.width);
  const py =
    ((clientY - rect.top) * view.height) / (rect.height || view.height);
  return {
    x: (px - view.width / 2) / scale + camera.x,
    y: (py - view.height / 2) / scale + camera.y,
  };
}

/** `v` moved onto a whole device pixel (v is in logical pixels). */
export function snapToDevicePixel(v: number, pixelRatio: number): number {
  return Math.round(v * pixelRatio) / pixelRatio;
}

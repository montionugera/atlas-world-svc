import { GRID_CONFIG } from '../config/gameConfig';

/**
 * Draw a grid overlay on the canvas aligned with game world coordinates
 */
export const drawGrid = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  scale: number = 1
): void => {
  if (!GRID_CONFIG.enabled) return;

  ctx.save();
  ctx.strokeStyle = GRID_CONFIG.color;
  ctx.lineWidth = GRID_CONFIG.lineWidth;
  ctx.font = GRID_CONFIG.coordinateFont;
  ctx.fillStyle = GRID_CONFIG.coordinateColor;

  // Grid size in pixels (game units * scale)
  const gridSizePixels = GRID_CONFIG.size * scale;
  
  // Calculate how many grid lines we need for the world (100x100 game units)
  const worldWidth = 100; // Game world width in units
  const worldHeight = 100; // Game world height in units
  const gridLinesX = Math.ceil(worldWidth / GRID_CONFIG.size);
  const gridLinesY = Math.ceil(worldHeight / GRID_CONFIG.size);

  // Draw vertical lines
  for (let i = 0; i <= gridLinesX; i++) {
    const x = i * gridSizePixels;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, worldHeight * scale);
    ctx.stroke();
  }

  // Draw horizontal lines
  for (let i = 0; i <= gridLinesY; i++) {
    const y = i * gridSizePixels;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(worldWidth * scale, y);
    ctx.stroke();
  }

  // Draw coordinates if enabled
  if (GRID_CONFIG.showCoordinates) {
    const offset = GRID_CONFIG.coordinateOffset;
    
    // Draw X coordinates (top) - show game units
    for (let i = 0; i <= gridLinesX; i++) {
      const x = i * gridSizePixels;
      const gameUnit = i * GRID_CONFIG.size;
      ctx.fillText(gameUnit.toString(), x + offset, 15);
    }

    // Draw Y coordinates (left) - show game units
    for (let i = 0; i <= gridLinesY; i++) {
      const y = i * gridSizePixels;
      const gameUnit = i * GRID_CONFIG.size;
      ctx.fillText(gameUnit.toString(), 5, y - offset);
    }
  }

  ctx.restore();
};

/**
 * Snap a coordinate to the nearest grid point (in game units)
 */
export const snapToGrid = (value: number, gridSize: number = GRID_CONFIG.size): number => {
  return Math.round(value / gridSize) * gridSize;
};

/**
 * Get grid cell coordinates for a given position (in game units)
 */
export const getGridCell = (x: number, y: number, gridSize: number = GRID_CONFIG.size): { cellX: number; cellY: number } => {
  return {
    cellX: Math.floor(x / gridSize),
    cellY: Math.floor(y / gridSize)
  };
};

/**
 * Convert world coordinates to grid coordinates (in game units)
 */
export const worldToGrid = (x: number, y: number, gridSize: number = GRID_CONFIG.size): { gridX: number; gridY: number } => {
  return {
    gridX: Math.floor(x / gridSize),
    gridY: Math.floor(y / gridSize)
  };
};

/**
 * Convert grid coordinates to world coordinates (in game units)
 */
export const gridToWorld = (gridX: number, gridY: number, gridSize: number = GRID_CONFIG.size): { x: number; y: number } => {
  return {
    x: gridX * gridSize,
    y: gridY * gridSize
  };
};

/**
 * Check if a position is on a grid line (useful for debugging)
 */
export const isOnGridLine = (x: number, y: number, gridSize: number = GRID_CONFIG.size): boolean => {
  return (x % gridSize === 0) || (y % gridSize === 0);
};

import { GRID_CONFIG } from '../config/gameConfig';

/**
 * Draw a grid overlay on the canvas aligned with game world coordinates
 */
export const drawGrid = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  scale: number = 1,
  viewScale: number = 1
): void => {
  if (!GRID_CONFIG.enabled) return;
  
  // Inverse scale line width to maintain constant 1px on screen
  const inverseScale = 1 / viewScale;

  ctx.save();
  ctx.strokeStyle = GRID_CONFIG.color;
  ctx.lineWidth = GRID_CONFIG.lineWidth * inverseScale;
  
  // Grid size in World Units
  const gridSize = GRID_CONFIG.size;
  
  const gridLinesX = Math.ceil(width / gridSize);
  const gridLinesY = Math.ceil(height / gridSize);

  // Draw vertical lines
  for (let i = 0; i <= gridLinesX; i++) {
    const x = i * gridSize;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }

  // Draw horizontal lines
  for (let i = 0; i <= gridLinesY; i++) {
    const y = i * gridSize;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  ctx.restore();
};

/**
 * Draw grid coordinates in Screen Space (HUD overlay style)
 * Should be called AFTER restoring camera transform
 */
export const drawGridCoordinates = (
  ctx: CanvasRenderingContext2D,
  cameraX: number,
  cameraY: number,
  scale: number,
  canvasWidth: number,
  canvasHeight: number,
  worldWidth: number,
  worldHeight: number
): void => {
  if (!GRID_CONFIG.enabled || !GRID_CONFIG.showCoordinates) return;

  ctx.save();
  ctx.fillStyle = GRID_CONFIG.coordinateColor;
  ctx.font = GRID_CONFIG.coordinateFont;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  const gridSize = GRID_CONFIG.size;
  const gridLinesX = Math.ceil(worldWidth / gridSize);
  const gridLinesY = Math.ceil(worldHeight / gridSize);

  // Draw X coordinates (along top edge)
  for (let i = 0; i <= gridLinesX; i++) {
    const worldX = i * gridSize;
    // Project to Screen
    const screenX = (worldX - cameraX) * scale + canvasWidth / 2;
    
    // Only draw if within horizontal bounds
    if (screenX >= -20 && screenX <= canvasWidth + 20) {
      ctx.fillText(worldX.toString(), screenX + GRID_CONFIG.coordinateOffset, GRID_CONFIG.coordinateOffset);
      
      // Draw small tick mark at the edge
      ctx.beginPath();
      ctx.moveTo(screenX, 0);
      ctx.lineTo(screenX, 5);
      ctx.strokeStyle = GRID_CONFIG.coordinateColor;
      ctx.stroke();
    }
  }

  // Draw Y coordinates (along left edge)
  for (let i = 0; i <= gridLinesY; i++) {
    const worldY = i * gridSize;
    // Project to Screen
    const screenY = (worldY - cameraY) * scale + canvasHeight / 2;
    
    // Only draw if within vertical bounds
    if (screenY >= -20 && screenY <= canvasHeight + 20) {
        // Draw text slightly offset from left
        ctx.fillText(worldY.toString(), GRID_CONFIG.coordinateOffset, screenY + GRID_CONFIG.coordinateOffset);
        
        // Draw small tick mark
        ctx.beginPath();
        ctx.moveTo(0, screenY);
        ctx.lineTo(5, screenY);
        ctx.strokeStyle = GRID_CONFIG.coordinateColor;
        ctx.stroke();
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

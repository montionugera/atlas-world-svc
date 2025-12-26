import { GameState } from '../types/game';
import { CANVAS_CONFIG } from '../config/gameConfig';

export interface Camera {
  x: number;
  y: number;
  scale: number;
}

/**
 * Calculate the scale factor to fit the game world into the canvas
 * while maintaining aspect ratio, OR for fixed viewport size
 */
export const calculateScale = (gameState: GameState, canvas: HTMLCanvasElement, viewportSize: number = 50): number => {
  // If viewportSize is provided, scale is based on fitting that many units into the smaller canvas dimension
  const scaleX = canvas.width / viewportSize;
  const scaleY = canvas.height / viewportSize;
  return Math.min(scaleX, scaleY);
};

/**
 * Clear the canvas with the configured background color
 */
export const clearCanvas = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement): void => {
  ctx.fillStyle = CANVAS_CONFIG.backgroundColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
};

/**
 * Draw a circle at the specified position with the given radius and color
 */
export const drawCircle = (
  ctx: CanvasRenderingContext2D, 
  x: number, 
  y: number, 
  radius: number, 
  color: string
): void => {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
};

/**
 * Draw a line from one point to another
 */
export const drawLine = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  lineWidth: number = 2
): void => {
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
};

/**
 * Draw a heading indicator (arrow) showing entity direction
 */
export const drawHeading = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  radius: number,
  scale: number = 1,
  color: string = '#ffffff',
  lineWidth: number = 3,
  sizeMultiplier: number = 0.6,
  viewScale: number = 1 // New parameter for inverse scaling
): void => {
  const scaledRadius = radius * scale;
  
  // Main line length - ensure tip is well within the circle
  const mainLineLength = scaledRadius * sizeMultiplier;
  
  // Calculate the tip of the arrow
  const tipX = x + Math.cos(angle) * mainLineLength;
  const tipY = y + Math.sin(angle) * mainLineLength;
  
  // Calculate points for the base of the arrowhead, slightly behind the tip
  const arrowHeadBaseLength = scaledRadius * (sizeMultiplier * 0.67); // Proportional to arrow length
  const basePointX = x + Math.cos(angle) * arrowHeadBaseLength;
  const basePointY = y + Math.sin(angle) * arrowHeadBaseLength;

  // Calculate the perpendicular offset for the wings
  const wingWidth = scaledRadius * 0.08; // 8% of radius for wing spread
  
  const wing1X = basePointX + Math.cos(angle - Math.PI / 2) * wingWidth; // Perpendicular to main line
  const wing1Y = basePointY + Math.sin(angle - Math.PI / 2) * wingWidth;
  
  const wing2X = basePointX + Math.cos(angle + Math.PI / 2) * wingWidth; // Perpendicular to main line
  const wing2Y = basePointY + Math.sin(angle + Math.PI / 2) * wingWidth;
  
  // Draw main line
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth / viewScale; // Inverse scale line width
  ctx.beginPath();
  ctx.moveTo(x, y); // Start from center
  ctx.lineTo(tipX, tipY); // Draw main line
  ctx.stroke(); // Stroke the main line

  // Draw arrowhead as a filled triangle for a cleaner look
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(wing1X, wing1Y);
  ctx.lineTo(wing2X, wing2Y);
  ctx.closePath();
  ctx.fill(); // Fill the arrowhead
};

/**
 * Draw text at the specified position
 */
export const drawText = (
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  font: string
): void => {
  ctx.fillStyle = color;
  ctx.font = font;
  ctx.fillText(text, x, y);
};

/**
 * Draw a health bar above an entity with customizable colors and size constraints
 */
export const drawHealthBar = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  currentHealth: number,
  maxHealth: number,
  entityRadius: number,
  scale: number = 1,
  backgroundColor: string = '#ff0000',
  healthColor: string = '#00ff00',
  borderColor: string = '#000000',
  options: {
    minWidth?: number;
    maxWidth?: number;
    minHeight?: number;
    maxHeight?: number;
    minOffset?: number;
    maxOffset?: number;
    widthMultiplier?: number;
    heightMultiplier?: number;
  } = {},
  viewScale: number = 1 // New parameter for inverse scaling
): void => {
  if (maxHealth <= 0) return;
  
  const scaledRadius = entityRadius * scale;
  const healthPercentage = currentHealth / maxHealth;
  const inverseScale = 1 / viewScale;
  
  // Destructure options with defaults (these are unscaled base values)
  const {
    minWidth: baseMinWidth = 8,
    maxWidth: baseMaxWidth = 60,
    minHeight: baseMinHeight = 2,
    maxHeight: baseMaxHeight = 8,
    minOffset: baseMinOffset = 4,
    maxOffset: baseMaxOffset = 20,
    widthMultiplier = 2.5,
    heightMultiplier = 0.3
  } = options;

  // Apply inverse scaling to all dimensional constraints so they remain constant in screen space
  const minWidth = baseMinWidth * inverseScale;
  const maxWidth = baseMaxWidth * inverseScale;
  const minHeight = baseMinHeight * inverseScale;
  const maxHeight = baseMaxHeight * inverseScale;
  const minOffset = baseMinOffset * inverseScale;
  const maxOffset = baseMaxOffset * inverseScale;
  
  // Calculate health bar size based on entity radius with constraints
  const baseWidth = scaledRadius * widthMultiplier;
  const baseHeight = scaledRadius * heightMultiplier;
  
  const barWidth = Math.max(minWidth, Math.min(maxWidth, baseWidth));
  const barHeight = Math.max(minHeight, Math.min(maxHeight, baseHeight));
  
  // Calculate offset with constraints
  const baseOffset = scaledRadius + (8 * inverseScale); // Base offset relative to radius
  const offset = Math.max(minOffset, Math.min(maxOffset, baseOffset));
  
  // Position health bar above the entity
  const barX = x - barWidth / 2;
  const barY = y - offset;
  
  // Draw background
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(barX, barY, barWidth, barHeight);
  
  // Draw current health
  ctx.fillStyle = healthColor;
  ctx.fillRect(barX, barY, barWidth * healthPercentage, barHeight);
  
  // Draw border
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1 * inverseScale;
  ctx.strokeRect(barX, barY, barWidth, barHeight);
};

/**
 * Draw an attack cone showing the attack direction and range
 */
export const drawAttackCone = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  heading: number,
  range: number,
  scale: number = 1,
  color: string = '#ff4444',
  alpha: number = 0.3
): void => {
  const scaledRange = range * scale;
  const coneAngle = Math.PI / 4; // 45-degree attack cone
  
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  
  // Start from player center
  ctx.moveTo(x, y);
  
  // Calculate cone edges
  const leftAngle = heading - coneAngle / 2;
  const rightAngle = heading + coneAngle / 2;
  
  // Draw arc from left edge to right edge
  ctx.arc(x, y, scaledRange, leftAngle, rightAngle);
  ctx.lineTo(x, y); // Close the cone
  ctx.fill();
  
  ctx.restore();
};

/**
 * Draw an attack slash effect
 */
export const drawAttackSlash = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  heading: number,
  playerScaledRadius: number,
  color: string = '#ffff00',
  lineWidth: number = 10,
  viewScale: number = 1
): void => {
  // Calculate slash line endpoints - shorter arc
  const startX = x ;
  const startY = y ;
  const endX = x + Math.cos(heading)*playerScaledRadius*2.2 ;
  const endY = y + Math.sin(heading)*playerScaledRadius*2.2;
  
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth / viewScale;
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineTo(endX, endY);
  ctx.stroke();
};

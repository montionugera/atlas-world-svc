import { GameState } from '../types/game';
import { CANVAS_CONFIG } from '../config/gameConfig';

/**
 * Calculate the scale factor to fit the game world into the canvas
 * while maintaining aspect ratio
 */
export const calculateScale = (gameState: GameState, canvas: HTMLCanvasElement): number => {
  const scaleX = canvas.width / gameState.width;
  const scaleY = canvas.height / gameState.height;
  return Math.min(scaleX, scaleY); // Use smaller scale to maintain aspect ratio
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
  lineWidth: number = 3
): void => {
  const scaledRadius = radius * scale;
  const arrowLength = scaledRadius * 0.7; // 70% of entity radius (inside circle)
  
  // Calculate arrow tip position (from center)
  const tipX = x + Math.cos(angle) * arrowLength;
  const tipY = y + Math.sin(angle) * arrowLength;
  
  // Arrow starts from center
  const baseX = x;
  const baseY = y;
  
  // Calculate arrow wing positions (larger wings for thicker arrow)
  const wingLength = scaledRadius * 0.25; // Larger wings
  const wingAngle1 = angle + Math.PI * 0.6; // 108 degrees
  const wingAngle2 = angle - Math.PI * 0.6; // -108 degrees
  
  const wing1X = tipX + Math.cos(wingAngle1) * wingLength;
  const wing1Y = tipY + Math.sin(wingAngle1) * wingLength;
  const wing2X = tipX + Math.cos(wingAngle2) * wingLength;
  const wing2Y = tipY + Math.sin(wingAngle2) * wingLength;
  
  // Draw arrow
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  ctx.moveTo(baseX, baseY); // Start from center
  ctx.lineTo(tipX, tipY);   // Main arrow line
  ctx.moveTo(tipX, tipY);   // Wings from tip
  ctx.lineTo(wing1X, wing1Y);
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(wing2X, wing2Y);
  ctx.stroke();
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
  } = {}
): void => {
  if (maxHealth <= 0) return;
  
  const scaledRadius = entityRadius * scale;
  const healthPercentage = currentHealth / maxHealth;
  
  // Default constraints
  const {
    minWidth = 8,
    maxWidth = 60,
    minHeight = 2,
    maxHeight = 8,
    minOffset = 4,
    maxOffset = 20,
    widthMultiplier = 2.5,
    heightMultiplier = 0.3
  } = options;
  
  // Calculate health bar size based on entity radius with constraints
  const baseWidth = scaledRadius * widthMultiplier;
  const baseHeight = scaledRadius * heightMultiplier;
  
  const barWidth = Math.max(minWidth, Math.min(maxWidth, baseWidth));
  const barHeight = Math.max(minHeight, Math.min(maxHeight, baseHeight));
  
  // Calculate offset with constraints
  const baseOffset = scaledRadius + 8;
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
  ctx.lineWidth = 1;
  ctx.strokeRect(barX, barY, barWidth, barHeight);
};

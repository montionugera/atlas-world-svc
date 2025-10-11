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
 * Draw a health bar above an entity
 */
export const drawHealthBar = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  currentHealth: number,
  maxHealth: number,
  width: number = 40,
  height: number = 4,
  scale: number = 1
): void => {
  if (maxHealth <= 0) return;
  
  const scaledWidth = width * scale;
  const scaledHeight = height * scale;
  const healthPercentage = currentHealth / maxHealth;
  
  // Position health bar above the entity
  const barX = x - scaledWidth / 2;
  const barY = y - 20 * scale; // 20 pixels above entity
  
  // Draw background (red)
  ctx.fillStyle = '#ff0000';
  ctx.fillRect(barX, barY, scaledWidth, scaledHeight);
  
  // Draw current health (green)
  ctx.fillStyle = '#00ff00';
  ctx.fillRect(barX, barY, scaledWidth * healthPercentage, scaledHeight);
  
  // Draw border
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1;
  ctx.strokeRect(barX, barY, scaledWidth, scaledHeight);
};

/**
 * Draw a health bar with custom colors
 */
export const drawHealthBarCustom = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  currentHealth: number,
  maxHealth: number,
  width: number = 40,
  height: number = 4,
  scale: number = 1,
  backgroundColor: string = '#ff0000',
  healthColor: string = '#00ff00',
  borderColor: string = '#000000'
): void => {
  if (maxHealth <= 0) return;
  
  const scaledWidth = width * scale;
  const scaledHeight = height * scale;
  const healthPercentage = currentHealth / maxHealth;
  
  // Position health bar above the entity
  const barX = x - scaledWidth / 2;
  const barY = y - 20 * scale; // 20 pixels above entity
  
  // Draw background
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(barX, barY, scaledWidth, scaledHeight);
  
  // Draw current health
  ctx.fillStyle = healthColor;
  ctx.fillRect(barX, barY, scaledWidth * healthPercentage, scaledHeight);
  
  // Draw border
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1;
  ctx.strokeRect(barX, barY, scaledWidth, scaledHeight);
};

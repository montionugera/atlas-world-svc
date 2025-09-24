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

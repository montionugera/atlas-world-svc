import { GameState } from '../types/game';
import { CANVAS_CONFIG } from '../config/gameConfig';

/**
 * Draw the game map boundaries
 */
export const drawMap = (ctx: CanvasRenderingContext2D, gameState: GameState, scale: number): void => {
  ctx.strokeStyle = CANVAS_CONFIG.borderColor;
  ctx.lineWidth = CANVAS_CONFIG.borderWidth;
  ctx.strokeRect(0, 0, gameState.width * scale, gameState.height * scale);
};

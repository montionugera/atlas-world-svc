// Game rendering configuration constants

export const CANVAS_CONFIG = {
  width: 800,
  height: 600,
  backgroundColor: '#1a1a1a',
  borderColor: '#00ff00',
  borderWidth: 3,
  borderRadius: '10px',
  cursor: 'crosshair'
} as const;

export const RENDER_CONFIG = {
  mobRadius: 4,
  playerRadius: 4,
  velocityVectorScale: 5,
  hudBackground: 'rgba(0, 0, 0, 0.45)',
  hudTextColor: '#fff',
  hudFont: 'bold 16px Arial',
  playerNameFont: '12px Arial',
  hudPadding: 5,
  hudWidth: 200,
  hudHeight: 180,
  hudLineSpacing: 20
} as const;

export const COLORS = {
  mob: '#ff6b6b',
  player: '#4ecdc4',
  playerHighlight: '#fff',
  hudBackground: '#000',
  hudText: '#fff',
  canvasBackground: '#1a1a1a',
  border: '#00ff00'
} as const;

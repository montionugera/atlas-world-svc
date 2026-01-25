import React, { useEffect, useRef } from 'react';
import { UseColyseusClientReturn } from '../hooks/useColyseusClient';
import { useKeyboardControls } from '../hooks/useKeyboardControls';
import { GameRenderer } from './GameRenderer';
import { CANVAS_CONFIG } from '../config/gameConfig';
import { useGameStateContext } from '../contexts/GameStateContext';
import { InputDebugPanel } from './InputDebugPanel';
import { calculateScale } from '../utils/drawingUtils';

interface ColyseusGameCanvasProps {
  client: UseColyseusClientReturn;
}

export const ColyseusGameCanvas: React.FC<ColyseusGameCanvasProps> = ({ client }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mousePositionRef = useRef<{ x: number, y: number }>({ x: 0, y: 0 }); // Track mouse world position
  const { setGameState } = useGameStateContext();
  
  const {
    isConnected: clientConnected,
    roomId,
    playerId,
    gameState,
    updateCount,
    fps,
    updateRate,
    updatePlayerInput,
    sendPlayerAction,
    toggleBotMode,
    trackFrame,
    respawn,
    forceDie
  } = client;

  // Update context when gameState or roomId changes
  useEffect(() => {
    setGameState(gameState, roomId, clientConnected);
  }, [gameState?.tick, gameState, roomId, clientConnected, setGameState]);

  // Handle keyboard controls
  const { pressedKeys } = useKeyboardControls({ updatePlayerInput, sendPlayerAction, mousePositionRef });
  
  // Handle mouse tracking to update mousePositionRef with World Coordinates
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
        const canvas = canvasRef.current;
        if (!canvas || !gameState) return;
        
        const rect = canvas.getBoundingClientRect();
        const clientX = e.clientX - rect.left;
        const clientY = e.clientY - rect.top;
        
        // Match scaling logic from GameRenderer / drawingUtils
        const viewportSize = 50; 
        const scale = calculateScale(gameState, canvas, viewportSize);
        
        let cameraX = gameState.width / 2;
        let cameraY = gameState.height / 2;
        
        const player = gameState.players.get(playerId);
        if (player) {
           cameraX = player.x;
           cameraY = player.y;
        }
        
        // Transform: World -> Screen
        // ScreenX = (WorldX - CameraX) * Scale + CanvasWidth/2
        // Inverse: WorldX = (ScreenX - CanvasWidth/2) / Scale + CameraX
        
        const worldX = (clientX - canvas.width / 2) / scale + cameraX;
        const worldY = (clientY - canvas.height / 2) / scale + cameraY;
        
        mousePositionRef.current = { x: worldX, y: worldY };
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [gameState, playerId]); // Dependency on gameState needed for frame updates, but ref is stable. 
                             // Optimization: gameState changes every tick. This effect re-binding every tick is heavy.
                             // But calculateScale/camera depends on latest State.
                             // We can use refs for gameState inside the handler to avoid re-binding.
                             
  // Optimized Mouse Handler using Refs for dependencies to avoid listener churn
  const latestStateRef = useRef({ gameState, playerId });
  useEffect(() => {
    latestStateRef.current = { gameState, playerId };
  }, [gameState, playerId]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
        const canvas = canvasRef.current;
        const { gameState, playerId } = latestStateRef.current;
        
        if (!canvas || !gameState) return;
        
        const rect = canvas.getBoundingClientRect();
        const clientX = e.clientX - rect.left;
        const clientY = e.clientY - rect.top;
        
        const viewportSize = 50; 
        const scale = calculateScale(gameState, canvas, viewportSize);
        
        let cameraX = gameState.width / 2;
        let cameraY = gameState.height / 2;
        
        const player = gameState.players.get(playerId);
        if (player) {
           cameraX = player.x;
           cameraY = player.y;
        }
        
        const worldX = (clientX - canvas.width / 2) / scale + cameraX;
        const worldY = (clientY - canvas.height / 2) / scale + cameraY;
        
        mousePositionRef.current = { x: worldX, y: worldY };
    };
    
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []); // Bound once

  const containerStyle: React.CSSProperties = {
     position: 'relative', 
     display: 'inline-block',
     borderRadius: CANVAS_CONFIG.borderRadius,
     overflow: 'hidden', 
     boxShadow: '0 20px 50px rgba(0,0,0,0.5)'
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px', padding: '20px' }}>
      
      <div style={containerStyle}>
        <canvas
          ref={canvasRef}
          width={CANVAS_CONFIG.width}
          height={CANVAS_CONFIG.height}
          style={{
            backgroundColor: CANVAS_CONFIG.backgroundColor,
            cursor: CANVAS_CONFIG.cursor, // Maybe change to crosshair?
            display: 'block'
          }}
        />
        
        <InputDebugPanel pressedKeysRef={pressedKeys} />
        
        <GameRenderer
          canvasRef={canvasRef}
          gameState={gameState}
          updateCount={updateCount}
          fps={fps}
          updateRate={updateRate}
          roomId={roomId}
          playerId={playerId}
          trackFrame={trackFrame}
        />
      </div>
    </div>
  );
};
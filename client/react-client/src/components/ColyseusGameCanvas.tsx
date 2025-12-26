import React, { useEffect, useRef } from 'react';
import { UseColyseusClientReturn } from '../hooks/useColyseusClient';
import { useKeyboardControls } from '../hooks/useKeyboardControls';
import { GameRenderer } from './GameRenderer';
import { GameHUD } from './GameHUD';
import { GameHoverMenu } from './GameHoverMenu';
import { GameInstructions } from './GameInstructions';
import { CANVAS_CONFIG } from '../config/gameConfig';
import { useGameStateContext } from '../contexts/GameStateContext';

interface ColyseusGameCanvasProps {
  client: UseColyseusClientReturn;
}

export const ColyseusGameCanvas: React.FC<ColyseusGameCanvasProps> = ({ client }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
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
  // Track tick to ensure updates even when Colyseus updates in-place
  useEffect(() => {
    setGameState(gameState, roomId, clientConnected);
  }, [gameState?.tick, gameState, roomId, clientConnected, setGameState]);

  // Handle keyboard controls
  useKeyboardControls({ updatePlayerInput, sendPlayerAction });

  // Connection logic is now handled by the parent (App.tsx)
  
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
            cursor: CANVAS_CONFIG.cursor,
            display: 'block'
          }}
        />
        
        <GameHUD
          isConnected={clientConnected}
          playerId={playerId}
          roomId={roomId}
        />

        {/* Bottom: Hover Action Menu */}
        <GameHoverMenu 
            isConnected={clientConnected}
            isBotMode={gameState?.players.get(playerId)?.isBotMode || false}
            onToggleBotMode={() => {
              const currentMode = gameState?.players.get(playerId)?.isBotMode || false;
              toggleBotMode(!currentMode);
            }}
            onAttack={() => sendPlayerAction('attack', true)}
            isDead={!gameState?.players.get(playerId)?.isAlive && !!gameState?.players.get(playerId)}
            onRespawn={respawn}
            onForceDie={forceDie}
        />
        
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
      
      <GameInstructions />
    </div>
  );
};
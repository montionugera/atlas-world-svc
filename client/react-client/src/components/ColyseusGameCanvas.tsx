import React, { useEffect, useRef, useState } from 'react';
import { useColyseusClient, ColyseusClientConfig } from '../hooks/useColyseusClient';
import { useKeyboardControls } from '../hooks/useKeyboardControls';
import { GameRenderer } from './GameRenderer';
import { GameHUD } from './GameHUD';
import { GameControls } from './GameControls';
import { GameInstructions } from './GameInstructions';
import { CANVAS_CONFIG } from '../config/gameConfig';
import { useGameStateContext } from '../contexts/GameStateContext';

interface ColyseusGameCanvasProps {
  config: ColyseusClientConfig;
}

export const ColyseusGameCanvas: React.FC<ColyseusGameCanvasProps> = ({ config }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isConnected, setIsConnected] = useState(false);
  const { setGameState } = useGameStateContext();
  
  const {
    isConnected: clientConnected,
    roomId,
    playerId,
    gameState,
    updateCount,
    isSimulating,
    fps,
    updateRate,
    connect,
    joinRoom,
    updatePlayerInput,
    sendPlayerAction,
    startSimulation,
    stopSimulation,
    disconnect,
    toggleBotMode,
    trackFrame,
    respawn
  } = useColyseusClient(config);

  // Update context when gameState or roomId changes
  // Track tick to ensure updates even when Colyseus updates in-place
  useEffect(() => {
    setGameState(gameState, roomId, clientConnected);
  }, [gameState?.tick, gameState, roomId, clientConnected, setGameState]);

  // Handle keyboard controls
  useKeyboardControls({ updatePlayerInput, sendPlayerAction });

  // Handle connection
  useEffect(() => {
    if (!isConnected && !clientConnected) {
      connect().then(() => {
        setIsConnected(true);
        joinRoom('map-01-sector-a');
      }).catch(console.error);
    }
  }, [isConnected, clientConnected, connect, joinRoom]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
      <GameControls
        isSimulating={isSimulating}
        isConnected={clientConnected}
        onStartSimulation={startSimulation}
        onStopSimulation={stopSimulation}
        onDisconnect={disconnect}
        isBotMode={gameState?.players.get(playerId)?.isBotMode || false}
        onToggleBotMode={() => {
          const currentMode = gameState?.players.get(playerId)?.isBotMode || false;
          toggleBotMode(!currentMode);
        }}
        onAttack={() => sendPlayerAction('attack', true)}
        isDead={!gameState?.players.get(playerId)?.isAlive && !!gameState?.players.get(playerId)}
        onRespawn={respawn}
      />
      
      <div style={{ position: 'relative', display: 'inline-block' }}>
        <canvas
          ref={canvasRef}
          width={CANVAS_CONFIG.width}
          height={CANVAS_CONFIG.height}
          style={{
            border: `${CANVAS_CONFIG.borderWidth}px solid ${CANVAS_CONFIG.borderColor}`,
            backgroundColor: CANVAS_CONFIG.backgroundColor,
            cursor: CANVAS_CONFIG.cursor,
            borderRadius: CANVAS_CONFIG.borderRadius,
            display: 'block'
          }}
        />
        
        <GameHUD
          isConnected={clientConnected}
          playerId={playerId}
          roomId={roomId}
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
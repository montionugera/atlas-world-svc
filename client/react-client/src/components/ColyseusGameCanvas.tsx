import React, { useEffect, useRef, useState } from 'react';
import { useColyseusClient, ColyseusClientConfig } from '../hooks/useColyseusClient';
import { useKeyboardControls } from '../hooks/useKeyboardControls';
import { GameRenderer } from './GameRenderer';
import { GameHUD } from './GameHUD';
import { GameControls } from './GameControls';
import { GameInstructions } from './GameInstructions';

interface ColyseusGameCanvasProps {
  config: ColyseusClientConfig;
}

export const ColyseusGameCanvas: React.FC<ColyseusGameCanvasProps> = ({ config }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isConnected, setIsConnected] = useState(false);
  
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
    startSimulation,
    stopSimulation,
    disconnect,
    trackFrame
  } = useColyseusClient(config);

  // Handle keyboard controls
  useKeyboardControls({ updatePlayerInput });

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
      />
      
      <div style={{ position: 'relative' }}>
        <canvas
          ref={canvasRef}
          width={800}
          height={600}
          style={{
            border: '3px solid #00ff00',
            backgroundColor: '#1a1a1a',
            cursor: 'crosshair',
            borderRadius: '10px'
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
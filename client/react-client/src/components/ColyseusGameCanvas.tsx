import React, { useEffect, useRef, useState } from 'react';
import { useColyseusClient, ColyseusClientConfig } from '../hooks/useColyseusClient';

interface ColyseusGameCanvasProps {
  config: ColyseusClientConfig;
}

export const ColyseusGameCanvas: React.FC<ColyseusGameCanvasProps> = ({ config }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | undefined>(undefined);
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
    updatePlayerPosition,
    updatePlayerInput,
    startSimulation,
    stopSimulation,
    disconnect,
    trackFrame
  } = useColyseusClient(config);

  // Handle connection
  useEffect(() => {
    if (!isConnected && !clientConnected) {
      connect().then(() => {
        setIsConnected(true);
        joinRoom('map-01-sector-a');
      }).catch(console.error);
    }
  }, [isConnected, clientConnected, connect, joinRoom]);

  // Animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const animate = () => {
      trackFrame();
      
      // Clear canvas
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      if (gameState) {
        // Draw map boundaries
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 3;
        ctx.strokeRect(0, 0, gameState.width, gameState.height);
        
        // Draw mobs
        ctx.fillStyle = '#ff6b6b';
        gameState.mobs.forEach(mob => {
          ctx.beginPath();
          ctx.arc(mob.x, mob.y, 8, 0, Math.PI * 2);
          ctx.fill();
          
          // Draw velocity vector
          ctx.strokeStyle = '#ff6b6b';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(mob.x, mob.y);
          ctx.lineTo(mob.x + mob.vx * 5, mob.y + mob.vy * 5);
          ctx.stroke();
        });
        
        // Draw players
        ctx.fillStyle = '#4ecdc4';
        gameState.players.forEach((player, sessionId) => {
          ctx.beginPath();
          ctx.arc(player.x, player.y, 10, 0, Math.PI * 2);
          ctx.fill();
          
          // Draw player name
          ctx.fillStyle = '#fff';
          ctx.font = '12px Arial';
          ctx.fillText(player.name, player.x - 20, player.y - 15);
          ctx.fillStyle = '#4ecdc4';
          
          // Highlight current player
          if (sessionId === playerId) {
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 3;
            ctx.stroke();
          }
        });
        
        // Draw game info with better contrast
        ctx.fillStyle = '#000';
        ctx.fillRect(5, 5, 200, 180);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 16px Arial';
        ctx.fillText(`Map: ${gameState.mapId}`, 10, 25);
        ctx.fillText(`Players: ${gameState.players.size}`, 10, 45);
        ctx.fillText(`Mobs: ${gameState.mobs.length}`, 10, 65);
        ctx.fillText(`Tick: ${gameState.tick}`, 10, 85);
        ctx.fillText(`Updates: ${updateCount}`, 10, 105);
        ctx.fillText(`FPS: ${fps}`, 10, 125);
        ctx.fillText(`Rate: ${updateRate}/s`, 10, 145);
        
        if (roomId) {
          ctx.fillText(`Room: ${roomId}`, 10, 165);
        }
      }
      
      animationFrameRef.current = requestAnimationFrame(animate);
    };
    
    animate();
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [gameState, updateCount, fps, updateRate, roomId, playerId, trackFrame]);

  // Handle keyboard input
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const speed = 2;
      let vx = 0, vy = 0;
      
      switch (event.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
          vy = -speed;
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          vy = speed;
          break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
          vx = -speed;
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          vx = speed;
          break;
      }
      
      if (vx !== 0 || vy !== 0) {
        updatePlayerInput(vx, vy);
      }
    };
    
    const handleKeyUp = () => {
      updatePlayerInput(0, 0);
    };
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [updatePlayerInput]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
        <button 
          onClick={startSimulation} 
          disabled={isSimulating || !clientConnected}
          style={{ 
            padding: '10px 20px', 
            backgroundColor: isSimulating ? '#666' : '#4ecdc4',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: isSimulating || !clientConnected ? 'not-allowed' : 'pointer'
          }}
        >
          {isSimulating ? 'Simulating...' : 'Start Simulation'}
        </button>
        
        <button 
          onClick={stopSimulation} 
          disabled={!isSimulating}
          style={{ 
            padding: '10px 20px', 
            backgroundColor: !isSimulating ? '#666' : '#ff6b6b',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: !isSimulating ? 'not-allowed' : 'pointer'
          }}
        >
          Stop Simulation
        </button>
        
        <button 
          onClick={disconnect}
          style={{ 
            padding: '10px 20px', 
            backgroundColor: '#666',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer'
          }}
        >
          Disconnect
        </button>
      </div>
      
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
        
        <div style={{
          position: 'absolute',
          top: '10px',
          right: '10px',
          backgroundColor: 'rgba(0,0,0,0.9)',
          color: '#00ff00',
          padding: '15px',
          borderRadius: '8px',
          fontSize: '16px',
          fontFamily: 'monospace',
          fontWeight: 'bold',
          border: '2px solid #00ff00'
        }}>
          <div>Status: {clientConnected ? '🟢 Connected' : '🔴 Disconnected'}</div>
          <div>Player: {playerId.substring(0, 8)}...</div>
          {roomId && <div>Room: {roomId.substring(0, 8)}...</div>}
        </div>
      </div>
      
      <div style={{ 
        backgroundColor: '#2a2a2a', 
        color: '#00ff00',
        padding: '20px', 
        borderRadius: '10px',
        fontFamily: 'monospace',
        fontSize: '16px',
        fontWeight: 'bold',
        border: '2px solid #00ff00',
        marginTop: '20px'
      }}>
        <div style={{ color: '#ffff00', fontSize: '18px', marginBottom: '10px' }}><strong>🎮 CONTROLS:</strong></div>
        <div style={{ marginBottom: '8px' }}>• Use WASD or Arrow Keys to move</div>
        <div style={{ marginBottom: '8px' }}>• Click "Start Simulation" to begin automated movement</div>
        <div style={{ color: '#00ffff' }}>• Real-time state synchronization via Colyseus</div>
      </div>
    </div>
  );
};

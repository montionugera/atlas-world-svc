import React from 'react';

interface GameHUDProps {
  isConnected: boolean;
  playerId: string;
  roomId: string | null;
}

export const GameHUD: React.FC<GameHUDProps> = ({ isConnected, playerId, roomId }) => {
  return (
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
      <div>Status: {isConnected ? '🟢 Connected' : '🔴 Disconnected'}</div>
      <div>Player: {playerId.substring(0, 8)}...</div>
      {roomId && <div>Room: {roomId.substring(0, 8)}...</div>}
    </div>
  );
};

import React from 'react';

export const GameInstructions: React.FC = () => {
  return (
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
      <div style={{ color: '#ffff00', fontSize: '18px', marginBottom: '10px' }}>
        <strong>🎮 CONTROLS:</strong>
      </div>
      <div style={{ marginBottom: '8px' }}>• Use WASD or Arrow Keys to move</div>
      <div style={{ marginBottom: '8px' }}>• Click "Start Simulation" to begin automated movement</div>
      <div style={{ color: '#00ffff' }}>• Real-time state synchronization via Colyseus</div>
    </div>
  );
};

import React from 'react';

interface GameControlsProps {
  isSimulating: boolean;
  isConnected: boolean;
  onStartSimulation: () => void;
  onStopSimulation: () => void;
  onDisconnect: () => void;
}

export const GameControls: React.FC<GameControlsProps> = ({
  isSimulating,
  isConnected,
  onStartSimulation,
  onStopSimulation,
  onDisconnect
}) => {
  return (
    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
      <button 
        onClick={onStartSimulation} 
        disabled={isSimulating || !isConnected}
        style={{ 
          padding: '10px 20px', 
          backgroundColor: isSimulating ? '#666' : '#4ecdc4',
          color: 'white',
          border: 'none',
          borderRadius: '5px',
          cursor: isSimulating || !isConnected ? 'not-allowed' : 'pointer'
        }}
      >
        {isSimulating ? 'Simulating...' : 'Start Simulation'}
      </button>
      
      <button 
        onClick={onStopSimulation} 
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
        onClick={onDisconnect}
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
  );
};

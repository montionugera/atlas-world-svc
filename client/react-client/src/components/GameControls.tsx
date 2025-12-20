import React from 'react';

interface GameControlsProps {
  isSimulating: boolean;
  isConnected: boolean;
  onStartSimulation: () => void;
  onStopSimulation: () => void;
  onDisconnect: () => void;
  isBotMode: boolean;
  onToggleBotMode: () => void;
  onAttack: () => void;
  isDead: boolean;
  onRespawn: () => void;
}

export const GameControls: React.FC<GameControlsProps> = ({
  isSimulating,
  isConnected,
  onStartSimulation,
  onStopSimulation,
  onDisconnect,
  isBotMode,
  onToggleBotMode,
  onAttack,
  isDead,
  onRespawn
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

      <button 
        onClick={onToggleBotMode}
        disabled={!isConnected}
        style={{ 
          padding: '10px 20px', 
          backgroundColor: isBotMode ? '#ff9f43' : '#54a0ff',
          color: 'white',
          border: 'none',
          borderRadius: '5px',
          cursor: !isConnected ? 'not-allowed' : 'pointer',
          marginLeft: '20px'
        }}
      >
        {isBotMode ? '🤖 Disable Bot' : '🤖 Enable Bot'}
      </button>

      <button 
        onClick={onAttack}
        disabled={!isConnected || isBotMode || isDead}
        style={{ 
          padding: '10px 20px', 
          backgroundColor: '#ff4757',
          color: 'white',
          border: 'none',
          borderRadius: '5px',
          cursor: !isConnected || isBotMode || isDead ? 'not-allowed' : 'pointer',
          marginLeft: '10px'
        }}
      >
        ⚔️ Attack
      </button>

      {isDead && (
        <button 
          onClick={onRespawn}
          style={{ 
            padding: '10px 20px', 
            backgroundColor: '#2ecc71',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer',
            marginLeft: '10px',
            fontWeight: 'bold',
            boxShadow: '0 0 10px rgba(46, 204, 113, 0.5)'
          }}
        >
          ♻️ RESPAWN
        </button>
      )}
    </div>
  );
};

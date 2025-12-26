import React from 'react';
// import { Player } from '../../../types/game';

interface PlayerDebugPanelProps {
  player: any; // Relaxed type to handle both Player and PlayerInstance
  onDebugTeleport?: (x: number, y: number) => void;
  onDebugSpawnMob?: (x: number, y: number) => void;
}

export const PlayerDebugPanel: React.FC<PlayerDebugPanelProps> = ({ player, onDebugTeleport, onDebugSpawnMob }) => {
  const cardStyle: React.CSSProperties = {
    backgroundColor: '#2c3e50',
    color: '#ecf0f1',
    borderRadius: '8px',
    padding: '15px',
    marginBottom: '10px',
    boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
    fontFamily: 'monospace',
    fontSize: '14px',
    width: '300px'
  };

  const headerStyle: React.CSSProperties = {
    borderBottom: '1px solid #34495e',
    paddingBottom: '10px',
    marginBottom: '10px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  };

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '5px'
  };

  const labelStyle: React.CSSProperties = {
    color: '#bdc3c7',
    fontWeight: 'bold'
  };

  const valueStyle: React.CSSProperties = {
    color: '#3498db'
  };

  const buttonStyle: React.CSSProperties = {
    backgroundColor: '#e67e22',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    padding: '4px 8px',
    fontSize: '12px',
    cursor: 'pointer',
    marginTop: '5px',
    width: '100%'
  };

  const statusColor = player.isBotMode ? '#2ecc71' : '#95a5a6';

  const handleTeleport = () => {
    if (onDebugTeleport) {
      // Teleport to 100, 100 or random
      onDebugTeleport(100, 100);
    }
  };

  const handleSpawnMob = () => {
    if (onDebugSpawnMob && player.x && player.y) {
      // Spawn near player
      onDebugSpawnMob(player.x + 5, player.y + 5);
    }
  };

  return (
    <div style={cardStyle}>
      <div style={headerStyle}>
        <span style={{ fontWeight: 'bold', fontSize: '16px' }}>{player.name || 'Unknown'}</span>
        <span style={{ 
          backgroundColor: statusColor, 
          padding: '2px 6px', 
          borderRadius: '4px', 
          fontSize: '10px',
          color: 'white'
        }}>
          {player.isBotMode ? 'BOT ACTIVE' : 'MANUAL'}
        </span>
      </div>

      <div style={rowStyle}>
        <span style={labelStyle}>ID:</span>
        <span style={valueStyle}>{player.sessionId}</span>
      </div>

      <div style={rowStyle}>
        <span style={labelStyle}>Behavior:</span>
        <span style={{ ...valueStyle, color: player.currentBehavior === 'attack' ? '#e74c3c' : '#3498db' }}>
          {player.currentBehavior || 'idle'}
        </span>
      </div>

      <div style={rowStyle}>
        <span style={labelStyle}>Target:</span>
        <span style={valueStyle}>{player.currentAttackTarget || 'None'}</span>
      </div>

      <div style={rowStyle}>
        <span style={labelStyle}>Position:</span>
        <span style={valueStyle}>
          {player.x?.toFixed(1)}, {player.y?.toFixed(1)}
        </span>
      </div>

      <div style={rowStyle}>
        <span style={labelStyle}>Velocity:</span>
        <span style={valueStyle}>
          {player.vx?.toFixed(2)}, {player.vy?.toFixed(2)}
        </span>
      </div>

      {onDebugSpawnMob && (
        <button style={buttonStyle} onClick={handleSpawnMob}>
          👹 Spawn Mob Here
        </button>
      )}
      
      {onDebugTeleport && (
        <button style={{ ...buttonStyle, backgroundColor: '#8e44ad', marginTop: '5px' }} onClick={handleTeleport}>
          ⚡ Teleport (100, 100)
        </button>
      )}
    </div>
  );
};

// Status Panel Component for displaying game status

import React from 'react';

interface StatusPanelProps {
  isConnected: boolean;
  matchId: string | null;
  playerId: string;
  isSimulating: boolean;
  gameState: {
    tick: number;
    mobs: any[];
    players: Record<string, any>;
    playerCount: number;
  } | null;
  updateCount: number;
}

export const StatusPanel: React.FC<StatusPanelProps> = ({
  isConnected,
  matchId,
  playerId,
  isSimulating,
  gameState,
  updateCount
}) => {
  return (
    <div className="status-panel">
      <div className="status-item">
        <span className="status-label">Connection:</span>
        <span className={`status-value ${isConnected ? 'connected' : 'disconnected'}`}>
          {isConnected ? 'Connected' : 'Disconnected'}
        </span>
      </div>
      
      <div className="status-item">
        <span className="status-label">Match ID:</span>
        <span className="status-value">
          {matchId || 'None'}
        </span>
      </div>
      
      <div className="status-item">
        <span className="status-label">Player ID:</span>
        <span className="status-value">
          {playerId}
        </span>
      </div>
      
      <div className="status-item">
        <span className="status-label">Simulation:</span>
        <span className={`status-value ${isSimulating ? 'running' : 'stopped'}`}>
          {isSimulating ? 'Running' : 'Stopped'}
        </span>
      </div>
    </div>
  );
};

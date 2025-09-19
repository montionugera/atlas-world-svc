// Control Panel Component for game controls

import React from 'react';

interface ControlPanelProps {
  isConnected: boolean;
  matchId: string | null;
  isSimulating: boolean;
  onConnect: () => void;
  onCreateMatch: () => void;
  onJoinMatch: () => void;
  onStartSimulation: () => void;
  onStopSimulation: () => void;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  isConnected,
  matchId,
  isSimulating,
  onConnect,
  onCreateMatch,
  onJoinMatch,
  onStartSimulation,
  onStopSimulation
}) => {
  return (
    <div className="control-panel">
      <div className="control-group">
        <button 
          onClick={onConnect} 
          disabled={isConnected}
          className="btn btn-primary"
        >
          🔌 Connect
        </button>
        
        <button 
          onClick={onCreateMatch} 
          disabled={!isConnected}
          className="btn btn-secondary"
        >
          🎯 Create Match
        </button>
        
        <button 
          onClick={onJoinMatch} 
          disabled={!isConnected || !matchId}
          className="btn btn-secondary"
        >
          🚪 Join Match
        </button>
        
        <button 
          onClick={onStartSimulation} 
          disabled={!isConnected || !matchId || isSimulating}
          className="btn btn-success"
        >
          🤖 Start Simulation
        </button>
        
        <button 
          onClick={onStopSimulation} 
          disabled={!isSimulating}
          className="btn btn-danger"
        >
          ⏹️ Stop Simulation
        </button>
      </div>
    </div>
  );
};

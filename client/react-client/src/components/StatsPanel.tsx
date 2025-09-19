// Stats Panel Component for displaying game statistics

import React from 'react';

interface StatsPanelProps {
  gameState: {
    tick: number;
    mobs: any[];
    players: Record<string, any>;
    playerCount: number;
  } | null;
  updateCount: number;
  fps: number;
  updateRate: number;
}

export const StatsPanel: React.FC<StatsPanelProps> = ({ gameState, updateCount, fps, updateRate }) => {
  return (
    <div className="stats-panel">
      <div className="stat-card">
        <div className="stat-title">Match Tick</div>
        <div className="stat-value">{gameState?.tick || 0}</div>
      </div>
      
      <div className="stat-card">
        <div className="stat-title">Mobs</div>
        <div className="stat-value">{gameState?.mobs.length || 0}</div>
      </div>
      
      <div className="stat-card">
        <div className="stat-title">Players</div>
        <div className="stat-value">{gameState?.playerCount || 0}</div>
      </div>
      
      <div className="stat-card">
        <div className="stat-title">Updates</div>
        <div className="stat-value">{updateCount}</div>
      </div>
      
      <div className="stat-card">
        <div className="stat-title">FPS</div>
        <div className="stat-value">{fps}</div>
      </div>
      
      <div className="stat-card">
        <div className="stat-title">Update Rate</div>
        <div className="stat-value">{updateRate}/s</div>
      </div>
    </div>
  );
};

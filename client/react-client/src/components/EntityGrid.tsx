import React from 'react';
import { EntityCard } from './EntityCard';

interface EntityGridProps {
  players?: any[]; // Using any for flexibility with Colyseus schema types
  mobs?: any[];
  currentPlayerId?: string;
}

export const EntityGrid: React.FC<EntityGridProps> = ({ players = [], mobs = [], currentPlayerId }) => {
  const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: '16px',
    padding: '16px',
    width: '100%',
    boxSizing: 'border-box'
  };

  const sectionHeaderStyle: React.CSSProperties = {
      color: '#fff',
      marginLeft: '16px',
      marginTop: '16px',
      fontFamily: '"Inter", sans-serif',
      fontSize: '1.2rem',
      fontWeight: 'bold',
      opacity: 0.8
  };

  return (
    <div className="entity-grid-container">
      {players.length > 0 && (
          <>
            <h3 style={sectionHeaderStyle}>Players ({players.length})</h3>
            <div style={gridStyle}>
                {players.map(p => (
                <EntityCard
                    key={p.sessionId || p.id}
                    id={p.sessionId || p.id}
                    type="player"
                    name={p.sessionId === currentPlayerId ? `${p.name} (YOU)` : p.name}
                    x={p.x}
                    y={p.y}
                    isBot={p.isBotMode}
                    state={p.currentBehavior}
                    target={p.currentAttackTarget}
                    avatarColor={p.color} 
                />
                ))}
            </div>
          </>
      )}

      {mobs.length > 0 && (
          <>
            <h3 style={sectionHeaderStyle}>Mobs ({mobs.length})</h3>
             <div style={gridStyle}>
                {mobs.map(m => (
                <EntityCard
                    key={m.id}
                    id={m.id}
                    type="mob"
                    name={m.type || 'Unknown Mob'}
                    x={m.x}
                    y={m.y}
                    health={m.health}
                    maxHealth={m.maxHealth}
                    state={m.behaviorType} // Assuming behaviorType is the state for mobs
                />
                ))}
            </div>
          </>
      )}

      {players.length === 0 && mobs.length === 0 && (
          <div style={{ padding: '32px', textAlign: 'center', color: '#7f8c8d' }}>
              No entities found in this area.
          </div>
      )}
    </div>
  );
};

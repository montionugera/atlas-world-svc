import React from 'react';

interface EntityCardProps {
  id: string;
  type: 'player' | 'mob';
  name?: string;
  x: number;
  y: number;
  health?: number;
  maxHealth?: number;
  isBot?: boolean;
  state?: string; // e.g. "idle", "attack"
  target?: string;
  avatarColor?: string;
}

export const EntityCard: React.FC<EntityCardProps> = ({
  id,
  type,
  name,
  x,
  y,
  health,
  maxHealth,
  isBot,
  state,
  target,
  avatarColor,
}) => {
  const isPlayer = type === 'player';
  const bgColor = isPlayer ? '#2c3e50' : '#8e44ad'; // distinct colors
  const borderColor = isPlayer ? '#3498db' : '#9b59b6';

  const cardStyle: React.CSSProperties = {
    backgroundColor: bgColor,
    color: '#ecf0f1',
    borderRadius: '12px',
    padding: '16px',
    boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
    borderLeft: `5px solid ${borderColor}`,
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    minWidth: '250px',
    fontFamily: '"Inter", sans-serif',
    position: 'relative',
    overflow: 'hidden'
  };

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
    borderBottom: '1px solid rgba(255,255,255,0.1)',
    paddingBottom: '8px'
  };

  const nameStyle: React.CSSProperties = {
    fontWeight: 700,
    fontSize: '1.1rem',
    color: '#fff'
  };

  const typeBadgeStyle: React.CSSProperties = {
    fontSize: '0.7rem',
    padding: '4px 8px',
    borderRadius: '12px',
    textTransform: 'uppercase',
    fontWeight: 'bold',
    backgroundColor: isPlayer ? 'rgba(52, 152, 219, 0.3)' : 'rgba(155, 89, 182, 0.3)',
    color: isPlayer ? '#3498db' : '#dda0dd'
  };

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '0.9rem'
  };

  const labelStyle: React.CSSProperties = {
    color: '#bdc3c7',
  };

  const valueStyle: React.CSSProperties = {
    fontWeight: 500,
    color: '#ecf0f1'
  };

  return (
    <div style={cardStyle}>
      <div style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
             {/* Small avatar or icon could go here */}
            {avatarColor && (
                <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: avatarColor}}></div>
            )}
            <span style={nameStyle}>{name || (isPlayer ? 'Unknown Player' : 'Mob')}</span>
        </div>
        <span style={typeBadgeStyle}>{type}</span>
      </div>

      <div style={rowStyle}>
        <span style={labelStyle}>ID</span>
        <span style={valueStyle} title={id}>{id.substring(0, 8)}...</span>
      </div>

       <div style={rowStyle}>
        <span style={labelStyle}>Position</span>
        <span style={valueStyle}>{x.toFixed(1)}, {y.toFixed(1)}</span>
      </div>

      {state && (
        <div style={rowStyle}>
          <span style={labelStyle}>State</span>
          <span style={{ ...valueStyle, color: state === 'attack' ? '#e74c3c' : '#bdc3c7' }}>
              {state.toUpperCase()}
          </span>
        </div>
      )}
      
       {target && (
        <div style={rowStyle}>
          <span style={labelStyle}>Target</span>
          <span style={valueStyle}>{target.substring(0, 8)}...</span>
        </div>
      )}

      {isBot !== undefined && (
         <div style={rowStyle}>
          <span style={labelStyle}>Mode</span>
          <span style={{ ...valueStyle, color: isBot ? '#2ecc71' : '#95a5a6' }}>
             {isBot ? 'BOT' : 'MANUAL'}
          </span>
        </div>
      )}

      {health !== undefined && maxHealth !== undefined && (
          <div style={{ marginTop: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '2px' }}>
                  <span style={labelStyle}>HP</span>
                  <span style={valueStyle}>{Math.ceil(health)}/{maxHealth}</span>
              </div>
              <div style={{ width: '100%', height: '6px', backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ 
                      width: `${(health / maxHealth) * 100}%`, 
                      height: '100%', 
                      backgroundColor: health < maxHealth * 0.3 ? '#e74c3c' : '#2ecc71',
                      transition: 'width 0.3s ease'
                   }} />
              </div>
          </div>
      )}
    </div>
  );
};

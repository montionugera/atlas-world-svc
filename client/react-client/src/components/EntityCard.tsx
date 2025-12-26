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
  isCurrentPlayer?: boolean;
  isDead?: boolean;
  onToggleBot?: () => void;
  onAttack?: () => void;
  onForceDie?: () => void;
  onRespawn?: () => void;
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
  isCurrentPlayer,
  isDead,
  onToggleBot,
  onAttack,
  onForceDie,
  onRespawn
}) => {
  const isPlayer = type === 'player';
  const bgColor = isPlayer ? '#2c3e50' : '#8e44ad'; // distinct colors
  const borderColor = isPlayer ? (isCurrentPlayer ? '#f1c40f' : '#3498db') : '#9b59b6'; // Gold border for current player

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
    backgroundColor: isCurrentPlayer ? '#f1c40f' : (isPlayer ? 'rgba(52, 152, 219, 0.3)' : 'rgba(155, 89, 182, 0.3)'),
    color: isCurrentPlayer ? '#2c3e50' : (isPlayer ? '#3498db' : '#dda0dd')
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

  const actionGroupStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '8px',
    marginTop: '12px',
    paddingTop: '12px',
    borderTop: '1px solid rgba(255,255,255,0.1)'
  };

  const buttonStyle: React.CSSProperties = {
    padding: '6px 12px',
    borderRadius: '6px',
    border: 'none',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: '0.8rem',
    transition: 'all 0.2s',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '4px'
  };
  
  const botBtnStyle: React.CSSProperties = {
     ...buttonStyle,
     backgroundColor: isBot ? '#e67e22' : '#2ecc71',
     color: 'white',
     gridColumn: '1 / -1'
  };
  
  const attackBtnStyle: React.CSSProperties = {
     ...buttonStyle,
     backgroundColor: '#e74c3c',
     color: 'white',
     opacity: (isBot || isDead) ? 0.5 : 1,
     cursor: (isBot || isDead) ? 'not-allowed' : 'pointer'
  };
  
  const dieRespawnBtnStyle: React.CSSProperties = {
      ...buttonStyle,
      backgroundColor: isDead ? '#2ecc71' : '#34495e',
      color: isDead ? 'white' : '#fab1a0',
      border: isDead ? 'none' : '1px solid #c0392b'
  };


  return (
    <div style={cardStyle}>
      <div style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
             {/* Small avatar or icon could go here */}
            {avatarColor && (
                <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: avatarColor}}></div>
            )}
            <span style={/*isCurrentPlayer ? { ...nameStyle, color: '#f1c40f' } :*/ nameStyle}>{name || (isPlayer ? 'Unknown Player' : 'Mob')}</span>
        </div>
        <span style={typeBadgeStyle}>{isCurrentPlayer ? 'YOU' : type}</span>
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

      {isBot !== undefined && !isCurrentPlayer && (
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

      {/* Action Buttons for Current Player */}
      {isCurrentPlayer && (
          <div style={actionGroupStyle}>
              {onToggleBot && (
                  <button style={botBtnStyle} onClick={onToggleBot}>
                      {isBot ? '🛑 Disable Bot' : '🤖 Enable Bot'}
                  </button>
              )}
              
              {onAttack && (
                  <button 
                      style={attackBtnStyle} 
                      onClick={onAttack}
                      disabled={isBot || isDead}
                  >
                      ⚔️ Attack
                  </button>
              )}

              {!isDead && onForceDie && (
                   <button 
                      style={dieRespawnBtnStyle}
                      onClick={onForceDie}
                   >
                       💀 Kill Me
                   </button>
              )}
              
              {isDead && onRespawn && (
                  <button
                      style={dieRespawnBtnStyle}
                      onClick={onRespawn}
                  >
                      ♻️ Respawn
                  </button>
              )}
          </div>
      )}
    </div>
  );
};

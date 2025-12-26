import React from 'react';

interface GameHoverMenuProps {
  isConnected: boolean;
  isBotMode: boolean;
  onToggleBotMode: () => void;
  onAttack: () => void;
  isDead: boolean;
  onRespawn: () => void;
  onForceDie: () => void;
}

export const GameHoverMenu: React.FC<GameHoverMenuProps> = ({
  isConnected,
  isBotMode,
  onToggleBotMode,
  onAttack,
  isDead,
  onRespawn,
  onForceDie
}) => {
  if (!isConnected) return null;

  return (
    <div style={{
      position: 'absolute',
      bottom: '20px',
      left: '50%',
      transform: 'translateX(-50%)',
      display: 'flex',
      gap: '12px',
      padding: '12px 20px',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      backdropFilter: 'blur(10px)',
      borderRadius: '16px',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      zIndex: 100,
      transition: 'all 0.3s ease'
    }}>
      <button
        onClick={onToggleBotMode}
        style={{
          padding: '8px 16px',
          backgroundColor: isBotMode ? 'rgba(255, 159, 67, 0.9)' : 'rgba(84, 160, 255, 0.2)',
          color: 'white',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          borderRadius: '8px',
          cursor: 'pointer',
          fontWeight: 600,
          transition: 'all 0.2s ease',
          display: 'flex',
          alignItems: 'center',
          gap: '6px'
        }}
        onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
        onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
      >
        <span>{isBotMode ? '🤖' : '🦾'}</span>
        {isBotMode ? 'Disable Bot' : 'Enable Bot'}
      </button>

      <button
        onClick={onAttack}
        disabled={isBotMode || isDead}
        style={{
          padding: '8px 16px',
          backgroundColor: isBotMode || isDead ? 'rgba(100, 100, 100, 0.2)' : 'rgba(255, 71, 87, 0.8)',
          color: isBotMode || isDead ? '#aaa' : 'white',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          borderRadius: '8px',
          cursor: isBotMode || isDead ? 'not-allowed' : 'pointer',
          fontWeight: 600,
          transition: 'all 0.2s ease',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          opacity: isBotMode || isDead ? 0.6 : 1
        }}
        onMouseEnter={e => !isBotMode && !isDead && (e.currentTarget.style.transform = 'translateY(-2px)')}
        onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
      >
        <span>⚔️</span>
        Attack
      </button>

      <div style={{ width: '1px', backgroundColor: 'rgba(255,255,255,0.2)', margin: '0 4px' }} />

      {!isDead ? (
        <button
          onClick={onForceDie}
          style={{
            padding: '8px 16px',
            backgroundColor: 'rgba(45, 52, 54, 0.6)',
            color: '#fab1a0',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: 500,
            transition: 'all 0.2s ease',
            fontSize: '0.9em'
          }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(214, 48, 49, 0.4)'}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = 'rgba(45, 52, 54, 0.6)'}
        >
          💀 Kill Me
        </button>
      ) : (
        <button
          onClick={onRespawn}
          style={{
            padding: '8px 24px',
            backgroundColor: 'rgba(46, 204, 113, 0.9)',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: 700,
            boxShadow: '0 0 15px rgba(46, 204, 113, 0.4)',
            animation: 'pulse 2s infinite',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <span>♻️</span>
          RESPAWN
        </button>
      )}
    </div>
  );
};

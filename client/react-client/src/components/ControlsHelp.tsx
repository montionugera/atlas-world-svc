interface ControlsHelpProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ControlsHelp: React.FC<ControlsHelpProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    backdropFilter: 'blur(5px)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000
  };

  const modalStyle: React.CSSProperties = {
    backgroundColor: '#2c3e50',
    borderRadius: '16px',
    padding: '24px',
    width: '90%',
    maxWidth: '500px',
    boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
    border: '1px solid rgba(255,255,255,0.1)',
    position: 'relative',
    animation: 'fadeIn 0.2s ease-out'
  };

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
    borderBottom: '1px solid rgba(255,255,255,0.1)',
    paddingBottom: '12px'
  };

  const closeButtonStyle: React.CSSProperties = {
      background: 'none',
      border: 'none',
      color: '#bdc3c7',
      fontSize: '24px',
      cursor: 'pointer',
      padding: '0 8px',
      lineHeight: 1
  };

  const contentStyle: React.CSSProperties = {
    color: '#ecf0f1',
    lineHeight: 1.6
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        <div style={headerStyle}>
          <h2 style={{ margin: 0, fontSize: '1.5rem', color: '#f1c40f' }}>🎮 Game Controls</h2>
          <button style={closeButtonStyle} onClick={onClose}>&times;</button>
        </div>
        
        <div style={contentStyle}>
          <div style={{ marginBottom: '16px' }}>
              <h3 style={{ fontSize: '1.1rem', marginBottom: '8px', color: '#3498db' }}>Movement</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ backgroundColor: 'rgba(255,255,255,0.1)', padding: '4px 8px', borderRadius: '4px' }}>W</span>
                  <span style={{ backgroundColor: 'rgba(255,255,255,0.1)', padding: '4px 8px', borderRadius: '4px' }}>A</span>
                  <span style={{ backgroundColor: 'rgba(255,255,255,0.1)', padding: '4px 8px', borderRadius: '4px' }}>S</span>
                  <span style={{ backgroundColor: 'rgba(255,255,255,0.1)', padding: '4px 8px', borderRadius: '4px' }}>D</span>
                  <span style={{ color: '#bdc3c7', marginLeft: '8px' }}>or Arrow Keys</span>
              </div>
          </div>

          <div style={{ marginBottom: '16px' }}>
              <h3 style={{ fontSize: '1.1rem', marginBottom: '8px', color: '#e74c3c' }}>Actions</h3>
              <div style={{ marginBottom: '8px' }}>
                  <strong>⚔️ Attack:</strong> Press <span style={{ backgroundColor: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.9em' }}>SPACE</span> or use the Attack button on your card.
              </div>
              <div style={{ marginBottom: '8px' }}>
                  <strong>💣 Trap:</strong> Press <span style={{ backgroundColor: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.9em' }}>F</span> to place a trap.
              </div>
              <div>
                  <strong>🤖 Auto-Play:</strong> Toggle "Enable Bot" on your card to let AI take over.
              </div>
          </div>
          
           <div style={{ marginTop: '24px', fontSize: '0.9rem', color: '#95a5a6', fontStyle: 'italic', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '12px' }}>
               Tip: You can find your player controls on the card labeled "YOU" in the right panel.
           </div>
        </div>
      </div>
    </div>
  );
};

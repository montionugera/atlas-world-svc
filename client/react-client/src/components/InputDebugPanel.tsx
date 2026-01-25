import React, { useEffect, useState } from 'react';

interface InputDebugPanelProps {
  pressedKeysRef: React.MutableRefObject<Set<string>>;
}

export const InputDebugPanel: React.FC<InputDebugPanelProps> = ({ pressedKeysRef }) => {
  const [keys, setKeys] = useState<string[]>([]);

  useEffect(() => {
    // Poll for changes (since ref doesn't trigger re-render)
    const interval = setInterval(() => {
      setKeys(Array.from(pressedKeysRef.current));
    }, 100);
    return () => clearInterval(interval);
  }, [pressedKeysRef]);

  return (
    <div style={{
      position: 'absolute',
      top: '10px',
      left: '10px',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      color: '#0f0',
      padding: '10px',
      borderRadius: '5px',
      fontFamily: 'monospace',
      fontSize: '12px',
      pointerEvents: 'none',
      zIndex: 1000
    }}>
      <h4 style={{ margin: '0 0 5px 0', borderBottom: '1px solid #0f0' }}>INPUT DEBUG</h4>
      <div>Keys: {keys.length > 0 ? keys.join(', ') : 'NONE'}</div>
      <div style={{ marginTop: '5px', display: 'grid', gridTemplateColumns: 'repeat(3, 20px)', gap: '2px', textAlign: 'center' }}>
         <div></div>
         <div style={{ background: keys.includes('w') ? '#0f0' : '#333', color: '#000' }}>W</div>
         <div></div>
         <div style={{ background: keys.includes('a') ? '#0f0' : '#333', color: '#000' }}>A</div>
         <div style={{ background: keys.includes('s') ? '#0f0' : '#333', color: '#000' }}>S</div>
         <div style={{ background: keys.includes('d') ? '#0f0' : '#333', color: '#000' }}>D</div>
      </div>
      <div style={{ marginTop: '5px' }}>
        SHIFT: <span style={{ color: keys.includes('shift') ? '#0f0' : '#555' }}>{keys.includes('shift') ? 'ON' : 'OFF'}</span>
      </div>
    </div>
  );
};

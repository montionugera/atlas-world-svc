import React, { useState, useCallback, useEffect } from 'react';
import { useColyseusClient, ColyseusClientConfig } from './hooks/useColyseusClient';
import { ColyseusGameCanvas } from './components/ColyseusGameCanvas';
import { LogPanel } from './components/LogPanel';
import { EntityGrid } from './components/EntityGrid';
import { GameStats } from './components/GameStats';
import { ControlsHelp } from './components/ControlsHelp';
import { GameStateProvider } from './contexts/GameStateContext';
import './App.css';

interface LogEntry {
  id: string;
  message: string;
  type: 'info' | 'warn' | 'error' | 'mob' | 'player';
  timestamp: Date;
}

const colyseusConfig: ColyseusClientConfig = {
  serverHost: 'localhost',
  serverPort: 2567,
  useSSL: false
};

function App() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  
  const client = useColyseusClient(colyseusConfig);
  
  const addLog = useCallback((message: string, type: LogEntry['type'] = 'info') => {
    const log: LogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      message,
      type,
      timestamp: new Date()
    };
    
    setLogs(prev => [...prev.slice(-49), log]); // Keep last 50 logs
  }, []);
  
  // Connection helpers
   useEffect(() => {
    // Auto-connect when app starts
    if (!client.isConnected) {
       addLog('🔌 Connecting to Colyseus Server...', 'info');
       client.connect().then(() => {
          client.joinRoom('map-01-sector-a');
       }).catch(e => {
          addLog(`❌ Detailed connection error: ${e.message}`, 'error');
       });
    } else {
       // Already connected
    }
  }, [filterDep(client)]); // only run once on mount effectively, or when client changes (unlikely)

  function filterDep(c: any) {
      return c.connect;
  }
  
  useEffect(() => {
    if (client.isConnected) {
       addLog('✅ Connected and joined room successfully!', 'info');
    }
  }, [client.isConnected, addLog]);

  // Log specialized game events
  useEffect(() => {
    if (client.gameState?.tick && client.gameState.tick % 100 === 0) {
        // Heartbeat log
    }
  }, [client.gameState?.tick, addLog]);
  
  
  // Prepare data for EntityGrid
  const players = client.gameState?.players ? Array.from(client.gameState.players.values()) : [];
  const mobs = client.gameState?.mobs ? Array.from(client.gameState.mobs.values()) : [];
  
  const [showHelp, setShowHelp] = useState(false);

  return (
    <GameStateProvider 
      initialGameState={client.gameState} 
      initialRoomId={client.roomId} 
      initialIsConnected={client.isConnected}
    >
      <div className="App">
        <header className="app-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
              <h1>🌍 Atlas World</h1>
              <button 
                onClick={() => setShowHelp(true)}
                style={{
                    backgroundColor: 'rgba(255,255,255,0.1)',
                    border: '1px solid rgba(255,255,255,0.2)',
                    color: '#fff',
                    padding: '8px 16px',
                    borderRadius: '20px',
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    transition: 'all 0.2s'
                }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.2)'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)'}
              >
                  ❓ Controls
              </button>
          </div>
          
          <div className='header-status'>
             <span>{client.isConnected ? '🟢 Online' : '🔴 Offline'}</span>
             {client.roomId && <span>Room: {client.roomId}</span>}
          </div>
        </header>
        
        <ControlsHelp isOpen={showHelp} onClose={() => setShowHelp(false)} />
        
        <main className="app-main">
          {/* Left Column: Game Canvas */}
          <div className="game-section">
            <ColyseusGameCanvas client={client} />
          </div>
          
          {/* Right Column: unified Info Panel */}
          <div className="info-section">
             <div className="entity-panel">
                <GameStats 
                   mapId={client.gameState?.mapId}
                   fps={client.fps}
                   tick={client.gameState?.tick || 0}
                   updateRate={client.updateRate}
                   playerCount={players.length}
                   mobCount={mobs.length}
                   roomId={client.roomId}
                   isConnected={client.isConnected}
                />
                
                <EntityGrid 
                  players={players} 
                  mobs={mobs} 
                  currentPlayerId={client.playerId}
                  onToggleBot={() => {
                      const player = client.gameState?.players.get(client.playerId);
                      if (player) {
                          client.toggleBotMode(!player.isBotMode);
                      }
                  }}
                  onAttack={() => client.sendPlayerAction('attack', true)}
                  onForceDie={client.forceDie}
                  onRespawn={client.respawn}
                />
             </div>
             
             <div className="log-section">
               <LogPanel logs={logs} />
             </div>
          </div>
        </main>
      </div>
    </GameStateProvider>
  );
}

export default App;


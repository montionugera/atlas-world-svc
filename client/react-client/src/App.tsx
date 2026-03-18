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

  // Frontend map picker (decides which server-side room to join).
  const AVAILABLE_MAP_IDS = ['map-for-play', 'map-for-test-projectile'] as const
  const [selectedMapId, setSelectedMapId] = useState<(typeof AVAILABLE_MAP_IDS)[number]>(AVAILABLE_MAP_IDS[0])
  
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
          // Default initial join; user can switch maps from the UI.
          return client.joinRoom(selectedMapId);
       }).catch(e => {
          let errorMessage = e.message || 'Unknown error';
          if (e instanceof ProgressEvent || e.type === 'error') {
             errorMessage = 'Connection failed (Server might be offline or schema mismatch)';
          }
          addLog(`❌ Detailed connection error: ${errorMessage}`, 'error');
          console.error(e);
       });
    } else {
       // Already connected
    }
  }, [filterDep(client)]); // only run once on mount effectively, or when client changes (unlikely)

  const joinMap = useCallback(async (mapId: string) => {
    try {
      if (!client.isConnected) return
      // Update dropdown selection first, so UI and join decision stay in sync.
      setSelectedMapId(mapId as any)
      await client.joinRoom(mapId)
    } catch (e: any) {
      console.error(e)
      addLog(`❌ Failed to join map ${mapId}: ${e?.message || e}`, 'error')
    }
  }, [client, addLog])

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
  const npcsMap = client.gameState?.npcs ?? client.gameState?.companions;
  const companions = npcsMap ? Array.from(npcsMap.values()) : [];
  
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
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
                  <label style={{ color: '#fff', fontWeight: 700 }}>Map</label>
                  <select
                    value={selectedMapId}
                    onChange={(e) => setSelectedMapId(e.target.value as any)}
                    style={{
                      padding: '6px 10px',
                      borderRadius: 8,
                      backgroundColor: 'rgba(0,0,0,0.3)',
                      color: '#fff',
                      border: '1px solid rgba(255,255,255,0.2)',
                    }}
                  >
                    {AVAILABLE_MAP_IDS.map((id) => (
                      <option key={id} value={id} style={{ color: '#000' }}>
                        {id}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => joinMap(selectedMapId)}
                    disabled={!client.isConnected}
                    style={{
                      padding: '8px 14px',
                      borderRadius: 10,
                      cursor: client.isConnected ? 'pointer' : 'not-allowed',
                      border: '1px solid rgba(255,255,255,0.2)',
                      backgroundColor: client.isConnected ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)',
                      color: '#fff',
                      fontWeight: 800,
                    }}
                  >
                    🎮 Join
                  </button>
                </div>

                <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                  <button
                    onClick={() => joinMap('map-for-play')}
                    disabled={!client.isConnected}
                    style={{
                      flex: 1,
                      padding: '8px 10px',
                      borderRadius: 10,
                      border: '1px solid rgba(255,255,255,0.2)',
                      backgroundColor: selectedMapId === 'map-for-play' ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)',
                      color: '#fff',
                      fontWeight: 900,
                      cursor: client.isConnected ? 'pointer' : 'not-allowed',
                    }}
                  >
                    Play
                  </button>
                  <button
                    onClick={() => joinMap('map-for-test-projectile')}
                    disabled={!client.isConnected}
                    style={{
                      flex: 1,
                      padding: '8px 10px',
                      borderRadius: 10,
                      border: '1px solid rgba(255,255,255,0.2)',
                      backgroundColor:
                        selectedMapId === 'map-for-test-projectile' ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)',
                      color: '#fff',
                      fontWeight: 900,
                      cursor: client.isConnected ? 'pointer' : 'not-allowed',
                    }}
                  >
                    Projectile
                  </button>
                </div>

                <GameStats 
                   mapId={client.gameState?.mapId}
                   fps={client.fps}
                   tick={client.gameState?.tick || 0}
                   updateRate={client.updateRate}
                   playerCount={players.length}
                   mobCount={mobs.length}
                   companionCount={companions.length}
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


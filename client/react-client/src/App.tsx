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

  // Frontend map picker (decides which server-side room to join). Use tabs/radio, not dropdown.
  const AVAILABLE_MAP_IDS = ['map-for-play', 'map-for-test-projectile', 'map-for-test-deflect'] as const
  const MAP_LABELS: Record<(typeof AVAILABLE_MAP_IDS)[number], string> = {
    'map-for-play': 'Play',
    'map-for-test-projectile': 'Projectile',
    'map-for-test-deflect': 'Deflect test',
  }
  const getInitialSelectedMapId = (): (typeof AVAILABLE_MAP_IDS)[number] => {
    if (typeof window === 'undefined') return AVAILABLE_MAP_IDS[0]
    const params = new URLSearchParams(window.location.search)
    const mapParam = params.get('map')
    if (mapParam && (AVAILABLE_MAP_IDS as readonly string[]).includes(mapParam)) {
      return mapParam as (typeof AVAILABLE_MAP_IDS)[number]
    }
    return AVAILABLE_MAP_IDS[0]
  }
  const [selectedMapId, setSelectedMapId] = useState<(typeof AVAILABLE_MAP_IDS)[number]>(() => getInitialSelectedMapId())
  
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
      setSelectedMapId(mapId as (typeof AVAILABLE_MAP_IDS)[number])
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
                <div style={{ marginBottom: 12 }}>
                  <label style={{ color: '#fff', fontWeight: 700 }}>Map</label>
                  <fieldset
                    style={{
                      border: 'none',
                      margin: 0,
                      marginTop: 6,
                      padding: 0,
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 8,
                    }}
                    role="radiogroup"
                    aria-label="Select map"
                  >
                    {AVAILABLE_MAP_IDS.map((id) => (
                      <label
                        key={id}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          cursor: 'pointer',
                          color: '#fff',
                        }}
                      >
                        <input
                          type="radio"
                          name="map"
                          value={id}
                          checked={selectedMapId === id}
                          onChange={() => setSelectedMapId(id)}
                          style={{ accentColor: 'rgba(255,255,255,0.8)' }}
                        />
                        <span>{MAP_LABELS[id]}</span>
                      </label>
                    ))}
                  </fieldset>
                  <button
                    onClick={() => joinMap(selectedMapId)}
                    disabled={!client.isConnected}
                    style={{
                      marginTop: 8,
                      padding: '8px 14px',
                      borderRadius: 10,
                      cursor: client.isConnected ? 'pointer' : 'not-allowed',
                      border: '1px solid rgba(255,255,255,0.2)',
                      backgroundColor: client.isConnected ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)',
                      color: '#fff',
                      fontWeight: 800,
                    }}
                  >
                    Join
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


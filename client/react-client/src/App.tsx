import React, { useState, useCallback, useEffect } from 'react';
import { useColyseusClient, ColyseusClientConfig } from './hooks/useColyseusClient';
import { ColyseusGameCanvas } from './components/ColyseusGameCanvas';
import { LogPanel } from './components/LogPanel';
import { EntityGrid } from './components/EntityGrid';
import { GameStats } from './components/GameStats';
import { ControlsHelp } from './components/ControlsHelp';
import { PLAYER_WEAPON_OPTIONS } from './config/playerWeapons';
import { EQUIPMENT_SLOT_IDS } from './config/equipmentSlots';
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

const EQUIPMENT_SLOT_LABELS: Record<(typeof EQUIPMENT_SLOT_IDS)[number], string> = {
  head: 'Head',
  midHead: 'Mid head',
  lowerHead: 'Lower head',
  body: 'Body',
  mainHand: 'Main hand',
  offHand: 'Off hand',
  outerwear: 'Outerwear',
  feet: 'Feet',
  accessory1: 'Accessory 1',
  accessory2: 'Accessory 2',
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
  const equippedWeaponId = client.equippedWeaponId;
  const mobs = client.gameState?.mobs ? Array.from(client.gameState.mobs.values()) : [];
  const npcsMap = client.gameState?.npcs ?? client.gameState?.companions;
  const companions = npcsMap ? Array.from(npcsMap.values()) : [];
  
  const [showHelp, setShowHelp] = useState(false);
  const [showEquipmentModal, setShowEquipmentModal] = useState(false);

  useEffect(() => {
    if (showEquipmentModal && client.isConnected) {
      client.requestEquipment();
    }
  }, [showEquipmentModal, client.isConnected, client.requestEquipment]);

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

        {showEquipmentModal && (
          <div
            role="presentation"
            onClick={() => setShowEquipmentModal(false)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.55)',
              zIndex: 1000,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 16,
            }}
          >
            <div
              role="dialog"
              aria-labelledby="equipment-modal-title"
              onClick={(e) => e.stopPropagation()}
              style={{
                background: '#1e272e',
                borderRadius: 12,
                padding: 20,
                maxWidth: 420,
                width: '100%',
                maxHeight: '80vh',
                overflow: 'auto',
                border: '1px solid rgba(255,255,255,0.15)',
                color: '#ecf0f1',
              }}
            >
              <h2 id="equipment-modal-title" style={{ margin: '0 0 12px', fontSize: 18 }}>
                Equipment
              </h2>
              <p style={{ margin: '0 0 12px', fontSize: 12, opacity: 0.85 }}>
                {client.equipmentRequestPending ? 'Syncing with server…' : 'Slots (switch main hand with weapon buttons below).'}
              </p>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, fontSize: 13 }}>
                {EQUIPMENT_SLOT_IDS.map((slot) => (
                  <li
                    key={slot}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 12,
                      padding: '6px 0',
                      borderBottom: '1px solid rgba(255,255,255,0.08)',
                    }}
                  >
                    <span>{EQUIPMENT_SLOT_LABELS[slot]}</span>
                    <code style={{ color: '#9b59b6' }}>{client.equipment[slot] || '—'}</code>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => setShowEquipmentModal(false)}
                style={{
                  marginTop: 16,
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: '1px solid rgba(255,255,255,0.2)',
                  background: 'rgba(255,255,255,0.08)',
                  color: '#fff',
                  cursor: 'pointer',
                  fontWeight: 700,
                }}
              >
                Close
              </button>
            </div>
          </div>
        )}
        
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

                <div style={{ marginBottom: 12 }}>
                  <label style={{ color: '#fff', fontWeight: 700 }}>Weapon</label>
                  <div style={{ marginTop: 6, color: '#bdc3c7', fontSize: 12 }}>
                    Equipped: <strong style={{ color: '#fff' }}>{equippedWeaponId || '—'}</strong>
                    <span style={{ marginLeft: 8, opacity: 0.85 }}>(hotkeys 5–7)</span>
                  </div>
                  <button
                    type="button"
                    disabled={!client.isConnected}
                    onClick={() => setShowEquipmentModal(true)}
                    style={{
                      marginTop: 8,
                      padding: '6px 12px',
                      borderRadius: 8,
                      cursor: client.isConnected ? 'pointer' : 'not-allowed',
                      border: '1px solid rgba(255,255,255,0.25)',
                      backgroundColor: 'rgba(255,255,255,0.08)',
                      color: '#fff',
                      fontWeight: 600,
                      fontSize: 12,
                    }}
                  >
                    All slots…
                  </button>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                    {PLAYER_WEAPON_OPTIONS.map((w) => (
                      <button
                        key={w.id}
                        type="button"
                        disabled={!client.isConnected}
                        onClick={() => client.switchWeapon(w.id)}
                        style={{
                          padding: '6px 10px',
                          borderRadius: 8,
                          cursor: client.isConnected ? 'pointer' : 'not-allowed',
                          border:
                            equippedWeaponId === w.id
                              ? '2px solid #9b59b6'
                              : '1px solid rgba(255,255,255,0.25)',
                          backgroundColor:
                            equippedWeaponId === w.id ? 'rgba(155,89,182,0.25)' : 'rgba(255,255,255,0.06)',
                          color: '#fff',
                          fontWeight: 600,
                          fontSize: 12,
                        }}
                      >
                        {w.label} [{w.hotkey}]
                      </button>
                    ))}
                  </div>
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


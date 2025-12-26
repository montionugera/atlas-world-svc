import React, { useState, useCallback, useEffect } from 'react';
import { useColyseusClient, ColyseusClientConfig } from './hooks/useColyseusClient';
import { ColyseusGameCanvas } from './components/ColyseusGameCanvas';
import { LogPanel } from './components/LogPanel';
import { EntityGrid } from './components/EntityGrid';
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
      // Just a helper to force effect to depend on client existence but not its internal state changes
      // Actually we can just depend on empty array if client is stable, but client comes from hook.
      // useColyseusClient returns new object on re-renders? 
      // Checking hook source: "return { ... }" -> Yes it returns new object every render.
      // So we need to be careful with dependency array.
      // The `connect` function is memoized with useCallback.
      return c.connect;
  }
  
  useEffect(() => {
    if (client.isConnected) {
       addLog('✅ Connected and joined room successfully!', 'info');
    }
  }, [client.isConnected, addLog]);

  // Log specialized game events (throttled or filtered to avoid spam)
  useEffect(() => {
    if (client.gameState?.tick && client.gameState.tick % 100 === 0) {
        // Log every 100 ticks just as a heartbeat
       // addLog(`Tick: ${client.gameState.tick}`, 'info');
    }
  }, [client.gameState?.tick, addLog]);
  
  
  // Prepare data for EntityGrid
  const players = client.gameState?.players ? Array.from(client.gameState.players.values()) : [];
  const mobs = client.gameState?.mobs ? Array.from(client.gameState.mobs.values()) : [];

  return (
    <GameStateProvider 
      initialGameState={client.gameState} 
      initialRoomId={client.roomId} 
      initialIsConnected={client.isConnected}
    >
      <div className="App">
        <header className="app-header">
          <h1>🌍 Atlas World - Real-time Multiplayer</h1>
          <div className='header-status'>
             <span>{client.isConnected ? '🟢 Online' : '🔴 Offline'}</span>
             {client.roomId && <span>Room: {client.roomId}</span>}
          </div>
        </header>
        
        <main className="app-main">
          {/* Left Column: Game Canvas */}
          <div className="game-section">
            <ColyseusGameCanvas client={client} />
          </div>
          
          {/* Right Column: Unified Entity Panel & Logs */}
          <div className="info-section">
             <div className="entity-panel">
                <EntityGrid 
                  players={players} 
                  mobs={mobs} 
                  currentPlayerId={client.playerId}
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


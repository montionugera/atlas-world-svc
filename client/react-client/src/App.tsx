import React, { useState, useCallback } from 'react';
import { useColyseusClient, ColyseusClientConfig } from './hooks/useColyseusClient';
import { ColyseusGameCanvas } from './components/ColyseusGameCanvas';
import { LogPanel } from './components/LogPanel';
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
  
  const handleConnect = useCallback(async () => {
    try {
      addLog('🔌 Connecting to Colyseus Server...');
      await client.connect();
      addLog('✅ Connected successfully!');
    } catch (error) {
      addLog(`❌ Connection failed: ${error}`, 'error');
    }
  }, [client, addLog]);
  
  const handleJoinRoom = useCallback(async () => {
    try {
      addLog('🚪 Joining Colyseus room...');
      await client.joinRoom('map-01-sector-a');
      addLog('✅ Joined room successfully!');
    } catch (error) {
      addLog(`❌ Failed to join room: ${error}`, 'error');
    }
  }, [client, addLog]);
  
  const handleStartSimulation = useCallback(() => {
    addLog('🤖 Starting mob simulation...');
    client.startSimulation();
  }, [client, addLog]);
  
  const handleStopSimulation = useCallback(() => {
    addLog('⏹️ Simulation stopped');
    client.stopSimulation();
  }, [client, addLog]);

  
  // Add logs for game state changes
  React.useEffect(() => {
    if (client.gameState?.mobs) {
      addLog(`🔄 Mob update - Tick: ${client.gameState.tick}, Mobs: ${client.gameState.mobs.length}`, 'mob');
    }
  }, [client.gameState?.tick, client.gameState?.mobs, addLog]);
  
  return (
    <div className="App">
      <header className="app-header">
        <h1>🌍 Atlas World - Real-time Multiplayer</h1>
        <p>Colyseus WebSocket Client with Live Game Simulation</p>
      </header>
      
      <main className="app-main">
        <div className="game-section">
          <ColyseusGameCanvas config={colyseusConfig} />
        </div>
        
        <div className="log-section">
          <LogPanel logs={logs} />
        </div>
      </main>
    </div>
  );
}

export default App;

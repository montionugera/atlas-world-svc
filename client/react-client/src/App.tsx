import React, { useState, useCallback } from 'react';
import { useAtlasClient } from './hooks/useAtlasClient';
import { ControlPanel } from './components/ControlPanel';
import { StatusPanel } from './components/StatusPanel';
import { StatsPanel } from './components/StatsPanel';
import { GameCanvas } from './components/GameCanvas';
import { LogPanel } from './components/LogPanel';
import { ClientConfig } from './types/game';
import './App.css';

interface LogEntry {
  id: string;
  message: string;
  type: 'info' | 'warn' | 'error' | 'mob' | 'player';
  timestamp: Date;
}

const config: ClientConfig = {
  serverHost: 'localhost',
  serverPort: 7350,
  serverKey: 'defaultkey',
  useSSL: false
};

function App() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  
  const {
    isConnected,
    matchId,
    playerId,
    gameState,
    updateCount,
    isSimulating,
    fps,
    updateRate,
    connect,
    createMatch,
    joinMatch,
    enterMap,
    updateMap,
    updatePlayerInput,
    getMapState,
    startSimulation,
    stopSimulation,
    trackFrame
  } = useAtlasClient(config);
  
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
      addLog('🔌 Connecting to Atlas World Server...');
      await connect();
      addLog('✅ Connected successfully!');
    } catch (error) {
      addLog(`❌ Connection failed: ${error}`, 'error');
    }
  }, [connect, addLog]);
  
  const handleCreateMatch = useCallback(async () => {
    try {
      addLog('🎯 Creating new movement match...');
      const newMatchId = await createMatch();
      addLog(`✅ Match created: ${newMatchId}`);
    } catch (error) {
      addLog(`❌ Failed to create match: ${error}`, 'error');
    }
  }, [createMatch, addLog]);
  
  const handleJoinMatch = useCallback(async () => {
    try {
      addLog(`🚪 Joining match: ${matchId}`);
      const response = await joinMatch();
      addLog(`✅ Joined match: ${response.playerCount} players`);
    } catch (error) {
      addLog(`❌ Failed to join match: ${error}`, 'error');
    }
  }, [joinMatch, matchId, addLog]);
  
  const handleStartSimulation = useCallback(() => {
    addLog('🤖 Starting mob simulation...');
    startSimulation();
  }, [startSimulation, addLog]);
  
  const handleStopSimulation = useCallback(() => {
    addLog('⏹️ Simulation stopped');
    stopSimulation();
  }, [stopSimulation, addLog]);

  // --- Map Flow Handlers ---
  const mapId = 'map-01-sector-a';
  const mapIntervalRef = React.useRef<NodeJS.Timeout | null>(null);

  const handleEnterMap = useCallback(async () => {
    try {
      addLog(`🗺️ Entering map: ${mapId}`);
      const resp = await enterMap(mapId, { x: 100, y: 100 });
      if (resp.success) addLog('✅ Entered map');
      else addLog(`❌ enter_map failed: ${resp.error}`, 'error');
    } catch (e) {
      addLog(`❌ enter_map error: ${e}`, 'error');
    }
  }, [enterMap, addLog]);

  const handleStartMap = useCallback(() => {
    if (mapIntervalRef.current) return;
    addLog('▶️ Starting map polling (50ms)');
    mapIntervalRef.current = setInterval(() => {
      updateMap(mapId).catch(err => addLog(`update_map error: ${err}`, 'error'));
      // Optionally move player every 2s
    }, 50);
  }, [updateMap, addLog]);

  const handleStopMap = useCallback(() => {
    if (mapIntervalRef.current) {
      clearInterval(mapIntervalRef.current);
      mapIntervalRef.current = null;
      addLog('⏹️ Stopped map polling');
    }
  }, [addLog]);
  
  // Add logs for game state changes
  React.useEffect(() => {
    if (gameState?.mobs) {
      addLog(`🔄 Mob update - Tick: ${gameState.tick}, Mobs: ${gameState.mobs.length}`, 'mob');
    }
  }, [gameState?.tick, gameState?.mobs, addLog]);
  
  return (
    <div className="App">
      <header className="app-header">
        <h1>🌍 Atlas World - Mob Simulation</h1>
        <p>React TypeScript Client with Real-time Visualization</p>
      </header>
      
      <main className="app-main">
        <div className="control-section">
          <ControlPanel
            isConnected={isConnected}
            matchId={matchId}
            isSimulating={isSimulating}
            onConnect={handleConnect}
            onCreateMatch={handleCreateMatch}
            onJoinMatch={handleJoinMatch}
            onStartSimulation={handleStartSimulation}
            onStopSimulation={handleStopSimulation}
            onEnterMap={handleEnterMap}
            onStartMap={handleStartMap}
            onStopMap={handleStopMap}
          />
        </div>
        
        <div className="status-section">
          <StatusPanel
            isConnected={isConnected}
            matchId={matchId}
            playerId={playerId}
            isSimulating={isSimulating}
            gameState={gameState}
            updateCount={updateCount}
          />
        </div>
        
        <div className="game-section">
          <div className="game-world">
            <GameCanvas
              mobs={gameState?.mobs || []}
              players={gameState?.players || {}}
              onFrameUpdate={trackFrame}
            />
          </div>
        </div>
        
        <div className="stats-section">
          <StatsPanel
            gameState={gameState}
            updateCount={updateCount}
            fps={fps}
            updateRate={updateRate}
          />
        </div>
        
        <div className="log-section">
          <LogPanel logs={logs} />
        </div>
      </main>
    </div>
  );
}

export default App;

// React hook for Atlas World Colyseus Client

import { useState, useCallback, useRef, useEffect } from 'react';
import { Client, Room } from 'colyseus.js';
import { GameState } from '../types/game';

export interface ColyseusClientConfig {
  serverHost: string;
  serverPort: number;
  useSSL: boolean;
}

export interface UseColyseusClientReturn {
  // State
  isConnected: boolean;
  roomId: string | null;
  playerId: string;
  gameState: GameState | null;
  updateCount: number;
  isSimulating: boolean;
  fps: number;
  updateRate: number;
  
  // Actions
  connect: () => Promise<void>;
  joinRoom: (mapId?: string) => Promise<void>;
  updatePlayerPosition: (x: number, y: number) => void;
  updatePlayerInput: (vx: number, vy: number) => void;
  startSimulation: () => void;
  stopSimulation: () => void;
  
  // Utilities
  disconnect: () => void;
  trackFrame: () => void;
}

export const useColyseusClient = (config: ColyseusClientConfig): UseColyseusClientReturn => {
  // State
  const [isConnected, setIsConnected] = useState(false);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [playerId] = useState(`react-player-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [updateCount, setUpdateCount] = useState(0);
  const [isSimulating, setIsSimulating] = useState(false);
  const [fps, setFps] = useState(0);
  const [updateRate, setUpdateRate] = useState(0);
  
  // Refs
  const clientRef = useRef<Client | null>(null);
  const roomRef = useRef<Room<GameState> | null>(null);
  const simulationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastUpdateTimeRef = useRef<number>(0);
  const frameCountRef = useRef<number>(0);
  const lastFpsTimeRef = useRef<number>(performance.now());
  
  // Connect to server
  const connect = useCallback(async () => {
    try {
      const protocol = config.useSSL ? 'wss' : 'ws';
      const endpoint = `${protocol}://${config.serverHost}:${config.serverPort}`;
      
      const client = new Client(endpoint);
      clientRef.current = client;
      setIsConnected(true);
      
      // Store connection state in localStorage
      localStorage.setItem('atlas-world-colyseus-connected', 'true');
      localStorage.setItem('atlas-world-colyseus-player-id', playerId);
      
      console.log(`🔗 Connected to Colyseus server at ${endpoint}`);
      
    } catch (error) {
      console.error('Connection failed:', error);
      throw error;
    }
  }, [config, playerId]);
  
  // Join room
  const joinRoom = useCallback(async (mapId: string = 'map-01-sector-a') => {
    if (!clientRef.current) {
      throw new Error('Not connected');
    }
    
    try {
      const room = await clientRef.current.joinOrCreate<GameState>('game_room', {
        mapId,
        name: `Player-${playerId.substring(0, 8)}`
      });
      
      roomRef.current = room;
      setRoomId(room.id);
      
      // Handle room state changes
      room.onStateChange((state) => {
        setGameState(state);
        setUpdateCount(prev => prev + 1);
        
        // Calculate update rate
        const now = Date.now();
        const timeSinceLastUpdate = now - lastUpdateTimeRef.current;
        lastUpdateTimeRef.current = now;
        const currentUpdateRate = timeSinceLastUpdate > 0 ? Math.round(1000 / timeSinceLastUpdate) : 0;
        setUpdateRate(currentUpdateRate);
      });
      
      // Handle room messages
      room.onMessage('welcome', (message) => {
        console.log('🎉 Welcome message:', message);
      });
      
      // Handle room errors
      room.onError((code, message) => {
        console.error('❌ Room error:', code, message);
      });
      
      // Handle room leave
      room.onLeave((code) => {
        console.log('👋 Left room:', code);
        setRoomId(null);
        setGameState(null);
      });
      
      console.log(`🎮 Joined room ${room.id} on map ${mapId}`);
      
    } catch (error) {
      console.error('Failed to join room:', error);
      throw error;
    }
  }, [playerId]);
  
  // Update player position
  const updatePlayerPosition = useCallback((x: number, y: number) => {
    if (roomRef.current) {
      roomRef.current.send('player_position', { x, y });
    }
  }, []);
  
  // Update player input (velocity)
  const updatePlayerInput = useCallback((vx: number, vy: number) => {
    if (roomRef.current) {
      roomRef.current.send('player_input', { vx, vy });
    }
  }, []);
  
  // Start simulation
  const startSimulation = useCallback(() => {
    if (isSimulating) return;
    
    setIsSimulating(true);
    
    // Start player movement simulation
    simulationIntervalRef.current = setInterval(() => {
      const positions = [
        { x: 100, y: 100 },
        { x: 200, y: 100 },
        { x: 200, y: 200 },
        { x: 100, y: 200 }
      ];
      
      const step = Math.floor(updateCount / 2) % positions.length;
      const position = positions[step];
      
      updatePlayerPosition(position.x, position.y);
    }, 2000);
    
    console.log('🚀 Started simulation');
  }, [isSimulating, updateCount, updatePlayerPosition]);
  
  // Stop simulation
  const stopSimulation = useCallback(() => {
    setIsSimulating(false);
    
    if (simulationIntervalRef.current) {
      clearInterval(simulationIntervalRef.current);
      simulationIntervalRef.current = null;
    }
    
    console.log('⏹️ Stopped simulation');
  }, []);
  
  // Track frame for FPS calculation
  const trackFrame = useCallback(() => {
    const now = performance.now();
    frameCountRef.current++;
    if (now - lastFpsTimeRef.current >= 1000) {
      setFps(Math.round((frameCountRef.current * 1000) / (now - lastFpsTimeRef.current)));
      frameCountRef.current = 0;
      lastFpsTimeRef.current = now;
    }
  }, []);

  // Disconnect
  const disconnect = useCallback(() => {
    stopSimulation();
    
    if (roomRef.current) {
      roomRef.current.leave();
      roomRef.current = null;
    }
    
    clientRef.current = null;
    setIsConnected(false);
    setRoomId(null);
    setGameState(null);
    setUpdateCount(0);
    
    // Clear localStorage
    localStorage.removeItem('atlas-world-colyseus-connected');
    localStorage.removeItem('atlas-world-colyseus-player-id');
    
    console.log('🔌 Disconnected from Colyseus server');
  }, [stopSimulation]);
  
  // Restore connection state on mount
  useEffect(() => {
    const wasConnected = localStorage.getItem('atlas-world-colyseus-connected') === 'true';
    const savedPlayerId = localStorage.getItem('atlas-world-colyseus-player-id');
    
    if (wasConnected && savedPlayerId === playerId) {
      // Restore connection state
      setIsConnected(true);
    }
  }, [playerId]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopSimulation();
      if (roomRef.current) {
        roomRef.current.leave();
      }
    };
  }, [stopSimulation]);
  
  return {
    // State
    isConnected,
    roomId,
    playerId,
    gameState,
    updateCount,
    isSimulating,
    fps,
    updateRate,
    
    // Actions
    connect,
    joinRoom,
    updatePlayerPosition,
    updatePlayerInput,
    startSimulation,
    stopSimulation,
    
    // Utilities
    disconnect,
    trackFrame
  };
};

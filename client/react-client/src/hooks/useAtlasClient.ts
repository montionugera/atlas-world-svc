// React hook for Atlas World Client

import { useState, useCallback, useRef, useEffect } from 'react';
import { Client } from '@heroiclabs/nakama-js';
import { 
  ClientConfig, 
  MatchState, 
  CreateMatchResponse, 
  JoinMatchResponse, 
  UpdatePositionResponse, 
  GetMatchStateResponse, 
  UpdateMobsResponse,
  Position
} from '../types/game';

export interface UseAtlasClientReturn {
  // State
  isConnected: boolean;
  matchId: string | null;
  playerId: string;
  gameState: MatchState | null;
  updateCount: number;
  isSimulating: boolean;
  fps: number;
  updateRate: number;
  
  // Actions
  connect: () => Promise<void>;
  createMatch: () => Promise<string>;
  joinMatch: (matchId?: string) => Promise<JoinMatchResponse>;
  updatePlayerPosition: (position: Position) => Promise<UpdatePositionResponse>;
  getMatchState: () => Promise<GetMatchStateResponse>;
  updateMobs: () => Promise<UpdateMobsResponse>;
  startSimulation: () => void;
  stopSimulation: () => void;
  
  // Utilities
  disconnect: () => void;
  trackFrame: () => void;
}

export const useAtlasClient = (config: ClientConfig): UseAtlasClientReturn => {
  // State
  const [isConnected, setIsConnected] = useState(false);
  const [matchId, setMatchId] = useState<string | null>(null);
  const [playerId] = useState(`react-player-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
  const [gameState, setGameState] = useState<MatchState | null>(null);
  const [updateCount, setUpdateCount] = useState(0);
  const [isSimulating, setIsSimulating] = useState(false);
  const [fps, setFps] = useState(0);
  const [updateRate, setUpdateRate] = useState(0);
  
  // Refs
  const clientRef = useRef<Client | null>(null);
  const sessionRef = useRef<any>(null);
  const simulationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const mobUpdateIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastUpdateTimeRef = useRef<number>(0);
  const frameCountRef = useRef<number>(0);
  const lastFpsTimeRef = useRef<number>(performance.now());
  
  // Connect to server
  const connect = useCallback(async () => {
    try {
      const client = new Client(
        config.serverKey,
        config.serverHost,
        config.serverPort.toString(),
        config.useSSL
      );
      
      const session = await client.authenticateDevice(playerId, true);
      
      clientRef.current = client;
      sessionRef.current = session;
      setIsConnected(true);
      
      // Store connection state in localStorage to persist across re-renders
      localStorage.setItem('atlas-world-connected', 'true');
      localStorage.setItem('atlas-world-player-id', playerId);
      
    } catch (error) {
      console.error('Connection failed:', error);
      throw error;
    }
  }, [config, playerId]);
  
  // Create match
  const createMatch = useCallback(async (): Promise<string> => {
    if (!clientRef.current || !sessionRef.current) {
      throw new Error('Not connected');
    }
    
    const result = await clientRef.current.rpc(sessionRef.current, 'create_movement_match', {});
    const response: CreateMatchResponse = typeof result.payload === 'string' 
      ? JSON.parse(result.payload) 
      : result.payload;
    
    if (response.success && response.matchId) {
      setMatchId(response.matchId);
      localStorage.setItem('atlas-world-match-id', response.matchId);
      return response.matchId;
    } else {
      throw new Error(`Failed to create match: ${response.error}`);
    }
  }, []);
  
  // Join match
  const joinMatch = useCallback(async (targetMatchId?: string): Promise<JoinMatchResponse> => {
    if (!clientRef.current || !sessionRef.current) {
      throw new Error('Not connected');
    }
    
    const id = targetMatchId || matchId;
    if (!id) {
      throw new Error('No match ID provided');
    }
    
    const payload = { matchId: id, playerId };
    const result = await clientRef.current.rpc(sessionRef.current, 'join_match', payload);
    const response: JoinMatchResponse = typeof result.payload === 'string' 
      ? JSON.parse(result.payload) 
      : result.payload;
    
    if (response.success) {
      setMatchId(id);
    }
    
    return response;
  }, [matchId, playerId]);
  
  // Update player position
  const updatePlayerPosition = useCallback(async (position: Position): Promise<UpdatePositionResponse> => {
    if (!clientRef.current || !sessionRef.current || !matchId) {
      throw new Error('Not connected or no active match');
    }
    
    const payload = {
      matchId,
      playerId,
      position
    };
    
    const result = await clientRef.current.rpc(sessionRef.current, 'update_player_position', payload);
    const response: UpdatePositionResponse = typeof result.payload === 'string' 
      ? JSON.parse(result.payload) 
      : result.payload;
    
    if (response.success) {
      const now = Date.now();
      const timeSinceLastUpdate = now - lastUpdateTimeRef.current;
      lastUpdateTimeRef.current = now;
      
      // Calculate update rate (updates per second)
      const currentUpdateRate = timeSinceLastUpdate > 0 ? Math.round(1000 / timeSinceLastUpdate) : 0;
      setUpdateRate(currentUpdateRate);
      
      setGameState(prev => ({
        ...prev!,
        tick: response.tick || 0,
        mobs: response.mobs || [],
        players: response.players || {},
        playerCount: response.players?.length || 0
      }));
      setUpdateCount(prev => prev + 1);
    }
    
    return response;
  }, [matchId, playerId]);
  
  // Get match state
  const getMatchState = useCallback(async (): Promise<GetMatchStateResponse> => {
    if (!clientRef.current || !sessionRef.current || !matchId) {
      throw new Error('Not connected or no active match');
    }
    
    const payload = { matchId };
    const result = await clientRef.current.rpc(sessionRef.current, 'get_match_state', payload);
    const response: GetMatchStateResponse = typeof result.payload === 'string' 
      ? JSON.parse(result.payload) 
      : result.payload;
    
    if (response.success) {
      setGameState(prev => ({
        ...prev!,
        tick: response.tick || 0,
        mobs: response.mobs || [],
        players: response.players || {},
        playerCount: response.playerCount || 0
      }));
    }
    
    return response;
  }, [matchId]);
  
  // Update mobs
  const updateMobs = useCallback(async (): Promise<UpdateMobsResponse> => {
    if (!clientRef.current || !sessionRef.current || !matchId) {
      throw new Error('Not connected or no active match');
    }
    
    const payload = { matchId };
    const result = await clientRef.current.rpc(sessionRef.current, 'update_mobs', payload);
    const response: UpdateMobsResponse = typeof result.payload === 'string' 
      ? JSON.parse(result.payload) 
      : result.payload;
    
    if (response.success) {
      const now = Date.now();
      const timeSinceLastUpdate = now - lastUpdateTimeRef.current;
      lastUpdateTimeRef.current = now;
      
      // Calculate update rate (updates per second)
      const currentUpdateRate = timeSinceLastUpdate > 0 ? Math.round(1000 / timeSinceLastUpdate) : 0;
      setUpdateRate(currentUpdateRate);
      
      setGameState(prev => ({
        ...prev!,
        tick: response.tick || 0,
        mobs: response.mobs || [],
        playerCount: prev?.playerCount || 0
      }));
      setUpdateCount(prev => prev + 1);
    }
    
    return response;
  }, [matchId]);
  
  // Start simulation
  const startSimulation = useCallback(() => {
    if (isSimulating) return;
    
    setIsSimulating(true);
    
    // Start mob updates every 50ms for ultra smooth movement (20 updates per second)
    mobUpdateIntervalRef.current = setInterval(() => {
      updateMobs().catch(console.error);
    }, 50);
    
    // Start player movement every 2 seconds
    simulationIntervalRef.current = setInterval(() => {
      const positions = [
        { x: 100, y: 100 },
        { x: 200, y: 100 },
        { x: 200, y: 200 },
        { x: 100, y: 200 }
      ];
      
      const step = Math.floor(updateCount / 2) % positions.length;
      const position = positions[step];
      
      updatePlayerPosition(position).catch(console.error);
    }, 2000);
    
    // Initial mob update
    updateMobs().catch(console.error);
  }, [isSimulating, updateMobs, updatePlayerPosition, updateCount]);
  
  // Stop simulation
  const stopSimulation = useCallback(() => {
    setIsSimulating(false);
    
    if (mobUpdateIntervalRef.current) {
      clearInterval(mobUpdateIntervalRef.current);
      mobUpdateIntervalRef.current = null;
    }
    
    if (simulationIntervalRef.current) {
      clearInterval(simulationIntervalRef.current);
      simulationIntervalRef.current = null;
    }
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
    clientRef.current = null;
    sessionRef.current = null;
    setIsConnected(false);
    setMatchId(null);
    setGameState(null);
    setUpdateCount(0);
    
    // Clear localStorage
    localStorage.removeItem('atlas-world-connected');
    localStorage.removeItem('atlas-world-player-id');
    localStorage.removeItem('atlas-world-match-id');
  }, [stopSimulation]);
  
  // Restore connection state on mount
  useEffect(() => {
    const wasConnected = localStorage.getItem('atlas-world-connected') === 'true';
    const savedPlayerId = localStorage.getItem('atlas-world-player-id');
    const savedMatchId = localStorage.getItem('atlas-world-match-id');
    
    if (wasConnected && savedPlayerId === playerId) {
      // Restore connection state
      setIsConnected(true);
      if (savedMatchId) {
        setMatchId(savedMatchId);
      }
    }
  }, [playerId]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopSimulation();
    };
  }, [stopSimulation]);
  
  return {
    // State
    isConnected,
    matchId,
    playerId,
    gameState,
    updateCount,
    isSimulating,
    fps,
    updateRate,
    
    // Actions
    connect,
    createMatch,
    joinMatch,
    updatePlayerPosition,
    getMatchState,
    updateMobs,
    startSimulation,
    stopSimulation,
    
    // Utilities
    disconnect,
    trackFrame
  };
};

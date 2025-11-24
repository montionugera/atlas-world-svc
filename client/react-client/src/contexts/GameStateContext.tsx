import React, { createContext, useContext, ReactNode, useState, useCallback } from 'react';
import { GameState } from '../types/game';

interface GameStateContextValue {
  gameState: GameState | null;
  roomId: string | null;
  isConnected: boolean;
  setGameState: (gameState: GameState | null, roomId: string | null, isConnected: boolean) => void;
}

const GameStateContext = createContext<GameStateContextValue>({
  gameState: null,
  roomId: null,
  isConnected: false,
  setGameState: () => {}
});

export const useGameStateContext = () => useContext(GameStateContext);

interface GameStateProviderProps {
  children: ReactNode;
  initialGameState?: GameState | null;
  initialRoomId?: string | null;
  initialIsConnected?: boolean;
}

export const GameStateProvider: React.FC<GameStateProviderProps> = ({
  children,
  initialGameState = null,
  initialRoomId = null,
  initialIsConnected = false
}) => {
  const [gameState, setGameStateValue] = useState<GameState | null>(initialGameState);
  const [roomId, setRoomId] = useState<string | null>(initialRoomId);
  const [isConnected, setIsConnected] = useState<boolean>(initialIsConnected);

  const setGameState = useCallback((
    newGameState: GameState | null,
    newRoomId: string | null,
    newIsConnected: boolean
  ) => {
    setGameStateValue(newGameState);
    setRoomId(newRoomId);
    setIsConnected(newIsConnected);
  }, []);

  return (
    <GameStateContext.Provider value={{ gameState, roomId, isConnected, setGameState }}>
      {children}
    </GameStateContext.Provider>
  );
};


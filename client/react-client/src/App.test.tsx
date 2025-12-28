import React from 'react';
import { render, screen, act } from '@testing-library/react';
import App from './App';
import * as ColyseusClientHook from './hooks/useColyseusClient';

// Mock the hook
jest.mock('./hooks/useColyseusClient');

// Mock child components that rely on canvas/DOM APIs not present in JSDOM
jest.mock('./components/ColyseusGameCanvas', () => ({
  ColyseusGameCanvas: () => <div data-testid="game-canvas">Game Canvas</div>
}));

const mockClient = {
  client: {},
  room: null,
  roomId: 'test-room',
  sessionId: 'test-session',
  playerId: 'player-1',
  isConnected: true,
  error: null,
  gameState: {
    players: new Map(),
    mobs: new Map(),
    width: 500,
    height: 500,
    tick: 100
  },
  fps: 60,
  updateRate: 20,
  connect: jest.fn().mockResolvedValue(undefined),
  joinRoom: jest.fn().mockResolvedValue(true),
  leaveRoom: jest.fn(),
  sendPlayerAction: jest.fn(),
  forceDie: jest.fn(),
  respawn: jest.fn(),
  toggleBotMode: jest.fn()
};

describe('App Component', () => {
  beforeEach(() => {
    // Reset mock implementation before each test
    (ColyseusClientHook.useColyseusClient as jest.Mock).mockReturnValue(mockClient);
  });

  test('renders Atlas World header', () => {
    act(() => {
      render(<App />);
    });
    const titleElement = screen.getByText(/Atlas World/i);
    expect(titleElement).toBeInTheDocument();
  });

  test('renders Controls button', () => {
    act(() => {
      render(<App />);
    });
    const controlsButton = screen.getByText(/Controls/i);
    expect(controlsButton).toBeInTheDocument();
  });

  test('shows online status when connected', () => {
    act(() => {
      render(<App />);
    });
    const statusElements = screen.getAllByText(/Online/i);
    expect(statusElements.length).toBeGreaterThan(0);
    expect(screen.getByText(/Room: test-room/i)).toBeInTheDocument();
  });

  test('renders game canvas area', () => {
    act(() => {
      render(<App />);
    });
    expect(screen.getByTestId('game-canvas')).toBeInTheDocument();
  });
});

import React from 'react';
import { render, screen, act } from '@testing-library/react';
import App from './App';
import * as ColyseusClientHook from './hooks/useColyseusClient';
import { emptyEquipmentSnapshot } from './config/equipmentSlots';

// Mock the hooks
jest.mock('./hooks/useColyseusClient');
jest.mock('./hooks/useServerRsClient');

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
  connectionError: null as string | null,
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
  equipment: emptyEquipmentSnapshot(),
  equipmentRequestPending: false,
  equippedWeaponId: '',
  connect: jest.fn().mockResolvedValue(undefined),
  joinRoom: jest.fn().mockResolvedValue(true),
  leaveRoom: jest.fn(),
  sendPlayerAction: jest.fn(),
  switchWeapon: jest.fn(),
  requestEquipment: jest.fn(),
  requestLoadout: jest.fn(),
  forceDie: jest.fn(),
  respawn: jest.fn(),
  toggleBotMode: jest.fn()
};

import * as ServerRsClientHook from './hooks/useServerRsClient';

describe('App Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockClient.connect.mockResolvedValue(undefined);
    mockClient.joinRoom.mockResolvedValue(true);
    // Reset mock implementation before each test
    (ColyseusClientHook.useColyseusClient as jest.Mock).mockReturnValue(mockClient);
    (ServerRsClientHook.useServerRsClient as jest.Mock).mockReturnValue(mockClient);
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

  test('surfaces protocol mismatch connectionError without calling joinRoom or logging joined', () => {
    const mismatchClient = {
      ...mockClient,
      isConnected: false,
      gameState: null,
      connectionError:
        'This game client is out of date (client protocol 1, server protocol 2). Reload the page to update.',
    };
    (ServerRsClientHook.useServerRsClient as jest.Mock).mockReturnValue(
      mismatchClient,
    );
    act(() => {
      render(<App />);
    });
    expect(mismatchClient.joinRoom).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        /This game client is out of date \(client protocol 1, server protocol 2\)\. Reload the page to update\./i,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/joined/i)).not.toBeInTheDocument();
  });
});

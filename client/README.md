# Atlas World Client

TypeScript client for Atlas World Server with mob simulation capabilities.

## Features

- 🤖 **Mob Simulation**: Automatically simulate mob movement and AI
- 🚶 **Player Movement**: Simulate player movement patterns
- 🎮 **Full Integration**: Complete integration with Atlas World Server
- 📊 **Real-time Updates**: Live monitoring of match state and mob positions
- 🧪 **Test Suite**: Comprehensive test suite for all client functionality

## Installation

```bash
cd client
npm install
```

## Usage

### Build the Client

```bash
npm run build
```

### Run Mob Simulation

```bash
npm start
```

This will:
1. Connect to the Atlas World Server
2. Create a new match
3. Join the match
4. Run a 30-second simulation with both mob and player movement

### Run Test Suite

```bash
npm test
```

This will run all client tests:
- Basic connection
- Match creation
- Match joining
- Player movement
- Mob updates
- Match state retrieval
- Mob simulation

### Development Mode

```bash
npm run dev
```

This will watch for TypeScript changes and rebuild automatically.

## Configuration

Edit `src/index.ts` to modify the server configuration:

```typescript
const config: ClientConfig = {
  serverHost: 'localhost',  // Server hostname
  serverPort: 7350,         // Server port
  serverKey: 'defaultkey',  // Server key
  useSSL: false             // Use SSL/TLS
};
```

## API Reference

### AtlasClient

Main client class for interacting with the Atlas World Server.

#### Methods

- `connect()`: Connect to the server and authenticate
- `createMatch()`: Create a new movement match
- `joinMatch(matchId?)`: Join a match (creates if no ID provided)
- `updatePlayerPosition(position)`: Update player position
- `getMatchState()`: Get current match state
- `updateMobs()`: Trigger mob AI update
- `simulateMobMovement(duration, interval)`: Run mob simulation
- `simulatePlayerMovement(duration, interval)`: Run player movement simulation
- `runFullSimulation(duration)`: Run both mob and player simulations

#### Example Usage

```typescript
import { AtlasClient } from './atlas-client';

const client = new AtlasClient(config, 'player-123');

// Connect and create match
await client.connect();
const matchId = await client.createMatch();
await client.joinMatch();

// Run mob simulation for 30 seconds
await client.simulateMobMovement(30000, 1000);

// Update player position
await client.updatePlayerPosition({ x: 100, y: 200 });

// Get match state
const state = await client.getMatchState();
console.log(`Mobs: ${state.mobs?.length}, Players: ${state.playerCount}`);
```

## Mob Simulation

The client can simulate autonomous mob behavior by:

1. **Automatic Updates**: Periodically calling `updateMobs()` RPC
2. **Position Tracking**: Monitoring mob positions and velocities
3. **Physics Validation**: Verifying mob boundary bouncing and movement
4. **Real-time Logging**: Displaying mob state changes in real-time

## Player Simulation

The client can simulate player movement by:

1. **Pattern Movement**: Moving in predefined patterns (squares, circles, etc.)
2. **Position Updates**: Sending position updates to the server
3. **State Monitoring**: Tracking match state changes
4. **Interaction**: Triggering mob AI updates through player actions

## Error Handling

The client includes comprehensive error handling:

- Connection failures
- RPC call failures
- Invalid responses
- Network timeouts
- Graceful shutdown

## Logging

The client provides detailed logging:

- Connection status
- Match operations
- Mob positions and movements
- Player actions
- Error messages
- Simulation progress

## Requirements

- Node.js 16+
- TypeScript 5+
- Atlas World Server running on localhost:7350
- Nakama server with Atlas World runtime module loaded

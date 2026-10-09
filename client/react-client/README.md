# Atlas World React Client

A modern React TypeScript client for the Atlas World Server with real-time mob simulation visualization.

## Features

- 🎮 **Real-time Visualization**: Canvas-based rendering of mobs and players
- 🔄 **Live Updates**: Real-time mob movement and player position updates
- 📊 **Statistics Dashboard**: Live stats for match tick, mob count, players, and updates
- 📝 **Activity Logs**: Real-time logging of all game events
- 🎨 **Modern UI**: Beautiful gradient design with glassmorphism effects
- 📱 **Responsive**: Works on desktop and mobile devices
- 🔧 **TypeScript**: Full type safety and IntelliSense support

## Quick Start

### Prerequisites

- Node.js 16+ 
- Atlas World Server running on localhost:7350

### Installation

```bash
cd client/react-client
npm install
```

### Development

```bash
npm start
```

Opens http://localhost:3000 in your browser.

### Build for Production

```bash
npm run build
```

## Usage

1. **Connect**: Click "Connect" to establish connection to Atlas World Server
2. **Create Match**: Click "Create Match" to create a new movement match
3. **Join Match**: Click "Join Match" to join the created match
4. **Start Simulation**: Click "Start Simulation" to begin mob movement simulation
5. **Watch**: Observe real-time mob movement on the canvas
6. **Monitor**: Check statistics and logs for detailed information

## Architecture

### Components

- **App**: Main application component with state management
- **GameCanvas**: Canvas component for rendering mobs and players
- **ControlPanel**: UI controls for game actions
- **StatusPanel**: Connection and match status display
- **StatsPanel**: Real-time game statistics
- **LogPanel**: Activity logging with color-coded entries

### Hooks

- **useAtlasClient**: Custom hook for Nakama client integration
  - Connection management
  - Match creation and joining
  - Player movement updates
  - Mob simulation control
  - Real-time state updates

### Types

- **Game Types**: Shared TypeScript interfaces for game entities
- **RPC Responses**: Type-safe RPC response handling
- **Client Config**: Configuration for server connection

## Configuration

Edit `src/App.tsx` to modify server configuration:

```typescript
const config: ClientConfig = {
  serverHost: 'localhost',
  serverPort: 7350,
  serverKey: 'defaultkey',
  useSSL: false
};
```

## Development

### Project Structure

```
src/
├── components/          # React components
│   ├── ControlPanel.tsx
│   ├── GameCanvas.tsx
│   ├── LogPanel.tsx
│   ├── StatsPanel.tsx
│   └── StatusPanel.tsx
├── hooks/              # Custom React hooks
│   └── useAtlasClient.ts
├── types/              # TypeScript type definitions
│   └── game.ts
├── App.tsx             # Main application
├── App.css             # Styling
└── index.tsx           # Entry point
```

### Key Features

- **Real-time Canvas Rendering**: Efficient 2D rendering with velocity indicators
- **State Management**: React hooks for clean state management
- **Error Handling**: Comprehensive error handling with user feedback
- **Responsive Design**: Mobile-first responsive design
- **Type Safety**: Full TypeScript support throughout

### Testing

```bash
CI=true npm test -- --watchAll=false   # unit tests (hooks, renderers, utils)
npm run e2e                            # both e2e files, real Chromium vs live stack (server-rs + npm start :3000)
E2E_SERVER=localhost:2577 npm run e2e  # same, against a server-rs on another port (adds ?server=)
```

- `e2e/movement.e2e.mjs` holds/taps WASD, attacks while moving, simulates swallowed
  modifier keyups, checks the camera scale and map switching.
- `e2e/gameplay.e2e.mjs` checks live gameplay: mobs move, every mob has a bestiary type
  (no "Unknown Mob"), the local human is not tagged `[BOT]`, a nearby mob approaches,
  holding Space damages → kills → removes a mob, mobs respawn, bodies never overlap
  (≥ 25u), hit/kill events from this player arrive, and skill key `1` shows the player's
  projectiles.

First run on a machine: `npx playwright install chromium-headless-shell`. `HEADED=1` to watch.

### server-rs client notes

- `?player=<name>` connects as `dev-token:<name>` — use distinct names per tab; tabs
  sharing the default `dev-player` session control the same avatar.
- `?server=<host>:<port>` points the tab at another server-rs without a rebuild
  (`REACT_APP_SERVER_PORT` is build-time; default `localhost:2567`).
- Every `ClientInput` is the **full** input state (server overwrites it), so action
  packets re-send the held move vector / attack. Skill slots are one-shot on the server.
- server-rs world units are 10× the legacy Colyseus ones; the hook sets
  `gameState.viewportSize` (400) so the follow-camera shows movement at a visible rate.
- Snapshot fields used by the hook (`schemas/game_protocol.fbs`):
  - `state_flags`: bit 1 = alive (dead mobs render grey with `[DEAD]` until removed),
    bit 2 = server bot — only these players get `isBotMode` / the `[BOT]` label.
  - `mob_type`: bestiary id → `mobTypeId`; `getMobDisplayName` maps it to the bestiary
    name via `src/data/bestiaryNames.json`. Regenerate that file with
    `node scripts/gen-bestiary-names.mjs` when `content/bestiary/bestiary.json` changes
    (`mobUtils.test.ts` fails on drift).
  - `removed_ids`: deleted from `players` / `mobs`.
  - Projectile entities → `gameState.projectiles` (rebuilt every snapshot; `ownerId` from
    `owner_id`), drawn by `projectileRenderer`.
  - `events` (hit / kill) → `gameState.events` (latest snapshot) and a rolling
    `window.__gameEvents` buffer (last 500).
- `window.__gameState` / `window.__playerId` are exposed for debugging and e2e.

## Troubleshooting

### Connection Issues

- Ensure Atlas World Server is running on localhost:7350
- Check server logs for any errors
- Verify network connectivity

### Performance

- Canvas rendering is optimized for 60fps
- Log entries are limited to last 50 entries
- Mob updates are throttled to 1 second intervals

## License

MIT License - see LICENSE file for details.
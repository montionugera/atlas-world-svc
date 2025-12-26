# 🚀 Atlas World - Real-time Multiplayer Game

A high-performance real-time multiplayer game built with Colyseus, featuring live mob simulation and WebSocket-based state synchronization.

## 🏗️ Architecture

### Core Services
- **`atlas-colyseus-server`** - Colyseus WebSocket server (port 2567)
- **`atlas-metrics`** - Prometheus monitoring (port 9091)
- **`atlas-monitoring`** - Grafana dashboards (port 3000)

### Performance Features
- **Real-time WebSocket** - Instant state synchronization
- **REST API** - Static data offloaded from real-time sync (~90% bandwidth reduction)
- **20 FPS simulation** - Smooth mob movement and physics
- **Automatic state sync** - No polling required
- **Built for games** - Purpose-built for multiplayer gaming

## 🚀 Quick Start

### Prerequisites
- Docker & Docker Compose
- Node.js 18+

### 1. Start Colyseus Server
```bash
# Start Colyseus server
docker-compose up -d atlas-colyseus-server

# Or run locally
cd colyseus-server
npm install
npm run dev
```

### 2. Start React Client
```bash
cd client/react-client
npm install
npm start
```

### 3. Play the Game
- Open http://localhost:3001
- Watch mobs move in real-time
- Use WASD/Arrow keys to control your player

### 4. C# Unity Client (Optional)
```bash
# Copy C# client to your Unity project
cp -r colyseus-server/generated/csharp/* /path/to/your/unity/project/Assets/Scripts/

# Add AtlasWorldUnityClient component to a GameObject
# Configure server URL: ws://localhost:2567
# Press Play to connect automatically
```

## 🔗 Service Endpoints

| Service | URL | Purpose | Credentials |
|---------|-----|---------|-------------|
| **Colyseus Server** | ws://localhost:2567 | WebSocket game server | - |
| **REST API** | http://localhost:2567/api | Static game data (mob types, config) | - |
| **React Client** | http://localhost:3001 | Game client interface | - |
| **API Documentation** | http://localhost:3000 | WebSocket API docs | - |
| **C# Unity Client** | Generated files | Unity-compatible client | - |
| **Grafana** | http://localhost:3000 | Metrics dashboards | admin/admin |
| **Prometheus** | http://localhost:9091 | Raw metrics | - |

## 📁 Project Structure

```
atlas-world-svc/
├── .cursor/
│   ├── plans/           # Implementation roadmap
│   └── rules/           # Development standards
├── colyseus-server/
│   ├── src/
│   │   ├── rooms/       # Game room handlers
│   │   ├── schemas/     # Colyseus schemas
│   │   └── index.ts     # Server entry point
│   ├── generated/csharp/ # C# Unity client
│   ├── docs/            # API documentation
│   ├── package.json
│   └── Dockerfile
├── client/
│   └── react-client/    # React WebSocket client
├── docker-compose.yml   # Infrastructure orchestration
└── monitoring/          # Prometheus & Grafana configs
```

## 🧪 Development Workflow

### Branch Strategy
- `main` - Production-ready
- `feature/*` - New features
- `hotfix/*` - Urgent fixes

### Code Quality
- TypeScript strict mode
- ESLint + Prettier
- Unit tests required
- Performance regression tests

### Performance Monitoring
```bash
# Check server health
curl http://localhost:7349/healthcheck

# View metrics
curl http://localhost:9090/metrics

# Database status
docker-compose exec atlas-database psql -U nakama -d nakama
```

## 🎮 Game Features

### Core Systems
- **Real-time WebSocket** communication via Colyseus
- **Automatic state synchronization** - No polling needed
- **Live mob simulation** with AI movement
- **Multiplayer support** - Multiple players per room
- **Smooth interpolation** - 20 FPS server updates
- **Room-based architecture** - Scalable game rooms

### Game Mechanics
- **Mob AI** - Red circles with autonomous movement
- **Player controls** - WASD/Arrow key movement
- **Real-time physics** - Boundary collision detection
- **Live statistics** - FPS, tick count, player count
- **Room management** - Automatic room creation/joining

## 📊 Monitoring

### Key Metrics
- Tick duration (target: <7ms p50)
- Physics step time (<5ms p50)
- Snapshot size (<800B avg)
- Bandwidth usage (20-40KB/s per client)
- Active connections
- Memory usage & GC stats

### Dashboards
- **Server Performance**: Tick times, physics, networking
- **Game Metrics**: Player count, entity counts, AoE activity
- **Database**: Query performance, connection pools
- **System**: CPU, memory, disk I/O

## 🔧 Configuration

### Environment Variables
- `NAKAMA_RUNTIME_ENV=development`
- `NAKAMA_LOG_LEVEL=debug`
- Database credentials in `nakama-game-server-config.yml`

### Scaling
- Horizontal scaling via Kubernetes
- Redis for match routing (future)
- Agones for game server orchestration (future)

## 📚 API Reference

### REST API (Static Data)
Offloads rarely-changing data from real-time sync for better performance.

**Endpoints:**
- `GET /api/mob-types` - List all mob types
- `GET /api/mob-types/:id` - Get mob type details
- `GET /api/mob-types/:id/stats` - Get mob combat stats
- `GET /api/game-config` - Get game configuration
- `GET /api/mob-stats/default` - Get default mob stats

**Client Usage:**
```typescript
import { gameDataManager } from './utils/gameDataManager'

// Fetch mob types
const mobTypes = await gameDataManager.getMobTypesList()
const mobType = await gameDataManager.getMobType('spear_thrower')

// Fetch game config
const config = await gameDataManager.getGameConfig()
```

**Full Documentation:** See `colyseus-server/docs/API.md`

### WebSocket Messages (Real-time)
- `player_input` - Player movement (vx, vy)
- `player_position` - Direct position updates (x, y)
- `welcome` - Server welcome message
- `state_change` - Real-time game state updates

### Client Libraries
- **React/TypeScript** - `client/react-client/`
- **C# Unity** - `colyseus-server/generated/csharp/`
- **API Documentation** - http://localhost:3000

### AsyncAPI Specification
- **WebSocket API** - `colyseus-server/asyncapi.yaml`
- **Generated Clients** - C# Unity, TypeScript
- **Interactive Docs** - HTML documentation

## 🚦 Deployment

### Development
```bash
docker-compose up -d
pnpm run dev
```

### Production
```bash
# Build optimized
pnpm run build

# Deploy to staging/production
docker-compose -f docker-compose.prod.yml up -d
```

## 🤝 Contributing

1. Create feature branch from `main`
2. Implement with tests
3. Pass CI checks
4. Create PR with description
5. Squash merge after review

### Code Standards
- SOLID principles
- Performance-first mindset
- Comprehensive error handling
- Clean, readable TypeScript

---

**Built for performance, scaled for players.** 🎯

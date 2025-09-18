# 🚀 Atlas World - Realtime Game Server

A high-performance 2.5D realtime multiplayer game server built with Nakama, supporting 150-300 concurrent players per map.

## 🏗️ Architecture

### Core Services
- **`atlas-server`** - Nakama game server (port 7349, console 7351)
- **`atlas-database`** - PostgreSQL database (port 5432)
- **`atlas-metrics`** - Prometheus monitoring (port 9091)
- **`atlas-monitoring`** - Grafana dashboards (port 3000)

### Performance Targets
- **30Hz server tick** (< 7ms p50, < 20ms p95)
- **60Hz physics simulation**
- **< 120ms perceived latency**
- **< 800B snapshot size**
- **20-40 KB/s bandwidth per client**

## 🚀 Quick Start

### Prerequisites
- Docker & Docker Compose
- Node.js 18+ & pnpm

### 1. Install Dependencies
```bash
cd modules/ts
pnpm install
```

### 2. Start Infrastructure
```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f atlas-server
```

### 3. Build & Deploy
```bash
cd modules/ts
pnpm run build
pnpm run watch  # Auto-rebuild on changes
```

## 🔗 Service Endpoints

| Service | URL | Purpose | Credentials |
|---------|-----|---------|-------------|
| **Nakama Console** | http://localhost:7351 | Admin dashboard | admin/admin |
| **Grafana** | http://localhost:3000 | Metrics dashboards | admin/admin |
| **Prometheus** | http://localhost:9091 | Raw metrics | - |
| **Server API** | http://localhost:7349 | Game client connections | - |

## 📁 Project Structure

```
atlas-world-svc/
├── .cursor/
│   ├── plans/           # Implementation roadmap
│   └── rules/           # Development standards
├── modules/ts/
│   ├── src/
│   │   ├── matches/     # Match handlers
│   │   ├── physics/     # Planck.js physics
│   │   ├── net/         # AOI & networking
│   │   ├── systems/     # Game systems
│   │   └── metrics/     # Observability
│   ├── package.json
│   └── tsconfig.json
├── docker-compose.yml                # Infrastructure orchestration
├── nakama-game-server-config.yml   # Nakama configuration
├── pnpm-workspace.yaml # Workspace config
└── monitoring/         # Prometheus & Grafana configs
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
- **Authoritative server** with client prediction
- **2.5D layered physics** with Planck.js
- **AOI (Area of Interest)** grid system
- **Binary WebSocket protocol**
- **Portal/stair transitions**
- **Monster AI** with pathfinding

### Performance Specs
- **150-300 players** per map
- **~100 monsters** active
- **~200 AoEs** pulsing
- **32x32m AOI grid**
- **3x3 cell interest area**

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

### Client ↔ Server Messages
- `INPUT` - Player movement, actions
- `SNAPSHOT` - Entity state updates (~25Hz)
- `EVENT` - Reliable game events
- `PONG` - Latency measurement

### Server RPCs
- `match_create` - Create new game match
- `match_join` - Join existing match
- `player_ready` - Signal ready state

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

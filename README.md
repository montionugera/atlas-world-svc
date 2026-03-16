# 🚀 Atlas World - Real-time Multiplayer Game

A high-performance real-time multiplayer game built with a split architecture: **Colyseus** for real-time physics and state, and **Nakama** for meta-systems (auth, social, matchmaking).

---

## 🏗️ Architecture

### Core Simulation Engine (Colyseus)
- **Authoritative 2.5D Model:** Per-floor 2D physics using `Planck.js` with 3D visual metadata (slopes, portals).
- **Tick/Time Budget:**
  - `30 Hz` server tick (limit: <7ms p50)
  - `60 Hz` physics sub-step (limit: <5ms p50)
  - `~25 Hz` client snapshots
  - `10-15 Hz` AoE pulses
- **AOI (Area of Interest):** Grid filtering (3x3 cells per player) to optimize snapshot bandwidth (budget: 15-25 entities; ~800B peak/client).

### Meta-Systems (Nakama)
- **Auth & Storage:** Handles user accounts, inventory, and leaderboards.
- **Matchmaking:** Calls Agones to allocate a server and returns `ip:port:token` to client.

### Orchestration (Agones)
- **Lifecycle:** 1 Match = 1 Pod. 
- **Scale Target:** 150-300 players, ~100 monsters, ~200 active AoEs per server instance.
- **Exposure:** HostPort preferred for lowest latency.

---

## 🚀 Quick Start

### Prerequisites
- Docker & Docker Compose
- Node.js 18+

### 1. Start Colyseus Game Server
```bash
# Via Docker
docker-compose up -d atlas-colyseus-server

# Or Run Locally
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
Play the game at `http://localhost:3001` (Use WASD/Arrows to move).

### 3. C# Unity Client Integration (Optional)
```bash
# Copy C# API generator models to Unity
cp -r colyseus-server/generated/csharp/* /path/to/your/unity/project/Assets/Scripts/
```
Attach the `AtlasWorldUnityClient` to a Unity GameObject and configure the server URL (`ws://localhost:2567`).

---

## 🔗 Main Service Endpoints

| Service | Endpoint | Purpose |
| ---| --- | --- |
| **Colyseus Server (WS)** | `ws://localhost:2567/game` | Binary websocket connection |
| **REST API (Static Data)** | `http://localhost:2567/api` | Mob types, configs, stats |
| **Metrics (Prometheus)** | `http://localhost:9091/metrics`| Raw diagnostic metrics |
| **Dashboards (Grafana)** | `http://localhost:3000` | Analytics dashboards (admin/admin) |
| **React Interface** | `http://localhost:3001` | Browser-based generic client |

---

## 📁 Project Structure

| Path | Description |
| ---| --- |
| `.cursor/` | Project rules and roadmap implementation plans. |
| `docs/` | Architecture specs and API documentation. |
| `colyseus-server/` | The core Node.js authoritative game server. |
| `colyseus-server/src/rooms/` | Colyseus room handlers. |
| `colyseus-server/src/schemas/`| Networked data models & structs. |
| `client/react-client/` | Web-based client implementation for quick prototyping. |
| `monitoring/` | Prometheus & Grafana configuration stacks. |
| `docker-compose.yml` | Complete local orchestration setup. |

---

## 📜 Technical Data Contracts

### Static World Bundles (Loaded at Boot)
- `config.json` - Map scale & layers.
- `level-colliders.json` - Static Planck.js physics bodies (boxes, circles, polygons).
- `slopes.json` - Movement speed modifiers (gradient, upMul/downMul).
- `portals.json` - Floor-changing trigger zones.

### Network Protocol (Binary Frames)
1. **Client -> Server:** `INPUT` (Move vectors, Cast trigger, Use portal).
2. **Server -> Client:** `SNAPSHOT` (Authoritative positions, HP, status flags using AOI).
3. **Server -> Client:** `EVENT` (Spawn, Despawn, CastHit, Death, FloorChanged).

---

## 🧪 Development Workflow

### Git / Deployment Rules
- Create feature branch from `main`. Write tests.
- CI pipeline triggers on Pull Request.
- `main` deploys to Production/Staging.

### Required Code Quality
- TypeScript **Strict Mode** only.
- Passing `ESLint` and `Prettier` configurations.
- Commit to the 2.5D Physical limitations (never blindly trust Client elevation inputs, always audit slope coordinates).

---

## 🎛 Configuration & Environment Variables

| Variable | Default / Example | Purpose |
| ---| --- | --- |
| `MAP_KEY` | `TowerF5` | Name of the instance map |
| `CAPACITY` | `300` | Limit of connections before rejecting |
| `NAKAMA_RUNTIME_ENV` | `development` | Nakama operation mode |
| `PORT` | `2567` (or `7350`) | Game socket port |

**Built for performance, scaled for players.** 🎯

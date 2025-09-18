# 🚀 Realtime Game Server Implementation Plan

## 🎯 Project Scope
Build authoritative 2.5D layered realtime game server supporting 150-300 players per map with 30Hz tick rate and <120ms perceived latency.

## 🏗️ Architecture Overview
- **Runtime:** Nakama server with TypeScript modules
- **Physics:** Planck.js (Box2D) per floor
- **Networking:** WebSocket binary transport
- **Storage:** Postgres via Nakama APIs
- **AOI:** Grid-based interest management (3x3 cells)

## 🎯 Key Objectives
- ✅ Server authoritative movement, collisions, skills
- ✅ 30Hz server tick, 60Hz physics sub-steps
- ✅ AOI snapshots at ~25Hz
- ✅ Support 150-300 concurrent players
- ✅ <120ms perceived latency with prediction

## 📊 Performance Targets
- Tick time: ≤7ms p50, ≤20ms p95
- Physics step: ≤5ms p50
- Snapshot size: ≤800B average
- Bandwidth: 20-40 KB/s per client

## 🗂️ Implementation Phases

### Phase 1: Core Infrastructure ✅
- [ ] Nakama server setup with TypeScript
- [ ] Basic match handler structure
- [ ] WebSocket binary protocol
- [ ] Prometheus metrics integration

### Phase 2: Physics Engine 🚧
- [ ] Planck.js world per floor
- [ ] Player/monster body factories
- [ ] Collision detection system
- [ ] Static world colliders

### Phase 3: Networking Layer ⏳
- [ ] AOI grid system (32x32m cells)
- [ ] Binary codec with object pools
- [ ] Reliable/unreliable message handling
- [ ] Input processing pipeline

### Phase 4: Game Systems ⏳
- [ ] Movement system with input prediction
- [ ] Portal/stair transfer system
- [ ] Slope movement modifiers
- [ ] AoE pulse system (10-15Hz)

### Phase 5: AI & Balance ⏳
- [ ] Monster AI FSM (6-10Hz)
- [ ] Pathfinding on floor navmeshes
- [ ] Skill cooldowns and validation
- [ ] Damage calculation system

### Phase 6: Testing & Optimization ⏳
- [ ] Bot harness for load testing
- [ ] Performance profiling
- [ ] Memory leak detection
- [ ] Chaos testing (latency/loss injection)

## 🛠️ Development Workflow
- Feature branches from main
- PR reviews required
- Squash merge only
- Automated testing on PR
- Performance regression checks

## 📈 Success Metrics
- Server handles 300 concurrent players
- <120ms perceived latency
- <7ms average tick time
- <800B average snapshot size
- Zero data races or memory leaks

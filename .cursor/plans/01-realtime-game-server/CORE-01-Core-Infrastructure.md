# 🔧 CORE-01: Core Infrastructure Setup

## 🎯 Epic Goal
Establish the foundational server infrastructure with Nakama, TypeScript, and basic networking.

## ✅ Checklist

### Phase 1.1: Project Bootstrap ✅
- [x] Create Nakama server project structure
- [x] Setup TypeScript configuration with @heroiclabs/nakama-runtime
- [x] Initialize package.json with dependencies
- [x] Configure docker-compose for local development

### Phase 1.2: Character Movement System 🚧
- [ ] Create AtlasMovementMatch handler for character movement
- [ ] Setup basic player state (position, velocity, direction)
- [ ] Process movement input messages (WASD/arrows)
- [ ] Implement server-side movement validation
- [ ] Add real-time position broadcasting to other players
- [ ] Basic collision detection with world bounds

### Phase 1.3: WebSocket Transport ⏳
- [ ] Implement binary WebSocket protocol
- [ ] Setup message queues (reliable/unreliable)
- [ ] Add connection lifecycle management
- [ ] Basic ping/pong for latency measurement

### Phase 1.4: Metrics & Observability ⏳
- [ ] Integrate Prometheus metrics
- [ ] Add tick duration tracking
- [ ] Setup Grafana dashboards
- [ ] JSON logging structure

### Phase 1.5: Development Tools ⏳
- [ ] Hot reload for TypeScript modules
- [ ] Local testing harness
- [ ] Debug logging utilities
- [ ] Performance profiling setup

## 🏗️ Technical Requirements
- TypeScript 4.9+ with strict mode
- Nakama server 3.15+
- Docker Compose for local dev
- Prometheus metrics exporter

## 📊 Acceptance Criteria
- [ ] Server starts without errors
- [ ] Basic match creation works
- [ ] WebSocket connections establish
- [ ] Metrics are exposed on /metrics endpoint

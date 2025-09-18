# 🌐 NET-03: Networking Layer Implementation

## 🎯 Epic Goal
Build efficient binary networking with AOI interest management and snapshot broadcasting.

## ✅ Checklist

### Phase 3.1: Binary Protocol ⏳
- [ ] Message type definitions
- [ ] Binary encoder/decoder with pools
- [ ] Compression for snapshots
- [ ] Message validation and sanitization

### Phase 3.2: AOI Grid System ⏳
- [ ] Grid implementation (32x32m cells)
- [ ] Entity registration system
- [ ] Interest queries (3x3 cells)
- [ ] Dynamic grid resizing

### Phase 3.3: Snapshot System ⏳
- [ ] Entity state snapshotting (~25Hz)
- [ ] Delta compression
- [ ] Priority-based entity selection
- [ ] Bandwidth monitoring

### Phase 3.4: Input Processing ⏳
- [ ] Input queue management
- [ ] Sequence number validation
- [ ] Input rate limiting
- [ ] Client-side prediction reconciliation

### Phase 3.5: Reliable Events ⏳
- [ ] Spawn/despawn events
- [ ] Cast/hit/death notifications
- [ ] Floor change synchronization
- [ ] Event batching and ordering

## 🏗️ Technical Requirements
- Binary protocol with MsgPack
- AOI grid with spatial hashing
- Reliable UDP-like semantics
- Input buffering (100-150ms)

## 📊 Acceptance Criteria
- [ ] <800B average snapshot size
- [ ] 20-40 KB/s per client bandwidth
- [ ] AOI returns 15-25 entities per query
- [ ] Input processing <2ms latency

# WebSocket Client Snapshot Bandwidth Investigation (2026-10-30)

## Executive Summary

In the 50-client headless WebSocket swarm load test ([`server-rs/tests/ws_swarm_load_test.rs`](server-rs/tests/ws_swarm_load_test.rs)), each connected client receives **76,550.40 Bytes/sec** (~76.6 KB/s, or **612.4 kbps** / ~613 kbps).

This investigation explains and quantifies the exact mechanism producing this bandwidth:
1. **Unfiltered Global Broadcast**: Snapshots broadcast to clients in the swarm test contain **all entities in the world** (75 total: 50 players + 5 bots + 20 mobs), completely bypassing Area of Interest (AOI) filtering.
2. **Full State Transmission Every Tick (Zero Delta Compression)**: Despite being named `EntityDelta`, the schema transmits uncompressed full state every tick (20 Hz, 50ms interval) with no tick-to-tick state diffing or entity omission.
3. **FlatBuffers Wire Format Cost**: Each entity table costs **~48–56 bytes** on the wire (including vtable offsets, position/velocity vectors, progression, state flags, and alignment).
4. **Calculated Bandwidth Equation**:
   $$\text{Bandwidth} = 75 \text{ entities} \times \sim 51.03 \text{ bytes/entity} \times 20 \text{ Hz} \approx 3,828 \text{ bytes/tick} \times 20 \text{ ticks/s} = 76,550.40 \text{ B/s} \approx 76.6 \text{ KB/s}$$

No server behavior or production protocol logic was modified for this research.

---

## Detailed Investigation & File:Line Evidence

### Question 1: Is each client's snapshot filtered by area of interest, or does every client get every entity?

**Answer:** Every client receives **every entity in the world**. The swarm test snapshot broadcast path bypasses AOI filtering entirely.

#### File:Line Evidence

1. **Swarm Test Broadcast Loop**:
   In [`server-rs/tests/ws_swarm_load_test.rs:53-68`](server-rs/tests/ws_swarm_load_test.rs#L53-L68):
   ```rust
   let frame = sim.live_tick(&inputs, &disconnects);
   ...
   let bytes = builder.build_frame(
       frame.tick,
       now_ms,
       &frame.entities,
       &frame.removed_ids,
       &frame.events,
   );
   server_tick.broadcast_snapshot(bytes).await;
   ```
   `SnapshotBuilder::build_frame` receives `&frame.entities` (the full simulation entity list containing all 50 players, 5 bots, and 20 mobs = 75 entities).

2. **Indiscriminate Global Broadcast in WsServer**:
   In [`server-rs/src/net/ws.rs:863-874`](server-rs/src/net/ws.rs#L863-L874):
   ```rust
   pub async fn broadcast_snapshot(&self, bytes: &[u8]) {
       let mut stalled = Vec::new();
       {
           let conns = self.connections.read().await;
           if conns.is_empty() {
               return;
           }

           let msg = Message::Binary(bytes.to_vec().into());
           for (conn_key, tx) in conns.iter() {
               match tx.try_send(msg.clone()) {
   ```
   `broadcast_snapshot` clones the identical serialized buffer `bytes` into a binary WebSocket message and transmits it to every connection in `self.connections`. There is no per-session spatial culling.

3. **Existing AOI Implementation in Repo**:
   An Area-of-Interest tracking system already exists in [`server-rs/src/spatial/aoi.rs:16-56`](server-rs/src/spatial/aoi.rs#L16-L56) (`AoiTracker` with 600-unit enter and 640-unit exit radii). Furthermore, `WsServer` exposes `broadcast_aoi_snapshots_to_room` and `broadcast_aoi_snapshots_with_ghosts_to_room` in [`server-rs/src/net/ws.rs:725-785`](server-rs/src/net/ws.rs#L725-L785), which is utilized by the production server binary in [`server-rs/src/main.rs:510-521`](server-rs/src/main.rs#L510-L521). However, the headless swarm integration test calls `broadcast_snapshot` directly, replicating 100% of entities to 100% of clients every tick.

---

### Question 2: Is it a full snapshot every tick, or delta-compressed?

**Answer:** It is a **full snapshot every tick**. There is zero delta compression across ticks.

#### File:Line Evidence

1. **Misleading Name `EntityDelta` vs Complete Attribute Table**:
   In [`schemas/game_protocol.fbs:33-56`](schemas/game_protocol.fbs#L33-L56):
   ```flatbuffers
   table EntityDelta {
       id: uint32;
       entity_type: EntityType;
       pos: Vec2;
       vel: Vec2;
       health: float;
       max_health: float;
       state_flags: uint16;
       target_id: uint32;
       mob_type: string;
       owner_id: uint32;
       input_ack: uint32;
       level: uint32;
       xp: uint32;
       race: Race = HumanDemiHuman;
       enchant_glow: EnchantVisualGlow = None;
   }
   ```
   Despite the identifier `EntityDelta`, this table represents a full entity state manifest containing position, kinematics, vital stats, bestiary archetype, and full progression data.

2. **Per-Tick Builder Resets and Full Reconstruction**:
   In [`server-rs/src/protocol/mod.rs:203-241`](server-rs/src/protocol/mod.rs#L203-L241) (`SnapshotBuilder::build_frame`):
   ```rust
   self.fbb.reset();
   self.delta_offsets.clear();

   for e in entities {
       let pos = Vec2::new(e.x, e.y);
       let vel = Vec2::new(e.vx, e.vy);
       let vel_opt = if e.vx != 0.0 || e.vy != 0.0 {
           Some(&vel)
       } else {
           None
       };
       let mob_type = if e.mob_type.is_empty() {
           None
       } else {
           Some(self.fbb.create_shared_string(e.mob_type))
       };
       let delta = EntityDelta::create(
           &mut self.fbb,
           &EntityDeltaArgs {
               id: e.id,
               entity_type: e.entity_type,
               pos: Some(&pos),
               vel: vel_opt,
               health: e.health,
               max_health: e.max_health,
               state_flags: e.state_flags,
               target_id: e.target_id,
               mob_type,
               owner_id: e.owner_id,
               input_ack: e.input_ack,
               level: e.level,
               xp: e.xp,
               race: e.race,
               enchant_glow: e.enchant_glow,
           },
       );
       self.delta_offsets.push(delta);
   }
   ```
   - No previous tick state is cached or consulted.
   - Stationary or idle entities (e.g. idle mobs or non-moving players) are re-serialized in full every 50ms tick.
   - Static attributes (`max_health`, `level`, `xp`, `race`, `mob_type`) are transmitted repeatedly every 50ms.
   - There are no dirty bitmasks, no delta frames relative to keyframes, and no omission of un-mutated entities.

---

### Question 3: Per-entity byte cost, broken down by FlatBuffers fields

**Answer:** In FlatBuffers, each entity costs **~48 to 56 bytes** on the wire.

#### FlatBuffers Field & Wire Layout Breakdown

The generated layout in [`server-rs/src/protocol/generated/game_protocol_generated.rs:568-584`](server-rs/src/protocol/generated/game_protocol_generated.rs#L568-L584) and [`schemas/game_protocol.fbs:33-56`](schemas/game_protocol.fbs#L33-L56) yields the following byte consumption per entity:

| Component / Field | FlatBuffers Type / VOffset | Size (Bytes) | Notes & Presence Invariants |
|:---|:---|:---:|:---|
| **Vector Offset** | `uoffset_t` | 4 | Offset in `WorldSnapshot.entities: [EntityDelta]` |
| **VTable Pointer** | `soffset_t` | 4 | Negative offset pointing to shared `EntityDelta` vtable |
| **`pos`** | `struct Vec2` (`VT_POS = 8`) | 8 | Inline struct: `x: f32` (4B) + `y: f32` (4B). Always present. |
| **`vel`** | `struct Vec2` (`VT_VEL = 10`) | 8 (or 0) | Inline struct: `vx: f32` (4B) + `vy: f32` (4B). Omitted if `vx == 0 && vy == 0`. |
| **`id`** | `uint32` (`VT_ID = 4`) | 4 | Wire entity ID (`fnv1a_32`) |
| **`health`** | `float` (`VT_HEALTH = 12`) | 4 | Current health (`f32`) |
| **`max_health`** | `float` (`VT_MAX_HEALTH = 14`) | 4 | Maximum health (`f32`) |
| **`target_id`** | `uint32` (`VT_TARGET_ID = 18`) | 4 (or 0) | Target entity ID. Omitted by FlatBuffers when 0 (default). |
| **`input_ack`** | `uint32` (`VT_INPUT_ACK = 24`) | 4 (or 0) | Client input tick ack for players. Omitted when 0 (mobs/bots). |
| **`level`** | `uint32` (`VT_LEVEL = 26`) | 4 (or 0) | Player progression level. Omitted when 0 (default). |
| **`xp`** | `uint32` (`VT_XP = 28`) | 4 (or 0) | Player experience points. Omitted when 0 (default). |
| **`owner_id`** | `uint32` (`VT_OWNER_ID = 22`) | 0 (or 4) | Projectile owner. 0 for mobs/players (omitted). |
| **`state_flags`** | `uint16` (`VT_STATE_FLAGS = 16`) | 2 | Bitmask: alive (1), bot (2) |
| **`entity_type`** | `byte` (`VT_ENTITY_TYPE = 6`) | 0 (or 1) | Default 0 (`Player`) is omitted; 1 byte for `Mob`. |
| **`race`** | `byte` (`VT_RACE = 30`) | 0 (or 1) | Default 0 (`HumanDemiHuman`) is omitted. |
| **`enchant_glow`**| `byte` (`VT_ENCHANT_GLOW = 32`) | 0 (or 1) | Default 0 (`None`) is omitted. |
| **`mob_type`** | `uoffset_t` (`VT_MOB_TYPE = 20`) | 4 (or 0) | String offset (mobs only; empty/omitted for players). |
| **Mob String Table**| `FlatBuffers String` | amortized | Interned once per tick via `create_shared_string`. |
| **Alignment Padding**| Byte padding | 2–4 | Internal padding to align 4-byte boundaries. |

#### VTable Deduplication Note
The `EntityDelta` vtable header and field offset map total 34 bytes (`vtable_len: 2B`, `table_len: 2B`, 15 field offsets $\times$ 2B = 30B). Because FlatBuffers builders deduplicate identical vtables, entities with matching presence shapes share the exact same vtable offset. The 34-byte overhead is paid once per frame per entity archetype, adding $<0.5$ bytes per entity in aggregate.

#### Per-Entity Typical Footprint:
- **Active Moving Player**: 4B vector offset + 4B vtable offset + 8B pos + 8B vel + 4B id + 4B health + 4B max_health + 4B input_ack + 4B level + 2B state_flags + 2B padding $\approx$ **48 bytes**.
- **Stationary Mob**: 4B vector offset + 4B vtable offset + 8B pos + 0B vel + 4B id + 4B health + 4B max_health + 4B mob_type offset + 2B state_flags + 1B entity_type + 1B padding $\approx$ **36–40 bytes** (plus shared string table entry).

---

## Measured Benchmark Results

Measurements taken from the isolated measurement test [`server-rs/tests/snapshot_bytes_breakdown_test.rs`](server-rs/tests/snapshot_bytes_breakdown_test.rs) run via:
```bash
cargo test --manifest-path server-rs/Cargo.toml --test snapshot_bytes_breakdown_test -- --ignored --nocapture
```

### Scaling Measurement Table

| Entity Count ($N$) | Snapshot Bytes | Per-Entity Bytes | Bandwidth @ 20Hz (KB/s) | Bandwidth @ 20Hz (kbps) |
|:---:|:---:|:---:|:---:|:---:|
| **0** (Header Framing) | 32 B | — | 0.63 KB/s | 5.12 kbps |
| **50** | 2,736 B | 54.72 B | 53.44 KB/s | 437.76 kbps |
| **75** (Swarm Baseline) | 3,464–3,828 B | 46.19–51.04 B | 67.66–76.55 KB/s | 554.24–612.40 kbps |
| **200** | 10,072 B | 50.36 B | 196.72 KB/s | 1,611.52 kbps |
| **800** | 39,352 B | 49.19 B | 768.59 KB/s | 6,296.32 kbps |

### Swarm 50-Client Load Verification
In [`server-rs/tests/ws_swarm_load_test.rs`](server-rs/tests/ws_swarm_load_test.rs):
- **Clients**: 50 connected human players
- **Bots**: 5 wandering server bots
- **Mobs**: 20 route mobs
- **Total Entities**: $50 + 5 + 20 = 75$ entities
- **Measured Bandwidth**: **76,550.40 Bytes/client/sec**
- **Snapshot Size**: $76,550.40 / 20 = 3,827.52 \text{ bytes/snapshot}$
- **Observed Per-Entity Cost**: $3,827.52 / 75 = \mathbf{51.03\text{ bytes/entity}}$

---

## Ranked Optimization Options

The table below ranks optimization strategies by expected bandwidth reduction, implementation risk, and structural fit for `server-rs`:

| Rank | Strategy | Est. Bandwidth Saving | Scope / Reversibility | Code Reference |
|:---:|:---|:---:|:---:|:---|
| **1** | **Area-of-Interest (AOI) Filtering** | **70% – 85%** | R1 (Integration) | [`server-rs/src/spatial/aoi.rs:27-56`](server-rs/src/spatial/aoi.rs#L27-L56), [`server-rs/src/net/ws.rs:725-785`](server-rs/src/net/ws.rs#L725-L785) |
| **2** | **Delta / Keyframe Compression** | **60% – 75%** | R1 (Protocol) | [`server-rs/src/protocol/mod.rs:206-241`](server-rs/src/protocol/mod.rs#L206-L241), [`schemas/game_protocol.fbs:72-79`](schemas/game_protocol.fbs#L72-L79) |
| **3** | **Field Pruning (Split Motion vs Meta)**| **40% – 45%** | R1 (Schema) | [`schemas/game_protocol.fbs:33-56`](schemas/game_protocol.fbs#L33-L56) |
| **4** | **Position / Velocity Quantization** | **18% – 22%** | R2 (Encoding) | [`schemas/game_protocol.fbs:28-31`](schemas/game_protocol.fbs#L28-L31) |

---

### Option 1: Area-of-Interest (AOI) Filtering (Estimated Saving: 70% – 85%)

- **Mechanism**: Use the existing `AoiTracker` ([`server-rs/src/spatial/aoi.rs:16-56`](server-rs/src/spatial/aoi.rs#L16-L56)) and `WsServer::broadcast_aoi_snapshots_to_room` ([`server-rs/src/net/ws.rs:725-748`](server-rs/src/net/ws.rs#L725-L748)) instead of `broadcast_snapshot`.
- **Mathematical Impact**:
  - In a $2000 \times 2000$ arena ($4,000,000\text{ units}^2$), an AOI circle with $R=600$ covers $\pi \times 600^2 \approx 1,130,973\text{ units}^2$ (~28.3% of the arena).
  - With uniform distribution, an average client sees only $\sim 21$ entities instead of 75 entities.
  - Per-tick snapshot shrinks from $\sim 3,828\text{ B}$ down to $\sim 1,100\text{ B}$.
  - Bandwidth drops from **76.6 KB/s down to ~22.0 KB/s** (**~71% reduction** in 50-client arena; **>90% reduction** at $N=800$ on larger worlds).

### Option 2: Delta vs Keyframe Compression (Estimated Saving: 60% – 75%)

- **Mechanism**:
  - Track last-replicated state per entity per viewer (or per room).
  - Transmit a full keyframe snapshot once every 20 ticks (1.0s) or upon entering AOI.
  - On intermediate ticks, omit entities whose position and state have not changed, or send only entities with nonzero velocity / modified health.
  - In MMO workloads, only 20–30% of mobs and stationary players move during any single 50ms tick.
- **Mathematical Impact**:
  - Across 75 entities, transmitting 20 active entities instead of 75 on 19 out of 20 ticks reduces average per-tick payload from 3,828 B to $\sim 1,150\text{ B}$.
  - Bandwidth drops to **~23 KB/s (~70% reduction)**.

### Option 3: Field Pruning: Static Metadata vs Motion (Estimated Saving: 40% – 45%)

- **Mechanism**:
  - Split [`schemas/game_protocol.fbs:33-56`](schemas/game_protocol.fbs#L33-L56) into `EntitySpawn` (sent once when entering AOI: `max_health`, `level`, `xp`, `race`, `mob_type`) and a slim `EntityMotion` (sent at 20Hz: `id`, `x`, `y`, `vx`, `vy`, `health`, `flags`, `input_ack`).
  - Pruning static fields removes 16–22 bytes per entity per tick.
- **Mathematical Impact**:
  - Per-entity wire cost shrinks from $\sim 51\text{ bytes}$ down to $\sim 28\text{ bytes}$.
  - At 75 entities, snapshot drops from 3,828 B to $\sim 2,130\text{ B}$.
  - Bandwidth drops from **76.6 KB/s to ~42.6 KB/s (~44% reduction)** without requiring stateful delta tracking.

### Option 4: Quantized Positions and Velocities (Estimated Saving: 18% – 22%)

- **Mechanism**:
  - Replace two 32-bit floats (`f32`) for `pos` (8B) and two `f32` for `vel` (8B) in [`schemas/game_protocol.fbs:28-31`](schemas/game_protocol.fbs#L28-L31).
  - Positions within a map can be encoded as two 16-bit unsigned integers (`u16`) with 0.1-unit precision (4 bytes total).
  - Velocities can be packed into a 16-bit angle + 8-bit speed or small signed delta integers (2–3 bytes total).
  - Kinematics shrinks from 16 bytes to 6–7 bytes per entity (saving $\sim 10\text{ bytes}$ per entity).
- **Mathematical Impact**:
  - 10 bytes saved per entity across 75 entities = 750 bytes/tick.
  - Bandwidth drops from **76.6 KB/s to ~61.6 KB/s (~20% reduction)**.

---

## Combined Projection

If **AOI Filtering** (Option 1) is combined with **Field Pruning** (Option 3):
- Each client receives $\sim 21$ entities instead of 75.
- Each entity costs $\sim 28\text{ bytes}$ instead of 51 bytes.
- Per-snapshot payload: $21 \times 28\text{ B} + 32\text{ B header} \approx 620\text{ bytes}$.
- **Resulting Bandwidth**: $620\text{ B} \times 20\text{ Hz} \approx \mathbf{12.1\text{ KB/s}}$ (**~96.8 kbps**), representing an **84.2% total reduction** from the current 76.6 KB/s baseline.

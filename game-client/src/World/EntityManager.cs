using System.Collections.Generic;
using Godot;
using Atlas.Protocol;
using AtlasWorld.Contracts;
using AtlasWorld.Client.Net;

namespace AtlasWorld.Client.World
{
    /// <summary>
    /// Owns the pool of <see cref="EntityView"/>s (one per server entity id) and their
    /// scene nodes, AND the <see cref="SnapshotInterpolator"/> that turns 20 Hz server
    /// snapshots into smooth per-frame poses. The Net layer calls Spawn/ApplyLife/Despawn
    /// and <see cref="IngestSnapshot"/> / <see cref="IngestServerRsSnapshot"/> on the MAIN
    /// thread (the dispatch pump), so no thread marshalling is needed here.
    ///
    /// <para>Rendered pose is driven exclusively from the interpolator in
    /// <see cref="_Process"/> — remote entities at a 100 ms-delayed cursor (smooth), the
    /// local player at the newest snapshot (no input lag).</para>
    /// </summary>
    public sealed partial class EntityManager : Node3D
    {
        private readonly Dictionary<string, EntityView> _views = new();
        private readonly SnapshotInterpolator _interp = new();
        private readonly OwnPoseSmoother _ownSmoother = new();
        private readonly Dictionary<string, float> _lastHeadings = new();
        private readonly HashSet<string> _activeProjectiles = new();
        private readonly HashSet<string> _seenProjectiles = new();
        private readonly List<string> _expiredProjectiles = new();

        private string _ownPlayerId = "";
        private bool _localMoveHeld;
        private readonly bool _debugInterp = OS.GetEnvironment("ATLAS_DEBUG_INTERP") == "1";
        private double _debugAccum;

        public int Count => _views.Count;
        public int InterpolatedBufferCount => _interp.EntityCount;
        public string OwnPlayerId => _ownPlayerId;
        public IReadOnlyDictionary<string, EntityView> Views => _views;

        /// <summary>
        /// When true (used by <see cref="VerticalSliceRoot"/> which owns its bespoke hero
        /// <c>PlayerAvatar</c> node with attached 3D equipment), <see cref="IngestServerRsSnapshot"/>
        /// still feeds the own-player pose into <see cref="SnapshotInterpolator"/> and updates
        /// authoritative HP, without spawning a duplicate second player mesh.
        /// </summary>
        public bool SuppressOwnPlayerView { get; set; }

        public float OwnPlayerHealth { get; private set; } = 100f;
        public float OwnPlayerMaxHealth { get; private set; } = 100f;
        public bool OwnPlayerAlive { get; private set; } = true;

        public bool TryGetEntityView(string id, out EntityView? view) =>
            _views.TryGetValue(id, out view);

        /// <param name="typeId">
        /// The specific registry key (e.g. <c>mob:spear_thrower</c>) the view resolves its
        /// visual node from. <paramref name="kind"/> stays the broad class used for pose
        /// ground-height + the capsule fallback; only the visual node's SOURCE changes.
        /// </param>
        public void Spawn(string id, EntityKind kind, string typeId)
        {
            if (_views.ContainsKey(id))
                return;

            var view = new EntityView(kind, typeId);
            AddChild(view.Root);
            _views[id] = view;
        }

        public void ApplyLife(string id, WorldLife e)
        {
            if (!_views.TryGetValue(id, out EntityView? view))
                return;

            view.ApplyLife(e);

            // isAlive → death + free: a dead life entity leaves the pool immediately.
            if (!view.Alive)
                Despawn(id);
        }

        public void Despawn(string id)
        {
            _lastHeadings.Remove(id);
            _activeProjectiles.Remove(id);

            if (!_views.TryGetValue(id, out EntityView? view))
            {
                _interp.RemoveEntity(id);
                return;
            }

            _views.Remove(id); // out of the pool first — later OnChange becomes a no-op
            _interp.RemoveEntity(id); // linger the buffer briefly to absorb a late patch
            if (GodotObject.IsInstanceValid(view.Root))
                view.Root.QueueFree();
        }

        /// <summary>Local move-input intent (from PlayerController / VerticalSliceRoot) — gates own-player dead reckoning.</summary>
        public void SetLocalMoveHeld(bool held) => _localMoveHeld = held;

        public void SetOwnPlayer(string id)
        {
            if (id != _ownPlayerId)
                _ownSmoother.Reset();
            _ownPlayerId = id;
        }

        /// <summary>
        /// Ingest a FlatBuffers <see cref="WorldSnapshot"/> directly from <c>server-rs</c>.
        /// Spawns/updates <see cref="EntityView"/>s for players, bots, mobs, NPCs, and
        /// ephemeral projectiles, pushes one <see cref="PoseSample"/> per entity into
        /// <see cref="SnapshotInterpolator"/>, and despawns <c>RemovedIds</c>.
        /// </summary>
        public void IngestServerRsSnapshot(WorldSnapshot snapshot, float coordScale = 0.1f, Vector2? serverOrigin = null)
        {
            long tick = snapshot.Tick;
            long nowMs = MonotonicClock.NowMs;
            Vector2 center = serverOrigin ?? new Vector2(500f, 500f);

            if (_debugSmooth)
            {
                if (_lastIngestMs > 0)
                    _ingestDeltas.Add(nowMs - _lastIngestMs);
                _lastIngestMs = nowMs;
            }

            _seenProjectiles.Clear();

            int count = snapshot.EntitiesLength;
            for (int i = 0; i < count; i++)
            {
                EntityDelta? deltaOpt = snapshot.Entities(i);
                if (!deltaOpt.HasValue)
                    continue;

                EntityDelta d = deltaOpt.Value;
                uint wireId = d.Id;
                string id = wireId.ToString();

                bool isAlive = (d.StateFlags & 1) != 0;
                bool isBot = (d.StateFlags & 2) != 0;
                bool isAttacking = d.TargetId != 0;

                Vec2? posOpt = d.Pos;
                Vec2? velOpt = d.Vel;
                float rawX = posOpt.HasValue ? posOpt.Value.X : center.X;
                float rawY = posOpt.HasValue ? posOpt.Value.Y : center.Y;
                float rawVx = velOpt.HasValue ? velOpt.Value.X : 0f;
                float rawVy = velOpt.HasValue ? velOpt.Value.Y : 0f;

                float wx = (rawX - center.X) * coordScale;
                float wz = (rawY - center.Y) * coordScale;
                float vx = isAlive ? rawVx * coordScale : 0f;
                float vz = isAlive ? rawVy * coordScale : 0f;

                (EntityKind kind, string typeId) = d.EntityType switch
                {
                    EntityType.Player => (EntityKind.Player, EntityKeys.Player),
                    EntityType.Mob => (EntityKind.Mob, EntityKeys.ServerRsMob(d.MobType)),
                    EntityType.Projectile => (EntityKind.Projectile, EntityKeys.ServerRsProjectile(d.MobType)),
                    EntityType.Npc => (EntityKind.Npc, EntityKeys.Npc),
                    _ => (EntityKind.Mob, EntityKeys.ServerRsMob(d.MobType)),
                };

                float wy = kind == EntityKind.Projectile ? 1.0f : 0f;

                float heading;
                if (vx * vx + vz * vz > 0.0001f)
                {
                    // EntityView.ApplyPose sets Rotation.Y = -heading. Using -Atan2(vx, vz)
                    // rotates +Z-facing glTF character rigs directly toward (vx, vz).
                    heading = -Mathf.Atan2(vx, vz);
                    _lastHeadings[id] = heading;
                }
                else if (!_lastHeadings.TryGetValue(id, out heading))
                {
                    heading = 0f;
                }

                _interp.Push(id, new PoseSample(
                    tick,
                    nowMs,
                    new Vector3(wx, wy, wz),
                    heading,
                    new Vector3(vx, 0f, vz)));

                if (id == _ownPlayerId)
                {
                    OwnPlayerHealth = d.Health;
                    OwnPlayerMaxHealth = d.MaxHealth;
                    OwnPlayerAlive = isAlive;
                    if (SuppressOwnPlayerView)
                        continue;
                }

                if (kind == EntityKind.Projectile)
                {
                    _seenProjectiles.Add(id);
                    _activeProjectiles.Add(id);
                }

                if (!_views.TryGetValue(id, out EntityView? view))
                {
                    // Skip spawning a corpse that is already dead on first sight
                    if (!isAlive && kind != EntityKind.Projectile)
                        continue;

                    Spawn(id, kind, typeId);
                    view = _views[id];
                    view.WireId = wireId;
                    view.RawMobType = d.MobType ?? "";

                    if (kind == EntityKind.Player)
                    {
                        string label = isBot
                            ? $"[Bot] Vanguard #{wireId % 1000:D3}"
                            : $"Adventurer #{wireId % 1000:D3}";
                        Color col = isBot
                            ? new Color(0.55f, 0.86f, 1.0f, 1f)
                            : new Color(0.38f, 1.0f, 0.58f, 1f);
                        view.SetDisplayName(label, col);
                    }
                    else if (kind == EntityKind.Mob)
                    {
                        string badge = EntityKeys.FormatMobBadge(d.MobType);
                        string mobName = EntityKeys.FormatMobDisplayName(d.MobType);
                        Color col = badge == "MVP Boss"
                            ? new Color(1.0f, 0.86f, 0.32f, 1f)
                            : badge == "Elite Mob"
                                ? new Color(1.0f, 0.55f, 0.45f, 1f)
                                : new Color(0.95f, 0.78f, 0.65f, 1f);
                        view.SetDisplayName($"[{badge}] {mobName}", col);
                    }
                }

                if (kind is EntityKind.Player or EntityKind.Mob or EntityKind.Npc)
                {
                    string team = kind == EntityKind.Player ? "player" : kind == EntityKind.Mob ? "enemy" : "npc";
                    view.ApplyLifeState(isAlive, d.Health, d.MaxHealth, isAttacking, team);
                }
            }

            // Reconcile ephemeral projectiles (server-rs omits detonated/expired projectiles from next snapshot)
            if (_activeProjectiles.Count > 0)
            {
                _expiredProjectiles.Clear();
                foreach (string projId in _activeProjectiles)
                {
                    if (!_seenProjectiles.Contains(projId))
                        _expiredProjectiles.Add(projId);
                }
                foreach (string projId in _expiredProjectiles)
                    Despawn(projId);
            }

            // Despawn explicitly removed entities
            int remLen = snapshot.RemovedIdsLength;
            for (int r = 0; r < remLen; r++)
            {
                string remId = snapshot.RemovedIds(r).ToString();
                Despawn(remId);
            }
        }

        /// <summary>
        /// Push one <see cref="PoseSample"/> per entity from the just-applied snapshot into
        /// the interpolator. Called from the room's <c>OnStateChange</c> (the snapshot
        /// boundary) — NOT per-field OnChange — so each buffer gets exactly one sample per
        /// patch. Dead life entities are pushed with zero velocity so extrapolation cannot
        /// overshoot a server-side stop/death.
        /// </summary>
        public void IngestSnapshot(GameState state)
        {
            if (state == null)
                return;

            long tick = (long)state.tick;
            long nowMs = MonotonicClock.NowMs;

            if (_debugSmooth)
            {
                if (_lastIngestMs > 0)
                    _ingestDeltas.Add(nowMs - _lastIngestMs);
                _lastIngestMs = nowMs;
            }

            state.players?.ForEach((id, p) => PushLife(id, p, EntityKind.Player, tick, nowMs));
            state.mobs?.ForEach((id, m) => PushLife(id, m, EntityKind.Mob, tick, nowMs));
            state.npcs?.ForEach((id, n) => PushLife(id, n, EntityKind.Npc, tick, nowMs));
            state.projectiles?.ForEach((id, pr) => PushObject(id, pr, EntityKind.Projectile, tick, nowMs));
            state.zoneEffects?.ForEach((id, z) => PushObject(id, z, EntityKind.ZoneEffect, tick, nowMs));
        }

        private void PushLife(string id, WorldLife e, EntityKind kind, long tick, long nowMs)
        {
            Vector3 pos = new(e.x, EntityVisuals.GroundHeight(kind), e.y);
            // Zero velocity on death: hold at the last authoritative pose, no overshoot.
            Vector3 vel = e.isAlive ? new Vector3(e.vx, 0f, e.vy) : Vector3.Zero;
            _interp.Push(id, new PoseSample(tick, nowMs, pos, e.heading, vel));
        }

        private void PushObject(string id, WorldObject e, EntityKind kind, long tick, long nowMs)
        {
            Vector3 pos = new(e.x, EntityVisuals.GroundHeight(kind), e.y);
            _interp.Push(id, new PoseSample(tick, nowMs, pos, e.angle, new Vector3(e.vx, 0f, e.vy)));
        }

        public bool TryGetOwnPlayerFlatPosition(out Vector3 flat)
        {
            flat = Vector3.Zero;
            if (_ownPlayerId.Length == 0)
                return false;

            if (_views.TryGetValue(_ownPlayerId, out EntityView? own) && GodotObject.IsInstanceValid(own.Root))
            {
                Vector3 p = own.Root.Position;
                flat = new Vector3(p.X, 0f, p.Z);
                return true;
            }

            if (_interp.TryGetNewestRaw(_ownPlayerId, out Vector3 raw))
            {
                flat = new Vector3(raw.X, 0f, raw.Z);
                return true;
            }

            return false;
        }

        /// <summary>
        /// Sample the own-player dead-reckoned pose from <see cref="OwnPoseSmoother"/> +
        /// <see cref="SnapshotInterpolator"/> even when <see cref="SuppressOwnPlayerView"/> is enabled.
        /// </summary>
        public bool TrySampleOwnPlayerPose(float deltaSec, out Vector3 pos, out float heading, out Vector3 rawVel)
        {
            pos = Vector3.Zero;
            heading = 0f;
            rawVel = Vector3.Zero;
            if (_ownPlayerId.Length == 0)
                return false;

            long now = MonotonicClock.NowMs;
            if (!_interp.TryGetNewest(_ownPlayerId, now, out PoseSample newest, out float ageSec))
                return false;

            (pos, heading) = _ownSmoother.Step(newest, ageSec, deltaSec, _localMoveHeld);
            rawVel = newest.Vel;
            return true;
        }

        /// <summary>Free all views, clear the pool and interpolator — used on a fresh (re)connect.</summary>
        public void Reset()
        {
            foreach (EntityView view in _views.Values)
            {
                if (GodotObject.IsInstanceValid(view.Root))
                    view.Root.QueueFree();
            }
            _views.Clear();
            _lastHeadings.Clear();
            _activeProjectiles.Clear();
            _seenProjectiles.Clear();
            _interp.Clear();
            _ownSmoother.Reset();
            _ownPlayerId = "";
        }

        public override void _Process(double delta)
        {
            long now = MonotonicClock.NowMs;
            // Remote cursor lives on the SERVER tick timeline (see SnapshotInterpolator.ToCursor).
            long delayedCursor = _interp.ToCursor(now, SnapshotInterpolator.InterpolationDelayMs);

            foreach (KeyValuePair<string, EntityView> kv in _views)
            {
                if (kv.Key == _ownPlayerId)
                {
                    // Own player: dead reckoning (server velocity + smoothed error
                    // correction) — zero added latency, C¹-continuous motion.
                    if (_interp.TryGetNewest(kv.Key, now, out PoseSample newest, out float ageSec))
                    {
                        (Vector3 opos, float ohead) = _ownSmoother.Step(newest, ageSec, (float)delta, _localMoveHeld);
                        kv.Value.ApplyPose(opos, ohead);
                        // Animation gait reads the raw server velocity (not the smoothed
                        // render pose delta) — same source dead reckoning itself extrapolates from.
                        kv.Value.UpdateAnimation(newest.Vel);
                    }
                    continue;
                }

                if (_interp.TrySamplePose(kv.Key, delayedCursor, out Vector3 pos, out float heading))
                    kv.Value.ApplyPose(pos, heading);
                // Animation state is driven from the newest RAW sample's velocity, independent
                // of the delayed interpolation cursor used for position — gait should react to
                // "is the server telling us this entity is moving right now", not the render lag.
                if (_interp.TryGetNewest(kv.Key, now, out PoseSample newestRemote, out _))
                    kv.Value.UpdateAnimation(newestRemote.Vel);
            }

            _interp.TickCleanup(now);

            if (_debugInterp)
                DebugTick(delta, now, delayedCursor);
            if (_debugSmooth)
                SmoothTick(delta);
        }

        // ---- Smoothness instrumentation (ATLAS_DEBUG_SMOOTH=1) --------------------------
        private readonly bool _debugSmooth = OS.GetEnvironment("ATLAS_DEBUG_SMOOTH") == "1";
        private Vector3 _smoothLastPos;
        private bool _smoothHasLast;
        private readonly List<float> _frameSpeeds = new();
        private long _lastIngestMs;
        private readonly List<float> _ingestDeltas = new();
        private double _smoothAccum;

        private void SmoothTick(double delta)
        {
            if (_ownPlayerId.Length > 0 && _views.TryGetValue(_ownPlayerId, out EntityView? own) &&
                GodotObject.IsInstanceValid(own.Root))
            {
                Vector3 p = own.Root.Position;
                if (_smoothHasLast && delta > 0.0)
                    _frameSpeeds.Add(p.DistanceTo(_smoothLastPos) / (float)delta);
                _smoothLastPos = p;
                _smoothHasLast = true;
            }

            _smoothAccum += delta;
            if (_smoothAccum < 2.0)
                return;
            _smoothAccum = 0.0;

            GD.Print($"[Smooth] ownSpeed {Stats(_frameSpeeds)} u/s | ingest {Stats(_ingestDeltas)} ms | msPerTick={_interp.MsPerTickEstimate:0.00}");
            _frameSpeeds.Clear();
            _ingestDeltas.Clear();
        }

        private static string Stats(List<float> v)
        {
            if (v.Count == 0)
                return "n=0";
            float mean = 0f;
            foreach (float x in v) mean += x;
            mean /= v.Count;
            float var = 0f, max = float.MinValue, min = float.MaxValue;
            foreach (float x in v)
            {
                var += (x - mean) * (x - mean);
                if (x > max) max = x;
                if (x < min) min = x;
            }
            float sd = Mathf.Sqrt(var / v.Count);
            return $"n={v.Count} mean={mean:0.00} sd={sd:0.00} min={min:0.00} max={max:0.00}";
        }

        private void DebugTick(double delta, long now, long delayedCursor)
        {
            _debugAccum += delta;
            if (_debugAccum < 1.0)
                return;
            _debugAccum = 0.0;

            string bestId = "";
            bool bestOwn = false;
            Vector3 bestRaw = Vector3.Zero, bestInterp = Vector3.Zero;
            float bestDelta = -1f;

            foreach (KeyValuePair<string, EntityView> kv in _views)
            {
                bool isOwn = kv.Key == _ownPlayerId;
                long cursor = _interp.ToCursor(now, isOwn
                    ? SnapshotInterpolator.OwnPlayerDelayMs
                    : SnapshotInterpolator.InterpolationDelayMs);
                if (_interp.TrySamplePose(kv.Key, cursor, out Vector3 interp, out _) &&
                    _interp.TryGetNewestRaw(kv.Key, out Vector3 raw))
                {
                    float d = interp.DistanceTo(raw);
                    if (d > bestDelta)
                    {
                        bestDelta = d;
                        bestId = kv.Key;
                        bestOwn = isOwn;
                        bestRaw = raw;
                        bestInterp = interp;
                    }
                }
            }

            if (bestDelta < 0f)
            {
                GD.Print($"[Interp] buffers={_interp.EntityCount} views={_views.Count} (no sampleable entity yet)");
                return;
            }

            GD.Print($"[Interp] buffers={_interp.EntityCount} views={_views.Count} " +
                     $"maxDeltaEntity id={bestId} own={bestOwn} " +
                     $"raw=({bestRaw.X:0.00},{bestRaw.Z:0.00}) interp=({bestInterp.X:0.00},{bestInterp.Z:0.00}) " +
                     $"interpVsRaw={bestDelta:0.000}");
        }
    }
}

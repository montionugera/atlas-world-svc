using System.Collections.Generic;
using Godot;
using AtlasWorld.Contracts;
using AtlasWorld.Client.Net;

namespace AtlasWorld.Client.World
{
    /// <summary>
    /// Owns the pool of <see cref="EntityView"/>s (one per server entity id) and their
    /// scene nodes, AND the <see cref="SnapshotInterpolator"/> that turns 20 Hz server
    /// snapshots into smooth per-frame poses. The Net layer calls Spawn/ApplyLife/Despawn
    /// and <see cref="IngestSnapshot"/> on the MAIN thread (the dispatch pump), so no thread
    /// marshalling is needed here.
    ///
    /// <para>Rendered pose is now driven exclusively from the interpolator in
    /// <see cref="_Process"/> — remote entities at a 100 ms-delayed cursor (smooth), the
    /// local player at the newest snapshot (no input lag). The old per-view lerp is gone.</para>
    ///
    /// Invariant: an entity is removed from the pool in <see cref="Despawn"/> BEFORE any
    /// later OnChange could fire, so a stale change on a freed node is a no-op. Node
    /// access is additionally guarded with <c>IsInstanceValid</c>.
    /// </summary>
    public sealed partial class EntityManager : Node3D
    {
        private readonly Dictionary<string, EntityView> _views = new();
        private readonly SnapshotInterpolator _interp = new();
        private readonly OwnPoseSmoother _ownSmoother = new();

        private string _ownPlayerId = "";
        private bool _localMoveHeld;
        private readonly bool _debugInterp = OS.GetEnvironment("ATLAS_DEBUG_INTERP") == "1";
        private double _debugAccum;

        public int Count => _views.Count;
        public string OwnPlayerId => _ownPlayerId;

        public void Spawn(string id, EntityKind kind)
        {
            if (_views.ContainsKey(id))
                return;

            var view = new EntityView(kind);
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
            if (!_views.TryGetValue(id, out EntityView? view))
                return;

            _views.Remove(id); // out of the pool first — later OnChange becomes a no-op
            _interp.RemoveEntity(id); // linger the buffer briefly to absorb a late patch
            if (GodotObject.IsInstanceValid(view.Root))
                view.Root.QueueFree();
        }

        /// <summary>Local move-input intent (from PlayerController) — gates own-player dead reckoning.</summary>
        public void SetLocalMoveHeld(bool held) => _localMoveHeld = held;

        public void SetOwnPlayer(string id)
        {
            if (id != _ownPlayerId)
                _ownSmoother.Reset();
            _ownPlayerId = id;
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
            if (_ownPlayerId.Length == 0 || !_views.TryGetValue(_ownPlayerId, out EntityView? own))
                return false;
            if (!GodotObject.IsInstanceValid(own.Root))
                return false;
            Vector3 p = own.Root.Position;
            flat = new Vector3(p.X, 0f, p.Z);
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
                    }
                    continue;
                }

                if (_interp.TrySamplePose(kv.Key, delayedCursor, out Vector3 pos, out float heading))
                    kv.Value.ApplyPose(pos, heading);
            }

            _interp.TickCleanup(now);

            if (_debugInterp)
                DebugTick(delta, now, delayedCursor);
            if (_debugSmooth)
                SmoothTick(delta);
        }

        // ---- Smoothness instrumentation (ATLAS_DEBUG_SMOOTH=1) --------------------------
        // Quantifies the two candidate jitter sources: (1) per-frame rendered SPEED of the
        // own player (constant input ⇒ should be near-constant; σ is the felt jitter) and
        // (2) snapshot ARRIVAL cadence (should be the 50 ms patch rate; σ is timeline noise).
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

        // Gated diagnostic (ATLAS_DEBUG_INTERP=1): proves the interpolator is actively
        // sampling — logs buffer count and, for one entity, raw-newest vs interpolated pose.
        private void DebugTick(double delta, long now, long delayedCursor)
        {
            _debugAccum += delta;
            if (_debugAccum < 1.0)
                return;
            _debugAccum = 0.0;

            // Surface the entity whose interpolated pose differs MOST from the raw newest
            // sample — that is the strongest proof the interpolator is actively smoothing a
            // moving remote entity at the 100 ms-delayed cursor, not just snapping to state.
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

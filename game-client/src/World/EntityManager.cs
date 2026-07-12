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

        private string _ownPlayerId = "";
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

        public void SetOwnPlayer(string id) => _ownPlayerId = id;

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
            _ownPlayerId = "";
        }

        public override void _Process(double delta)
        {
            long now = MonotonicClock.NowMs;
            long delayedCursor = now - SnapshotInterpolator.InterpolationDelayMs;
            long ownCursor = now - SnapshotInterpolator.OwnPlayerDelayMs;

            foreach (KeyValuePair<string, EntityView> kv in _views)
            {
                // Local player renders one patch in the past (interpolating, not
                // extrapolate-and-correct); everyone else at the full delayed cursor.
                long cursor = kv.Key == _ownPlayerId ? ownCursor : delayedCursor;
                if (_interp.TrySamplePose(kv.Key, cursor, out Vector3 pos, out float heading))
                    kv.Value.ApplyPose(pos, heading);
            }

            _interp.TickCleanup(now);

            if (_debugInterp)
                DebugTick(delta, now, delayedCursor);
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
                long cursor = isOwn ? now - SnapshotInterpolator.OwnPlayerDelayMs : delayedCursor;
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

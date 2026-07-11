using System.Collections.Generic;
using Godot;

namespace AtlasWorld.Client.Net
{
    /// <summary>
    /// The single source of every entity's RENDERED pose. 20 Hz server snapshots go in
    /// (one <see cref="PoseSample"/> per entity per applied patch); a smooth pose comes out
    /// at whatever frame rate the client renders (60/120 fps), sampled at a render cursor
    /// held <see cref="InterpolationDelayMs"/> in the past so there is almost always a newer
    /// snapshot to interpolate toward.
    ///
    /// <para>Owned by the <c>EntityManager</c>. Ingestion (<see cref="Push"/>) happens in the
    /// room's <c>OnStateChange</c> and rendering (<see cref="TrySamplePose"/>) in <c>_Process</c> —
    /// both on Godot's main thread (the dispatch pump), so this class is deliberately
    /// single-threaded and lock-free (no <c>ConcurrentQueue</c> is needed).</para>
    /// </summary>
    public sealed class SnapshotInterpolator
    {
        /// <summary>How far in the past remote entities are rendered — one 50 ms patch of slack, doubled.</summary>
        public const int InterpolationDelayMs = 100;

        /// <summary>Cap on velocity extrapolation past the newest sample before hold-freezing.</summary>
        public const int MaxExtrapolationMs = 250;

        /// <summary>Grace window a buffer survives after its entity despawns (absorbs a late patch).</summary>
        private const int RemoveLingerMs = 200;

        /// <summary>Samples older than the render window + this margin are pruned each cleanup pass.</summary>
        private const int PruneMarginMs = 200;

        private readonly Dictionary<string, SnapshotBuffer> _buffers = new();

        public int EntityCount => _buffers.Count;

        /// <summary>Ingest one entity's pose from the current snapshot (called per entity in OnStateChange).</summary>
        public void Push(string id, in PoseSample sample)
        {
            if (!_buffers.TryGetValue(id, out SnapshotBuffer? buffer))
            {
                buffer = new SnapshotBuffer();
                _buffers[id] = buffer;
            }
            buffer.Push(sample);
        }

        /// <summary>
        /// Schedule an entity's buffer for removal after a short linger, so a patch that
        /// arrives just after despawn cannot resurrect a freed view or NPE.
        /// </summary>
        public void RemoveEntity(string id)
        {
            if (_buffers.TryGetValue(id, out SnapshotBuffer? buffer))
                buffer.ScheduleRemoval(MonotonicClock.NowMs + RemoveLingerMs);
        }

        /// <summary>
        /// Resolve the rendered pose for <paramref name="id"/> at <paramref name="cursorMs"/>.
        /// The caller passes <c>now - InterpolationDelayMs</c> for remote entities and <c>now</c>
        /// for the local player (rendered at the newest snapshot to avoid input lag).
        /// </summary>
        public bool TrySamplePose(string id, long cursorMs, out Vector3 pos, out float heading)
        {
            if (_buffers.TryGetValue(id, out SnapshotBuffer? buffer))
                return buffer.TrySample(cursorMs, MaxExtrapolationMs, out pos, out heading);

            pos = Vector3.Zero;
            heading = 0f;
            return false;
        }

        /// <summary>Raw newest (un-interpolated) pose — used only by the debug readout.</summary>
        public bool TryGetNewestRaw(string id, out Vector3 pos)
        {
            if (_buffers.TryGetValue(id, out SnapshotBuffer? buffer) && buffer.Count > 0)
            {
                pos = buffer.Newest.Pos;
                return true;
            }
            pos = Vector3.Zero;
            return false;
        }

        /// <summary>
        /// Drop expired (despawned + lingered) buffers and prune stale samples. Call once
        /// per frame from <c>_Process</c> after sampling.
        /// </summary>
        public void TickCleanup(long nowMs)
        {
            long pruneCutoff = nowMs - InterpolationDelayMs - PruneMarginMs;

            List<string>? expired = null;
            foreach (KeyValuePair<string, SnapshotBuffer> kv in _buffers)
            {
                if (nowMs >= kv.Value.ExpireAt)
                {
                    (expired ??= new List<string>()).Add(kv.Key);
                    continue;
                }
                kv.Value.PruneOlderThan(pruneCutoff);
            }

            if (expired != null)
            {
                foreach (string id in expired)
                    _buffers.Remove(id);
            }
        }

        /// <summary>Drop all buffers — used on a fresh (re)connect alongside the entity-pool reset.</summary>
        public void Clear() => _buffers.Clear();
    }
}

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

        /// <summary>
        /// Own-player render delay: one patch, so the cursor sits BETWEEN samples
        /// (interpolating) instead of ahead of the newest (extrapolate-then-correct,
        /// which reads as 20 Hz jitter on the entity the player stares at). Half the
        /// remote delay keeps input feel snappy.
        /// </summary>
        public const int OwnPlayerDelayMs = 50;

        /// <summary>Cap on velocity extrapolation past the newest sample before hold-freezing.</summary>
        public const int MaxExtrapolationMs = 250;

        /// <summary>Grace window a buffer survives after its entity despawns (absorbs a late patch).</summary>
        private const int RemoveLingerMs = 200;

        /// <summary>Samples older than the render window + this margin are pruned each cleanup pass.</summary>
        private const int PruneMarginMs = 200;

        private readonly Dictionary<string, SnapshotBuffer> _buffers = new();

        // The interpolation TIME AXIS is tick-derived (even by construction), NOT the
        // snapshot arrival time: arrival stamps carry ±3–5 ms network/frame noise, which
        // measured as ±13% rendered-speed warble when used as the timeline directly.
        //
        // The timeline is built INCREMENTALLY: each snapshot is stamped once with
        // _timelineMs += Δtick × msPerTick and never restamped — so rate-estimate noise
        // only perturbs segment lengths (~1%), not the whole axis. (A first attempt used
        // absolute tick × msPerTick; that multiplies rate noise by the ever-growing tick
        // and measured WORSE than arrival time.)
        //
        // ms-per-tick is ESTIMATED from the stream (EMA of Δrecv/Δtick) instead of
        // hardcoded, because the server's tick cadence is a config detail that has already
        // drifted once: gameConfig.ts says 50 ms, but GameRoom's setSimulationInterval(cb)
        // omits the interval and gets Colyseus' ~16.6 ms default (≈3 ticks per patch).
        private double _msPerTick;
        private bool _hasRate;
        private const double RateEmaAlpha = 0.02;  // ~2.5 s time constant at 20 Hz

        private double _timelineMs;                // stamp for the CURRENT snapshot
        private long _lastTick = long.MinValue;    // last stamped snapshot tick
        private long _lastRecvMs;

        // Server-timeline ↔ client-clock offset ≈ timelineMs − RecvMs, EMA-smoothed so
        // arrival noise shrinks to sub-ms on the render cursor.
        private double _offsetMs;
        private bool _hasOffset;
        private const double OffsetEmaAlpha = 0.05; // ~1 s time constant at 20 Hz

        /// <summary>Estimated server ms/tick (debug readout only).</summary>
        public double MsPerTickEstimate => _msPerTick;

        public int EntityCount => _buffers.Count;

        /// <summary>Ingest one entity's pose from the current snapshot (called per entity in OnStateChange).</summary>
        public void Push(string id, in PoseSample sample)
        {
            // One timeline advance per snapshot (every entity in a patch shares tick+RecvMs).
            if (sample.Tick != _lastTick)
            {
                if (_lastTick != long.MinValue)
                {
                    long dTick = sample.Tick - _lastTick;
                    double inst = (sample.RecvMs - _lastRecvMs) / (double)dTick;
                    if (inst > 1.0 && inst < 1000.0) // sanity: skip pauses/hiccups
                    {
                        _msPerTick = _hasRate ? _msPerTick + RateEmaAlpha * (inst - _msPerTick) : inst;
                        _hasRate = true;
                    }
                    _timelineMs += dTick * _msPerTick; // stamp advances by ideal step
                }
                _lastTick = sample.Tick;
                _lastRecvMs = sample.RecvMs;

                double obs = _timelineMs - sample.RecvMs;
                _offsetMs = _hasOffset ? _offsetMs + OffsetEmaAlpha * (obs - _offsetMs) : obs;
                _hasOffset = true;
            }

            if (!_buffers.TryGetValue(id, out SnapshotBuffer? buffer))
            {
                buffer = new SnapshotBuffer();
                _buffers[id] = buffer;
            }
            buffer.Push(sample, (long)System.Math.Round(_timelineMs));
        }

        /// <summary>
        /// Map a client-clock time to a render cursor on the SERVER timeline, delayed by
        /// <paramref name="delayMs"/>. Before the first snapshot there is no mapping yet —
        /// callers still get a defined pose (buffers hold their single/oldest sample).
        /// </summary>
        public long ToCursor(long nowMs, int delayMs) =>
            _hasOffset ? nowMs + (long)System.Math.Round(_offsetMs) - delayMs : 0L;

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
        /// Resolve the rendered pose for <paramref name="id"/> at <paramref name="cursorMs"/>
        /// (SERVER-timeline ms — callers derive it via <see cref="ToCursor"/>).
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
            if (!_hasOffset)
                return; // no timeline mapping yet → nothing sensible to prune

            long pruneCutoff = ToCursor(nowMs, InterpolationDelayMs) - PruneMarginMs;

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
        public void Clear()
        {
            _buffers.Clear();
            // A new room restarts tick from its own base — the old mapping is meaningless.
            // (The rate estimate survives: same server, same cadence.)
            _hasOffset = false;
            _lastTick = long.MinValue;
            _timelineMs = 0;
        }
    }
}

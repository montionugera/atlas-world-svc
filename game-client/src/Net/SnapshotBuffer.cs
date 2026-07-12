using Godot;

namespace AtlasWorld.Client.Net
{
    /// <summary>
    /// Fixed-size ring of <see cref="PoseSample"/>s for ONE entity, ordered oldest→newest,
    /// each stamped with its SERVER-TIMELINE time (computed once by the interpolator at
    /// push; see <see cref="SnapshotInterpolator"/> for why the timeline is tick-derived
    /// rather than arrival-derived).
    ///
    /// <para>At the server's 20 Hz (~50 ms/patch) a 16-slot ring holds ~800 ms of history —
    /// far more than the render delay needs, with headroom for jitter. <see cref="Push"/>
    /// drops any sample whose tick is not strictly newer than the last accepted one, so
    /// duplicate or out-of-order patches can never corrupt the timeline.</para>
    ///
    /// Single-threaded: only touched on Godot's main thread (dispatch pump + <c>_Process</c>).
    /// </summary>
    public sealed class SnapshotBuffer
    {
        public const int Capacity = 16;

        private struct Entry
        {
            public long TimeMs; // server-timeline stamp (stable; never recomputed)
            public PoseSample Sample;
        }

        private readonly Entry[] _ring = new Entry[Capacity];
        private int _head;  // index of the oldest sample
        private int _count;
        private long _lastTick = long.MinValue;

        /// <summary>
        /// Monotonic deadline (ms, CLIENT clock) after which cleanup drops this buffer;
        /// <see cref="long.MaxValue"/> means the entity is live. Set by
        /// <see cref="ScheduleRemoval"/>, cleared by a fresh push.
        /// </summary>
        public long ExpireAt { get; private set; } = long.MaxValue;

        public int Count => _count;

        /// <summary>Append a sample at timeline time <paramref name="timeMs"/>, dropping stale ticks.</summary>
        public bool Push(in PoseSample sample, long timeMs)
        {
            if (sample.Tick <= _lastTick)
                return false;

            _lastTick = sample.Tick;
            ExpireAt = long.MaxValue; // a live sample cancels any pending removal (id reuse)

            var entry = new Entry { TimeMs = timeMs, Sample = sample };
            if (_count < Capacity)
            {
                _ring[(_head + _count) % Capacity] = entry;
                _count++;
            }
            else
            {
                // Full ring: overwrite the oldest and advance the window.
                _ring[_head] = entry;
                _head = (_head + 1) % Capacity;
            }
            return true;
        }

        /// <summary>Mark the buffer for removal at <paramref name="deadlineMs"/> (linger tolerance).</summary>
        public void ScheduleRemoval(long deadlineMs) => ExpireAt = deadlineMs;

        /// <summary>Drop leading samples older than <paramref name="cutoffMs"/> (server timeline), always keeping ≥1.</summary>
        public void PruneOlderThan(long cutoffMs)
        {
            while (_count > 1 && At(0).TimeMs < cutoffMs)
            {
                _head = (_head + 1) % Capacity;
                _count--;
            }
        }

        /// <summary>Newest accepted pose (raw, un-interpolated). Valid only when <see cref="Count"/> &gt; 0.</summary>
        public PoseSample Newest => At(_count - 1).Sample;

        private Entry At(int i) => _ring[(_head + i) % Capacity];

        /// <summary>
        /// Resolve the rendered pose at <paramref name="cursorMs"/> (SERVER-timeline ms):
        /// interpolate between the two bracketing samples; hold the oldest if the cursor is
        /// behind the buffer; extrapolate along velocity (capped at <paramref name="maxExtrapolationMs"/>)
        /// then hold-freeze if the cursor is past the newest sample.
        /// </summary>
        public bool TrySample(long cursorMs, int maxExtrapolationMs, out Vector3 pos, out float heading)
        {
            if (_count == 0)
            {
                pos = Vector3.Zero;
                heading = 0f;
                return false;
            }

            if (_count == 1)
            {
                Entry only = At(0);
                pos = only.Sample.Pos;
                heading = only.Sample.Heading;
                return true;
            }

            Entry oldest = At(0);
            Entry newest = At(_count - 1);

            // Cursor behind the buffer (we drifted late) → hold at the oldest known pose.
            if (cursorMs <= oldest.TimeMs)
            {
                pos = oldest.Sample.Pos;
                heading = oldest.Sample.Heading;
                return true;
            }

            // Cursor past the newest sample → extrapolate briefly, then hold-freeze at the cap.
            if (cursorMs >= newest.TimeMs)
            {
                long dt = cursorMs - newest.TimeMs;
                if (dt > maxExtrapolationMs)
                    dt = maxExtrapolationMs;
                float sec = dt / 1000f;
                pos = newest.Sample.Pos + newest.Sample.Vel * sec;
                heading = newest.Sample.Heading;
                return true;
            }

            // Common case: find the [a, b] pair straddling the cursor and lerp.
            for (int i = 0; i < _count - 1; i++)
            {
                Entry a = At(i);
                Entry b = At(i + 1);
                if (cursorMs >= a.TimeMs && cursorMs <= b.TimeMs)
                {
                    float span = b.TimeMs - a.TimeMs;
                    float t = span > 0f ? (cursorMs - a.TimeMs) / span : 0f;
                    pos = a.Sample.Pos.Lerp(b.Sample.Pos, t);
                    heading = Mathf.LerpAngle(a.Sample.Heading, b.Sample.Heading, t); // shortest arc
                    return true;
                }
            }

            // Unreachable given the guards above, but stay defined.
            pos = newest.Sample.Pos;
            heading = newest.Sample.Heading;
            return true;
        }
    }
}

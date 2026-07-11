using Godot;

namespace AtlasWorld.Client.Net
{
    /// <summary>
    /// Fixed-size ring of <see cref="PoseSample"/>s for ONE entity, ordered oldest→newest.
    ///
    /// <para>At the server's 20 Hz (~50 ms/patch) a 16-slot ring holds ~800 ms of history —
    /// far more than the 100 ms render delay needs, with headroom for jitter. <see cref="Push"/>
    /// drops any sample whose tick is not strictly newer than the last accepted one, so
    /// duplicate or out-of-order patches can never corrupt the timeline.</para>
    ///
    /// Single-threaded: only touched on Godot's main thread (dispatch pump + <c>_Process</c>).
    /// </summary>
    public sealed class SnapshotBuffer
    {
        public const int Capacity = 16;

        private readonly PoseSample[] _ring = new PoseSample[Capacity];
        private int _head;  // index of the oldest sample
        private int _count;
        private long _lastTick = long.MinValue;

        /// <summary>
        /// Monotonic deadline (ms) after which cleanup drops this buffer; <see cref="long.MaxValue"/>
        /// means the entity is live. Set by <see cref="ScheduleRemoval"/>, cleared by a fresh push.
        /// </summary>
        public long ExpireAt { get; private set; } = long.MaxValue;

        public int Count => _count;

        /// <summary>Append a sample, dropping it if its tick is stale (dedup / reorder guard).</summary>
        public bool Push(in PoseSample sample)
        {
            if (sample.Tick <= _lastTick)
                return false;

            _lastTick = sample.Tick;
            ExpireAt = long.MaxValue; // a live sample cancels any pending removal (id reuse)

            if (_count < Capacity)
            {
                _ring[(_head + _count) % Capacity] = sample;
                _count++;
            }
            else
            {
                // Full ring: overwrite the oldest and advance the window.
                _ring[_head] = sample;
                _head = (_head + 1) % Capacity;
            }
            return true;
        }

        /// <summary>Mark the buffer for removal at <paramref name="deadlineMs"/> (linger tolerance).</summary>
        public void ScheduleRemoval(long deadlineMs) => ExpireAt = deadlineMs;

        /// <summary>Drop leading samples older than <paramref name="cutoffMs"/>, always keeping ≥1.</summary>
        public void PruneOlderThan(long cutoffMs)
        {
            while (_count > 1 && At(0).RecvMs < cutoffMs)
            {
                _head = (_head + 1) % Capacity;
                _count--;
            }
        }

        /// <summary>Newest accepted pose (raw, un-interpolated). Valid only when <see cref="Count"/> &gt; 0.</summary>
        public PoseSample Newest => At(_count - 1);

        private PoseSample At(int i) => _ring[(_head + i) % Capacity];

        /// <summary>
        /// Resolve the rendered pose at <paramref name="cursorMs"/>:
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
                PoseSample only = At(0);
                pos = only.Pos;
                heading = only.Heading;
                return true;
            }

            PoseSample oldest = At(0);
            PoseSample newest = At(_count - 1);

            // Cursor behind the buffer (we drifted late) → hold at the oldest known pose.
            if (cursorMs <= oldest.RecvMs)
            {
                pos = oldest.Pos;
                heading = oldest.Heading;
                return true;
            }

            // Cursor past the newest sample → extrapolate briefly, then hold-freeze at the cap.
            if (cursorMs >= newest.RecvMs)
            {
                long dt = cursorMs - newest.RecvMs;
                if (dt > maxExtrapolationMs)
                    dt = maxExtrapolationMs;
                float sec = dt / 1000f;
                pos = newest.Pos + newest.Vel * sec;
                heading = newest.Heading;
                return true;
            }

            // Common case: find the [a, b] pair straddling the cursor and lerp.
            for (int i = 0; i < _count - 1; i++)
            {
                PoseSample a = At(i);
                PoseSample b = At(i + 1);
                if (cursorMs >= a.RecvMs && cursorMs <= b.RecvMs)
                {
                    float span = b.RecvMs - a.RecvMs;
                    float t = span > 0f ? (cursorMs - a.RecvMs) / span : 0f;
                    pos = a.Pos.Lerp(b.Pos, t);
                    heading = Mathf.LerpAngle(a.Heading, b.Heading, t); // shortest arc
                    return true;
                }
            }

            // Unreachable given the guards above, but stay defined.
            pos = newest.Pos;
            heading = newest.Heading;
            return true;
        }
    }
}

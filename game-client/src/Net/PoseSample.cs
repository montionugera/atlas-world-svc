using Godot;

namespace AtlasWorld.Client.Net
{
    /// <summary>
    /// One entity's authoritative pose from a single server snapshot, stamped with the
    /// client's monotonic arrival time. The interpolator brackets two of these to derive
    /// the rendered pose at an arbitrary render cursor.
    ///
    /// <para><see cref="Pos"/> is already in Godot 3D world space (ground height baked in
    /// at ingestion) so no per-frame Y lookup is needed. <see cref="Vel"/> is world units
    /// per second (server <c>vx</c>/<c>vy</c>), used ONLY to extrapolate briefly past the
    /// newest sample. <see cref="Heading"/> is radians in the server XY plane.</para>
    /// </summary>
    public readonly struct PoseSample
    {
        /// <summary>Server <c>state.tick</c> at ingestion — a dedup / ordering id only.</summary>
        public readonly long Tick;

        /// <summary>Client monotonic time (ms) when this snapshot was applied.</summary>
        public readonly long RecvMs;

        /// <summary>3D world-space position (ground height already baked in).</summary>
        public readonly Vector3 Pos;

        /// <summary>Facing angle in radians (server heading / object angle).</summary>
        public readonly float Heading;

        /// <summary>World units/second; zeroed for a dead entity so we never overshoot a stop.</summary>
        public readonly Vector3 Vel;

        public PoseSample(long tick, long recvMs, Vector3 pos, float heading, Vector3 vel)
        {
            Tick = tick;
            RecvMs = recvMs;
            Pos = pos;
            Heading = heading;
            Vel = vel;
        }
    }
}

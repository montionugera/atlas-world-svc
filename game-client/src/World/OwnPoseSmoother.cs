using Godot;
using AtlasWorld.Client.Net;

namespace AtlasWorld.Client.World
{
    /// <summary>
    /// Dead-reckoning renderer for the OWN player: every frame the rendered position
    /// advances by the server's authoritative velocity, and the residual error against
    /// the latest server pose is folded in as a small velocity correction — so the
    /// server's truth is reached smoothly, never by resampling or snapping.
    ///
    /// <para>This replaces cursor interpolation for the local player only. Interpolation
    /// renders in the past (adds input latency) and re-derives the pose from samples
    /// each frame (segment boundaries read as micro-jiggle on long runs). Continuous
    /// integration + proportional correction has zero added latency and C¹-continuous
    /// motion. Remote entities keep interpolation — their inputs are unknown, so
    /// rendering slightly in the past is the right trade for them.</para>
    /// </summary>
    public sealed class OwnPoseSmoother
    {
        /// <summary>Error beyond this is a teleport (respawn/debug) — snap, don't steer.</summary>
        private const float SnapDistance = 8f;

        /// <summary>Fraction of the position error converted to velocity, per second (e-fold ≈ 1/gain).</summary>
        private const float CorrectionGain = 8f;

        /// <summary>Cap extrapolation of the correction target past the newest sample.</summary>
        private const float MaxTargetAgeSec = 0.25f;

        private Vector3 _pos;
        private float _heading;
        private bool _init;

        /// <summary>Forget state (reconnect / entity reset) — next step snaps to the target.</summary>
        public void Reset() => _init = false;

        /// <summary>
        /// Advance one frame. <paramref name="ageSec"/> is how old the newest sample is on
        /// the render clock (used to project the correction target forward along velocity).
        /// </summary>
        public (Vector3 Pos, float Heading) Step(in PoseSample newest, float ageSec, float dt)
        {
            Vector3 target = newest.Pos + newest.Vel * Mathf.Min(ageSec, MaxTargetAgeSec);

            if (!_init || _pos.DistanceTo(target) > SnapDistance)
            {
                _pos = target;
                _heading = newest.Heading;
                _init = true;
                return (_pos, _heading);
            }

            // Server velocity carries the motion; the error term gently steers onto truth.
            Vector3 vel = newest.Vel + (target - _pos) * CorrectionGain;
            _pos += vel * dt;
            _heading = Mathf.LerpAngle(_heading, newest.Heading, 1f - Mathf.Exp(-12f * dt));
            return (_pos, _heading);
        }
    }
}

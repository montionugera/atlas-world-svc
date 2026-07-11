using System.Diagnostics;

namespace AtlasWorld.Client.Net
{
    /// <summary>
    /// Single monotonic time source for snapshot interpolation, in milliseconds.
    ///
    /// This is the ONE clock that both the ingestion path (stamping a patch's arrival
    /// time in <c>OnStateChange</c>) and the render path (computing the delayed render
    /// cursor in <c>_Process</c>) read — so "when did this snapshot arrive" and "what
    /// time are we rendering" are measured on the same ruler.
    ///
    /// It is deliberately NOT the server's <c>state.tick</c> (that is only a dedup/order
    /// id) and NOT wall-clock <c>DateTime</c> (subject to NTP steps / DST). A process-wide
    /// <see cref="Stopwatch"/> is monotonic and cheap. Everything runs on Godot's main
    /// thread (the dispatch pump), so no synchronization is needed.
    /// </summary>
    public static class MonotonicClock
    {
        private static readonly Stopwatch Watch = Stopwatch.StartNew();

        /// <summary>Milliseconds since process start; strictly non-decreasing.</summary>
        public static long NowMs => Watch.ElapsedMilliseconds;
    }
}

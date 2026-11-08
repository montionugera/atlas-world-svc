using Godot;

namespace AtlasWorld.Client
{
    /// <summary>F-191: the one wheel-zoom setting shared by the game scene and the playtest sandbox.</summary>
    public static class CameraZoom
    {
        public const float MinDistance = 0.35f;
        public const float MaxDistance = 30.0f;

        /// <summary>One wheel notch (dir -1 in, +1 out); step is 14% of the distance (min 0.08 m) so both ends feel alike.</summary>
        public static float Zoomed(float current, int dir) =>
            Mathf.Clamp(current + dir * Mathf.Max(0.08f, current * 0.14f), MinDistance, MaxDistance);
    }
}

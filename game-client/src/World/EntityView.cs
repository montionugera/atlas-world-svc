using Godot;
using AtlasWorld.Contracts;

namespace AtlasWorld.Client.World
{
    /// <summary>
    /// A single rendered entity. Its VISUALS are a pure function of the synced schema
    /// fields — team → tint, hp → bar, isAlive → death. Its POSE (position + facing) is no
    /// longer read here: the <c>SnapshotInterpolator</c> is the single source of the
    /// rendered pose and drives it via <see cref="ApplyPose"/> every frame. This view
    /// never sends anything and never reads input; it only reflects server state.
    /// </summary>
    public sealed class EntityView
    {
        private readonly EntityVisualParts _parts;

        public Node3D Root => _parts.Root;

        /// <summary>False once the server reports the entity dead (life entities only).</summary>
        public bool Alive { get; private set; } = true;

        public EntityView(EntityKind kind)
        {
            _parts = EntityVisuals.CreateView(kind);
        }

        /// <summary>
        /// Drive the rendered pose from an interpolated snapshot sample. This is the ONLY
        /// path that writes position/rotation — called each frame by the EntityManager.
        /// </summary>
        public void ApplyPose(Vector3 pos, float headingRadians)
        {
            if (!IsInstanceValid(_parts.Root))
                return;
            _parts.Root.Position = pos;
            // heading is an angle in the server XY plane; rotate about world Y. Placeholder
            // primitives are radially symmetric, so exact facing is cosmetic today.
            _parts.Root.Rotation = new Vector3(0f, -headingRadians, 0f);
        }

        /// <summary>Apply a life entity's VISUAL state (Player / Mob / NPC) — no pose here.</summary>
        public void ApplyLife(WorldLife e)
        {
            Alive = e.isAlive;

            _parts.Material.AlbedoColor = TeamTint(e.teamId, _parts.Material.AlbedoColor);

            if (_parts.HpBar != null)
            {
                float frac = e.maxHealth > 0f ? Mathf.Clamp(e.currentHealth / e.maxHealth, 0f, 1f) : 0f;
                var s = _parts.HpBar.Scale;
                _parts.HpBar.Scale = new Vector3(Mathf.Max(0.001f, frac), s.Y, s.Z);
                if (_parts.HpBarMaterial != null)
                {
                    // green → red as hp drops.
                    _parts.HpBarMaterial.AlbedoColor = new Color(1f - frac, frac, 0.2f);
                }
                _parts.HpBar.Visible = Alive;
            }

            if (!Alive)
                _parts.Body.Visible = false; // simple death; EntityManager frees the view
        }

        private static bool IsInstanceValid(GodotObject o) => GodotObject.IsInstanceValid(o);

        private static Color TeamTint(string teamId, Color fallback) => teamId switch
        {
            "player" or "players" or "allies" => new Color(0.3f, 0.6f, 1f),
            "enemy" or "enemies" or "mobs" or "monster" => new Color(1f, 0.4f, 0.3f),
            "npc" or "neutral" => new Color(0.4f, 1f, 0.5f),
            _ => fallback,
        };
    }
}

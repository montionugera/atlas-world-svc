using Godot;
using AtlasWorld.Contracts;

namespace AtlasWorld.Client.World
{
    /// <summary>
    /// A single rendered entity. Its visuals are a PURE FUNCTION of the synced schema
    /// fields — team → tint, hp → bar, isAlive → death, heading/angle → Y-rotation,
    /// position → interpolation target. It never sends anything and never reads input;
    /// it only reflects authoritative server state.
    /// </summary>
    public sealed class EntityView
    {
        private readonly EntityVisualParts _parts;
        private readonly float _groundHeight;

        public Node3D Root => _parts.Root;
        public Vector3 TargetPosition { get; private set; }

        /// <summary>False once the server reports the entity dead (life entities only).</summary>
        public bool Alive { get; private set; } = true;

        private const float LerpRate = 12f; // frame-rate independent smoothing

        public EntityView(EntityKind kind)
        {
            _parts = EntityVisuals.CreateView(kind);
            _groundHeight = EntityVisuals.GroundHeight(kind);
        }

        /// <summary>Apply a life entity (Player / Mob / NPC).</summary>
        public void ApplyLife(WorldLife e)
        {
            SetTargetFromPosition(e.x, e.y);
            SetHeading(e.heading);
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

        /// <summary>Apply a non-life object (Projectile / ZoneEffect).</summary>
        public void ApplyObject(WorldObject e)
        {
            SetTargetFromPosition(e.x, e.y);
            SetHeading(e.angle);
        }

        /// <summary>Frame-rate independent lerp toward the latest server position.</summary>
        public void Tick(float delta)
        {
            if (!IsInstanceValid(_parts.Root))
                return;
            float t = 1f - Mathf.Exp(-LerpRate * delta);
            _parts.Root.Position = _parts.Root.Position.Lerp(TargetPosition, t);
        }

        public void SnapToTarget()
        {
            if (IsInstanceValid(_parts.Root))
                _parts.Root.Position = TargetPosition;
        }

        private void SetTargetFromPosition(float x, float y)
        {
            // Server ships a 2D position (x, y) in world units → 3D (x, height, y).
            TargetPosition = new Vector3(x, _groundHeight, y);
        }

        private void SetHeading(float headingRadians)
        {
            // heading is an angle in the server's XY plane; rotate about world Y.
            // Placeholder primitives are radially symmetric, so exact facing is cosmetic.
            if (IsInstanceValid(_parts.Root))
                _parts.Root.Rotation = new Vector3(0f, -headingRadians, 0f);
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

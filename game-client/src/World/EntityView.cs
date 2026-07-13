using System.Collections.Generic;
using Godot;
using AtlasWorld.Contracts;
using AtlasWorld.Client.Content;

namespace AtlasWorld.Client.World
{
    /// <summary>
    /// A single rendered entity. Its VISUAL NODE now comes from the <see cref="AssetRegistry"/>
    /// (bespoke → seed → procedural capsule) resolved from the entity's server type id, instead
    /// of a hardcoded primitive — but the capsule tier reuses the same <see cref="EntityVisuals"/>
    /// primitive, so an empty manifest still renders exactly what the client always rendered.
    ///
    /// Its life VISUALS are a pure function of the synced schema fields — team → tint, hp → bar,
    /// isAlive → death — applied by rediscovering the capsule tier's named <c>Body</c>/<c>HpBar</c>
    /// nodes (best-effort on bespoke/seed scenes that lack them). Its POSE (position + facing) is
    /// unchanged: the <c>SnapshotInterpolator</c> remains the single source of the rendered pose
    /// and drives it via <see cref="ApplyPose"/>. This view never sends anything and never reads
    /// input; it only reflects server state.
    /// </summary>
    public sealed class EntityView
    {
        private readonly Node3D _root;
        private readonly MeshInstance3D? _body;
        private readonly StandardMaterial3D? _material;
        private readonly MeshInstance3D? _hpBar;
        private readonly StandardMaterial3D? _hpBarMaterial;
        private readonly AnimationController _animController;

        /// <summary>Cached from the most recent <see cref="ApplyLife"/> — animation reads it every frame.</summary>
        private bool _isAttacking;

        public Node3D Root => _root;

        /// <summary>False once the server reports the entity dead (life entities only).</summary>
        public bool Alive { get; private set; } = true;

        /// <param name="kind">Broad primitive class, used for the capsule fallback + ground height.</param>
        /// <param name="typeId">
        /// The specific registry key (<c>mob:&lt;type&gt;</c>, <c>projectile:&lt;type&gt;</c>,
        /// <c>player</c>, <c>npc</c>, <c>zone:&lt;type&gt;</c>) resolved to a visual scene.
        /// </param>
        public EntityView(EntityKind kind, string typeId)
        {
            _root = BuildVisualRoot(kind, typeId);

            // Same seam as the visual node itself: ask the registry for any per-entry clip
            // overrides for this type id. Null/empty when there is no manifest entry (or no
            // "anims" object on it) — the controller then just uses the shared Kenney default.
            IReadOnlyDictionary<string, string>? animOverrides = AssetRegistry.Instance?.ResolveAnimOverrides(typeId);
            _animController = new AnimationController(_root, animOverrides);

            // Rediscover the mutable capsule-tier parts by name. They exist on the procedural
            // capsule (player/npc/mob carry an HpBar); bespoke/seed scenes may omit them, in
            // which case life visuals become a safe no-op. Materials are DUPLICATED so tinting
            // one entity never bleeds into siblings that instanced the same cached PackedScene.
            _body = _root.GetNodeOrNull<MeshInstance3D>("Body");
            if (_body?.MaterialOverride is StandardMaterial3D bodyMat)
            {
                _material = (StandardMaterial3D)bodyMat.Duplicate();
                _body.MaterialOverride = _material;
            }

            _hpBar = _root.GetNodeOrNull<MeshInstance3D>("HpBar");
            if (_hpBar?.MaterialOverride is StandardMaterial3D hpMat)
            {
                _hpBarMaterial = (StandardMaterial3D)hpMat.Duplicate();
                _hpBar.MaterialOverride = _hpBarMaterial;
            }
        }

        /// <summary>
        /// The ONLY seam that chooses the visual node: ask the <see cref="AssetRegistry"/>
        /// autoload to resolve the type id, then instance the returned scene. If the autoload
        /// is not present (an isolated context with no scene tree), fall back to the same
        /// procedural primitive directly so the view is never null and never throws.
        /// </summary>
        private static Node3D BuildVisualRoot(EntityKind kind, string typeId)
        {
            AssetRegistry? registry = AssetRegistry.Instance;
            if (registry != null)
            {
                PackedScene scene = registry.Resolve(typeId, out _);
                if (scene.Instantiate() is Node3D node)
                    return node;
            }

            // No autoload, or a scene whose root is not a Node3D → procedural primitive.
            return EntityVisuals.CreateView(kind).Root;
        }

        /// <summary>
        /// Drive the rendered pose from an interpolated snapshot sample. This is the ONLY
        /// path that writes position/rotation — called each frame by the EntityManager.
        /// </summary>
        public void ApplyPose(Vector3 pos, float headingRadians)
        {
            if (!IsInstanceValid(_root))
                return;
            _root.Position = pos;
            // heading is an angle in the server XY plane; rotate about world Y. Placeholder
            // primitives are radially symmetric, so exact facing is cosmetic today.
            _root.Rotation = new Vector3(0f, -headingRadians, 0f);
        }

        /// <summary>
        /// Drive this frame's animation from the entity's velocity. Alive/attacking state is
        /// read from the cache kept up to date by <see cref="ApplyLife"/> — this method only
        /// needs the per-frame velocity, which lives with pose (interpolator), not life.
        /// </summary>
        public void UpdateAnimation(Vector3 velocity) => _animController.Update(Alive, velocity, _isAttacking);

        /// <summary>Apply a life entity's VISUAL state (Player / Mob / NPC) — no pose here.</summary>
        public void ApplyLife(WorldLife e)
        {
            Alive = e.isAlive;
            _isAttacking = e.isAttacking;

            if (_material != null)
                _material.AlbedoColor = TeamTint(e.teamId, _material.AlbedoColor);

            if (_hpBar != null)
            {
                float frac = e.maxHealth > 0f ? Mathf.Clamp(e.currentHealth / e.maxHealth, 0f, 1f) : 0f;
                var s = _hpBar.Scale;
                _hpBar.Scale = new Vector3(Mathf.Max(0.001f, frac), s.Y, s.Z);
                if (_hpBarMaterial != null)
                {
                    // green → red as hp drops.
                    _hpBarMaterial.AlbedoColor = new Color(1f - frac, frac, 0.2f);
                }
                _hpBar.Visible = Alive;
            }

            if (!Alive && _body != null)
                _body.Visible = false; // simple death; EntityManager frees the view
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

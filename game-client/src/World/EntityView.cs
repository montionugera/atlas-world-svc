using System.Collections.Generic;
using Godot;
using AtlasWorld.Contracts;
using AtlasWorld.Client.Content;
using AtlasWorld.Client.Audio;

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
    /// nodes (or overhead 3D billboard bars on real glTF character models). Its POSE (position + facing) is
    /// unchanged: the <c>SnapshotInterpolator</c> remains the single source of the rendered pose
    /// and drives it via <see cref="ApplyPose"/>. This view never sends anything and never reads
    /// input; it only reflects server state.
    /// </summary>
    public sealed class EntityView
    {
        private readonly EntityKind _kind;
        private readonly string _typeId;
        private readonly Node3D _root;
        private readonly MeshInstance3D? _body;
        private readonly StandardMaterial3D? _material;
        private readonly MeshInstance3D? _hpBar;
        private readonly MeshInstance3D? _hpBarBg;
        private readonly StandardMaterial3D? _hpBarMaterial;
        private readonly Label3D? _nameLabel;
        private readonly AnimationController _animController;

        /// <summary>Cached from the most recent <see cref="ApplyLife"/> — animation reads it every frame.</summary>
        private bool _isAttacking;

        /// <summary>
        /// Combat SFX PoC: last-seen HP, used ONLY to detect a "hit" edge (a decrease)
        /// in <see cref="ApplyLife"/> — attack/death reuse <see cref="AnimationController"/>'s
        /// existing state-change edge, but nothing already tracks HP deltas, so this is
        /// the one small edge this PoC adds. -1 sentinel = "no baseline yet" (spawn),
        /// so the very first snapshot never falsely reads as a hit.
        /// </summary>
        private float _lastHealth = -1f;
        private float _maxHealth = 100f;
        private bool _isSelectedTarget = false;

        public Node3D Root => _root;
        public EntityKind Kind => _kind;
        public string TypeId => _typeId;
        public float CurrentHealth => _lastHealth < 0f ? _maxHealth : _lastHealth;
        public float MaxHealth => _maxHealth;
        public string DisplayName { get; private set; } = "";
        public string RawMobType { get; set; } = "";
        public uint WireId { get; set; }

        /// <summary>False once the server reports the entity dead (life entities only).</summary>
        public bool Alive { get; private set; } = true;

        /// <param name="kind">Broad primitive class, used for the capsule fallback + ground height.</param>
        /// <param name="typeId">
        /// The specific registry key (<c>mob:&lt;type&gt;</c>, <c>projectile:&lt;type&gt;</c>,
        /// <c>player</c>, <c>npc</c>, <c>zone:&lt;type&gt;</c>) resolved to a visual scene.
        /// </param>
        public EntityView(EntityKind kind, string typeId)
        {
            _kind = kind;
            _typeId = typeId;
            _root = BuildVisualRoot(kind, typeId);

            // Same seam as the visual node itself: ask the registry for any per-entry clip
            // overrides for this type id. Null/empty when there is no manifest entry (or no
            // "anims" object on it) — the controller then just uses the shared Kenney default.
            IReadOnlyDictionary<string, string>? animOverrides = AssetRegistry.Instance?.ResolveAnimOverrides(typeId);
            _animController = new AnimationController(_root, animOverrides);

            // Rediscover the mutable capsule-tier parts by name. They exist on the procedural
            // capsule (player/npc/mob carry an HpBar); bespoke/seed scenes may omit them, in
            // which case we attach a 3D billboard overhead HP bar + nameplate. Materials are
            // DUPLICATED so tinting one entity never bleeds into siblings.
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
            else if (_body == null && kind is EntityKind.Player or EntityKind.Mob or EntityKind.Npc)
            {
                // Apply Ragnarok Origin anime cel-shading + warm rim light to all glTF character meshes
                ApplyAnimeToonShading(_root, kind);

                // Grounding contact shadow disc beneath real 3D character models
                var shadowDisc = new MeshInstance3D
                {
                    Name = "DropShadow",
                    Mesh = new CylinderMesh
                    {
                        TopRadius = 0.48f,
                        BottomRadius = 0.48f,
                        Height = 0.02f,
                        RadialSegments = 16
                    },
                    Position = new Vector3(0f, 0.02f, 0f),
                    MaterialOverride = new StandardMaterial3D
                    {
                        Transparency = BaseMaterial3D.TransparencyEnum.Alpha,
                        ShadingMode = BaseMaterial3D.ShadingModeEnum.Unshaded,
                        AlbedoColor = new Color(0.06f, 0.12f, 0.08f, 0.36f)
                    }
                };
                _root.AddChild(shadowDisc);

                // Real 3D glTF character model: attach compact ROO-style overhead 3D billboard nameplate & slim HP bar
                _nameLabel = new Label3D
                {
                    Name = "OverheadNameplate",
                    Text = kind == EntityKind.Player ? "Adventurer" : EntityKeys.FormatMobDisplayName(typeId),
                    PixelSize = 0.0048f,
                    FontSize = 16,
                    OutlineSize = 4,
                    Modulate = kind == EntityKind.Player
                        ? new Color(0.62f, 0.92f, 1.0f, 0.92f)
                        : new Color(1.0f, 0.86f, 0.56f, 0.94f),
                    OutlineModulate = new Color(0.05f, 0.06f, 0.10f, 0.90f),
                    Billboard = BaseMaterial3D.BillboardModeEnum.Enabled,
                    Position = new Vector3(0f, 2.15f, 0f),
                    VisibilityRangeEnd = 13.5f,
                    VisibilityRangeEndMargin = 2.5f,
                    VisibilityRangeFadeMode = GeometryInstance3D.VisibilityRangeFadeModeEnum.Self
                };
                _root.AddChild(_nameLabel);

                _hpBarBg = new MeshInstance3D
                {
                    Name = "OverheadHpBg",
                    Mesh = new BoxMesh { Size = new Vector3(0.76f, 0.056f, 0.022f) },
                    Position = new Vector3(0f, 1.94f, 0f),
                    VisibilityRangeEnd = 13.5f,
                    VisibilityRangeEndMargin = 2.5f,
                    VisibilityRangeFadeMode = GeometryInstance3D.VisibilityRangeFadeModeEnum.Self,
                    MaterialOverride = new StandardMaterial3D
                    {
                        ShadingMode = BaseMaterial3D.ShadingModeEnum.Unshaded,
                        BillboardMode = BaseMaterial3D.BillboardModeEnum.Enabled,
                        BillboardKeepScale = true,
                        AlbedoColor = new Color(0.06f, 0.08f, 0.12f, 0.92f)
                    }
                };
                _root.AddChild(_hpBarBg);

                _hpBarMaterial = new StandardMaterial3D
                {
                    ShadingMode = BaseMaterial3D.ShadingModeEnum.Unshaded,
                    BillboardMode = BaseMaterial3D.BillboardModeEnum.Enabled,
                    BillboardKeepScale = true,
                    AlbedoColor = kind == EntityKind.Player
                        ? new Color(0.28f, 0.92f, 0.48f, 1f)
                        : new Color(0.95f, 0.26f, 0.24f, 1f)
                };
                _hpBar = new MeshInstance3D
                {
                    Name = "OverheadHpFill",
                    Mesh = new BoxMesh { Size = new Vector3(0.72f, 0.040f, 0.028f) },
                    Position = new Vector3(0f, 1.94f, 0.01f),
                    VisibilityRangeEnd = 13.5f,
                    VisibilityRangeEndMargin = 2.5f,
                    VisibilityRangeFadeMode = GeometryInstance3D.VisibilityRangeFadeModeEnum.Self,
                    MaterialOverride = _hpBarMaterial
                };
                _root.AddChild(_hpBar);

                UpdateOverheadBarVisibility();
            }
        }

        /// <summary>
        /// Upgrades imported glTF PBR materials to Ragnarok Origin's signature anime cel-shaded look:
        /// Toon diffuse ramp, toon specular highlight, warm sunlit rim light, and subtle dark silhouette outline.
        /// </summary>
        public static void ApplyAnimeToonShading(Node root, EntityKind kind = EntityKind.Player)
        {
            Shader? outlineShader = ResourceLoader.Exists("res://assets/shaders/outline.gdshader")
                ? GD.Load<Shader>("res://assets/shaders/outline.gdshader")
                : null;

            ApplyAnimeToonShadingRecursive(root, kind, outlineShader);
        }

        private static void ApplyAnimeToonShadingRecursive(Node node, EntityKind kind, Shader? outlineShader)
        {
            if (node is MeshInstance3D meshInst && meshInst.Mesh != null &&
                meshInst.Name != "DropShadow" && meshInst.Name != "OverheadHpBg" && meshInst.Name != "OverheadHpFill")
            {
                int surfaceCount = meshInst.Mesh.GetSurfaceCount();
                for (int i = 0; i < surfaceCount; i++)
                {
                    Material? existing = meshInst.GetSurfaceOverrideMaterial(i) ?? meshInst.Mesh.SurfaceGetMaterial(i);
                    if (existing is StandardMaterial3D stdMat)
                    {
                        var toonMat = (StandardMaterial3D)stdMat.Duplicate();
                        toonMat.DiffuseMode = BaseMaterial3D.DiffuseModeEnum.Toon;
                        toonMat.SpecularMode = BaseMaterial3D.SpecularModeEnum.Toon;
                        toonMat.Roughness = Mathf.Clamp(toonMat.Roughness * 0.65f, 0.25f, 0.55f);
                        toonMat.RimEnabled = true;
                        toonMat.Rim = 0.42f;
                        toonMat.RimTint = 0.35f;

                        // Warm anime bounce light so shadows never look muddy grey/black
                        toonMat.EmissionEnabled = true;
                        toonMat.Emission = kind == EntityKind.Mob
                            ? new Color(0.18f, 0.11f, 0.14f, 1f)
                            : new Color(0.16f, 0.15f, 0.18f, 1f);
                        toonMat.EmissionEnergyMultiplier = 0.32f;

                        if (outlineShader != null)
                        {
                            var outlineMat = new ShaderMaterial { Shader = outlineShader };
                            outlineMat.SetShaderParameter("outline_color", new Color(0.14f, 0.10f, 0.16f, 1.0f));
                            outlineMat.SetShaderParameter("outline_thickness", 0.0065f);
                            toonMat.NextPass = outlineMat;
                        }

                        meshInst.SetSurfaceOverrideMaterial(i, toonMat);
                    }
                }
            }

            foreach (Node child in node.GetChildren())
            {
                ApplyAnimeToonShadingRecursive(child, kind, outlineShader);
            }
        }

        public void SetDisplayName(string text, Color? color = null)
        {
            DisplayName = text;
            if (_nameLabel != null && IsInstanceValid(_nameLabel))
            {
                // Keep overhead labels concise like Ragnarok Origin (strip verbose bracket prefixes)
                string cleanText = text;
                if (cleanText.StartsWith("[Bot] "))
                    cleanText = cleanText.Substring(6);
                else if (cleanText.StartsWith("[MVP Boss] "))
                    cleanText = "♛ " + cleanText.Substring(11);
                else if (cleanText.StartsWith("[Elite Mob] "))
                    cleanText = cleanText.Substring(12);
                else if (cleanText.StartsWith("[Field Mob] "))
                    cleanText = cleanText.Substring(12);
                else if (cleanText.StartsWith("[Mob] "))
                    cleanText = cleanText.Substring(6);

                _nameLabel.Text = cleanText;
                if (color.HasValue)
                    _nameLabel.Modulate = color.Value;
            }
            UpdateOverheadBarVisibility();
        }

        public void SetSelectedTarget(bool selected)
        {
            if (_isSelectedTarget == selected)
                return;
            _isSelectedTarget = selected;
            UpdateOverheadBarVisibility();
        }

        private void UpdateOverheadBarVisibility()
        {
            if (_body != null)
                return; // Procedural capsule tier keeps its own simple bar behavior

            bool isDamaged = _lastHealth >= 0f && _maxHealth > 0f && _lastHealth < _maxHealth - 0.5f;
            bool isMvp = DisplayName.Contains("MVP");
            // Authentic Ragnarok Origin rule: only show 3D overhead HP bar if damaged, targeted, or MVP boss!
            bool showHpBar = Alive && (_isSelectedTarget || isDamaged || isMvp);

            if (_hpBar != null && IsInstanceValid(_hpBar))
                _hpBar.Visible = showHpBar;
            if (_hpBarBg != null && IsInstanceValid(_hpBarBg))
                _hpBarBg.Visible = showHpBar;
            if (_nameLabel != null && IsInstanceValid(_nameLabel))
            {
                _nameLabel.Visible = Alive;
                _nameLabel.Position = showHpBar
                    ? new Vector3(0f, 2.15f, 0f)
                    : new Vector3(0f, 1.98f, 0f);
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
            // heading is an angle in the server XY plane; rotate about world Y.
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
            ApplyLifeState(e.isAlive, e.currentHealth, e.maxHealth, e.isAttacking, e.teamId);
        }

        /// <summary>
        /// Direct primitive life-state update used by both Colyseus (<see cref="ApplyLife"/>)
        /// and zero-allocation FlatBuffers <c>server-rs</c> entity deltas.
        /// </summary>
        public void ApplyLifeState(bool isAlive, float currentHealth, float maxHealth, bool isAttacking, string teamId = "")
        {
            Alive = isAlive;
            _isAttacking = isAttacking;
            if (maxHealth > 0f)
                _maxHealth = maxHealth;

            // "hit" edge: HP dropped since the last life update (and the entity was, and
            // still is, alive — death already plays its own sfx via AnimationController).
            if (_lastHealth >= 0f && isAlive && currentHealth < _lastHealth &&
                IsInstanceValid(_root))
            {
                AudioRegistry.Instance?.Play("sfx:hit", _root.GlobalPosition);
            }
            _lastHealth = currentHealth;

            if (_material != null && !string.IsNullOrEmpty(teamId))
                _material.AlbedoColor = TeamTint(teamId, _material.AlbedoColor);

            if (_hpBar != null && IsInstanceValid(_hpBar))
            {
                float frac = maxHealth > 0f ? Mathf.Clamp(currentHealth / maxHealth, 0f, 1f) : 0f;
                var s = _hpBar.Scale;
                _hpBar.Scale = new Vector3(Mathf.Max(0.001f, frac), s.Y, s.Z);
                if (_hpBarMaterial != null && _body != null)
                {
                    // green → red as hp drops on procedural capsules
                    _hpBarMaterial.AlbedoColor = new Color(1f - frac, frac, 0.2f);
                    _hpBar.Visible = Alive;
                }
            }

            UpdateOverheadBarVisibility();

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

using Godot;

namespace AtlasWorld.Client.World
{
    public enum EntityKind
    {
        Player,
        Npc,
        Mob,
        Projectile,
        ZoneEffect,
    }

    /// <summary>
    /// The single art-pipeline swap seam. <see cref="CreateView"/> builds the visual
    /// node tree for an entity kind out of placeholder primitives today; swapping in
    /// real 3D models / rigs later is a change confined to this file. Nothing else in
    /// the client constructs meshes.
    /// </summary>
    public static class EntityVisuals
    {
        /// <summary>Body half-height so the primitive sits on the ground plane.</summary>
        public static float GroundHeight(EntityKind kind) => kind switch
        {
            EntityKind.Mob => 0.5f,
            EntityKind.Projectile => 0.25f,
            EntityKind.ZoneEffect => 0.05f,
            _ => 1f, // player / npc capsule half-height
        };

        public static EntityVisualParts CreateView(EntityKind kind)
        {
            var root = new Node3D();
            var body = new MeshInstance3D();
            var mat = new StandardMaterial3D();

            switch (kind)
            {
                case EntityKind.Mob:
                    body.Mesh = new BoxMesh { Size = new Vector3(1f, 1f, 1f) };
                    mat.AlbedoColor = new Color(1f, 0.4f, 0.3f); // red-orange foe
                    break;
                case EntityKind.Npc:
                    body.Mesh = new CapsuleMesh { Radius = 0.5f, Height = 2f };
                    mat.AlbedoColor = new Color(0.4f, 1f, 0.5f); // green ally
                    break;
                case EntityKind.Projectile:
                    body.Mesh = new BoxMesh { Size = new Vector3(0.4f, 0.4f, 0.4f) };
                    mat.AlbedoColor = new Color(1f, 0.9f, 0.3f); // yellow projectile
                    break;
                case EntityKind.ZoneEffect:
                    body.Mesh = new CylinderMesh
                    {
                        TopRadius = 1f,
                        BottomRadius = 1f,
                        Height = 0.1f,
                    };
                    mat.AlbedoColor = new Color(0.6f, 0.4f, 1f, 0.45f); // translucent purple aoe
                    mat.Transparency = BaseMaterial3D.TransparencyEnum.Alpha;
                    break;
                default: // Player
                    body.Mesh = new CapsuleMesh { Radius = 0.5f, Height = 2f };
                    mat.AlbedoColor = new Color(0.3f, 0.6f, 1f); // blue player
                    break;
            }

            body.MaterialOverride = mat;
            root.AddChild(body);

            var parts = new EntityVisualParts
            {
                Root = root,
                Body = body,
                Material = mat,
                Kind = kind,
            };

            // Health bar only for life entities (player/npc/mob).
            if (kind is EntityKind.Player or EntityKind.Npc or EntityKind.Mob)
            {
                var barMat = new StandardMaterial3D
                {
                    AlbedoColor = new Color(0.2f, 1f, 0.3f),
                    ShadingMode = BaseMaterial3D.ShadingModeEnum.Unshaded,
                };
                var bar = new MeshInstance3D
                {
                    Mesh = new BoxMesh { Size = new Vector3(1f, 0.12f, 0.08f) },
                    MaterialOverride = barMat,
                    Position = new Vector3(0f, GroundHeight(kind) + 1.4f, 0f),
                };
                root.AddChild(bar);
                parts.HpBar = bar;
                parts.HpBarMaterial = barMat;
            }

            return parts;
        }
    }

    /// <summary>References into the visual tree that <see cref="EntityView"/> mutates.</summary>
    public sealed class EntityVisualParts
    {
        public Node3D Root = null!;
        public MeshInstance3D Body = null!;
        public StandardMaterial3D Material = null!;
        public EntityKind Kind;
        public MeshInstance3D? HpBar;
        public StandardMaterial3D? HpBarMaterial;
    }
}

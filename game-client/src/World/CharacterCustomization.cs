using System;
using System.Collections.Generic;
using Godot;

namespace AtlasWorld.Client.World
{
    /// <summary>
    /// Portable humanoid appearance &amp; equipment customization (F-186):
    /// 1. Runtime hair color tinting via the dedicated "Hair" material surface (luminance-normalized
    ///    strand texture in build_meshy_humanoid.py so any tint — Maro Chestnut, Linde Elf Silver,
    ///    Solar Blonde, Crimson Rose, Silme Azure — preserves strand shading without affecting skin,
    ///    eyes, or clothing on the "Body" surface).
    /// 2. Runtime 1H sword look swapping across shared weapon sockets (handslot_r / prop_weapon_r)
    ///    while preserving the same humanoid animation profile.
    /// </summary>
    public static class CharacterCustomization
    {
        public static readonly Color MaroChestnut = new(0.58f, 0.38f, 0.27f, 1.0f);
        public static readonly Color LindeSilver = new(0.90f, 0.93f, 0.99f, 1.0f);
        public static readonly Color SolarBlonde = new(0.96f, 0.80f, 0.32f, 1.0f);
        public static readonly Color CrimsonRose = new(0.86f, 0.22f, 0.28f, 1.0f);
        public static readonly Color SilmeAzure = new(0.30f, 0.70f, 0.96f, 1.0f);
        public static readonly Color ShadowViolet = new(0.58f, 0.36f, 0.86f, 1.0f);

        public static readonly IReadOnlyList<(string Name, Color Color)> HairColorPresets = new (string, Color)[]
        {
            ("Maro Chestnut", MaroChestnut),
            ("Linde Silver", LindeSilver),
            ("Solar Blonde", SolarBlonde),
            ("Crimson Rose", CrimsonRose),
            ("Silme Azure", SilmeAzure),
            ("Shadow Violet", ShadowViolet),
        };

        /// <summary>
        /// Tints all hair surfaces under <paramref name="root"/> by duplicating each surface's
        /// <see cref="StandardMaterial3D"/> override so shared resources are never mutated.
        /// Returns the number of hair surfaces updated.
        /// </summary>
        public static int SetHairColor(Node root, Color color)
        {
            if (root == null)
                return 0;
            int updated = 0;
            ApplyHairColorRecursive(root, color, ref updated);
            return updated;
        }

        /// <summary>Reads the current AlbedoColor of the first hair surface under <paramref name="root"/>, or null if none.</summary>
        public static Color? GetHairColor(Node root)
        {
            if (root == null)
                return null;
            return FindSurfaceColorRecursive(root, wantHair: true);
        }

        /// <summary>Reads the current AlbedoColor of the first non-hair character body surface under <paramref name="root"/>.</summary>
        public static Color? GetBodyColor(Node root)
        {
            if (root == null)
                return null;
            return FindSurfaceColorRecursive(root, wantHair: false);
        }

        private static void ApplyHairColorRecursive(Node node, Color color, ref int updated)
        {
            if (node is MeshInstance3D meshInst && meshInst.Mesh != null && IsCharacterMeshNode(meshInst))
            {
                int surfaceCount = meshInst.Mesh.GetSurfaceCount();
                for (int i = 0; i < surfaceCount; i++)
                {
                    if (!IsHairSurface(meshInst, i))
                        continue;

                    Material? existing = meshInst.GetSurfaceOverrideMaterial(i) ?? meshInst.Mesh.SurfaceGetMaterial(i);
                    StandardMaterial3D hairMat = existing is StandardMaterial3D std
                        ? (StandardMaterial3D)std.Duplicate()
                        : new StandardMaterial3D { ResourceName = "Hair" };

                    if (string.IsNullOrEmpty(hairMat.ResourceName))
                        hairMat.ResourceName = "Hair";
                    hairMat.AlbedoColor = color;
                    meshInst.SetSurfaceOverrideMaterial(i, hairMat);
                    updated++;
                }
            }

            foreach (Node child in node.GetChildren())
                ApplyHairColorRecursive(child, color, ref updated);
        }

        private static Color? FindSurfaceColorRecursive(Node node, bool wantHair)
        {
            if (node is MeshInstance3D meshInst && meshInst.Mesh != null && IsCharacterMeshNode(meshInst))
            {
                int surfaceCount = meshInst.Mesh.GetSurfaceCount();
                for (int i = 0; i < surfaceCount; i++)
                {
                    if (IsHairSurface(meshInst, i) != wantHair)
                        continue;
                    Material? mat = meshInst.GetSurfaceOverrideMaterial(i) ?? meshInst.Mesh.SurfaceGetMaterial(i);
                    if (mat is StandardMaterial3D std)
                        return std.AlbedoColor;
                }
            }

            foreach (Node child in node.GetChildren())
            {
                Color? hit = FindSurfaceColorRecursive(child, wantHair);
                if (hit.HasValue)
                    return hit;
            }
            return null;
        }

        public static bool IsHairSurface(MeshInstance3D meshInst, int surfaceIndex)
        {
            if (meshInst.Mesh == null || surfaceIndex < 0 || surfaceIndex >= meshInst.Mesh.GetSurfaceCount())
                return false;

            Material? baseMat = meshInst.Mesh.SurfaceGetMaterial(surfaceIndex);
            Material? overMat = meshInst.GetSurfaceOverrideMaterial(surfaceIndex);
            string matName = !string.IsNullOrEmpty(baseMat?.ResourceName)
                ? baseMat!.ResourceName
                : (overMat?.ResourceName ?? "");

            if (matName.Contains("hair", StringComparison.OrdinalIgnoreCase))
                return true;

            if (meshInst.Mesh.GetSurfaceCount() == 1 &&
                meshInst.Name.ToString().Contains("hair", StringComparison.OrdinalIgnoreCase))
                return true;

            return false;
        }

        private static bool IsCharacterMeshNode(MeshInstance3D meshInst)
        {
            string name = meshInst.Name.ToString();
            return name != "DropShadow" && name != "OverheadHpBg" && name != "OverheadHpFill";
        }
    }
}

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

        public static readonly IReadOnlyList<(string Label, string ShapeKey)> EyeExpressionPresets = new (string, string)[]
        {
            ("Neutral", ""),
            ("Happy ^_^", "eye_happy"),
            ("Determined", "eye_angry"),
            ("Surprised", "eye_surprised"),
            ("Sorrow", "eye_sorrow"),
            ("Blink", "eye_blink"),
        };

        private static readonly string[] AllEyeShapeKeys =
        {
            "eye_blink",
            "eye_happy",
            "eye_angry",
            "eye_sorrow",
            "eye_surprised",
        };

        /// <summary>
        /// Drives the mouthless anime eye &amp; brow expression blendshapes (<c>eye_blink</c>, <c>eye_happy</c>,
        /// <c>eye_angry</c>, <c>eye_sorrow</c>, <c>eye_surprised</c>) on any <see cref="MeshInstance3D"/>
        /// under <paramref name="root"/>. Returns the number of blendshape channels updated.
        /// </summary>
        public static int SetEyeExpression(Node root, string activeShapeKey, float weight = 1.0f, float blinkOverlay = 0.0f)
        {
            if (root == null)
                return 0;
            int updated = 0;
            ApplyEyeExpressionRecursive(root, activeShapeKey ?? "", Mathf.Clamp(weight, 0f, 1f), Mathf.Clamp(blinkOverlay, 0f, 1f), ref updated);
            return updated;
        }

        /// <summary>Reads the current blendshape weight for <paramref name="shapeKey"/> on the first face mesh under <paramref name="root"/>.</summary>
        public static float GetEyeExpressionWeight(Node root, string shapeKey)
        {
            if (root == null || string.IsNullOrEmpty(shapeKey))
                return 0f;
            return FindEyeExpressionWeightRecursive(root, shapeKey) ?? 0f;
        }

        private static void ApplyEyeExpressionRecursive(Node node, string activeShapeKey, float weight, float blinkOverlay, ref int updated)
        {
            if (node is MeshInstance3D meshInst && meshInst.Mesh != null && meshInst.GetBlendShapeCount() > 0)
            {
                foreach (string key in AllEyeShapeKeys)
                {
                    int idx = meshInst.FindBlendShapeByName(key);
                    if (idx < 0)
                        continue;

                    float target = 0f;
                    if (key == activeShapeKey)
                        target = weight;
                    if (key == "eye_blink")
                    {
                        // Suppress auto-blink when Happy ^_^ (which already closes the eyes into happy arcs) is active
                        float blinkEffective = activeShapeKey == "eye_happy" && weight > 0.3f
                            ? 0f
                            : blinkOverlay;
                        target = Mathf.Max(target, blinkEffective);
                    }

                    meshInst.SetBlendShapeValue(idx, target);
                    updated++;
                }
            }

            foreach (Node child in node.GetChildren())
                ApplyEyeExpressionRecursive(child, activeShapeKey, weight, blinkOverlay, ref updated);
        }

        private static float? FindEyeExpressionWeightRecursive(Node node, string shapeKey)
        {
            if (node is MeshInstance3D meshInst && meshInst.Mesh != null && meshInst.GetBlendShapeCount() > 0)
            {
                int idx = meshInst.FindBlendShapeByName(shapeKey);
                if (idx >= 0)
                    return meshInst.GetBlendShapeValue(idx);
            }

            foreach (Node child in node.GetChildren())
            {
                float? hit = FindEyeExpressionWeightRecursive(child, shapeKey);
                if (hit.HasValue)
                    return hit;
            }
            return null;
        }

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

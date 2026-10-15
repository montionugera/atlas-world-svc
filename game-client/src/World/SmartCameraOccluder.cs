using System;
using System.Collections.Generic;
using Godot;

namespace AtlasWorld.Client.World
{
    /// <summary>
    /// Smart Camera Line-of-Sight (LOS) Occlusion Fader (Ragnarok Origin / Diablo IV style).
    /// Automatically detects 3D environment props (trees, pillars, walls, boulders, banners)
    /// that sit inside the viewing corridor between <see cref="Camera3D"/> and the player / target,
    /// and smoothly fades their <see cref="GeometryInstance3D.Transparency"/> to <see cref="OccludedAlpha"/>
    /// (default 0.72 transparency = 28% opacity) so the player never loses sight of their hero.
    /// When the camera orbits away or the player walks past, faded props smoothly restore to 100% opaque.
    /// </summary>
    public sealed class SmartCameraOccluder
    {
        public sealed class OccludableEntry
        {
            public Node3D Root = null!;
            public float Radius = 1.6f;
            public float Height = 4.2f;
            public float CurrentTransparency = 0f;
            public float TargetTransparency = 0f;
            public readonly List<GeometryInstance3D> Meshes = new();
        }

        private readonly List<OccludableEntry> _entries = new();
        private readonly HashSet<ulong> _registeredIds = new();
        private int _currentlyFadedCount = 0;

        /// <summary>Enable or disable smart camera occlusion fading globally.</summary>
        public bool Enabled { get; set; } = true;

        /// <summary>
        /// Target Godot <see cref="GeometryInstance3D.Transparency"/> when blocking the camera
        /// (0.0 = fully opaque, 0.72 = 72% transparent / 28% visible silhouette).
        /// </summary>
        public float OccludedTransparency { get; set; } = 0.72f;

        /// <summary>Corridor radius (in meters) around the Camera -> Player ray.</summary>
        public float CorridorRadius { get; set; } = 2.35f;

        /// <summary>Fade speed (units of transparency per second).</summary>
        public float FadeSpeed { get; set; } = 9.5f;

        public int RegisteredPropCount => _entries.Count;
        public int CurrentlyFadedPropCount => _currentlyFadedCount;

        public void Clear()
        {
            foreach (var entry in _entries)
            {
                if (entry.CurrentTransparency > 0.001f)
                {
                    ApplyTransparencyToMeshes(entry, 0f);
                }
            }
            _entries.Clear();
            _registeredIds.Clear();
            _currentlyFadedCount = 0;
        }

        /// <summary>
        /// Registers all static props under <c>EnvironmentProps</c> (excluding ground tiles and grass tufts)
        /// and any newly streamed chunk prop so they participate in smart camera LOS fading.
        /// </summary>
        public void RegisterPropRoot(Node3D propRoot, float colliderHalfExtent = 1.0f, float scale = 1.0f)
        {
            if (propRoot == null || !GodotObject.IsInstanceValid(propRoot))
                return;

            ulong id = propRoot.GetInstanceId();
            if (_registeredIds.Contains(id))
                return;

            string lowerName = propRoot.Name.ToString().ToLowerInvariant();
            if (lowerName.Contains("tile") || lowerName.Contains("grass") || lowerName.Contains("floor"))
                return;

            var meshes = new List<GeometryInstance3D>();
            CollectGeometryInstances(propRoot, meshes);
            if (meshes.Count == 0)
                return;

            _registeredIds.Add(id);
            float effectiveRadius = Mathf.Clamp(Mathf.Max(colliderHalfExtent, 0.85f) * scale * 1.45f, 1.15f, 4.2f);
            float effectiveHeight = lowerName.Contains("tree") || lowerName.Contains("pillar") || lowerName.Contains("column") || lowerName.Contains("wall")
                ? 5.2f * scale
                : 2.6f * scale;

            _entries.Add(new OccludableEntry
            {
                Root = propRoot,
                Radius = effectiveRadius,
                Height = effectiveHeight,
                Meshes = { }
            });
            _entries[^1].Meshes.AddRange(meshes);
        }

        /// <summary>
        /// Scans a parent container (such as <c>EnvironmentProps/Trees</c>, <c>Rocks</c>, <c>Bushes</c>, <c>Props</c>)
        /// and registers each child prop root.
        /// </summary>
        public void RegisterEnvironmentHierarchy(Node3D? envPropsRoot)
        {
            if (envPropsRoot == null || !GodotObject.IsInstanceValid(envPropsRoot))
                return;

            foreach (Node group in envPropsRoot.GetChildren())
            {
                if (group is not Node3D group3D)
                    continue;
                if (group3D.Name == "CobblestonePath" || group3D.Name == "MeadowRing")
                    continue;

                foreach (Node prop in group3D.GetChildren())
                {
                    if (prop is Node3D prop3D)
                    {
                        RegisterPropRoot(prop3D, 1.1f, prop3D.Scale.X);
                    }
                }
            }
        }

        /// <summary>
        /// Updates per-frame LOS occlusion between <paramref name="cameraPos"/> and <paramref name="playerFocusPos"/>
        /// (plus optional <paramref name="combatTargetPos"/>) and smoothly interpolates mesh transparency.
        /// </summary>
        public void Update(float dt, Vector3 cameraPos, Vector3 playerFocusPos, Vector3? combatTargetPos = null)
        {
            _currentlyFadedCount = 0;

            Vector3 rayVec = playerFocusPos - cameraPos;
            float rayLen = rayVec.Length();
            if (rayLen < 0.25f)
                return;

            Vector3 rayDir = rayVec / rayLen;

            for (int i = _entries.Count - 1; i >= 0; i--)
            {
                var entry = _entries[i];
                if (!GodotObject.IsInstanceValid(entry.Root))
                {
                    _entries.RemoveAt(i);
                    continue;
                }

                bool blocksView = false;
                if (Enabled)
                {
                    blocksView = DoesPropOccludeRay(entry, cameraPos, rayDir, rayLen, playerFocusPos);
                    if (!blocksView && combatTargetPos.HasValue)
                    {
                        Vector3 targetFocus = combatTargetPos.Value + new Vector3(0f, 1.1f, 0f);
                        Vector3 targetRay = targetFocus - cameraPos;
                        float targetLen = targetRay.Length();
                        if (targetLen > 0.5f && targetLen < 28.0f)
                        {
                            blocksView = DoesPropOccludeRay(entry, cameraPos, targetRay / targetLen, targetLen, targetFocus);
                        }
                    }
                }

                entry.TargetTransparency = blocksView ? OccludedTransparency : 0f;
                if (blocksView)
                {
                    _currentlyFadedCount++;
                }

                if (!Mathf.IsEqualApprox(entry.CurrentTransparency, entry.TargetTransparency))
                {
                    entry.CurrentTransparency = Mathf.MoveToward(
                        entry.CurrentTransparency,
                        entry.TargetTransparency,
                        dt * FadeSpeed);

                    ApplyTransparencyToMeshes(entry, entry.CurrentTransparency);
                }
            }
        }

        private bool DoesPropOccludeRay(
            OccludableEntry entry,
            Vector3 camPos,
            Vector3 rayDir,
            float rayLen,
            Vector3 focusPos)
        {
            Vector3 basePos = entry.Root.GlobalPosition;
            // Sample the vertical trunk/canopy center of the prop
            Vector3 propCenter = basePos + new Vector3(0f, entry.Height * 0.48f, 0f);

            // Project propCenter onto the segment [camPos -> focusPos]
            Vector3 toProp = propCenter - camPos;
            float t = toProp.Dot(rayDir);

            // Must lie between the camera near plane and slightly behind the player's torso
            if (t < 0.35f || t > rayLen + 0.65f)
                return false;

            Vector3 closestOnRay = camPos + rayDir * Mathf.Clamp(t, 0f, rayLen);

            // Horizontal + vertical cylindrical distance check (canopy is wider horizontally than vertically)
            float dx = propCenter.X - closestOnRay.X;
            float dz = propCenter.Z - closestOnRay.Z;
            float dy = (propCenter.Y - closestOnRay.Y) * 0.62f;
            float distSq = dx * dx + dz * dz + dy * dy;

            float threshold = CorridorRadius * 0.55f + entry.Radius * 0.68f;
            return distSq <= threshold * threshold;
        }

        private static void ApplyTransparencyToMeshes(OccludableEntry entry, float transparency)
        {
            float clamped = Mathf.Clamp(transparency, 0f, 0.92f);
            for (int i = 0; i < entry.Meshes.Count; i++)
            {
                var g = entry.Meshes[i];
                if (GodotObject.IsInstanceValid(g))
                {
                    g.Transparency = clamped;
                }
            }
        }

        private static void CollectGeometryInstances(Node node, List<GeometryInstance3D> results)
        {
            if (node is GeometryInstance3D geom &&
                node.Name != "DropShadow" &&
                node.Name != "OverheadHpBg" &&
                node.Name != "OverheadHpFill")
            {
                results.Add(geom);
            }

            foreach (Node child in node.GetChildren())
            {
                CollectGeometryInstances(child, results);
            }
        }
    }
}

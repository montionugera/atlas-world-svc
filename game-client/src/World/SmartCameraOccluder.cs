using System;
using System.Collections.Generic;
using Godot;

namespace AtlasWorld.Client.World
{
    /// <summary>
    /// Smart Camera Line-of-Sight (LOS) Occlusion Fader + Multi-Floor Roof / Cave Wall Cutaway
    /// (Ragnarok Origin / Diablo IV style).
    /// 1. Automatically detects 3D environment props (trees, pillars, walls, boulders, banners)
    ///    that sit inside the viewing corridor between <see cref="Camera3D"/> and the player / target
    ///    OR that physically envelop the camera lens when orbiting close to a tree,
    ///    and smoothly fades their <see cref="GeometryInstance3D.Transparency"/> while suppressing
    ///    inverted-hull back-face outlines so the screen can never turn black or blocked.
    /// 2. Automatically cuts away (fades to 86% transparent silhouette) any Cave Roof/Walls or Upper Tower Deck
    ///    when the player walks inside or behind a Watchtower or Underground Crystal Cave,
    ///    while keeping the 2nd-floor deck 100% solid opaque whenever the player climbs onto the 2nd floor!
    /// </summary>
    public sealed class SmartCameraOccluder
    {
        public sealed class OccludableEntry
        {
            public Node3D Root = null!;
            public float Radius = 1.6f;
            public float Height = 4.2f;
            public bool IsRoofOrCeiling = false;
            public Rect2 FootprintWorldRect;
            public float CeilingDeckY = 0f;
            public float CurrentTransparency = 0f;
            public float TargetTransparency = 0f;
            public readonly List<GeometryInstance3D> Meshes = new();
            public readonly List<(BaseMaterial3D Mat, Material? OriginalNextPass)> MaterialsWithOutline = new();
        }

        private readonly List<OccludableEntry> _entries = new();
        private readonly HashSet<ulong> _registeredIds = new();
        private int _currentlyFadedCount = 0;

        /// <summary>Enable or disable smart camera occlusion fading globally.</summary>
        public bool Enabled { get; set; } = true;

        /// <summary>
        /// Target Godot <see cref="GeometryInstance3D.Transparency"/> when blocking the camera
        /// (0.0 = fully opaque, 0.78 = 78% transparent / 22% visible silhouette).
        /// </summary>
        public float OccludedTransparency { get; set; } = 0.78f;

        /// <summary>Corridor radius (in meters) around the Camera -> Player ray.</summary>
        public float CorridorRadius { get; set; } = 2.45f;

        /// <summary>Fade speed (units of transparency per second).</summary>
        public float FadeSpeed { get; set; } = 10.5f;

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
        /// Registers an upper tower floor/roof or cave ceiling/wall canopy so it automatically cuts away
        /// whenever the player walks underneath or behind it (<c>playerFootY &lt; ceilingDeckY - 0.75f</c>),
        /// and stays 100% opaque when the player stands on top of the 2nd floor.
        /// </summary>
        public void RegisterRoofOrCeilingCanopy(Node3D canopyRoot, Rect2 footprintWorldRect, float ceilingDeckY)
        {
            if (canopyRoot == null || !GodotObject.IsInstanceValid(canopyRoot))
                return;

            ulong id = canopyRoot.GetInstanceId();
            if (_registeredIds.Contains(id))
                return;

            var meshes = new List<GeometryInstance3D>();
            CollectGeometryInstances(canopyRoot, meshes);
            if (meshes.Count == 0)
                return;

            _registeredIds.Add(id);
            var entry = new OccludableEntry
            {
                Root = canopyRoot,
                Radius = Mathf.Max(footprintWorldRect.Size.X, footprintWorldRect.Size.Y) * 0.55f,
                Height = 3.6f,
                IsRoofOrCeiling = true,
                FootprintWorldRect = footprintWorldRect,
                CeilingDeckY = ceilingDeckY
            };
            entry.Meshes.AddRange(meshes);
            CacheOutlineMaterials(entry);
            _entries.Add(entry);
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
            bool isTallCanopy = lowerName.Contains("tree") || lowerName.Contains("pillar") ||
                                lowerName.Contains("column") || lowerName.Contains("wall") ||
                                lowerName.Contains("parapet") || lowerName.Contains("arch");

            float effectiveRadius = isTallCanopy
                ? Mathf.Clamp(Mathf.Max(colliderHalfExtent, 1.15f) * scale * 1.65f, 1.55f, 4.8f)
                : Mathf.Clamp(Mathf.Max(colliderHalfExtent, 0.85f) * scale * 1.45f, 1.15f, 4.2f);
            float effectiveHeight = isTallCanopy
                ? 5.6f * scale
                : 2.8f * scale;

            var entry = new OccludableEntry
            {
                Root = propRoot,
                Radius = effectiveRadius,
                Height = effectiveHeight
            };
            entry.Meshes.AddRange(meshes);
            CacheOutlineMaterials(entry);
            _entries.Add(entry);
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
        /// (plus automatic roof/wall cutaway when inside or behind a tower or cave) and smoothly interpolates mesh transparency.
        /// </summary>
        public void Update(float dt, Vector3 cameraPos, Vector3 playerFocusPos, Vector3? combatTargetPos = null)
        {
            _currentlyFadedCount = 0;

            Vector3 rayVec = playerFocusPos - cameraPos;
            float rayLen = rayVec.Length();
            if (rayLen < 0.25f)
                return;

            Vector3 rayDir = rayVec / rayLen;
            float playerFootY = playerFocusPos.Y - 1.25f;
            Vector2 playerXZ = new(playerFocusPos.X, playerFocusPos.Z);
            Vector2 camXZ = new(cameraPos.X, cameraPos.Z);

            for (int i = _entries.Count - 1; i >= 0; i--)
            {
                var entry = _entries[i];
                if (!GodotObject.IsInstanceValid(entry.Root))
                {
                    _entries.RemoveAt(i);
                    continue;
                }

                bool blocksView = false;
                bool cameraInsideProp = false;
                float targetAlpha = OccludedTransparency;

                if (Enabled)
                {
                    if (entry.IsRoofOrCeiling)
                    {
                        // Cut away cave ceiling/walls or upper watchtower deck whenever the player is BELOW the upper deck
                        // AND either inside the structure footprint OR looking through the structure footprint from the camera!
                        // When the player climbs onto the 2nd floor (playerFootY >= CeilingDeckY - 0.75f), keep the 2F deck 100% solid opaque!
                        if (playerFootY < entry.CeilingDeckY - 0.75f)
                        {
                            Rect2 expandedFootprint = entry.FootprintWorldRect.Grow(1.35f);
                            if (expandedFootprint.HasPoint(playerXZ) ||
                                expandedFootprint.HasPoint(camXZ) ||
                                SegmentIntersectsRect2D(camXZ, playerXZ, expandedFootprint) ||
                                DoesPropOccludeRay(entry, cameraPos, rayDir, rayLen, playerFocusPos, out cameraInsideProp))
                            {
                                blocksView = true;
                                targetAlpha = cameraInsideProp ? 0.96f : Mathf.Max(OccludedTransparency, 0.86f);
                            }
                        }
                    }
                    else
                    {
                        blocksView = DoesPropOccludeRay(entry, cameraPos, rayDir, rayLen, playerFocusPos, out cameraInsideProp);

                        if (!blocksView && combatTargetPos.HasValue)
                        {
                            Vector3 targetFocus = combatTargetPos.Value + new Vector3(0f, 1.1f, 0f);
                            Vector3 targetRay = targetFocus - cameraPos;
                            float targetLen = targetRay.Length();
                            if (targetLen > 0.5f && targetLen < 28.0f)
                            {
                                blocksView = DoesPropOccludeRay(entry, cameraPos, targetRay / targetLen, targetLen, targetFocus, out bool insideTargetRay);
                                cameraInsideProp |= insideTargetRay;
                            }
                        }

                        if (blocksView && cameraInsideProp)
                        {
                            // When the camera orbits directly inside a tree canopy or trunk, fade completely out of the lens
                            targetAlpha = 0.96f;
                        }
                    }
                }

                entry.TargetTransparency = blocksView ? targetAlpha : 0f;
                if (blocksView)
                {
                    _currentlyFadedCount++;
                }

                if (!Mathf.IsEqualApprox(entry.CurrentTransparency, entry.TargetTransparency))
                {
                    float speed = cameraInsideProp ? FadeSpeed * 2.6f : FadeSpeed;
                    entry.CurrentTransparency = Mathf.MoveToward(
                        entry.CurrentTransparency,
                        entry.TargetTransparency,
                        dt * speed);

                    ApplyTransparencyToMeshes(entry, entry.CurrentTransparency);
                }
            }
        }

        private bool DoesPropOccludeRay(
            OccludableEntry entry,
            Vector3 camPos,
            Vector3 rayDir,
            float rayLen,
            Vector3 focusPos,
            out bool cameraInsideProp)
        {
            cameraInsideProp = false;
            Vector3 basePos = entry.Root.GlobalPosition;

            // 1. Check if the Camera3D itself is physically inside or brushing against the prop's 3D volume
            //    (e.g., turning the camera behind/inside a tree canopy or trunk).
            float camDx = camPos.X - basePos.X;
            float camDz = camPos.Z - basePos.Z;
            float camHorizDistSq = camDx * camDx + camDz * camDz;
            float nearCamRadius = entry.Radius + 1.15f;
            if (camHorizDistSq <= nearCamRadius * nearCamRadius &&
                camPos.Y >= basePos.Y - 1.0f &&
                camPos.Y <= basePos.Y + entry.Height + 1.5f)
            {
                cameraInsideProp = true;
                return true;
            }

            // 2. Check the 2D XZ viewing segment (camPos -> focusPos) against the prop's vertical cylinder
            Vector2 camXZ = new(camPos.X, camPos.Z);
            Vector2 focusXZ = new(focusPos.X, focusPos.Z);
            Vector2 propXZ = new(basePos.X, basePos.Z);
            Vector2 segXZ = focusXZ - camXZ;
            float segLenXZ = segXZ.Length();
            if (segLenXZ > 0.05f)
            {
                Vector2 dirXZ = segXZ / segLenXZ;
                float projXZ = (propXZ - camXZ).Dot(dirXZ);
                if (projXZ >= -entry.Radius * 1.25f && projXZ <= segLenXZ + 0.55f)
                {
                    float clampedProj = Mathf.Clamp(projXZ, 0f, segLenXZ);
                    Vector2 closestXZ = camXZ + dirXZ * clampedProj;
                    float horizDistSq = propXZ.DistanceSquaredTo(closestXZ);
                    float corridorHalfWidth = CorridorRadius * 0.55f + entry.Radius * 0.75f;

                    if (horizDistSq <= corridorHalfWidth * corridorHalfWidth)
                    {
                        float frac = clampedProj / segLenXZ;
                        float rayY = Mathf.Lerp(camPos.Y, focusPos.Y, frac);
                        if (rayY >= basePos.Y - 0.85f && rayY <= basePos.Y + entry.Height + 1.15f)
                        {
                            if (projXZ < 1.85f)
                            {
                                cameraInsideProp = true;
                            }
                            return true;
                        }
                    }
                }
            }

            // 3. Fallback 3D sphere check around propCenter (allowing t down to -entry.Radius so near-camera props never snap opaque)
            Vector3 propCenter = basePos + new Vector3(0f, entry.Height * 0.48f, 0f);
            Vector3 toProp = propCenter - camPos;
            float t = toProp.Dot(rayDir);

            if (t < -entry.Radius * 1.25f || t > rayLen + 0.65f)
                return false;

            Vector3 closestOnRay = camPos + rayDir * Mathf.Clamp(t, 0f, rayLen);
            float dx = propCenter.X - closestOnRay.X;
            float dz = propCenter.Z - closestOnRay.Z;
            float dy = (propCenter.Y - closestOnRay.Y) * 0.58f;
            float distSq = dx * dx + dz * dz + dy * dy;

            float threshold = CorridorRadius * 0.55f + entry.Radius * 0.72f;
            if (distSq <= threshold * threshold)
            {
                if (t < 1.85f)
                {
                    cameraInsideProp = true;
                }
                return true;
            }

            return false;
        }

        private static bool SegmentIntersectsRect2D(Vector2 a, Vector2 b, Rect2 rect)
        {
            if (rect.HasPoint(a) || rect.HasPoint(b))
                return true;

            // Sample 6 points along the camera-to-player segment for fast, branch-free footprint intersection
            for (int step = 1; step <= 6; step++)
            {
                Vector2 pt = a.Lerp(b, step / 7.0f);
                if (rect.HasPoint(pt))
                    return true;
            }
            return false;
        }

        private static void ApplyTransparencyToMeshes(OccludableEntry entry, float transparency)
        {
            float clamped = Mathf.Clamp(transparency, 0f, 0.96f);
            bool hideCompletely = clamped >= 0.93f;
            bool suppressOutline = clamped > 0.03f;

            for (int i = 0; i < entry.MaterialsWithOutline.Count; i++)
            {
                var (mat, origNextPass) = entry.MaterialsWithOutline[i];
                if (GodotObject.IsInstanceValid(mat))
                {
                    mat.NextPass = suppressOutline ? null : origNextPass;
                }
            }

            for (int i = 0; i < entry.Meshes.Count; i++)
            {
                var g = entry.Meshes[i];
                if (GodotObject.IsInstanceValid(g))
                {
                    g.Visible = !hideCompletely;
                    g.Transparency = clamped;
                }
            }
        }

        private static void CacheOutlineMaterials(OccludableEntry entry)
        {
            var seen = new HashSet<ulong>();
            foreach (var g in entry.Meshes)
            {
                if (g is not MeshInstance3D mi || mi.Mesh == null)
                    continue;

                if (mi.MaterialOverride is BaseMaterial3D overrideBase && seen.Add(overrideBase.GetInstanceId()))
                {
                    entry.MaterialsWithOutline.Add((overrideBase, overrideBase.NextPass));
                }

                int surfCount = mi.Mesh.GetSurfaceCount();
                for (int s = 0; s < surfCount; s++)
                {
                    Material? surfMat = mi.GetSurfaceOverrideMaterial(s) ?? mi.Mesh.SurfaceGetMaterial(s);
                    if (surfMat is BaseMaterial3D baseMat && seen.Add(baseMat.GetInstanceId()))
                    {
                        entry.MaterialsWithOutline.Add((baseMat, baseMat.NextPass));
                    }
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

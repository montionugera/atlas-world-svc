using System;
using System.Collections.Generic;
using Godot;

namespace AtlasWorld.Client.World
{
    /// <summary>
    /// On-Demand Spatial Chunk Streamer + GPU Hardware Instancer (<see cref="MultiMeshInstance3D"/>)
    /// for massive 3D maps (1000x1000 up to 100M+ total world objects).
    ///
    /// Scaling Architecture:
    /// 1. Spatial Chunk Partitioning: Partitions authored props into 24m x 24m chunks and only keeps
    ///    chunks within <see cref="ActiveChunkRadius"/> resident in the SceneTree.
    /// 2. GPU Hardware Instancing (<see cref="MultiMeshInstance3D"/>): Batches non-occluding ground clutter
    ///    (grass tufts, flowers, cobblestone tiles, small shrubs) per asset type + deterministic procedural
    ///    foliage into a single <see cref="MultiMeshInstance3D"/> per chunk (1 GPU draw call per asset type,
    ///    0 individual <see cref="Node3D"/> overhead).
    /// 3. Zero-Storage Procedural Meadow Foliage: Generates <see cref="ProceduralClutterPerChunk"/> grass/flower
    ///    instances per active chunk deterministically from <c>Hash(chunkX, chunkZ, index)</c> on walkable terrain
    ///    slopes (&lt;= 32°), enabling 100M+ visual world objects with 0 bytes of JSON storage.
    /// 4. Smart LOS Occluder Registration: Tall/solid props (trees, pillars, walls, boulders) still spawn
    ///    as lightweight <see cref="Node3D"/> roots in active chunks so <see cref="SmartCameraOccluder"/> can
    ///    fade individual blocking trees smoothly when they cross the camera-to-player line of sight.
    /// </summary>
    public sealed class MapChunkStreamer
    {
        private readonly Node3D _chunksRoot;
        private readonly UnifiedMapDocument _doc;
        private readonly SmartCameraOccluder? _occluder;
        private readonly Dictionary<Vector2I, List<UnifiedMapProp>> _chunkBuckets = new();
        private readonly Dictionary<Vector2I, Node3D> _loadedChunkNodes = new();
        private readonly Dictionary<string, PackedScene?> _sceneCache = new();
        private readonly Dictionary<string, Mesh?> _meshPrototypeCache = new();

        private static readonly string[] ProceduralClutterAssets =
        {
            "res://assets/nature/grass_1_a_color1.glb",
            "res://assets/nature/bush_2_a_color1.glb"
        };

        private Vector2I _lastCenterChunk = new(int.MinValue, int.MinValue);
        private int _lastRadius = -1;
        private int _loadedPropCount = 0;
        private int _activeGpuInstanceCount = 0;
        private int _activeMultiMeshBatchCount = 0;

        public float ChunkSizeWorld => Mathf.Max(8.0f, _doc.ChunkSizeWorld);

        public int ActiveChunkRadius
        {
            get => Mathf.Clamp(_doc.ActiveChunkRadius, 1, 8);
            set
            {
                int clamped = Mathf.Clamp(value, 1, 8);
                if (_doc.ActiveChunkRadius != clamped)
                {
                    _doc.ActiveChunkRadius = clamped;
                    _lastRadius = -1; // Force refresh on next UpdateStreaming
                }
            }
        }

        public int ProceduralClutterPerChunk
        {
            get => Mathf.Clamp(_doc.ProceduralClutterDensity, 0, 200);
            set
            {
                int clamped = Mathf.Clamp(value, 0, 200);
                if (_doc.ProceduralClutterDensity != clamped)
                {
                    _doc.ProceduralClutterDensity = clamped;
                    _lastRadius = -1;
                }
            }
        }

        public Vector2I CurrentCenterChunk => _lastCenterChunk;
        public int LoadedChunkCount => _loadedChunkNodes.Count;
        public int TotalNonEmptyChunks => _chunkBuckets.Count;
        public int LoadedPropCount => _loadedPropCount;
        public int TotalPropCount => _doc.Props.Count;
        public int ActiveGpuInstanceCount => _activeGpuInstanceCount;
        public int ActiveMultiMeshBatchCount => _activeMultiMeshBatchCount;

        public MapChunkStreamer(Node3D chunksRoot, UnifiedMapDocument doc, SmartCameraOccluder? occluder = null)
        {
            _chunksRoot = chunksRoot;
            _doc = doc;
            _occluder = occluder;
            RebuildIndex();
        }

        public Vector2I WorldToChunkCoord(Vector3 worldPos)
        {
            float cs = ChunkSizeWorld;
            int cx = Mathf.FloorToInt(worldPos.X / cs);
            int cz = Mathf.FloorToInt(worldPos.Z / cs);
            return new Vector2I(cx, cz);
        }

        public Rect2 GetChunkWorldRect(Vector2I coord)
        {
            float cs = ChunkSizeWorld;
            return new Rect2(coord.X * cs, coord.Y * cs, cs, cs);
        }

        /// <summary>
        /// Returns true if a prop can be batched into a chunk-level GPU <see cref="MultiMeshInstance3D"/>
        /// rather than requiring an individual <see cref="Node3D"/> for per-tree camera LOS occlusion fading.
        /// </summary>
        public static bool IsGpuInstancedClutterAsset(UnifiedMapProp prop)
        {
            if (prop.BlocksMovement)
                return false;

            string lower = prop.AssetPath.ToLowerInvariant();
            return lower.Contains("grass") || lower.Contains("floor_tile") || lower.Contains("bush_2");
        }

        /// <summary>
        /// Re-partitions all props into spatial chunk buckets and forces active chunks to reload.
        /// </summary>
        public void RebuildIndex(Vector3? focusWorldPos = null)
        {
            foreach (var kv in _loadedChunkNodes)
            {
                if (GodotObject.IsInstanceValid(kv.Value))
                    kv.Value.QueueFree();
            }
            _loadedChunkNodes.Clear();
            _chunkBuckets.Clear();
            _loadedPropCount = 0;
            _activeGpuInstanceCount = 0;
            _activeMultiMeshBatchCount = 0;

            foreach (var prop in _doc.Props)
            {
                Vector2I coord = WorldToChunkCoord(new Vector3(prop.X, prop.Y, prop.Z));
                if (!_chunkBuckets.TryGetValue(coord, out var list))
                {
                    list = new List<UnifiedMapProp>();
                    _chunkBuckets[coord] = list;
                }
                list.Add(prop);
            }

            _lastCenterChunk = new Vector2I(int.MinValue, int.MinValue);
            _lastRadius = -1;

            if (focusWorldPos.HasValue)
            {
                UpdateStreaming(focusWorldPos.Value, forceReload: true);
            }
        }

        /// <summary>
        /// Re-snaps the Y altitude of all currently loaded chunk props AND GPU MultiMesh instances
        /// to match sculpted terrain changes.
        /// </summary>
        public void RefreshLoadedPropsAltitude()
        {
            UpdateStreaming(_lastCenterChunk == new Vector2I(int.MinValue, int.MinValue)
                ? Vector3.Zero
                : new Vector3((_lastCenterChunk.X + 0.5f) * ChunkSizeWorld, 0f, (_lastCenterChunk.Y + 0.5f) * ChunkSizeWorld),
                forceReload: true);
        }

        /// <summary>
        /// Incrementally registers a newly stamped prop into its spatial chunk and spawns it immediately
        /// if that chunk is within the active streaming window.
        /// </summary>
        public void AddPropIncremental(UnifiedMapProp prop, Vector3 currentFocusPos)
        {
            Vector2I coord = WorldToChunkCoord(new Vector3(prop.X, prop.Y, prop.Z));
            if (!_chunkBuckets.TryGetValue(coord, out var list))
            {
                list = new List<UnifiedMapProp>();
                _chunkBuckets[coord] = list;
            }
            list.Add(prop);

            Vector2I center = WorldToChunkCoord(currentFocusPos);
            int r = ActiveChunkRadius;
            if (Mathf.Abs(coord.X - center.X) <= r && Mathf.Abs(coord.Y - center.Y) <= r)
            {
                // Rebuild just this active chunk so either its MultiMesh batch or Node3D list updates cleanly
                ReloadSingleChunk(coord);
                RecountActiveStats();
            }
        }

        /// <summary>
        /// Evaluates which spatial chunks fall within [-ActiveChunkRadius .. +ActiveChunkRadius]
        /// around the focus position, unloading distant chunks and streaming in newly entered chunks.
        /// Returns true if the loaded chunk set changed on this frame.
        /// </summary>
        public bool UpdateStreaming(Vector3 focusWorldPos, bool forceReload = false)
        {
            Vector2I center = WorldToChunkCoord(focusWorldPos);
            int radius = ActiveChunkRadius;

            if (!forceReload && center == _lastCenterChunk && radius == _lastRadius)
                return false;

            if (forceReload)
            {
                foreach (var kv in _loadedChunkNodes)
                {
                    if (GodotObject.IsInstanceValid(kv.Value))
                        kv.Value.QueueFree();
                }
                _loadedChunkNodes.Clear();
            }

            _lastCenterChunk = center;
            _lastRadius = radius;

            // 1. Unload any active chunk outside the Chebyshev radius
            var toUnload = new List<Vector2I>();
            foreach (var kv in _loadedChunkNodes)
            {
                int dx = Mathf.Abs(kv.Key.X - center.X);
                int dz = Mathf.Abs(kv.Key.Y - center.Y);
                if (dx > radius || dz > radius)
                {
                    toUnload.Add(kv.Key);
                }
            }

            foreach (var coord in toUnload)
            {
                if (_loadedChunkNodes.TryGetValue(coord, out Node3D? node))
                {
                    if (GodotObject.IsInstanceValid(node))
                        node.QueueFree();
                    _loadedChunkNodes.Remove(coord);
                }
            }

            // 2. Load any chunk inside [-radius .. +radius] within map bounds
            float halfW = _doc.HalfWidthWorld(0.1f);
            float halfH = _doc.HalfHeightWorld(0.1f);

            for (int dz = -radius; dz <= radius; dz++)
            {
                for (int dx = -radius; dx <= radius; dx++)
                {
                    var coord = new Vector2I(center.X + dx, center.Y + dz);
                    if (_loadedChunkNodes.ContainsKey(coord))
                        continue;

                    Rect2 chunkRect = GetChunkWorldRect(coord);
                    float chunkCenterX = chunkRect.Position.X + chunkRect.Size.X * 0.5f;
                    float chunkCenterZ = chunkRect.Position.Y + chunkRect.Size.Y * 0.5f;
                    bool insideMapBounds = Mathf.Abs(chunkCenterX) <= halfW + ChunkSizeWorld * 0.5f &&
                                           Mathf.Abs(chunkCenterZ) <= halfH + ChunkSizeWorld * 0.5f;

                    bool hasAuthoredProps = _chunkBuckets.TryGetValue(coord, out var propsInChunk) && propsInChunk.Count > 0;
                    if (!hasAuthoredProps && (!insideMapBounds || ProceduralClutterPerChunk <= 0))
                        continue;

                    ReloadSingleChunk(coord);
                }
            }

            RecountActiveStats();
            return true;
        }

        private void ReloadSingleChunk(Vector2I coord)
        {
            if (_loadedChunkNodes.TryGetValue(coord, out Node3D? existing) && GodotObject.IsInstanceValid(existing))
            {
                existing.QueueFree();
            }

            var chunkNode = new Node3D { Name = $"Chunk_{coord.X}_{coord.Y}" };
            _chunksRoot.AddChild(chunkNode);
            _loadedChunkNodes[coord] = chunkNode;

            var instancedBatches = new Dictionary<string, List<Transform3D>>();
            int spawnedNodeProps = 0;

            if (_chunkBuckets.TryGetValue(coord, out var propsInChunk))
            {
                foreach (var prop in propsInChunk)
                {
                    float groundY = TerrainElevation.SampleHeight(prop.X, prop.Z, _doc);
                    prop.Y = Mathf.Round(groundY * 100f) / 100f;

                    if (IsGpuInstancedClutterAsset(prop))
                    {
                        if (!instancedBatches.TryGetValue(prop.AssetPath, out var list))
                        {
                            list = new List<Transform3D>();
                            instancedBatches[prop.AssetPath] = list;
                        }
                        Basis basis = Basis.FromEuler(new Vector3(0f, prop.RotY, 0f)).Scaled(Vector3.One * prop.Scale);
                        list.Add(new Transform3D(basis, new Vector3(prop.X, groundY, prop.Z)));
                    }
                    else if (SpawnSinglePropIntoChunk(prop, chunkNode, groundY))
                    {
                        spawnedNodeProps++;
                    }
                }
            }

            // 3. Deterministic Zero-Storage Procedural Meadow Clutter (GPU-instanced via MultiMeshInstance3D)
            AddDeterministicProceduralClutter(coord, instancedBatches);

            // 4. Build one MultiMeshInstance3D per batched asset type in this chunk (1 GPU draw call per asset type)
            int chunkGpuInstances = 0;
            int chunkBatchCount = 0;
            foreach (var (assetPath, transforms) in instancedBatches)
            {
                if (transforms.Count == 0)
                    continue;

                Mesh? protoMesh = ResolvePrototypeMesh(assetPath);
                if (protoMesh == null)
                    continue;

                var multiMesh = new MultiMesh
                {
                    TransformFormat = MultiMesh.TransformFormatEnum.Transform3D,
                    UseColors = false,
                    Mesh = protoMesh,
                    InstanceCount = transforms.Count
                };

                for (int i = 0; i < transforms.Count; i++)
                {
                    multiMesh.SetInstanceTransform(i, transforms[i]);
                }

                var mmi = new MultiMeshInstance3D
                {
                    Name = $"GPUInstanced_{ System.IO.Path.GetFileNameWithoutExtension(assetPath) }_{transforms.Count}",
                    Multimesh = multiMesh,
                    CastShadow = GeometryInstance3D.ShadowCastingSetting.Off
                };
                chunkNode.AddChild(mmi);
                chunkGpuInstances += transforms.Count;
                chunkBatchCount++;
            }

            chunkNode.SetMeta("node_prop_count", spawnedNodeProps);
            chunkNode.SetMeta("gpu_instance_count", chunkGpuInstances);
            chunkNode.SetMeta("gpu_batch_count", chunkBatchCount);
        }

        private void AddDeterministicProceduralClutter(Vector2I coord, Dictionary<string, List<Transform3D>> batches)
        {
            int density = ProceduralClutterPerChunk;
            if (density <= 0)
                return;

            float halfW = _doc.HalfWidthWorld(0.1f) - 2.0f;
            float halfH = _doc.HalfHeightWorld(0.1f) - 2.0f;
            Rect2 rect = GetChunkWorldRect(coord);

            for (int i = 0; i < density; i++)
            {
                uint h = HashChunkItem(coord.X, coord.Y, i);
                float u = ((h & 0xFFFFu) / 65535.0f);
                float v = (((h >> 16) & 0xFFFFu) / 65535.0f);

                float wx = rect.Position.X + u * rect.Size.X;
                float wz = rect.Position.Y + v * rect.Size.Y;

                if (Mathf.Abs(wx) > halfW || Mathf.Abs(wz) > halfH)
                    continue;

                // Keep central stone road (-2.4m .. +2.4m) and immediate combat origin clear
                if (Mathf.Abs(wx) < 2.6f && wz > -22f && wz < 22f)
                    continue;

                // Do not spawn meadow grass on sheer cliff walls (> 32 degrees)
                if (TerrainElevation.SampleSlopeDegrees(wx, wz, _doc) > 32.0f)
                    continue;

                float groundY = TerrainElevation.SampleHeight(wx, wz, _doc);
                string assetPath = (i % 6 == 0) ? ProceduralClutterAssets[1] : ProceduralClutterAssets[0];
                float scale = (i % 6 == 0)
                    ? 0.72f + (u * 0.35f)
                    : 0.95f + (v * 0.55f);
                float rotY = ((h & 0xFFu) / 255.0f) * Mathf.Tau;

                if (!batches.TryGetValue(assetPath, out var list))
                {
                    list = new List<Transform3D>();
                    batches[assetPath] = list;
                }

                Basis basis = Basis.FromEuler(new Vector3(0f, rotY, 0f)).Scaled(Vector3.One * scale);
                list.Add(new Transform3D(basis, new Vector3(wx, groundY, wz)));
            }
        }

        private static uint HashChunkItem(int cx, int cz, int index)
        {
            uint h = 2166136261u;
            h = (h ^ (uint)cx) * 16777619u;
            h = (h ^ (uint)cz) * 16777619u;
            h = (h ^ (uint)index) * 16777619u;
            h ^= h >> 13;
            h *= 0x5bd1e995u;
            h ^= h >> 15;
            return h;
        }

        private Mesh? ResolvePrototypeMesh(string assetPath)
        {
            if (_meshPrototypeCache.TryGetValue(assetPath, out Mesh? cached))
                return cached;

            if (!_sceneCache.TryGetValue(assetPath, out PackedScene? scene))
            {
                scene = ResourceLoader.Exists(assetPath) ? GD.Load<PackedScene>(assetPath) : null;
                _sceneCache[assetPath] = scene;
            }

            Mesh? extracted = null;
            if (scene?.Instantiate() is Node3D tempRoot)
            {
                EntityView.ApplyAnimeToonShading(tempRoot, EntityKind.Npc);
                MeshInstance3D? firstMeshInst = FindFirstMeshInstance(tempRoot);
                if (firstMeshInst?.Mesh != null)
                {
                    extracted = (Mesh)firstMeshInst.Mesh.Duplicate();
                    Material? matOverride = firstMeshInst.MaterialOverride ?? firstMeshInst.GetSurfaceOverrideMaterial(0);
                    if (matOverride != null && extracted.GetSurfaceCount() > 0)
                    {
                        extracted.SurfaceSetMaterial(0, matOverride);
                    }
                }
                tempRoot.Free();
            }

            _meshPrototypeCache[assetPath] = extracted;
            return extracted;
        }

        private static MeshInstance3D? FindFirstMeshInstance(Node node)
        {
            if (node is MeshInstance3D mi && mi.Mesh != null)
                return mi;

            foreach (Node child in node.GetChildren())
            {
                var found = FindFirstMeshInstance(child);
                if (found != null)
                    return found;
            }
            return null;
        }

        private void RecountActiveStats()
        {
            int nodeProps = 0;
            int gpuInsts = 0;
            int gpuBatches = 0;
            foreach (var kv in _loadedChunkNodes)
            {
                if (!GodotObject.IsInstanceValid(kv.Value))
                    continue;
                nodeProps += (int)kv.Value.GetMeta("node_prop_count", 0);
                gpuInsts += (int)kv.Value.GetMeta("gpu_instance_count", 0);
                gpuBatches += (int)kv.Value.GetMeta("gpu_batch_count", 0);
            }
            _loadedPropCount = nodeProps;
            _activeGpuInstanceCount = gpuInsts;
            _activeMultiMeshBatchCount = gpuBatches;
        }

        private bool SpawnSinglePropIntoChunk(UnifiedMapProp prop, Node3D chunkNode, float groundY)
        {
            if (!_sceneCache.TryGetValue(prop.AssetPath, out PackedScene? scene))
            {
                scene = ResourceLoader.Exists(prop.AssetPath)
                    ? GD.Load<PackedScene>(prop.AssetPath)
                    : null;
                _sceneCache[prop.AssetPath] = scene;
            }

            if (scene?.Instantiate() is Node3D instance)
            {
                instance.Name = prop.Id;
                instance.Position = new Vector3(prop.X, groundY, prop.Z);
                instance.Rotation = new Vector3(0f, prop.RotY, 0f);
                instance.Scale = Vector3.One * prop.Scale;
                EntityView.ApplyAnimeToonShading(instance, EntityKind.Npc);
                chunkNode.AddChild(instance);

                _occluder?.RegisterPropRoot(instance, prop.ColliderHalfExtent, prop.Scale);
                return true;
            }
            return false;
        }
    }
}

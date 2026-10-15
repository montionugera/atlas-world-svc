using System;
using System.Collections.Generic;
using Godot;

namespace AtlasWorld.Client.World
{
    /// <summary>
    /// On-Demand Spatial Chunk Streamer for large 3D maps (1000x1000 up to 4000x4000+).
    /// Partitions all props in a UnifiedMapDocument into a 2D grid of spatial chunks
    /// (default 24m x 24m) and only instantiates 3D Node3D scenes for chunks within
    /// ActiveChunkRadius around the camera or player focus point.
    /// Automatically snaps prop Y altitude to <see cref="TerrainElevation"/> and registers
    /// streamed props with <see cref="SmartCameraOccluder"/> for auto-transparent camera LOS fading.
    /// </summary>
    public sealed class MapChunkStreamer
    {
        private readonly Node3D _chunksRoot;
        private readonly UnifiedMapDocument _doc;
        private readonly SmartCameraOccluder? _occluder;
        private readonly Dictionary<Vector2I, List<UnifiedMapProp>> _chunkBuckets = new();
        private readonly Dictionary<Vector2I, Node3D> _loadedChunkNodes = new();
        private readonly Dictionary<string, PackedScene?> _sceneCache = new();

        private Vector2I _lastCenterChunk = new(int.MinValue, int.MinValue);
        private int _lastRadius = -1;
        private int _loadedPropCount = 0;

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

        public Vector2I CurrentCenterChunk => _lastCenterChunk;
        public int LoadedChunkCount => _loadedChunkNodes.Count;
        public int TotalNonEmptyChunks => _chunkBuckets.Count;
        public int LoadedPropCount => _loadedPropCount;
        public int TotalPropCount => _doc.Props.Count;

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
        /// Re-snaps the Y altitude of all currently loaded chunk props to match sculpted terrain changes.
        /// </summary>
        public void RefreshLoadedPropsAltitude()
        {
            foreach (var kv in _loadedChunkNodes)
            {
                Node3D chunkNode = kv.Value;
                if (!GodotObject.IsInstanceValid(chunkNode))
                    continue;

                if (!_chunkBuckets.TryGetValue(kv.Key, out var propsInChunk))
                    continue;

                int childCount = chunkNode.GetChildCount();
                for (int i = 0; i < childCount && i < propsInChunk.Count; i++)
                {
                    if (chunkNode.GetChild(i) is Node3D instance)
                    {
                        var prop = propsInChunk[i];
                        float groundY = TerrainElevation.SampleHeight(prop.X, prop.Z, _doc);
                        prop.Y = Mathf.Round(groundY * 100f) / 100f;
                        instance.Position = new Vector3(prop.X, groundY, prop.Z);
                    }
                }
            }
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
                if (!_loadedChunkNodes.TryGetValue(coord, out Node3D? chunkNode) || !GodotObject.IsInstanceValid(chunkNode))
                {
                    chunkNode = new Node3D { Name = $"Chunk_{coord.X}_{coord.Y}" };
                    _chunksRoot.AddChild(chunkNode);
                    _loadedChunkNodes[coord] = chunkNode;
                }
                if (SpawnSinglePropIntoChunk(prop, chunkNode))
                {
                    _loadedPropCount++;
                }
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
                    _loadedPropCount = Math.Max(0, _loadedPropCount - node.GetChildCount());
                    if (GodotObject.IsInstanceValid(node))
                        node.QueueFree();
                    _loadedChunkNodes.Remove(coord);
                }
            }

            // 2. Load any chunk inside [-radius .. +radius] that has props and isn't loaded yet
            for (int dz = -radius; dz <= radius; dz++)
            {
                for (int dx = -radius; dx <= radius; dx++)
                {
                    var coord = new Vector2I(center.X + dx, center.Y + dz);
                    if (_loadedChunkNodes.ContainsKey(coord))
                        continue;

                    if (!_chunkBuckets.TryGetValue(coord, out var propsInChunk) || propsInChunk.Count == 0)
                        continue;

                    var chunkNode = new Node3D { Name = $"Chunk_{coord.X}_{coord.Y}" };
                    _chunksRoot.AddChild(chunkNode);
                    _loadedChunkNodes[coord] = chunkNode;

                    foreach (var prop in propsInChunk)
                    {
                        if (SpawnSinglePropIntoChunk(prop, chunkNode))
                        {
                            _loadedPropCount++;
                        }
                    }
                }
            }

            return true;
        }

        private bool SpawnSinglePropIntoChunk(UnifiedMapProp prop, Node3D chunkNode)
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
                float groundY = TerrainElevation.SampleHeight(prop.X, prop.Z, _doc);
                prop.Y = Mathf.Round(groundY * 100f) / 100f;

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

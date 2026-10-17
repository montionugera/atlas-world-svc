using System;
using System.Collections.Generic;
using Godot;

namespace AtlasWorld.Client.World
{
    /// <summary>
    /// On-Demand Spatial Chunk Streamer + GPU Hardware Instancer (<see cref="MultiMeshInstance3D"/>)
    /// + Multi-Floor 3D Structure Assembler (Watchtowers &amp; Walk-In Crystal Caves)
    /// + Stage 4 Declarative <c>ground_id</c> Two-Tier Scatter Engine
    /// for massive 3D maps (1000x1000 up to 100M+ total world objects).
    ///
    /// Scaling &amp; Safety Architecture:
    /// 1. Spatial Chunk Partitioning: Partitions authored hero props and 3D multi-floor structures into 24m x 24m chunks
    ///    and only keeps chunks within <see cref="ActiveChunkRadius"/> resident in the SceneTree.
    /// 2. Declarative <c>ground_id</c> Scatter: Evaluates <see cref="UnifiedMapDocument.ResolveGroundIdAt"/> on a two-tier
    ///    deterministic chunk grid (Tier A 16x16 MultiMesh ground cover + Tier B 6x6 LOS-fading canopy trees/boulders)
    ///    driven by <c>groundPalettes[groundId].scatter</c> weights (<c>grass: 0.30, bush: 0.05, canopy_tree: 0.04</c>)
    ///    with zero hardcoded (x, y, z) coordinates stored in JSON.
    /// 3. Safe Multi-Floor 3D Structures (<see cref="UnifiedMapStructureVolume"/>): Spawns 2-Story Watchtowers
    ///    (with walkable ground chamber, wide exterior East stair ramp, and +3.2m upper battlement deck) and
    ///    Walk-In Crystal Caves (with South portal archway, glowing crystal interior, and automatic roof + wall cutaway
    ///    via <see cref="SmartCameraOccluder.RegisterRoofOrCeilingCanopy"/>).
    /// 4. Smart LOS Occluder Registration: Tall/solid props and upper structure roofs/walls automatically fade when
    ///    they cross the camera-to-player line of sight or when the player walks underneath an upper deck/ceiling.
    /// </summary>
    public sealed class MapChunkStreamer
    {
        private readonly Node3D _chunksRoot;
        private readonly UnifiedMapDocument _doc;
        private readonly SmartCameraOccluder? _occluder;
        private readonly Dictionary<Vector2I, List<UnifiedMapProp>> _chunkBuckets = new();
        private readonly Dictionary<Vector2I, List<UnifiedMapStructureVolume>> _structureBuckets = new();
        private readonly Dictionary<Vector2I, Node3D> _loadedChunkNodes = new();
        private readonly Dictionary<string, PackedScene?> _sceneCache = new();
        private readonly Dictionary<string, Mesh?> _meshPrototypeCache = new();

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
        /// Re-partitions all props and 3D structures into spatial chunk buckets and forces active chunks to reload.
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
            _structureBuckets.Clear();
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

            foreach (var s in _doc.Structures)
            {
                Vector2I coord = WorldToChunkCoord(new Vector3(s.X, 0f, s.Z));
                if (!_structureBuckets.TryGetValue(coord, out var sList))
                {
                    sList = new List<UnifiedMapStructureVolume>();
                    _structureBuckets[coord] = sList;
                }
                sList.Add(s);
            }

            _lastCenterChunk = new Vector2I(int.MinValue, int.MinValue);
            _lastRadius = -1;

            if (focusWorldPos.HasValue)
            {
                UpdateStreaming(focusWorldPos.Value, forceReload: true);
            }
        }

        /// <summary>
        /// Re-snaps the Y altitude of all currently loaded chunk props, structures, AND GPU MultiMesh instances
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
                ReloadSingleChunk(coord);
                RecountActiveStats();
            }
        }

        /// <summary>
        /// Incrementally registers a newly placed 3D structure (Watchtower or Crystal Cave) into its spatial chunk
        /// and spawns its 3D geometry immediately.
        /// </summary>
        public void AddStructureIncremental(UnifiedMapStructureVolume structure, Vector3 currentFocusPos)
        {
            Vector2I coord = WorldToChunkCoord(new Vector3(structure.X, 0f, structure.Z));
            if (!_structureBuckets.TryGetValue(coord, out var sList))
            {
                sList = new List<UnifiedMapStructureVolume>();
                _structureBuckets[coord] = sList;
            }
            sList.Add(structure);

            Vector2I center = WorldToChunkCoord(currentFocusPos);
            int r = ActiveChunkRadius;
            if (Mathf.Abs(coord.X - center.X) <= r && Mathf.Abs(coord.Y - center.Y) <= r)
            {
                ReloadSingleChunk(coord);
                RecountActiveStats();
            }
        }

        private void SyncFloorShaderIfPresent()
        {
            var floorNode = _chunksRoot.GetParent()?.GetParent()?.GetNodeOrNull<MeshInstance3D>("Floor");
            if (floorNode != null)
            {
                var mat = floorNode.GetSurfaceOverrideMaterial(0) ?? floorNode.MaterialOverride;
                TerrainElevation.SyncFloorShaderUniforms(mat, _doc);
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

            if (forceReload || _lastRadius == -1)
            {
                SyncFloorShaderIfPresent();
            }

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
                    bool hasStructures = _structureBuckets.TryGetValue(coord, out var structsInChunk) && structsInChunk.Count > 0;
                    if (!hasAuthoredProps && !hasStructures && (!insideMapBounds || ProceduralClutterPerChunk <= 0))
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
                    float groundY = TerrainElevation.SampleBaseTerrainHeight(prop.X, prop.Z, _doc);
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

            // 2. Spawn Multi-Floor 3D Structure Volumes (Watchtowers & Walk-In Crystal Caves) in this chunk
            if (_structureBuckets.TryGetValue(coord, out var structuresInChunk))
            {
                foreach (var s in structuresInChunk)
                {
                    SpawnStructureVolumeIntoChunk(s, chunkNode);
                    spawnedNodeProps++;
                }
            }

            // 3. Stage 4 Declarative Zero-Coordinate Ground-ID Scatter (Tier A MultiMesh + Tier B Colliders/Canopy)
            AddDeterministicProceduralClutter(coord, chunkNode, instancedBatches, ref spawnedNodeProps);

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
                    Name = $"GPUInstanced_{System.IO.Path.GetFileNameWithoutExtension(assetPath)}_{transforms.Count}",
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

        /// <summary>
        /// Builds a complete 3D multi-floor structure ("watchtower" or "crystal_cave") with deterministic
        /// stairs/portals and registers its upper deck / cave roof &amp; walls with <see cref="SmartCameraOccluder"/>
        /// for automatic interior cutaway.
        /// </summary>
        private void SpawnStructureVolumeIntoChunk(UnifiedMapStructureVolume s, Node3D chunkNode)
        {
            float baseY = TerrainElevation.SampleBaseTerrainHeight(s.X, s.Z, _doc);
            float r = Mathf.Max(2.5f, s.Radius);

            var root = new Node3D
            {
                Name = $"Structure_{s.Id}",
                Position = new Vector3(s.X, baseY, s.Z)
            };
            chunkNode.AddChild(root);

            if (s.Kind == "watchtower")
            {
                float deckH = Mathf.Max(2.2f, s.UpperFloorHeight);

                var stoneMat = new StandardMaterial3D
                {
                    AlbedoColor = new Color(0.58f, 0.56f, 0.52f),
                    Roughness = 0.85f
                };
                var darkStoneMat = new StandardMaterial3D
                {
                    AlbedoColor = new Color(0.42f, 0.40f, 0.38f),
                    Roughness = 0.90f
                };
                var woodDeckMat = new StandardMaterial3D
                {
                    AlbedoColor = new Color(0.52f, 0.36f, 0.22f),
                    Roughness = 0.80f
                };
                var goldRunnerMat = new StandardMaterial3D
                {
                    AlbedoColor = new Color(0.86f, 0.26f, 0.22f),
                    EmissionEnabled = true,
                    Emission = new Color(0.95f, 0.65f, 0.20f),
                    EmissionEnergyMultiplier = 0.35f,
                    Roughness = 0.72f
                };

                // 1st-Floor Walkable Stone Sanctuary Chamber Plinth
                var groundPlinth = new MeshInstance3D
                {
                    Name = "GroundFloorPlinth",
                    Mesh = new BoxMesh { Size = new Vector3(r * 2.0f, 0.14f, r * 2.0f) },
                    MaterialOverride = stoneMat,
                    Position = new Vector3(0f, 0.07f, 0f)
                };
                root.AddChild(groundPlinth);

                // Exterior East Stepped Stone Stair Ramp (matches TerrainElevation.SampleHeight 1:1!)
                // Climbs from Y=0 at x=+r+3.25m (East entrance) up to Y=deckH at x=+r-0.25m (2nd-floor deck edge)
                const int stepCount = 12;
                float rampStartX = r + 3.25f;
                float rampEndX = r - 0.25f;
                float stepSpanX = (rampStartX - rampEndX) / stepCount;
                for (int i = 0; i < stepCount; i++)
                {
                    float t = (i + 1f) / stepCount;
                    float stepH = deckH * t;
                    float sx = Mathf.Lerp(rampStartX, rampEndX, (i + 0.5f) / stepCount);
                    var stepBox = new MeshInstance3D
                    {
                        Name = $"StairStep_{i + 1}",
                        Mesh = new BoxMesh { Size = new Vector3(stepSpanX + 0.08f, stepH, 2.65f) },
                        MaterialOverride = stoneMat,
                        Position = new Vector3(sx, stepH * 0.5f, 0f)
                    };
                    root.AddChild(stepBox);

                    // Crimson-Gold Royal Stair Runner Carpet along the center of the steps so the climb path is unmistakable
                    var runnerStrip = new MeshInstance3D
                    {
                        Name = $"StairRunner_{i + 1}",
                        Mesh = new BoxMesh { Size = new Vector3(stepSpanX + 0.09f, 0.03f, 1.15f) },
                        MaterialOverride = goldRunnerMat,
                        Position = new Vector3(sx, stepH + 0.015f, 0f)
                    };
                    root.AddChild(runnerStrip);
                }

                // Upper 2nd-Floor Battlement Deck, Parapets & Supporting Pillars
                // (registered for automatic cutaway when player is on 1F or behind the tower!)
                var upperCanopy = new Node3D
                {
                    Name = "UpperDeckCanopy",
                    Position = new Vector3(0f, deckH, 0f)
                };
                root.AddChild(upperCanopy);

                // 4 Stone Corner Pillars: ankle-high plinth stays on 1F, upper shaft cuts away with 2F canopy!
                float pOff = r - 0.45f;
                (float px, float pz)[] corners =
                {
                    (-pOff, -pOff),
                    ( pOff, -pOff),
                    (-pOff,  pOff),
                    ( pOff,  pOff)
                };
                const float plinthH = 0.36f;
                float upperPillarH = Mathf.Max(0.5f, deckH - plinthH);
                foreach (var (px, pz) in corners)
                {
                    var pillarPlinth = new MeshInstance3D
                    {
                        Mesh = new BoxMesh { Size = new Vector3(0.76f, plinthH, 0.76f) },
                        MaterialOverride = darkStoneMat,
                        Position = new Vector3(px, plinthH * 0.5f, pz)
                    };
                    root.AddChild(pillarPlinth);

                    var pillarShaft = new MeshInstance3D
                    {
                        Mesh = new BoxMesh { Size = new Vector3(0.72f, upperPillarH, 0.72f) },
                        MaterialOverride = darkStoneMat,
                        Position = new Vector3(px, -upperPillarH * 0.5f, pz)
                    };
                    upperCanopy.AddChild(pillarShaft);
                }

                var upperSlab = new MeshInstance3D
                {
                    Name = "SecondFloorDeck",
                    Mesh = new BoxMesh { Size = new Vector3(r * 2.12f, 0.28f, r * 2.12f) },
                    MaterialOverride = woodDeckMat,
                    Position = new Vector3(0f, -0.10f, 0f)
                };
                upperCanopy.AddChild(upperSlab);

                // Low Battlement Parapet Walls (North, South, West — 0.62m high so they never hide the player on 2F)
                var northParapet = new MeshInstance3D
                {
                    Mesh = new BoxMesh { Size = new Vector3(r * 2.12f, 0.62f, 0.35f) },
                    MaterialOverride = stoneMat,
                    Position = new Vector3(0f, 0.31f, -r + 0.15f)
                };
                var southParapet = new MeshInstance3D
                {
                    Mesh = new BoxMesh { Size = new Vector3(r * 2.12f, 0.62f, 0.35f) },
                    MaterialOverride = stoneMat,
                    Position = new Vector3(0f, 0.31f, r - 0.15f)
                };
                var westParapet = new MeshInstance3D
                {
                    Mesh = new BoxMesh { Size = new Vector3(0.35f, 0.62f, r * 2.12f) },
                    MaterialOverride = stoneMat,
                    Position = new Vector3(-r + 0.15f, 0.31f, 0f)
                };
                upperCanopy.AddChild(northParapet);
                upperCanopy.AddChild(southParapet);
                upperCanopy.AddChild(westParapet);

                // Warm Beacon Torch Light on 2nd-Floor Battlement
                var beaconLight = new OmniLight3D
                {
                    LightColor = new Color(1.0f, 0.78f, 0.42f),
                    LightEnergy = 1.65f,
                    OmniRange = 9.5f,
                    Position = new Vector3(0f, 1.4f, 0f)
                };
                upperCanopy.AddChild(beaconLight);

                var bannerLabel = new Label3D
                {
                    Text = $"🏰 Watchtower (2F +{deckH:0.0}m)\n[Walk West Up East Stairs -> 2F]",
                    Billboard = BaseMaterial3D.BillboardModeEnum.Enabled,
                    FontSize = 22,
                    OutlineSize = 7,
                    Modulate = new Color(1.0f, 0.90f, 0.52f),
                    Position = new Vector3(0f, 1.85f, 0f)
                };
                upperCanopy.AddChild(bannerLabel);

                EntityView.ApplyAnimeToonShading(root, EntityKind.Npc);

                // Register the upper 2F canopy + pillar shafts for automatic 1st-floor interior & LOS cutaway
                // (never fade the stairs or the 2F deck when the player stands on top of the 2F deck!)
                _occluder?.RegisterRoofOrCeilingCanopy(
                    upperCanopy,
                    new Rect2(s.X - r, s.Z - r, r * 2.0f, r * 2.0f),
                    baseY + deckH);
            }
            else if (s.Kind == "crystal_cave")
            {
                float ceilH = Mathf.Max(2.6f, s.CeilingHeight);

                var cavernRockMat = new StandardMaterial3D
                {
                    AlbedoColor = new Color(0.28f, 0.31f, 0.38f),
                    Roughness = 0.92f
                };
                var cavernFloorMat = new StandardMaterial3D
                {
                    AlbedoColor = new Color(0.18f, 0.22f, 0.29f),
                    Roughness = 0.88f
                };
                var crystalMat = new StandardMaterial3D
                {
                    AlbedoColor = new Color(0.25f, 0.92f, 1.0f),
                    EmissionEnabled = true,
                    Emission = new Color(0.18f, 0.82f, 1.0f),
                    EmissionEnergyMultiplier = 2.1f,
                    Roughness = 0.2f
                };

                // Recessed Walk-In Crystal Cavern Floor Slab
                var caveFloor = new MeshInstance3D
                {
                    Name = "CavernFloor",
                    Mesh = new BoxMesh { Size = new Vector3(r * 1.9f, 0.16f, r * 1.9f) },
                    MaterialOverride = cavernFloorMat,
                    Position = new Vector3(0f, -0.32f, 0f)
                };
                root.AddChild(caveFloor);

                // Low ankle-high stone perimeter curb on the ground (0.28m high) so the cave boundary
                // remains clearly visible even when the upper walls & roof cut away!
                const float curbH = 0.28f;
                var westCurb = new MeshInstance3D
                {
                    Mesh = new BoxMesh { Size = new Vector3(0.95f, curbH, r * 1.95f) },
                    MaterialOverride = cavernRockMat,
                    Position = new Vector3(-r + 0.35f, curbH * 0.5f - 0.24f, 0f)
                };
                var eastCurb = new MeshInstance3D
                {
                    Mesh = new BoxMesh { Size = new Vector3(0.95f, curbH, r * 1.95f) },
                    MaterialOverride = cavernRockMat,
                    Position = new Vector3(r - 0.35f, curbH * 0.5f - 0.24f, 0f)
                };
                var northCurb = new MeshInstance3D
                {
                    Mesh = new BoxMesh { Size = new Vector3(r * 1.95f, curbH, 0.95f) },
                    MaterialOverride = cavernRockMat,
                    Position = new Vector3(0f, curbH * 0.5f - 0.24f, -r + 0.35f)
                };
                root.AddChild(westCurb);
                root.AddChild(eastCurb);
                root.AddChild(northCurb);

                // Glowing Bioluminescent Crystal Spires inside the Cavern (always visible!)
                (float cx, float cz, float ch, float rot)[] crystals =
                {
                    (-r * 0.45f, -r * 0.42f, 1.65f, 0.25f),
                    ( r * 0.48f, -r * 0.38f, 1.45f, -0.30f),
                    ( 0.0f,      -r * 0.52f, 1.95f, 0.10f)
                };
                foreach (var (cx, cz, ch, rot) in crystals)
                {
                    var spire = new MeshInstance3D
                    {
                        Mesh = new PrismMesh { Size = new Vector3(0.55f, ch, 0.55f) },
                        MaterialOverride = crystalMat,
                        Position = new Vector3(cx, ch * 0.42f - 0.2f, cz),
                        Rotation = new Vector3(rot * 0.35f, rot, -rot * 0.25f)
                    };
                    root.AddChild(spire);
                }

                var crystalLight = new OmniLight3D
                {
                    LightColor = new Color(0.22f, 0.88f, 1.0f),
                    LightEnergy = 2.25f,
                    OmniRange = 9.0f,
                    Position = new Vector3(0f, 1.2f, -0.4f)
                };
                root.AddChild(crystalLight);

                // Overhead Mountain Cavern Roof & Upper Walls Shell (auto-cuts away when the player walks inside or behind the cave!)
                var roofCanopy = new Node3D
                {
                    Name = "CaveRoofCanopy",
                    Position = new Vector3(0f, ceilH, 0f)
                };
                root.AddChild(roofCanopy);

                // Upper West, East, North Cavern Walls & South Portal Archway inside roofCanopy so they cut away with the roof!
                float wallShellH = Mathf.Max(1.8f, ceilH - curbH);
                float wallCenterRelY = -wallShellH * 0.5f;
                var westWall = new MeshInstance3D
                {
                    Mesh = new BoxMesh { Size = new Vector3(0.95f, wallShellH, r * 1.95f) },
                    MaterialOverride = cavernRockMat,
                    Position = new Vector3(-r + 0.35f, wallCenterRelY, 0f)
                };
                var eastWall = new MeshInstance3D
                {
                    Mesh = new BoxMesh { Size = new Vector3(0.95f, wallShellH, r * 1.95f) },
                    MaterialOverride = cavernRockMat,
                    Position = new Vector3(r - 0.35f, wallCenterRelY, 0f)
                };
                var northWall = new MeshInstance3D
                {
                    Mesh = new BoxMesh { Size = new Vector3(r * 1.95f, wallShellH, 0.95f) },
                    MaterialOverride = cavernRockMat,
                    Position = new Vector3(0f, wallCenterRelY, -r + 0.35f)
                };
                var archLeft = new MeshInstance3D
                {
                    Mesh = new BoxMesh { Size = new Vector3(0.95f, wallShellH, 0.85f) },
                    MaterialOverride = cavernRockMat,
                    Position = new Vector3(-r * 0.62f, wallCenterRelY, r - 0.25f)
                };
                var archRight = new MeshInstance3D
                {
                    Mesh = new BoxMesh { Size = new Vector3(0.95f, wallShellH, 0.85f) },
                    MaterialOverride = cavernRockMat,
                    Position = new Vector3(r * 0.62f, wallCenterRelY, r - 0.25f)
                };
                roofCanopy.AddChild(westWall);
                roofCanopy.AddChild(eastWall);
                roofCanopy.AddChild(northWall);
                roofCanopy.AddChild(archLeft);
                roofCanopy.AddChild(archRight);

                var roofDome = new MeshInstance3D
                {
                    Name = "MountainRoofSlab",
                    Mesh = new BoxMesh { Size = new Vector3(r * 2.15f, 0.95f, r * 2.15f) },
                    MaterialOverride = cavernRockMat,
                    Position = new Vector3(0f, 0.25f, 0f)
                };
                roofCanopy.AddChild(roofDome);

                var roofPeak = new MeshInstance3D
                {
                    Name = "MountainRoofPeak",
                    Mesh = new PrismMesh { Size = new Vector3(r * 1.75f, 1.35f, r * 1.75f) },
                    MaterialOverride = cavernRockMat,
                    Position = new Vector3(0f, 1.25f, 0f)
                };
                roofCanopy.AddChild(roofPeak);

                var caveLabel = new Label3D
                {
                    Text = "💎 Walk-In Crystal Cave\n[South Portal Entry | Auto Roof & Wall Cutaway]",
                    Billboard = BaseMaterial3D.BillboardModeEnum.Enabled,
                    FontSize = 22,
                    OutlineSize = 7,
                    Modulate = new Color(0.45f, 0.95f, 1.0f),
                    Position = new Vector3(0f, 2.25f, 0f)
                };
                roofCanopy.AddChild(caveLabel);

                EntityView.ApplyAnimeToonShading(root, EntityKind.Npc);

                _occluder?.RegisterRoofOrCeilingCanopy(
                    roofCanopy,
                    new Rect2(s.X - r, s.Z - r, r * 2.0f, r * 2.0f),
                    baseY + ceilH);
            }
        }

        /// <summary>
        /// Stage 4 Declarative <c>ground_id</c> Two-Tier Scatter Engine:
        /// - Tier A (16x16 = 256 virtual sub-cells per 24m chunk, <c>blocksMovement: false</c>):
        ///   Samples <c>groundPalettes[groundId].scatter</c> weights (<c>grass: 0.30, bush: 0.05, pebble: 0.02</c>)
        ///   into chunk-level <see cref="MultiMeshInstance3D"/> batches (1 GPU draw call per asset type, 0 Node3D overhead).
        /// - Tier B (6x6 = 36 stratified sub-cells per 24m chunk, <c>blocksMovement: true</c>):
        ///   Samples canopy trees and boulders (<c>canopy_tree: 0.04, boulder: 0.015</c>) outside route clearance corridors,
        ///   spawning LOS-fading <see cref="Node3D"/>s and registering deterministic colliders in the O(1) spatial hash grid.
        /// </summary>
        private void AddDeterministicProceduralClutter(
            Vector2I coord,
            Node3D chunkNode,
            Dictionary<string, List<Transform3D>> batches,
            ref int spawnedNodeProps)
        {
            int density = ProceduralClutterPerChunk;
            if (density <= 0)
                return;

            float densityScale = Mathf.Clamp(density / 48.0f, 0.1f, 3.0f);
            float halfW = _doc.HalfWidthWorld(0.1f) - 2.0f;
            float halfH = _doc.HalfHeightWorld(0.1f) - 2.0f;
            Rect2 rect = GetChunkWorldRect(coord);
            int seed = _doc.Seed;

            // --- TIER A: 16x16 Micro Ground Cover Grid (blocksMovement == false -> GPU MultiMeshInstance3D) ---
            const int tierAGrid = 16;
            float cellW = rect.Size.X / tierAGrid;
            float cellH = rect.Size.Y / tierAGrid;

            for (int gz = 0; gz < tierAGrid; gz++)
            {
                for (int gx = 0; gx < tierAGrid; gx++)
                {
                    int slotIdx = gz * tierAGrid + gx;
                    uint hPos = HashChunkItem(seed, coord.X, coord.Y, slotIdx);
                    float uJit = ((hPos & 0xFFFFu) / 65535.0f);
                    float vJit = (((hPos >> 16) & 0xFFFFu) / 65535.0f);

                    float wx = rect.Position.X + (gx + uJit) * cellW;
                    float wz = rect.Position.Y + (gz + vJit) * cellH;

                    if (Mathf.Abs(wx) > halfW || Mathf.Abs(wz) > halfH)
                        continue;

                    string groundId = _doc.ResolveGroundIdAt(wx, wz, out _, out float minRouteEdgeDist);
                    if (!_doc.GroundPalettes.TryGetValue(groundId, out var palette) || palette.Scatter.Count == 0)
                        continue;

                    int layerIdx = 0;
                    foreach (var (ruleName, rule) in palette.Scatter)
                    {
                        layerIdx++;
                        var enabledAssets = rule.GetEnabledAssets();
                        if (rule.BlocksMovement || rule.Weight <= 0.0005f || enabledAssets.Count == 0)
                            continue;

                        if (string.Equals(rule.Placement, "edge_only", StringComparison.OrdinalIgnoreCase) &&
                            minRouteEdgeDist > 0.95f)
                        {
                            continue;
                        }

                        uint hRoll = HashChunkItem(seed ^ (layerIdx * 7919), coord.X, coord.Y, slotIdx);
                        float roll = (hRoll & 0xFFFFu) / 65535.0f;
                        float effectiveWeight = Mathf.Clamp(rule.Weight * densityScale, 0f, 0.95f);
                        if (roll >= effectiveWeight)
                            continue;

                        string assetPath = enabledAssets[(int)((hRoll >> 16) % (uint)enabledAssets.Count)];
                        float minS = rule.ScaleRange != null && rule.ScaleRange.Length >= 1 ? rule.ScaleRange[0] : 0.65f;
                        float maxS = rule.ScaleRange != null && rule.ScaleRange.Length >= 2 ? rule.ScaleRange[1] : 0.95f;
                        float sLerp = ((hRoll >> 8) & 0xFFu) / 255.0f;
                        float scale = Mathf.Lerp(minS, maxS, sLerp);
                        float rotY = (hRoll & 0xFFu) / 255.0f * Mathf.Tau;
                        float groundY = TerrainElevation.SampleBaseTerrainHeight(wx, wz, _doc);

                        if (!batches.TryGetValue(assetPath, out var list))
                        {
                            list = new List<Transform3D>();
                            batches[assetPath] = list;
                        }

                        Basis basis = Basis.FromEuler(new Vector3(0f, rotY, 0f)).Scaled(Vector3.One * scale);
                        list.Add(new Transform3D(basis, new Vector3(wx, groundY, wz)));
                        break; // Maximum 1 micro instance per 1.5m sub-cell
                    }
                }
            }

            // --- TIER B: 6x6 Stratified Macro Canopy / Collider Grid (blocksMovement == true -> LOS-fading Node3D + Spatial Grid) ---
            const int tierBGrid = 6;
            float macroCellW = rect.Size.X / tierBGrid;
            float macroCellH = rect.Size.Y / tierBGrid;

            for (int tz = 0; tz < tierBGrid; tz++)
            {
                for (int tx = 0; tx < tierBGrid; tx++)
                {
                    int slotIdx = 1000 + tz * tierBGrid + tx;
                    uint hPos = HashChunkItem(seed ^ 0x13579BDF, coord.X, coord.Y, slotIdx);
                    float uJit = 0.15f + 0.70f * ((hPos & 0xFFFFu) / 65535.0f);
                    float vJit = 0.15f + 0.70f * (((hPos >> 16) & 0xFFFFu) / 65535.0f);

                    float wx = rect.Position.X + (tx + uJit) * macroCellW;
                    float wz = rect.Position.Y + (tz + vJit) * macroCellH;

                    if (Mathf.Abs(wx) > halfW || Mathf.Abs(wz) > halfH)
                        continue;

                    string groundId = _doc.ResolveGroundIdAt(wx, wz, out bool inRouteClearance, out _);
                    if (inRouteClearance)
                        continue;

                    if (!_doc.GroundPalettes.TryGetValue(groundId, out var palette) || palette.ClearColliders || palette.Scatter.Count == 0)
                        continue;

                    int layerIdx = 0;
                    foreach (var (ruleName, rule) in palette.Scatter)
                    {
                        layerIdx++;
                        var enabledAssets = rule.GetEnabledAssets();
                        if (!rule.BlocksMovement || rule.Weight <= 0.0005f || enabledAssets.Count == 0)
                            continue;

                        uint hRoll = HashChunkItem(seed ^ (layerIdx * 104729), coord.X, coord.Y, slotIdx);
                        float roll = (hRoll & 0xFFFFu) / 65535.0f;
                        // Scale weight from 1.5m density to 4.0m macro cell area (~3.2x)
                        float effectiveWeight = Mathf.Clamp(rule.Weight * 3.2f * densityScale, 0f, 0.85f);
                        if (roll >= effectiveWeight)
                            continue;

                        string assetPath = enabledAssets[(int)((hRoll >> 16) % (uint)enabledAssets.Count)];
                        float minS = rule.ScaleRange != null && rule.ScaleRange.Length >= 1 ? rule.ScaleRange[0] : 1.05f;
                        float maxS = rule.ScaleRange != null && rule.ScaleRange.Length >= 2 ? rule.ScaleRange[1] : 1.45f;
                        float sLerp = ((hRoll >> 8) & 0xFFu) / 255.0f;
                        float scale = Mathf.Lerp(minS, maxS, sLerp);
                        float rotY = (hRoll & 0xFFu) / 255.0f * Mathf.Tau;
                        float groundY = TerrainElevation.SampleBaseTerrainHeight(wx, wz, _doc);

                        string detId = $"proc_{ruleName}_{coord.X}_{coord.Y}_{tx}_{tz}";
                        var synthProp = new UnifiedMapProp
                        {
                            Id = detId,
                            AssetPath = assetPath,
                            X = wx,
                            Y = groundY,
                            Z = wz,
                            RotY = rotY,
                            Scale = scale,
                            BlocksMovement = true,
                            ColliderHalfExtent = rule.ColliderHalfExtent
                        };

                        if (SpawnSinglePropIntoChunk(synthProp, chunkNode, groundY))
                        {
                            spawnedNodeProps++;
                            float halfWorld = Mathf.Max(0.28f, rule.ColliderHalfExtent * scale * 0.65f);
                            _doc.IndexProceduralObstacleInSpatialGrid(detId, wx, wz, halfWorld, groundY);
                        }
                        break; // Maximum 1 macro tree/boulder per 4m cell
                    }
                }
            }
        }

        private static uint HashChunkItem(int seed, int cx, int cz, int index)
        {
            uint h = 2166136261u ^ (uint)seed;
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

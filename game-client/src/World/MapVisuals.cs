using System;
using System.Collections.Generic;
using Godot;

namespace AtlasWorld.Client.World
{
    /// <summary>
    /// STATIC, full-map ground detail so movement is trackable against fixed references:
    /// terrain-zone patches (ice / grass / mud / sand), a world-unit grid, stone walkways
    /// through the centre courtyard, scattered rocks, and the physics boundary walls.
    ///
    /// Data mirrors the server's <c>colyseus-server/src/config/mapConfig.ts</c>
    /// (MAP_DIMENSIONS + MAP_CONFIG.terrainZones + boundary walls in
    /// PlanckPhysicsManager). The zones are static server config, not synced state and
    /// not exposed over REST yet — if mapConfig.ts changes, update here too.
    /// TODO: serve map geometry from /api/maps/:mapId and fetch instead of mirroring.
    /// </summary>
    public sealed partial class MapVisuals : Node3D
    {
        private static readonly Dictionary<string, Vector2> MapDimensions = new()
        {
            // Mirrors MAP_DIMENSIONS; everything else falls back to GAME_CONFIG 1000×1000.
            ["map-for-test-deflect"] = new Vector2(100f, 100f),
        };

        private readonly record struct Zone(string Name, float X, float Y, float W, float H, Color Tint);

        // Mirrors MAP_CONFIG.terrainZones (friction zones; currently visual-only server-side).
        private static readonly Zone[] TerrainZones =
        {
            new("ice", 0, 0, 200, 150, new Color(0.72f, 0.83f, 0.92f)),
            new("grass", 200, 0, 200, 300, new Color(0.30f, 0.46f, 0.24f)),
            new("mud", 0, 150, 200, 150, new Color(0.36f, 0.27f, 0.17f)),
            new("sand", 400, 0, 200, 300, new Color(0.78f, 0.70f, 0.46f)),
        };

        private const float WalkwayWidth = 10f;
        private const float GridStep = 50f;

        public string CurrentMapId { get; private set; } = "";

        /// <summary>Free everything and rebuild the ground set for <paramref name="mapId"/>.</summary>
        public void Rebuild(string mapId)
        {
            if (mapId == CurrentMapId)
                return;
            CurrentMapId = mapId;

            foreach (Node child in GetChildren())
                child.QueueFree();

            Vector2 dims = MapDimensions.TryGetValue(mapId, out Vector2 d) ? d : new Vector2(1000f, 1000f);
            float w = dims.X, h = dims.Y;

            AddGroundPlane(w, h);
            AddTerrainZones(w, h);
            AddWalkways(w, h);
            AddGrid(w, h);
            AddRocks(mapId, w, h);
            AddBoundaryWalls(w, h);
        }

        private void AddGroundPlane(float w, float h)
        {
            AddChild(new MeshInstance3D
            {
                Mesh = new PlaneMesh { Size = new Vector2(w, h) },
                Position = new Vector3(w / 2f, 0f, h / 2f),
                MaterialOverride = Mat(new Color(0.23f, 0.31f, 0.20f)), // dark meadow base
            });
        }

        private void AddTerrainZones(float w, float h)
        {
            foreach (Zone z in TerrainZones)
            {
                // Server zones are authored for the 1000-map; clip zones that fall outside
                // a smaller map instead of drawing patches past its edge.
                float zw = Mathf.Min(z.W, w - z.X);
                float zh = Mathf.Min(z.H, h - z.Y);
                if (zw <= 0f || zh <= 0f)
                    continue;

                AddChild(new MeshInstance3D
                {
                    Mesh = new PlaneMesh { Size = new Vector2(zw, zh) },
                    Position = new Vector3(z.X + zw / 2f, 0.02f, z.Y + zh / 2f),
                    MaterialOverride = Mat(z.Tint),
                });

                AddChild(new Label3D
                {
                    Text = z.Name.ToUpperInvariant(),
                    Position = new Vector3(z.X + zw / 2f, 0.6f, z.Y + zh / 2f),
                    Billboard = BaseMaterial3D.BillboardModeEnum.Enabled,
                    Modulate = new Color(1f, 1f, 1f, 0.55f),
                    PixelSize = 0.04f,
                    FontSize = 48,
                });
            }
        }

        // A stone cross through the map centre (the courtyard at ~(w/2, h/2) is where the
        // action spawns) — the strongest fixed reference for judging motion.
        private void AddWalkways(float w, float h)
        {
            Color stone = new(0.52f, 0.52f, 0.55f);
            AddChild(new MeshInstance3D
            {
                Mesh = new PlaneMesh { Size = new Vector2(w, WalkwayWidth) },
                Position = new Vector3(w / 2f, 0.03f, h / 2f),
                MaterialOverride = Mat(stone),
            });
            AddChild(new MeshInstance3D
            {
                Mesh = new PlaneMesh { Size = new Vector2(WalkwayWidth, h) },
                Position = new Vector3(w / 2f, 0.03f, h / 2f),
                MaterialOverride = Mat(stone),
            });
        }

        private void AddGrid(float w, float h)
        {
            var mat = new StandardMaterial3D
            {
                AlbedoColor = new Color(0f, 0f, 0f, 0.28f),
                Transparency = BaseMaterial3D.TransparencyEnum.Alpha,
                ShadingMode = BaseMaterial3D.ShadingModeEnum.Unshaded,
            };

            for (float x = 0f; x <= w + 0.01f; x += GridStep)
            {
                AddChild(new MeshInstance3D
                {
                    Mesh = new BoxMesh { Size = new Vector3(0.2f, 0.02f, h) },
                    Position = new Vector3(x, 0.05f, h / 2f),
                    MaterialOverride = mat,
                });
            }
            for (float z = 0f; z <= h + 0.01f; z += GridStep)
            {
                AddChild(new MeshInstance3D
                {
                    Mesh = new BoxMesh { Size = new Vector3(w, 0.02f, 0.2f) },
                    Position = new Vector3(w / 2f, 0.05f, z),
                    MaterialOverride = mat,
                });
            }
        }

        // Decorative but deterministic (seeded by mapId) so the layout is stable across
        // runs — a moving landmark would defeat the point.
        private void AddRocks(string mapId, float w, float h)
        {
            var rng = new Random(mapId.GetHashCode());
            var mat = Mat(new Color(0.42f, 0.42f, 0.45f));
            int count = (int)(w * h / 25000f); // ~40 on the 1000-map, 0–1 on tiny maps

            for (int i = 0; i < count; i++)
            {
                float x = (float)rng.NextDouble() * w;
                float z = (float)rng.NextDouble() * h;

                // Keep the walkway cross clear.
                if (Math.Abs(x - w / 2f) < WalkwayWidth || Math.Abs(z - h / 2f) < WalkwayWidth)
                    continue;

                float s = 0.8f + (float)rng.NextDouble() * 2.2f;
                AddChild(new MeshInstance3D
                {
                    Mesh = new BoxMesh { Size = new Vector3(s, s * 0.7f, s * 0.9f) },
                    Position = new Vector3(x, s * 0.3f, z),
                    RotationDegrees = new Vector3(0f, (float)rng.NextDouble() * 90f, 0f),
                    MaterialOverride = mat,
                });
            }
        }

        // Mirrors the Planck boundary walls: the physical world edge, made visible.
        private void AddBoundaryWalls(float w, float h)
        {
            var mat = Mat(new Color(0.30f, 0.25f, 0.22f));
            const float wallH = 2f;
            const float wallT = 1f;

            void Wall(Vector3 size, Vector3 pos) =>
                AddChild(new MeshInstance3D
                {
                    Mesh = new BoxMesh { Size = size },
                    Position = pos,
                    MaterialOverride = mat,
                });

            Wall(new Vector3(w + wallT * 2, wallH, wallT), new Vector3(w / 2f, wallH / 2f, -wallT / 2f));
            Wall(new Vector3(w + wallT * 2, wallH, wallT), new Vector3(w / 2f, wallH / 2f, h + wallT / 2f));
            Wall(new Vector3(wallT, wallH, h), new Vector3(-wallT / 2f, wallH / 2f, h / 2f));
            Wall(new Vector3(wallT, wallH, h), new Vector3(w + wallT / 2f, wallH / 2f, h / 2f));
        }

        private static StandardMaterial3D Mat(Color color) => new() { AlbedoColor = color };
    }
}

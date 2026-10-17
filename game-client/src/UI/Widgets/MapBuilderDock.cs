using System;
using System.Collections.Generic;
using Godot;
using AtlasWorld.Client.World;

namespace AtlasWorld.Client.UI.Widgets
{
    /// <summary>
    /// Native macOS / Godot 4 In-Engine 3D Map Builder Dock &amp; Viewport Controller.
    /// Supports the 4-Stage Systematic Map Creation Pipeline:
    /// - Stage 1 (Concept): Zone Identity, World Scale (1000²..4000²), Day/Night Atmosphere &amp; Seed
    /// - Stage 2 (Outline &amp; Route): 2D Polyline Route Splines (<c>routes[]</c>), <c>groundZones[]</c> &amp; Spawn Areas
    /// - Stage 3 (Build 3D Macro): Height Terraces (+Hill, +Cliff, +Valley), 2-Story Watchtowers &amp; Walk-In Crystal Caves
    /// - Stage 4 (Fill Detail via <c>ground_id</c>): Declarative scatter weights (<c>grass: 0.30, bush: 0.05, canopy_tree: 0.04</c>)
    ///   rendered via chunk-level <see cref="MultiMeshInstance3D"/> and LOS-fading <see cref="SmartCameraOccluder"/>.
    /// </summary>
    public partial class MapBuilderDock : Control
    {
        public readonly record struct CatalogAsset(
            string Label,
            string Category,
            string AssetPath,
            bool DefaultBlocksMovement,
            float DefaultColliderHalfExtent,
            float DefaultScale);

        public static readonly CatalogAsset[] AssetCatalog =
        {
            new("Oak Tree A", "Nature", "res://assets/nature/tree_1_a_color1.glb", true, 1.1f, 1.5f),
            new("Pine Tree B", "Nature", "res://assets/nature/tree_2_a_color1.glb", true, 1.1f, 1.5f),
            new("Canopy Tree C", "Nature", "res://assets/nature/tree_3_a_color1.glb", true, 1.2f, 1.5f),
            new("Meadow Bush A", "Nature", "res://assets/nature/bush_1_a_color1.glb", false, 0.6f, 1.2f),
            new("Flower Bush B", "Nature", "res://assets/nature/bush_2_a_color1.glb", false, 0.6f, 1.2f),
            new("Moss Boulder A", "Nature", "res://assets/nature/rock_1_a_color1.glb", true, 0.9f, 1.3f),
            new("Granite Rock B", "Nature", "res://assets/nature/rock_2_a_color1.glb", true, 0.85f, 1.25f),
            new("Grass Tuft A", "Nature", "res://assets/nature/grass_1_a_color1.glb", false, 0.4f, 1.2f),
            new("Sanctuary Pillar", "Sanctuary", "res://assets/dungeon/pillar.glb", true, 0.65f, 1.15f),
            new("Stone Column", "Sanctuary", "res://assets/dungeon/column.glb", true, 0.65f, 1.15f),
            new("Royal Banner Blue", "Sanctuary", "res://assets/dungeon/banner_shield_blue.glb", false, 0.4f, 1.1f),
            new("Royal Banner Red", "Sanctuary", "res://assets/dungeon/banner_shield_red.glb", false, 0.4f, 1.1f),
            new("Lit Brazier Torch", "Sanctuary", "res://assets/dungeon/torch_lit.glb", false, 0.35f, 1.0f),
            new("Wooden Barrel", "Town Props", "res://assets/dungeon/barrel_large.glb", true, 0.55f, 1.0f),
            new("Supply Crate", "Town Props", "res://assets/dungeon/crate_large.glb", true, 0.60f, 1.0f),
            new("Treasure Chest", "Town Props", "res://assets/dungeon/chest.glb", true, 0.55f, 1.0f),
            new("Stone Wall Segment", "Town Props", "res://assets/dungeon/wall.glb", true, 1.1f, 1.0f),
            new("Cobblestone Tile", "Town Props", "res://assets/dungeon/floor_tile_large.glb", false, 1.0f, 1.0f),
        };

        private VerticalSliceRoot _root = null!;
        private UnifiedMapDocument _doc = null!;
        private MapChunkStreamer _streamer = null!;
        private SmartCameraOccluder _occluder = null!;
        private Node3D _gizmoRoot = null!;
        private Node3D _chunkGridGizmoRoot = null!;
        private Node3D? _cursorPreviewNode;
        private MeshInstance3D? _cursorRingMesh;

        private bool _builderActive = false;
        private int _activePipelineStage = 0; // 0 = All, 1 = Concept, 2 = Outline & Route, 3 = 3D Macro, 4 = Ground Detail
        private int _selectedAssetIndex = 0;
        private float _placementRotY = 0f;
        private float _placementScale = 1.4f;
        private bool _placementBlocksMovement = true;
        private bool _showServerAabbs = true;
        private bool _showSpawnZones = true;
        private bool _showChunkGrid = true;
        private bool _showElevationContours = true;
        private Vector3 _cursorWorldPos = new(0f, 0f, -5f);

        // Free-fly / Orbit Builder Camera state
        private Vector3 _camFocus = new(0f, 0f, -3f);
        private float _camYaw = 0.22f;
        private float _camPitch = 0.72f;
        private float _camDistance = 26.0f;
        private bool _rightMouseOrbiting = false;

        // UI Elements
        private PanelContainer? _dockPanel;
        private PanelContainer? _topBanner;
        private Button? _toggleBuilderBtn;
        private Button? _topBannerMobsBtn;
        private Button? _topBannerTimeBtn;
        private Label? _selectedAssetLabel;
        private Label? _cursorCoordLabel;
        private Label? _statsSummaryLabel;
        private Label? _streamingStatusLabel;
        private Label? _occlusionStatusLabel;
        private Label? _saveFeedbackLabel;
        private CheckBox? _blocksMoveCheck;
        private HSlider? _scaleSlider;
        private Label? _scaleValLabel;
        private HSlider? _rotSlider;
        private Label? _rotValLabel;
        private HSlider? _chunkRadiusSlider;
        private Label? _chunkRadiusValLabel;
        private HSlider? _clutterDensitySlider;
        private Label? _clutterDensityValLabel;
        private HSlider? _grassWeightSlider;
        private Label? _grassWeightValLabel;
        private HSlider? _bushWeightSlider;
        private Label? _bushWeightValLabel;
        private HSlider? _treeWeightSlider;
        private Label? _treeWeightValLabel;
        private HSlider? _terrainAmpSlider;
        private Label? _terrainAmpValLabel;
        private HSlider? _occlusionAlphaSlider;
        private Label? _occlusionAlphaValLabel;
        private HSlider? _timeSlider;
        private Label? _timeValLabel;
        private CheckBox? _autoTimeCheck;
        private HSlider? _timeSpeedSlider;
        private Label? _timeSpeedValLabel;
        private bool _suppressTimeSliderSignal = false;

        private VBoxContainer? _stage1Container;
        private VBoxContainer? _stage2And4Container;
        private VBoxContainer? _stage3Container;
        private VBoxContainer? _heroPropsContainer;
        private readonly List<(int stage, Button btn)> _stageButtons = new();
        private readonly List<Button> _catalogButtons = new();
        private readonly List<(float size, Button btn)> _mapSizeButtons = new();
        private readonly List<(WorldDayPhase phase, Button btn)> _timePresetButtons = new();
        private readonly List<UnifiedMapStaticObstacle> _nearbyObstaclesBuffer = new();

        public bool IsBuilderActive => _builderActive;
        public Vector3 CameraFocus => _camFocus;

        public void Initialize(
            VerticalSliceRoot root,
            UnifiedMapDocument doc,
            MapChunkStreamer streamer,
            SmartCameraOccluder occluder)
        {
            _root = root;
            _doc = doc;
            _streamer = streamer;
            _occluder = occluder;

            _gizmoRoot = new Node3D { Name = "MapBuilderGizmos", Visible = false };
            _root.AddChild(_gizmoRoot);

            _chunkGridGizmoRoot = new Node3D { Name = "ChunkGridGizmos" };
            _gizmoRoot.AddChild(_chunkGridGizmoRoot);

            BuildUi();
            _root.PeacefulModeChanged += _ => SyncPeacefulButtonState();
            SyncPeacefulButtonState();

            _streamer.UpdateStreaming(_camFocus, forceReload: true);
            RebuildGizmoOverlays();
            RebuildChunkGridGizmos();
            SelectCatalogAsset(0);
            RefreshMapSizeButtons();
            SelectPipelineStage(0);
            SyncTimeControlsFromCycle();

            if (OS.GetEnvironment("ATLAS_MAP_BUILDER") == "1")
            {
                SetBuilderActive(true);
            }
        }

        public override void _Process(double delta)
        {
            if (!_builderActive && _root?.PlayerAvatar != null && _cursorCoordLabel != null)
            {
                Vector3 p = _root.PlayerAvatar.Position;
                string floorTag = ResolvePlayerFloorTag(p);
                string groundId = _doc != null ? _doc.ResolveGroundIdAt(p.X, p.Z, out _, out _) : "meadow_grass";
                _cursorCoordLabel.Text =
                    $"Pos ({p.X:0.1}, Alt {p.Y:+0.00;-0.00}m [{floorTag}], {p.Z:0.1}) | Ground: {groundId}";
            }
        }

        private string ResolvePlayerFloorTag(Vector3 p)
        {
            if (_doc == null) return "1F";
            for (int i = 0; i < _doc.Structures.Count; i++)
            {
                var s = _doc.Structures[i];
                float r = Mathf.Max(2.5f, s.Radius);
                float baseY = TerrainElevation.SampleBaseTerrainHeight(s.X, s.Z, _doc);
                if (s.Kind == "watchtower")
                {
                    if (Mathf.Abs(p.X - s.X) <= r * 1.06f && Mathf.Abs(p.Z - s.Z) <= r * 1.06f)
                    {
                        return p.Y >= baseY + s.UpperFloorHeight * 0.45f ? "2F TOWER DECK" : "1F TOWER";
                    }
                    if (p.X >= s.X + r - 0.35f && p.X <= s.X + r + 3.45f && Mathf.Abs(p.Z - s.Z) <= 1.55f)
                    {
                        return "TOWER STAIRS";
                    }
                }
                else if (s.Kind == "crystal_cave")
                {
                    if (Mathf.Abs(p.X - s.X) <= r && Mathf.Abs(p.Z - s.Z) <= r + 1.5f)
                    {
                        return "CRYSTAL CAVE";
                    }
                }
            }
            return "GROUND";
        }

        private void SyncPeacefulButtonState()
        {
            if (_topBannerMobsBtn == null || _root == null)
                return;

            bool peaceful = _root.IsPeacefulMode;
            _topBannerMobsBtn.Text = peaceful
                ? "\ud83d\udd4a MOBS: OFF [P]"
                : "\u2694 MOBS: ON [P]";
            _topBannerMobsBtn.Modulate = peaceful
                ? new Color(0.45f, 1.0f, 0.68f)
                : new Color(1.0f, 0.72f, 0.42f);
        }

        private float GetScatterRuleWeight(string groundId, string ruleKey, float fallback)
        {
            if (_doc.GroundPalettes.TryGetValue(groundId, out var pal) &&
                pal.Scatter.TryGetValue(ruleKey, out var rule))
            {
                return rule.Weight;
            }
            return fallback;
        }

        private void SetScatterRuleWeight(string groundId, string ruleKey, float newWeight)
        {
            _doc.EnsureDefaultGroundPalettes();
            if (_doc.GroundPalettes.TryGetValue(groundId, out var pal) &&
                pal.Scatter.TryGetValue(ruleKey, out var rule))
            {
                rule.Weight = Mathf.Round(newWeight * 1000f) / 1000f;
            }
            _streamer.UpdateStreaming(_camFocus, forceReload: true);
            UpdateStatsLabel();
        }

        private void BuildUi()
        {
            AnchorsPreset = (int)LayoutPreset.FullRect;
            MouseFilter = MouseFilterEnum.Ignore;

            // 1. Top-Center Map Builder Toggle Pill & Live Altitude / Floor / Ground-ID / Peaceful Mobs / World Time Status Banner
            _topBanner = new PanelContainer
            {
                Name = "BuilderTopBanner",
                AnchorLeft = 0.5f,
                AnchorRight = 0.5f,
                OffsetLeft = -540f,
                OffsetTop = 10f,
                OffsetRight = 540f,
                OffsetBottom = 46f,
                MouseFilter = MouseFilterEnum.Stop
            };
            var bannerStyle = new StyleBoxFlat
            {
                BgColor = new Color(0.06f, 0.09f, 0.15f, 0.94f),
                BorderWidthLeft = 1,
                BorderWidthTop = 1,
                BorderWidthRight = 1,
                BorderWidthBottom = 2,
                BorderColor = new Color(0.95f, 0.78f, 0.35f, 0.95f),
                CornerRadiusTopLeft = 9,
                CornerRadiusTopRight = 9,
                CornerRadiusBottomLeft = 9,
                CornerRadiusBottomRight = 9,
                ContentMarginLeft = 10,
                ContentMarginRight = 10,
                ContentMarginTop = 5,
                ContentMarginBottom = 5
            };
            _topBanner.AddThemeStyleboxOverride("panel", bannerStyle);

            var bannerHBox = new HBoxContainer();
            bannerHBox.AddThemeConstantOverride("separation", 8);
            _topBanner.AddChild(bannerHBox);

            _toggleBuilderBtn = new Button
            {
                Text = "\ud83d\uddfa MAP BUILDER [F2]: OFF",
                CustomMinimumSize = new Vector2(162, 26)
            };
            _toggleBuilderBtn.AddThemeFontSizeOverride("font_size", 11);
            _toggleBuilderBtn.Pressed += () => SetBuilderActive(!_builderActive);
            bannerHBox.AddChild(_toggleBuilderBtn);

            _cursorCoordLabel = new Label
            {
                Text = "Pos (-2.4, Alt +0.38m [GROUND], -2.0) | Ground: meadow_grass",
                SizeFlagsHorizontal = SizeFlags.ExpandFill
            };
            _cursorCoordLabel.AddThemeFontSizeOverride("font_size", 11);
            _cursorCoordLabel.AddThemeColorOverride("font_color", new Color(0.86f, 0.92f, 1.0f));
            bannerHBox.AddChild(_cursorCoordLabel);

            _topBannerMobsBtn = new Button
            {
                Text = "\ud83d\udd4a MOBS: OFF [P]",
                CustomMinimumSize = new Vector2(118, 26),
                TooltipText = "Click or press [P] to toggle Monsters ON/OFF for peaceful 3D terrain & watchtower testing"
            };
            _topBannerMobsBtn.AddThemeFontSizeOverride("font_size", 11);
            _topBannerMobsBtn.Pressed += () => _root.TogglePeacefulMode();
            bannerHBox.AddChild(_topBannerMobsBtn);

            _topBannerTimeBtn = new Button
            {
                Text = "\u2600 10:30 DAY [T]",
                CustomMinimumSize = new Vector2(124, 26),
                TooltipText = "Click or press [T] to cycle World Time (Dawn / Noon / Sunset / Night)"
            };
            _topBannerTimeBtn.AddThemeFontSizeOverride("font_size", 11);
            _topBannerTimeBtn.Pressed += CycleWorldTimeFromBuilder;
            bannerHBox.AddChild(_topBannerTimeBtn);

            var quickSaveBtn = new Button
            {
                Text = "\ud83d\udcbe SAVE JSON (Cmd+S)",
                CustomMinimumSize = new Vector2(132, 26)
            };
            quickSaveBtn.AddThemeFontSizeOverride("font_size", 11);
            quickSaveBtn.Pressed += SaveUnifiedMap;
            bannerHBox.AddChild(quickSaveBtn);

            AddChild(_topBanner);

            // 2. Left-Side Map Builder Studio Dock
            _dockPanel = new PanelContainer
            {
                Name = "BuilderLeftDock",
                Visible = false,
                OffsetLeft = 14f,
                OffsetTop = 52f,
                OffsetRight = 388f,
                OffsetBottom = 935f,
                MouseFilter = MouseFilterEnum.Stop
            };
            var dockStyle = new StyleBoxFlat
            {
                BgColor = new Color(0.06f, 0.09f, 0.15f, 0.95f),
                BorderWidthLeft = 2,
                BorderWidthTop = 2,
                BorderWidthRight = 2,
                BorderWidthBottom = 2,
                BorderColor = new Color(0.92f, 0.76f, 0.36f, 0.92f),
                CornerRadiusTopLeft = 10,
                CornerRadiusTopRight = 10,
                CornerRadiusBottomLeft = 10,
                CornerRadiusBottomRight = 10,
                ContentMarginLeft = 12,
                ContentMarginRight = 12,
                ContentMarginTop = 8,
                ContentMarginBottom = 8,
                ShadowColor = new Color(0f, 0f, 0f, 0.55f),
                ShadowSize = 8
            };
            _dockPanel.AddThemeStyleboxOverride("panel", dockStyle);
            AddChild(_dockPanel);

            var vbox = new VBoxContainer();
            vbox.AddThemeConstantOverride("separation", 3);
            _dockPanel.AddChild(vbox);

            var title = new Label
            {
                Text = "4-STAGE SYSTEMATIC 3D MAP PIPELINE (v3)",
                Modulate = new Color(0.98f, 0.85f, 0.45f)
            };
            title.AddThemeFontSizeOverride("font_size", 11);
            vbox.AddChild(title);

            // 4-Stage Pipeline Stepper Tabs
            var stageRow = new HBoxContainer();
            stageRow.AddThemeConstantOverride("separation", 3);
            (int stageId, string stageLabel)[] stages =
            {
                (0, "All"),
                (1, "1.Concept"),
                (2, "2.Routes"),
                (3, "3.3D Macro"),
                (4, "4.Ground ID")
            };
            foreach (var (sId, sLbl) in stages)
            {
                int targetStage = sId;
                var stBtn = new Button
                {
                    Text = sLbl,
                    SizeFlagsHorizontal = SizeFlags.ExpandFill,
                    CustomMinimumSize = new Vector2(0, 21)
                };
                stBtn.AddThemeFontSizeOverride("font_size", 9);
                stBtn.Pressed += () => SelectPipelineStage(targetStage);
                _stageButtons.Add((targetStage, stBtn));
                stageRow.AddChild(stBtn);
            }
            vbox.AddChild(stageRow);

            _statsSummaryLabel = new Label
            {
                Text = "Map: freja-south-gate (4000x4000)",
                Modulate = new Color(0.72f, 0.86f, 0.98f)
            };
            _statsSummaryLabel.AddThemeFontSizeOverride("font_size", 10);
            vbox.AddChild(_statsSummaryLabel);

            _streamingStatusLabel = new Label
            {
                Text = "On-Demand Streamer: 0/0 Chunks Active",
                Modulate = new Color(0.45f, 1.0f, 0.68f)
            };
            _streamingStatusLabel.AddThemeFontSizeOverride("font_size", 10);
            vbox.AddChild(_streamingStatusLabel);

            _occlusionStatusLabel = new Label
            {
                Text = "Smart LOS & Roof Cutaway: Active",
                Modulate = new Color(0.62f, 0.90f, 1.0f)
            };
            _occlusionStatusLabel.AddThemeFontSizeOverride("font_size", 10);
            vbox.AddChild(_occlusionStatusLabel);

            vbox.AddChild(new HSeparator());

            // === STAGE 1: Draft Concept, Map Bounds, Chunks & World Time ===
            _stage1Container = new VBoxContainer();
            _stage1Container.AddThemeConstantOverride("separation", 3);
            vbox.AddChild(_stage1Container);

            var scaleHeader = new Label
            {
                Text = "STAGE 1: CONCEPT, BOUNDS & WORLD TIME [T]",
                Modulate = new Color(0.95f, 0.88f, 0.65f)
            };
            scaleHeader.AddThemeFontSizeOverride("font_size", 10);
            _stage1Container.AddChild(scaleHeader);

            var sizeBtnRow = new HBoxContainer();
            sizeBtnRow.AddThemeConstantOverride("separation", 5);
            (float size, string label)[] mapSizes =
            {
                (1000f, "1000\u00b2 (100m)"),
                (2000f, "2000\u00b2 (200m)"),
                (4000f, "4000\u00b2 (400m)")
            };
            foreach (var (sz, lbl) in mapSizes)
            {
                float targetSize = sz;
                var sBtn = new Button
                {
                    Text = lbl,
                    SizeFlagsHorizontal = SizeFlags.ExpandFill,
                    CustomMinimumSize = new Vector2(0, 21)
                };
                sBtn.AddThemeFontSizeOverride("font_size", 10);
                sBtn.Pressed += () => ApplyMapResize(targetSize);
                _mapSizeButtons.Add((targetSize, sBtn));
                sizeBtnRow.AddChild(sBtn);
            }
            _stage1Container.AddChild(sizeBtnRow);

            var radiusRow = new HBoxContainer();
            var radiusLbl = new Label { Text = "Load Radius:", CustomMinimumSize = new Vector2(82, 0) };
            radiusLbl.AddThemeFontSizeOverride("font_size", 10);
            _chunkRadiusSlider = new HSlider
            {
                MinValue = 1,
                MaxValue = 5,
                Step = 1,
                Value = _streamer.ActiveChunkRadius,
                SizeFlagsHorizontal = SizeFlags.ExpandFill
            };
            int sideInit = _streamer.ActiveChunkRadius * 2 + 1;
            _chunkRadiusValLabel = new Label
            {
                Text = $"R={_streamer.ActiveChunkRadius} ({sideInit}\u00d7{sideInit})",
                CustomMinimumSize = new Vector2(64, 0),
                HorizontalAlignment = HorizontalAlignment.Right
            };
            _chunkRadiusValLabel.AddThemeFontSizeOverride("font_size", 10);
            _chunkRadiusSlider.ValueChanged += val =>
            {
                int r = (int)Math.Round(val);
                _streamer.ActiveChunkRadius = r;
                int side = r * 2 + 1;
                _chunkRadiusValLabel.Text = $"R={r} ({side}\u00d7{side})";
                _streamer.UpdateStreaming(_camFocus, forceReload: true);
                RebuildChunkGridGizmos();
                RebuildGizmoOverlays();
                UpdateStatsLabel();
            };
            radiusRow.AddChild(radiusLbl);
            radiusRow.AddChild(_chunkRadiusSlider);
            radiusRow.AddChild(_chunkRadiusValLabel);
            _stage1Container.AddChild(radiusRow);

            var timeRow = new HBoxContainer();
            var timeLbl = new Label { Text = "World Clock:", CustomMinimumSize = new Vector2(80, 0) };
            timeLbl.AddThemeFontSizeOverride("font_size", 10);
            _timeSlider = new HSlider
            {
                MinValue = 0.0,
                MaxValue = 23.95,
                Step = 0.05,
                Value = _root.DayNightCycle.TimeOfDayHours,
                SizeFlagsHorizontal = SizeFlags.ExpandFill
            };
            _timeValLabel = new Label
            {
                Text = $"{_root.DayNightCycle.PhaseIconGlyph} {_root.DayNightCycle.FormattedClockString} {_root.DayNightCycle.PhaseDisplayName}",
                CustomMinimumSize = new Vector2(86, 0),
                HorizontalAlignment = HorizontalAlignment.Right
            };
            _timeValLabel.AddThemeFontSizeOverride("font_size", 10);
            _timeSlider.ValueChanged += val =>
            {
                if (_suppressTimeSliderSignal) return;
                _root.DayNightCycle.AutoAdvance = false;
                _root.DayNightCycle.SetTimeOfDay((float)val, _doc);
                _doc.DefaultTimeOfDayHours = _root.DayNightCycle.TimeOfDayHours;
                _doc.AutoAdvanceDayNight = false;
                SyncTimeControlsFromCycle();
            };
            timeRow.AddChild(timeLbl);
            timeRow.AddChild(_timeSlider);
            timeRow.AddChild(_timeValLabel);
            _stage1Container.AddChild(timeRow);

            var timePresetRow = new HBoxContainer();
            timePresetRow.AddThemeConstantOverride("separation", 4);
            (WorldDayPhase phase, float hr, string label)[] timePresets =
            {
                (WorldDayPhase.Dawn, 6.5f, "\u2600 Dawn"),
                (WorldDayPhase.Day, 12.5f, "\u2600 Noon"),
                (WorldDayPhase.Dusk, 18.25f, "\u25d0 Sunset"),
                (WorldDayPhase.Night, 22.5f, "\u263e Night")
            };
            foreach (var (phase, hr, lbl) in timePresets)
            {
                float targetHr = hr;
                var pBtn = new Button
                {
                    Text = lbl,
                    SizeFlagsHorizontal = SizeFlags.ExpandFill,
                    CustomMinimumSize = new Vector2(0, 20)
                };
                pBtn.AddThemeFontSizeOverride("font_size", 9);
                pBtn.Pressed += () =>
                {
                    _root.DayNightCycle.AutoAdvance = false;
                    _root.DayNightCycle.SetTimeOfDay(targetHr, _doc);
                    _doc.DefaultTimeOfDayHours = targetHr;
                    _doc.AutoAdvanceDayNight = false;
                    SyncTimeControlsFromCycle();
                    if (_saveFeedbackLabel != null)
                    {
                        _saveFeedbackLabel.Text = $"Set World Time -> {_root.DayNightCycle.FormattedClockString} ({_root.DayNightCycle.PhaseDisplayName}). Saved on Cmd+S.";
                        _saveFeedbackLabel.Modulate = new Color(0.98f, 0.86f, 0.45f);
                    }
                };
                _timePresetButtons.Add((phase, pBtn));
                timePresetRow.AddChild(pBtn);
            }
            _stage1Container.AddChild(timePresetRow);

            var timeSpeedRow = new HBoxContainer();
            timeSpeedRow.AddThemeConstantOverride("separation", 6);
            _autoTimeCheck = new CheckBox
            {
                Text = "Auto-Cycle",
                ButtonPressed = _root.DayNightCycle.AutoAdvance
            };
            _autoTimeCheck.AddThemeFontSizeOverride("font_size", 10);
            _autoTimeCheck.Toggled += on =>
            {
                _root.DayNightCycle.AutoAdvance = on;
                _doc.AutoAdvanceDayNight = on;
                SyncTimeControlsFromCycle();
            };

            var speedLbl = new Label { Text = "Speed:" };
            speedLbl.AddThemeFontSizeOverride("font_size", 10);
            _timeSpeedSlider = new HSlider
            {
                MinValue = 0.02,
                MaxValue = 1.00,
                Step = 0.02,
                Value = _root.DayNightCycle.HoursPerRealSecond,
                SizeFlagsHorizontal = SizeFlags.ExpandFill
            };
            _timeSpeedValLabel = new Label
            {
                Text = $"{_root.DayNightCycle.HoursPerRealSecond:0.00}h/s",
                CustomMinimumSize = new Vector2(46, 0),
                HorizontalAlignment = HorizontalAlignment.Right
            };
            _timeSpeedValLabel.AddThemeFontSizeOverride("font_size", 10);
            _timeSpeedSlider.ValueChanged += val =>
            {
                _root.DayNightCycle.HoursPerRealSecond = (float)val;
                _doc.DayNightSpeedHoursPerSec = (float)val;
                if (_timeSpeedValLabel != null)
                    _timeSpeedValLabel.Text = $"{val:0.00}h/s";
            };
            timeSpeedRow.AddChild(_autoTimeCheck);
            timeSpeedRow.AddChild(speedLbl);
            timeSpeedRow.AddChild(_timeSpeedSlider);
            timeSpeedRow.AddChild(_timeSpeedValLabel);
            _stage1Container.AddChild(timeSpeedRow);
            _stage1Container.AddChild(new HSeparator());

            // === STAGE 2 & STAGE 4: Map Outline & Routes + Declarative Ground-ID Scatter Weights ===
            _stage2And4Container = new VBoxContainer();
            _stage2And4Container.AddThemeConstantOverride("separation", 3);
            vbox.AddChild(_stage2And4Container);

            var stage24Header = new Label
            {
                Text = "STAGE 2 & 4: ROUTES + GROUND_ID WEIGHTS (0 COORDS)",
                Modulate = new Color(0.48f, 1.0f, 0.72f)
            };
            stage24Header.AddThemeFontSizeOverride("font_size", 10);
            _stage2And4Container.AddChild(stage24Header);

            var routeZoneBtnRow = new HBoxContainer();
            routeZoneBtnRow.AddThemeConstantOverride("separation", 4);
            var addRouteSpurBtn = new Button
            {
                Text = "🛣 +Route->Cursor",
                SizeFlagsHorizontal = SizeFlags.ExpandFill,
                CustomMinimumSize = new Vector2(0, 21),
                TooltipText = "Extends or adds a cobblestone route spline to the cursor, auto-flattening terrain & clearing trees"
            };
            addRouteSpurBtn.AddThemeFontSizeOverride("font_size", 9);
            addRouteSpurBtn.Pressed += AddRouteSpurToCursor;

            var addForestZoneBtn = new Button
            {
                Text = "🌲 +Forest Zone",
                SizeFlagsHorizontal = SizeFlags.ExpandFill,
                CustomMinimumSize = new Vector2(0, 21),
                TooltipText = "Stamps a pine_forest_border ground_id zone (R=18m) at cursor"
            };
            addForestZoneBtn.AddThemeFontSizeOverride("font_size", 9);
            addForestZoneBtn.Pressed += () => AddGroundZoneAtCursor("pine_forest_border", 18.0f, 15);

            var addClearingZoneBtn = new Button
            {
                Text = "🌿 +Clearing",
                SizeFlagsHorizontal = SizeFlags.ExpandFill,
                CustomMinimumSize = new Vector2(0, 21),
                TooltipText = "Stamps a meadow_grass clearing zone (R=14m) at cursor"
            };
            addClearingZoneBtn.AddThemeFontSizeOverride("font_size", 9);
            addClearingZoneBtn.Pressed += () => AddGroundZoneAtCursor("meadow_grass", 14.0f, 25);

            routeZoneBtnRow.AddChild(addRouteSpurBtn);
            routeZoneBtnRow.AddChild(addForestZoneBtn);
            routeZoneBtnRow.AddChild(addClearingZoneBtn);
            _stage2And4Container.AddChild(routeZoneBtnRow);

            // Declarative ground_id weight sliders (grass: 0.30, bush: 0.05, canopy_tree: 0.04)
            float initGrassW = GetScatterRuleWeight("meadow_grass", "grass", 0.30f);
            var grassWRow = new HBoxContainer();
            var grassWLbl = new Label { Text = "grass wt:", CustomMinimumSize = new Vector2(82, 0) };
            grassWLbl.AddThemeFontSizeOverride("font_size", 10);
            _grassWeightSlider = new HSlider
            {
                MinValue = 0.0,
                MaxValue = 0.80,
                Step = 0.02,
                Value = initGrassW,
                SizeFlagsHorizontal = SizeFlags.ExpandFill
            };
            _grassWeightValLabel = new Label
            {
                Text = $"{initGrassW:0.00}",
                CustomMinimumSize = new Vector2(48, 0),
                HorizontalAlignment = HorizontalAlignment.Right
            };
            _grassWeightValLabel.AddThemeFontSizeOverride("font_size", 10);
            _grassWeightSlider.ValueChanged += val =>
            {
                float w = (float)val;
                if (_grassWeightValLabel != null) _grassWeightValLabel.Text = $"{w:0.00}";
                SetScatterRuleWeight("meadow_grass", "grass", w);
            };
            grassWRow.AddChild(grassWLbl);
            grassWRow.AddChild(_grassWeightSlider);
            grassWRow.AddChild(_grassWeightValLabel);
            _stage2And4Container.AddChild(grassWRow);

            float initBushW = GetScatterRuleWeight("meadow_grass", "bush", 0.05f);
            var bushWRow = new HBoxContainer();
            var bushWLbl = new Label { Text = "bush wt:", CustomMinimumSize = new Vector2(82, 0) };
            bushWLbl.AddThemeFontSizeOverride("font_size", 10);
            _bushWeightSlider = new HSlider
            {
                MinValue = 0.0,
                MaxValue = 0.35,
                Step = 0.01,
                Value = initBushW,
                SizeFlagsHorizontal = SizeFlags.ExpandFill
            };
            _bushWeightValLabel = new Label
            {
                Text = $"{initBushW:0.00}",
                CustomMinimumSize = new Vector2(48, 0),
                HorizontalAlignment = HorizontalAlignment.Right
            };
            _bushWeightValLabel.AddThemeFontSizeOverride("font_size", 10);
            _bushWeightSlider.ValueChanged += val =>
            {
                float w = (float)val;
                if (_bushWeightValLabel != null) _bushWeightValLabel.Text = $"{w:0.00}";
                SetScatterRuleWeight("meadow_grass", "bush", w);
            };
            bushWRow.AddChild(bushWLbl);
            bushWRow.AddChild(_bushWeightSlider);
            bushWRow.AddChild(_bushWeightValLabel);
            _stage2And4Container.AddChild(bushWRow);

            float initTreeW = GetScatterRuleWeight("pine_forest_border", "canopy_tree", 0.04f);
            var treeWRow = new HBoxContainer();
            var treeWLbl = new Label { Text = "forest tree:", CustomMinimumSize = new Vector2(82, 0) };
            treeWLbl.AddThemeFontSizeOverride("font_size", 10);
            _treeWeightSlider = new HSlider
            {
                MinValue = 0.0,
                MaxValue = 0.20,
                Step = 0.005,
                Value = initTreeW,
                SizeFlagsHorizontal = SizeFlags.ExpandFill
            };
            _treeWeightValLabel = new Label
            {
                Text = $"{initTreeW:0.000}",
                CustomMinimumSize = new Vector2(48, 0),
                HorizontalAlignment = HorizontalAlignment.Right
            };
            _treeWeightValLabel.AddThemeFontSizeOverride("font_size", 10);
            _treeWeightSlider.ValueChanged += val =>
            {
                float w = (float)val;
                if (_treeWeightValLabel != null) _treeWeightValLabel.Text = $"{w:0.000}";
                SetScatterRuleWeight("pine_forest_border", "canopy_tree", w);
            };
            treeWRow.AddChild(treeWLbl);
            treeWRow.AddChild(_treeWeightSlider);
            treeWRow.AddChild(_treeWeightValLabel);
            _stage2And4Container.AddChild(treeWRow);

            var clutterRow = new HBoxContainer();
            var clutterLbl = new Label { Text = "Density Mult:", CustomMinimumSize = new Vector2(82, 0) };
            clutterLbl.AddThemeFontSizeOverride("font_size", 10);
            _clutterDensitySlider = new HSlider
            {
                MinValue = 0,
                MaxValue = 120,
                Step = 4,
                Value = _streamer.ProceduralClutterPerChunk,
                SizeFlagsHorizontal = SizeFlags.ExpandFill
            };
            _clutterDensityValLabel = new Label
            {
                Text = $"{_streamer.ProceduralClutterPerChunk / 48.0f:0.0}x",
                CustomMinimumSize = new Vector2(48, 0),
                HorizontalAlignment = HorizontalAlignment.Right
            };
            _clutterDensityValLabel.AddThemeFontSizeOverride("font_size", 10);
            _clutterDensitySlider.ValueChanged += val =>
            {
                int density = (int)Math.Round(val);
                _streamer.ProceduralClutterPerChunk = density;
                _clutterDensityValLabel.Text = $"{density / 48.0f:0.0}x";
                _streamer.UpdateStreaming(_camFocus, forceReload: true);
                UpdateStatsLabel();
            };
            clutterRow.AddChild(clutterLbl);
            clutterRow.AddChild(_clutterDensitySlider);
            clutterRow.AddChild(_clutterDensityValLabel);
            _stage2And4Container.AddChild(clutterRow);
            _stage2And4Container.AddChild(new HSeparator());

            // === STAGE 3: Build 3D Macro Geometry (Height Terraces, Watchtowers, Crystal Caves & Cutaway) ===
            _stage3Container = new VBoxContainer();
            _stage3Container.AddThemeConstantOverride("separation", 3);
            vbox.AddChild(_stage3Container);

            var altHeader = new Label
            {
                Text = "STAGE 3: 3D MACRO GEOMETRY (TERRACES & STRUCTURES)",
                Modulate = new Color(0.95f, 0.88f, 0.65f)
            };
            altHeader.AddThemeFontSizeOverride("font_size", 10);
            _stage3Container.AddChild(altHeader);

            var ampRow = new HBoxContainer();
            var ampLbl = new Label { Text = "Hill Height:", CustomMinimumSize = new Vector2(82, 0) };
            ampLbl.AddThemeFontSizeOverride("font_size", 10);
            _terrainAmpSlider = new HSlider
            {
                MinValue = 0.0,
                MaxValue = 2.5,
                Step = 0.1,
                Value = _doc.TerrainAmplitude,
                SizeFlagsHorizontal = SizeFlags.ExpandFill
            };
            _terrainAmpValLabel = new Label
            {
                Text = $"{_doc.TerrainAmplitude:0.1}x",
                CustomMinimumSize = new Vector2(48, 0),
                HorizontalAlignment = HorizontalAlignment.Right
            };
            _terrainAmpValLabel.AddThemeFontSizeOverride("font_size", 10);
            _terrainAmpSlider.ValueChanged += val =>
            {
                _doc.TerrainAmplitude = (float)val;
                _terrainAmpValLabel.Text = $"{_doc.TerrainAmplitude:0.1}x";
                _root.SyncMapFloorAndBounds();
                _streamer.RefreshLoadedPropsAltitude();
                RebuildGizmoOverlays();
                UpdateCursorPreviewTransform();
            };
            ampRow.AddChild(ampLbl);
            ampRow.AddChild(_terrainAmpSlider);
            ampRow.AddChild(_terrainAmpValLabel);
            _stage3Container.AddChild(ampRow);

            var terraceBtnRow = new HBoxContainer();
            terraceBtnRow.AddThemeConstantOverride("separation", 4);
            var addHillBtn = new Button
            {
                Text = "\u25b2 +Hill (+2.2m)",
                SizeFlagsHorizontal = SizeFlags.ExpandFill,
                CustomMinimumSize = new Vector2(0, 21)
            };
            addHillBtn.AddThemeFontSizeOverride("font_size", 10);
            addHillBtn.Pressed += () => SculptTerraceAtCursor(2.2f, 11.5f, 0.48f);

            var addCliffBtn = new Button
            {
                Text = "\u26f0 +Cliff (+4.2m)",
                SizeFlagsHorizontal = SizeFlags.ExpandFill,
                CustomMinimumSize = new Vector2(0, 21)
            };
            addCliffBtn.AddThemeFontSizeOverride("font_size", 10);
            addCliffBtn.Pressed += () => SculptTerraceAtCursor(4.2f, 9.5f, 0.16f);

            var addValleyBtn = new Button
            {
                Text = "\u25bc +Valley (-1.6m)",
                SizeFlagsHorizontal = SizeFlags.ExpandFill,
                CustomMinimumSize = new Vector2(0, 21)
            };
            addValleyBtn.AddThemeFontSizeOverride("font_size", 10);
            addValleyBtn.Pressed += () => SculptTerraceAtCursor(-1.6f, 11.0f, 0.48f);

            terraceBtnRow.AddChild(addHillBtn);
            terraceBtnRow.AddChild(addCliffBtn);
            terraceBtnRow.AddChild(addValleyBtn);
            _stage3Container.AddChild(terraceBtnRow);

            var structBtnRow = new HBoxContainer();
            structBtnRow.AddThemeConstantOverride("separation", 5);
            var addTowerBtn = new Button
            {
                Text = "\ud83c\udff0 +Watchtower (2-Floor)",
                SizeFlagsHorizontal = SizeFlags.ExpandFill,
                CustomMinimumSize = new Vector2(0, 22),
                TooltipText = "Spawns a 2-story Watchtower with 1F chamber, East stair ramp, +3.2m 2F deck & auto roof cutaway"
            };
            addTowerBtn.AddThemeFontSizeOverride("font_size", 10);
            addTowerBtn.Pressed += () => PlaceStructureAtCursor("watchtower");

            var addCaveBtn = new Button
            {
                Text = "\ud83d\udc8e +Crystal Cave",
                SizeFlagsHorizontal = SizeFlags.ExpandFill,
                CustomMinimumSize = new Vector2(0, 22),
                TooltipText = "Spawns a Walk-In Crystal Cavern with South archway, glowing crystal interior & auto roof cutaway"
            };
            addCaveBtn.AddThemeFontSizeOverride("font_size", 10);
            addCaveBtn.Pressed += () => PlaceStructureAtCursor("crystal_cave");

            structBtnRow.AddChild(addTowerBtn);
            structBtnRow.AddChild(addCaveBtn);
            _stage3Container.AddChild(structBtnRow);

            var occToggle = new CheckBox
            {
                Text = "Auto-Cutaway Roofs & Blocking Trees (LOS)",
                ButtonPressed = _occluder.Enabled
            };
            occToggle.AddThemeFontSizeOverride("font_size", 10);
            occToggle.Toggled += on =>
            {
                _occluder.Enabled = on;
                UpdateStatsLabel();
            };
            _stage3Container.AddChild(occToggle);

            var occSliderRow = new HBoxContainer();
            var occLbl = new Label { Text = "Block Fade:", CustomMinimumSize = new Vector2(82, 0) };
            occLbl.AddThemeFontSizeOverride("font_size", 10);
            _occlusionAlphaSlider = new HSlider
            {
                MinValue = 0.25,
                MaxValue = 0.88,
                Step = 0.03,
                Value = _occluder.OccludedTransparency,
                SizeFlagsHorizontal = SizeFlags.ExpandFill
            };
            _occlusionAlphaValLabel = new Label
            {
                Text = $"{(int)Math.Round((1f - _occluder.OccludedTransparency) * 100f)}% Vis",
                CustomMinimumSize = new Vector2(54, 0),
                HorizontalAlignment = HorizontalAlignment.Right
            };
            _occlusionAlphaValLabel.AddThemeFontSizeOverride("font_size", 10);
            _occlusionAlphaSlider.ValueChanged += val =>
            {
                _occluder.OccludedTransparency = (float)val;
                _occlusionAlphaValLabel.Text = $"{(int)Math.Round((1f - _occluder.OccludedTransparency) * 100f)}% Vis";
            };
            occSliderRow.AddChild(occLbl);
            occSliderRow.AddChild(_occlusionAlphaSlider);
            occSliderRow.AddChild(_occlusionAlphaValLabel);
            _stage3Container.AddChild(occSliderRow);
            _stage3Container.AddChild(new HSeparator());

            // === Hero Landmark Overrides (Sparse One-Off Props) ===
            _heroPropsContainer = new VBoxContainer();
            _heroPropsContainer.AddThemeConstantOverride("separation", 3);
            vbox.AddChild(_heroPropsContainer);

            var paletteHeader = new Label
            {
                Text = "HERO LANDMARK OVERRIDES (Sparse Setpiece Brush)",
                Modulate = new Color(0.95f, 0.88f, 0.65f)
            };
            paletteHeader.AddThemeFontSizeOverride("font_size", 10);
            _heroPropsContainer.AddChild(paletteHeader);

            var scroll = new ScrollContainer
            {
                CustomMinimumSize = new Vector2(320f, 82f),
                HorizontalScrollMode = ScrollContainer.ScrollMode.Disabled
            };
            _heroPropsContainer.AddChild(scroll);

            var grid = new GridContainer
            {
                Columns = 2,
                SizeFlagsHorizontal = SizeFlags.ExpandFill
            };
            grid.AddThemeConstantOverride("h_separation", 6);
            grid.AddThemeConstantOverride("v_separation", 4);
            scroll.AddChild(grid);

            for (int i = 0; i < AssetCatalog.Length; i++)
            {
                int idx = i;
                var item = AssetCatalog[i];
                var btn = new Button
                {
                    Text = $"{item.Label}\n[{item.Category}]",
                    CustomMinimumSize = new Vector2(152f, 28f),
                    ClipText = true
                };
                btn.AddThemeFontSizeOverride("font_size", 10);
                btn.Pressed += () => SelectCatalogAsset(idx);
                _catalogButtons.Add(btn);
                grid.AddChild(btn);
            }

            _selectedAssetLabel = new Label
            {
                Text = "Armed: Oak Tree A",
                Modulate = new Color(0.45f, 1.0f, 0.65f)
            };
            _selectedAssetLabel.AddThemeFontSizeOverride("font_size", 10);
            _heroPropsContainer.AddChild(_selectedAssetLabel);

            var scaleRow = new HBoxContainer();
            var scaleLbl = new Label { Text = "Scale ([ / ]):", CustomMinimumSize = new Vector2(82, 0) };
            scaleLbl.AddThemeFontSizeOverride("font_size", 10);
            _scaleSlider = new HSlider
            {
                MinValue = 0.5,
                MaxValue = 3.0,
                Step = 0.05,
                Value = _placementScale,
                SizeFlagsHorizontal = SizeFlags.ExpandFill
            };
            _scaleValLabel = new Label { Text = "1.40x", CustomMinimumSize = new Vector2(44, 0), HorizontalAlignment = HorizontalAlignment.Right };
            _scaleValLabel.AddThemeFontSizeOverride("font_size", 10);
            _scaleSlider.ValueChanged += val =>
            {
                _placementScale = (float)val;
                _scaleValLabel.Text = $"{_placementScale:0.00}x";
                UpdateCursorPreviewTransform();
            };
            scaleRow.AddChild(scaleLbl);
            scaleRow.AddChild(_scaleSlider);
            scaleRow.AddChild(_scaleValLabel);
            _heroPropsContainer.AddChild(scaleRow);

            var rotRow = new HBoxContainer();
            var rotLbl = new Label { Text = "Rotate (R):", CustomMinimumSize = new Vector2(82, 0) };
            rotLbl.AddThemeFontSizeOverride("font_size", 10);
            _rotSlider = new HSlider
            {
                MinValue = 0.0,
                MaxValue = 360.0,
                Step = 15.0,
                Value = 0.0,
                SizeFlagsHorizontal = SizeFlags.ExpandFill
            };
            _rotValLabel = new Label { Text = "0\u00b0", CustomMinimumSize = new Vector2(44, 0), HorizontalAlignment = HorizontalAlignment.Right };
            _rotValLabel.AddThemeFontSizeOverride("font_size", 10);
            _rotSlider.ValueChanged += val =>
            {
                _placementRotY = Mathf.DegToRad((float)val);
                _rotValLabel.Text = $"{val:0}\u00b0";
                UpdateCursorPreviewTransform();
            };
            rotRow.AddChild(rotLbl);
            rotRow.AddChild(_rotSlider);
            rotRow.AddChild(_rotValLabel);
            _heroPropsContainer.AddChild(rotRow);

            _blocksMoveCheck = new CheckBox
            {
                Text = "Blocks Movement (Export Server AABB)",
                ButtonPressed = true
            };
            _blocksMoveCheck.AddThemeFontSizeOverride("font_size", 10);
            _blocksMoveCheck.Toggled += on =>
            {
                _placementBlocksMovement = on;
                UpdateCursorPreviewTransform();
            };
            _heroPropsContainer.AddChild(_blocksMoveCheck);

            var gizmoTogglesRow = new HBoxContainer();
            gizmoTogglesRow.AddThemeConstantOverride("separation", 8);

            var chunkToggle = new CheckBox
            {
                Text = "Chunks",
                ButtonPressed = true
            };
            chunkToggle.AddThemeFontSizeOverride("font_size", 10);
            chunkToggle.Toggled += on =>
            {
                _showChunkGrid = on;
                RebuildChunkGridGizmos();
            };

            var aabbToggle = new CheckBox
            {
                Text = "AABBs",
                ButtonPressed = true
            };
            aabbToggle.AddThemeFontSizeOverride("font_size", 10);
            aabbToggle.Toggled += on =>
            {
                _showServerAabbs = on;
                RebuildGizmoOverlays();
            };

            var spawnToggle = new CheckBox
            {
                Text = "Routes/Zones",
                ButtonPressed = true
            };
            spawnToggle.AddThemeFontSizeOverride("font_size", 10);
            spawnToggle.Toggled += on =>
            {
                _showSpawnZones = on;
                RebuildGizmoOverlays();
            };

            var terraceToggle = new CheckBox
            {
                Text = "Terraces",
                ButtonPressed = true
            };
            terraceToggle.AddThemeFontSizeOverride("font_size", 10);
            terraceToggle.Toggled += on =>
            {
                _showElevationContours = on;
                RebuildGizmoOverlays();
            };

            gizmoTogglesRow.AddChild(chunkToggle);
            gizmoTogglesRow.AddChild(aabbToggle);
            gizmoTogglesRow.AddChild(spawnToggle);
            gizmoTogglesRow.AddChild(terraceToggle);
            vbox.AddChild(gizmoTogglesRow);

            var actRow1 = new HBoxContainer();
            actRow1.AddThemeConstantOverride("separation", 6);
            var stampBtn = new Button
            {
                Text = "\uff0b Place Hero Prop (L-Click)",
                SizeFlagsHorizontal = SizeFlags.ExpandFill,
                CustomMinimumSize = new Vector2(0, 22)
            };
            stampBtn.AddThemeFontSizeOverride("font_size", 10);
            stampBtn.Pressed += () => PlacePropAt(_cursorWorldPos);

            var undoBtn = new Button
            {
                Text = "\u232b Undo Last (Z)",
                SizeFlagsHorizontal = SizeFlags.ExpandFill,
                CustomMinimumSize = new Vector2(0, 22)
            };
            undoBtn.AddThemeFontSizeOverride("font_size", 10);
            undoBtn.Pressed += RemoveLastPlacedProp;

            actRow1.AddChild(stampBtn);
            actRow1.AddChild(undoBtn);
            vbox.AddChild(actRow1);

            var actRow2 = new HBoxContainer();
            actRow2.AddThemeConstantOverride("separation", 6);
            var saveBtn = new Button
            {
                Text = "\ud83d\udcbe Save Map v3 JSON",
                SizeFlagsHorizontal = SizeFlags.ExpandFill,
                CustomMinimumSize = new Vector2(0, 23)
            };
            saveBtn.AddThemeFontSizeOverride("font_size", 10);
            saveBtn.Pressed += SaveUnifiedMap;

            var playBtn = new Button
            {
                Text = "\u25b6 Playtest Here (F2)",
                SizeFlagsHorizontal = SizeFlags.ExpandFill,
                CustomMinimumSize = new Vector2(0, 23)
            };
            playBtn.AddThemeFontSizeOverride("font_size", 10);
            playBtn.Pressed += () => SetBuilderActive(false);

            actRow2.AddChild(saveBtn);
            actRow2.AddChild(playBtn);
            vbox.AddChild(actRow2);

            _saveFeedbackLabel = new Label
            {
                Text = "4-Stage Pipeline: 1.Concept -> 2.Routes -> 3.3D Macro -> 4.ground_id Weights",
                Modulate = new Color(0.75f, 0.84f, 0.96f),
                AutowrapMode = TextServer.AutowrapMode.WordSmart
            };
            _saveFeedbackLabel.AddThemeFontSizeOverride("font_size", 10);
            vbox.AddChild(_saveFeedbackLabel);

            UpdateStatsLabel();
        }

        private void SelectPipelineStage(int stage)
        {
            _activePipelineStage = stage;
            if (_stage1Container != null) _stage1Container.Visible = stage == 0 || stage == 1;
            if (_stage2And4Container != null) _stage2And4Container.Visible = stage == 0 || stage == 2 || stage == 4;
            if (_stage3Container != null) _stage3Container.Visible = stage == 0 || stage == 3;
            if (_heroPropsContainer != null) _heroPropsContainer.Visible = stage == 0 || stage == 3;

            foreach (var (sId, btn) in _stageButtons)
            {
                btn.Modulate = (sId == stage)
                    ? new Color(0.45f, 1.0f, 0.68f)
                    : Colors.White;
            }
        }

        private void AddRouteSpurToCursor()
        {
            float tx = Mathf.Round(_cursorWorldPos.X * 10f) / 10f;
            float tz = Mathf.Round(_cursorWorldPos.Z * 10f) / 10f;
            string routeId = $"route_spur_{_doc.Routes.Count + 1:00}";

            _doc.Routes.Add(new UnifiedMapRouteSpline
            {
                Id = routeId,
                GroundId = "cobble_road",
                Width = 4.0f,
                ClearMargin = 2.0f,
                Points = new List<float[]>
                {
                    new[] { 0.0f, Mathf.Clamp(tz * 0.35f, -35f, 35f) },
                    new[] { tx, tz }
                }
            });

            _root.SyncMapFloorAndBounds();
            _streamer.UpdateStreaming(_camFocus, forceReload: true);
            RebuildGizmoOverlays();
            UpdateStatsLabel();

            if (_saveFeedbackLabel != null)
            {
                _saveFeedbackLabel.Text =
                    $"Added Stage 2 Route '{routeId}' -> ({tx:0.0}, {tz:0.0}): terrain leveled, shader painted & trees cleared.";
                _saveFeedbackLabel.Modulate = new Color(0.45f, 1.0f, 0.68f);
            }
        }

        private void AddGroundZoneAtCursor(string groundId, float radius, int priority)
        {
            float zx = Mathf.Round(_cursorWorldPos.X * 10f) / 10f;
            float zz = Mathf.Round(_cursorWorldPos.Z * 10f) / 10f;
            string zoneId = $"{groundId}_{_doc.GroundZones.Count + 1:00}";

            _doc.GroundZones.Add(new UnifiedMapGroundZone
            {
                Id = zoneId,
                GroundId = groundId,
                Priority = priority,
                Shape = "circle",
                X = zx,
                Z = zz,
                Radius = radius,
                Feather = 3.5f
            });

            _streamer.UpdateStreaming(_camFocus, forceReload: true);
            RebuildGizmoOverlays();
            UpdateStatsLabel();

            if (_saveFeedbackLabel != null)
            {
                _saveFeedbackLabel.Text =
                    $"Stamped '{groundId}' Zone (R={radius:0}m) at ({zx:0.0}, {zz:0.0}) with 0 hardcoded prop coordinates.";
                _saveFeedbackLabel.Modulate = new Color(0.45f, 1.0f, 0.68f);
            }
        }

        public void SyncTimeControlsFromCycle()
        {
            var cycle = _root.DayNightCycle;
            _suppressTimeSliderSignal = true;
            if (_timeSlider != null && Mathf.Abs((float)_timeSlider.Value - cycle.TimeOfDayHours) > 0.02f)
            {
                _timeSlider.Value = cycle.TimeOfDayHours;
            }
            if (_autoTimeCheck != null && _autoTimeCheck.ButtonPressed != cycle.AutoAdvance)
            {
                _autoTimeCheck.ButtonPressed = cycle.AutoAdvance;
            }
            if (_timeSpeedSlider != null && Mathf.Abs((float)_timeSpeedSlider.Value - cycle.HoursPerRealSecond) > 0.005f)
            {
                _timeSpeedSlider.Value = cycle.HoursPerRealSecond;
            }
            _suppressTimeSliderSignal = false;

            Color phaseColor = cycle.CurrentPhase switch
            {
                WorldDayPhase.Dawn => new Color(1.0f, 0.78f, 0.52f),
                WorldDayPhase.Day => new Color(0.98f, 0.92f, 0.68f),
                WorldDayPhase.Dusk => new Color(1.0f, 0.62f, 0.42f),
                _ => new Color(0.66f, 0.82f, 1.0f)
            };

            if (_timeValLabel != null)
            {
                _timeValLabel.Text = $"{cycle.PhaseIconGlyph} {cycle.FormattedClockString} {cycle.PhaseDisplayName}";
                _timeValLabel.Modulate = phaseColor;
            }

            if (_topBannerTimeBtn != null)
            {
                _topBannerTimeBtn.Text = $"{cycle.PhaseIconGlyph} {cycle.FormattedClockString} {cycle.PhaseDisplayName} [T]";
                _topBannerTimeBtn.Modulate = phaseColor;
            }

            foreach (var (phase, btn) in _timePresetButtons)
            {
                btn.Modulate = (phase == cycle.CurrentPhase)
                    ? phaseColor
                    : Colors.White;
            }
        }

        private void CycleWorldTimeFromBuilder()
        {
            _root.DayNightCycle.AutoAdvance = false;
            _root.DayNightCycle.CycleNextPreset(_doc);
            _doc.DefaultTimeOfDayHours = _root.DayNightCycle.TimeOfDayHours;
            _doc.AutoAdvanceDayNight = false;
            SyncTimeControlsFromCycle();

            if (_saveFeedbackLabel != null)
            {
                _saveFeedbackLabel.Text =
                    $"World Time cycled -> {_root.DayNightCycle.FormattedClockString} ({_root.DayNightCycle.PhaseDisplayName}). Press Cmd+S to persist.";
                _saveFeedbackLabel.Modulate = new Color(0.98f, 0.86f, 0.45f);
            }
        }

        private void SculptTerraceAtCursor(float deltaHeight, float radius, float falloff = 0.45f)
        {
            string prefix = falloff <= 0.22f ? "cliff_mesa" : (deltaHeight >= 0 ? "hill_terrace" : "valley_basin");
            string id = $"{prefix}_{_doc.HeightTerraces.Count + 1:00}";
            var terrace = new UnifiedMapHeightTerrace
            {
                Id = id,
                X = Mathf.Round(_cursorWorldPos.X * 10f) / 10f,
                Z = Mathf.Round(_cursorWorldPos.Z * 10f) / 10f,
                Radius = radius,
                Height = deltaHeight,
                Falloff = falloff
            };
            _doc.HeightTerraces.Add(terrace);
            _root.SyncMapFloorAndBounds();
            _streamer.RefreshLoadedPropsAltitude();
            _cursorWorldPos.Y = TerrainElevation.SampleHeight(_cursorWorldPos.X, _cursorWorldPos.Z, _doc);
            UpdateCursorPreviewTransform();
            RebuildGizmoOverlays();
            UpdateStatsLabel();

            if (_saveFeedbackLabel != null)
            {
                _saveFeedbackLabel.Text =
                    $"Sculpted {(deltaHeight >= 0 ? "Hill Terrace" : "Valley Basin")} ({deltaHeight:+0.0;-0.0}m) at ({terrace.X:0.0}, {terrace.Z:0.0}).";
                _saveFeedbackLabel.Modulate = new Color(0.45f, 1.0f, 0.68f);
            }
        }

        private void PlaceStructureAtCursor(string kind)
        {
            string id = $"{kind}_{_doc.Structures.Count + 1:00}";
            var structure = new UnifiedMapStructureVolume
            {
                Id = id,
                Kind = kind,
                X = Mathf.Round(_cursorWorldPos.X * 10f) / 10f,
                Z = Mathf.Round(_cursorWorldPos.Z * 10f) / 10f,
                RotY = 0f,
                Radius = kind == "watchtower" ? 3.6f : 4.2f,
                UpperFloorHeight = 3.2f,
                CeilingHeight = 3.4f
            };
            _doc.Structures.Add(structure);
            _doc.IndexStructureWallsIncremental(structure, _doc.ServerCenter, VerticalSliceRoot.ServerCoordScale);
            _streamer.AddStructureIncremental(structure, _camFocus);
            RebuildGizmoOverlays();
            UpdateStatsLabel();

            if (_saveFeedbackLabel != null)
            {
                string label = kind == "watchtower" ? "2-Story Watchtower (+3.2m Deck)" : "Walk-In Crystal Cave";
                _saveFeedbackLabel.Text =
                    $"Placed {label} '{id}' at ({structure.X:0.0}, {structure.Z:0.0}) with O(1) wall slabs & Auto-Cutaway roof.";
                _saveFeedbackLabel.Modulate = new Color(0.45f, 1.0f, 0.68f);
            }
        }

        private void ApplyMapResize(float newServerSize)
        {
            _doc.ResizeMap(newServerSize, newServerSize, VerticalSliceRoot.ServerCoordScale);
            _root.SyncMapFloorAndBounds();
            _streamer.RebuildIndex(_camFocus);
            RebuildGizmoOverlays();
            RebuildChunkGridGizmos();
            RefreshMapSizeButtons();
            UpdateStatsLabel();

            float worldMeters = newServerSize * VerticalSliceRoot.ServerCoordScale;
            if (_saveFeedbackLabel != null)
            {
                _saveFeedbackLabel.Text =
                    $"Expanded Map to {newServerSize:0}\u00d7{newServerSize:0} server units ({worldMeters:0}m\u00d7{worldMeters:0}m). Press Cmd+S to persist.";
                _saveFeedbackLabel.Modulate = new Color(0.45f, 1.0f, 0.68f);
            }
        }

        private void RefreshMapSizeButtons()
        {
            foreach (var (sz, btn) in _mapSizeButtons)
            {
                bool active = Mathf.Abs(_doc.Width - sz) < 10f;
                btn.Modulate = active
                    ? new Color(0.45f, 1.0f, 0.65f)
                    : Colors.White;
            }
        }

        public void SetBuilderActive(bool active)
        {
            _builderActive = active;
            if (_dockPanel != null) _dockPanel.Visible = active;
            if (_gizmoRoot != null) _gizmoRoot.Visible = active;

            if (_toggleBuilderBtn != null)
            {
                _toggleBuilderBtn.Text = active
                    ? "\ud83d\uddfa MAP BUILDER [F2]: ON (STUDIO)"
                    : "\ud83d\uddfa MAP BUILDER [F2]: OFF (PLAY)";
                _toggleBuilderBtn.Modulate = active
                    ? new Color(0.45f, 1.0f, 0.65f)
                    : Colors.White;
            }

            _root.SetGameHudVisible(!active);

            if (active)
            {
                if (_root.PlayerAvatar != null)
                {
                    float px = _root.PlayerAvatar.Position.X;
                    float pz = _root.PlayerAvatar.Position.Z - 3f;
                    float py = TerrainElevation.SampleHeight(px, pz, _doc);
                    _camFocus = new Vector3(px, py, pz);
                }
                _streamer.UpdateStreaming(_camFocus, forceReload: true);
                EnsureCursorPreview();
                RebuildGizmoOverlays();
                RebuildChunkGridGizmos();
                UpdateStatsLabel();
                SyncTimeControlsFromCycle();
            }
        }

        private void SelectCatalogAsset(int index)
        {
            if (index < 0 || index >= AssetCatalog.Length) return;
            _selectedAssetIndex = index;
            var item = AssetCatalog[index];

            _placementScale = item.DefaultScale;
            _placementBlocksMovement = item.DefaultBlocksMovement;

            if (_scaleSlider != null) _scaleSlider.Value = _placementScale;
            if (_blocksMoveCheck != null) _blocksMoveCheck.ButtonPressed = _placementBlocksMovement;
            if (_selectedAssetLabel != null)
            {
                _selectedAssetLabel.Text = $"Armed: {item.Label} ({(item.DefaultBlocksMovement ? "Solid Collider" : "GPU-Instanced / Pass-Through")})";
            }

            for (int i = 0; i < _catalogButtons.Count; i++)
            {
                _catalogButtons[i].Modulate = (i == index)
                    ? new Color(1.0f, 0.90f, 0.45f)
                    : Colors.White;
            }

            EnsureCursorPreview();
        }

        private void EnsureCursorPreview()
        {
            if (_cursorPreviewNode != null && GodotObject.IsInstanceValid(_cursorPreviewNode))
            {
                _cursorPreviewNode.QueueFree();
                _cursorPreviewNode = null;
            }

            if (!_builderActive) return;

            var item = AssetCatalog[_selectedAssetIndex];
            _cursorPreviewNode = new Node3D { Name = "BuilderCursorGhost" };
            _gizmoRoot.AddChild(_cursorPreviewNode);

            if (ResourceLoader.Exists(item.AssetPath))
            {
                var scene = GD.Load<PackedScene>(item.AssetPath);
                if (scene?.Instantiate() is Node3D model)
                {
                    EntityView.ApplyAnimeToonShading(model, EntityKind.Npc);
                    _cursorPreviewNode.AddChild(model);
                }
            }

            var ringCyl = new CylinderMesh
            {
                TopRadius = item.DefaultColliderHalfExtent,
                BottomRadius = item.DefaultColliderHalfExtent,
                Height = 0.05f,
                RadialSegments = 28
            };
            var ringMat = new StandardMaterial3D
            {
                Transparency = BaseMaterial3D.TransparencyEnum.Alpha,
                ShadingMode = BaseMaterial3D.ShadingModeEnum.Unshaded,
                AlbedoColor = _placementBlocksMovement
                    ? new Color(1.0f, 0.32f, 0.28f, 0.55f)
                    : new Color(0.28f, 0.95f, 0.55f, 0.45f)
            };
            _cursorRingMesh = new MeshInstance3D
            {
                Mesh = ringCyl,
                MaterialOverride = ringMat,
                Position = new Vector3(0f, 0.04f, 0f)
            };
            _cursorPreviewNode.AddChild(_cursorRingMesh);
            UpdateCursorPreviewTransform();
        }

        private void UpdateCursorPreviewTransform()
        {
            if (_cursorPreviewNode == null || !GodotObject.IsInstanceValid(_cursorPreviewNode))
                return;

            _cursorWorldPos.Y = TerrainElevation.SampleHeight(_cursorWorldPos.X, _cursorWorldPos.Z, _doc);
            _cursorPreviewNode.Position = _cursorWorldPos;
            _cursorPreviewNode.Rotation = new Vector3(0f, _placementRotY, 0f);
            _cursorPreviewNode.Scale = Vector3.One * _placementScale;

            if (_cursorRingMesh?.MaterialOverride is StandardMaterial3D mat)
            {
                mat.AlbedoColor = _placementBlocksMovement
                    ? new Color(1.0f, 0.32f, 0.28f, 0.55f)
                    : new Color(0.28f, 0.95f, 0.55f, 0.45f);
            }
        }

        public void PlacePropAt(Vector3 worldPos)
        {
            var item = AssetCatalog[_selectedAssetIndex];
            string id = $"{item.Category.ToLowerInvariant().Replace(" ", "_")}_{_doc.Props.Count + 1:00}";
            float groundY = TerrainElevation.SampleBaseTerrainHeight(worldPos.X, worldPos.Z, _doc);

            var newProp = new UnifiedMapProp
            {
                Id = id,
                AssetPath = item.AssetPath,
                X = Mathf.Round(worldPos.X * 10f) / 10f,
                Y = Mathf.Round(groundY * 100f) / 100f,
                Z = Mathf.Round(worldPos.Z * 10f) / 10f,
                RotY = Mathf.Round(_placementRotY * 100f) / 100f,
                Scale = Mathf.Round(_placementScale * 100f) / 100f,
                BlocksMovement = _placementBlocksMovement,
                ColliderHalfExtent = item.DefaultColliderHalfExtent
            };

            _doc.Props.Add(newProp);
            // O(1) incremental obstacle insertion (no O(N) full-map rebuild!)
            _doc.IndexPropObstacleIncremental(newProp, _doc.ServerCenter, VerticalSliceRoot.ServerCoordScale);
            _streamer.AddPropIncremental(newProp, _camFocus);
            RebuildGizmoOverlays();
            UpdateStatsLabel();

            Vector2I chunk = _streamer.WorldToChunkCoord(worldPos);
            if (_saveFeedbackLabel != null)
            {
                _saveFeedbackLabel.Text =
                    $"Placed Hero Override '{item.Label}' at ({newProp.X:0.0}, Alt {newProp.Y:+0.0;-0.0}m, {newProp.Z:0.0}) in Chunk ({chunk.X},{chunk.Y}).";
                _saveFeedbackLabel.Modulate = new Color(0.55f, 1.0f, 0.68f);
            }
        }

        public void RemoveLastPlacedProp()
        {
            if (_doc.Props.Count == 0)
                return;

            var removed = _doc.Props[^1];
            _doc.Props.RemoveAt(_doc.Props.Count - 1);
            _doc.RebuildStaticObstacles(_doc.ServerCenter, VerticalSliceRoot.ServerCoordScale);
            _streamer.RebuildIndex(_camFocus);
            RebuildGizmoOverlays();
            UpdateStatsLabel();

            if (_saveFeedbackLabel != null)
            {
                _saveFeedbackLabel.Text = $"Removed '{removed.Id}'. ({_doc.Props.Count} hero props remaining)";
                _saveFeedbackLabel.Modulate = new Color(1.0f, 0.84f, 0.45f);
            }
        }

        public void SaveUnifiedMap()
        {
            _doc.DefaultTimeOfDayHours = Mathf.Round(_root.DayNightCycle.TimeOfDayHours * 100f) / 100f;
            _doc.AutoAdvanceDayNight = _root.DayNightCycle.AutoAdvance;
            _doc.DayNightSpeedHoursPerSec = Mathf.Round(_root.DayNightCycle.HoursPerRealSecond * 100f) / 100f;

            if (_doc.SaveToDisk(_doc.ServerCenter, VerticalSliceRoot.ServerCoordScale, out _))
            {
                RebuildGizmoOverlays();
                UpdateStatsLabel();
                if (_saveFeedbackLabel != null)
                {
                    _saveFeedbackLabel.Text =
                        $"\u2713 Saved v3 {_doc.Width:0}\u00d7{_doc.Height:0} map ({_doc.Routes.Count} routes, {_doc.GroundZones.Count} groundZones, {_doc.Props.Count} hero props) to content/maps/{_doc.MapId}.json";
                    _saveFeedbackLabel.Modulate = new Color(0.45f, 1.0f, 0.65f);
                }
            }
        }

        public void UpdateStatsLabel()
        {
            if (_statsSummaryLabel != null)
            {
                float worldW = _doc.Width * VerticalSliceRoot.ServerCoordScale;
                float worldH = _doc.Height * VerticalSliceRoot.ServerCoordScale;
                _statsSummaryLabel.Text =
                    $"v{_doc.Version}: {worldW:0}m\u00d7{worldH:0}m | Routes: {_doc.Routes.Count} | Zones: {_doc.GroundZones.Count} | Palettes: {_doc.GroundPalettes.Count}";
            }
            if (_streamingStatusLabel != null)
            {
                Vector2I c = _streamer.CurrentCenterChunk;
                _streamingStatusLabel.Text =
                    $"Chunks: {_streamer.LoadedChunkCount} @ ({c.X},{c.Y}) | Node3Ds: {_streamer.LoadedPropCount} | GPU MultiMesh: {_streamer.ActiveGpuInstanceCount} ({_streamer.ActiveMultiMeshBatchCount} draws)";
            }
            if (_occlusionStatusLabel != null)
            {
                _occlusionStatusLabel.Text = _occluder.Enabled
                    ? $"Smart LOS & Roof Cutaway: ON ({_occluder.CurrentlyFadedPropCount} faded / {_occluder.RegisteredPropCount} tracked)"
                    : "Smart LOS & Roof Cutaway: OFF";
            }
        }

        private void RebuildChunkGridGizmos()
        {
            foreach (Node child in _chunkGridGizmoRoot.GetChildren())
            {
                child.QueueFree();
            }

            if (!_builderActive || !_showChunkGrid) return;

            float cs = _streamer.ChunkSizeWorld;
            int radius = _streamer.ActiveChunkRadius;
            Vector2I center = _streamer.WorldToChunkCoord(_camFocus);

            var activeBorderMat = new StandardMaterial3D
            {
                Transparency = BaseMaterial3D.TransparencyEnum.Alpha,
                ShadingMode = BaseMaterial3D.ShadingModeEnum.Unshaded,
                AlbedoColor = new Color(0.28f, 0.98f, 0.56f, 0.42f)
            };
            var centerTileMat = new StandardMaterial3D
            {
                Transparency = BaseMaterial3D.TransparencyEnum.Alpha,
                ShadingMode = BaseMaterial3D.ShadingModeEnum.Unshaded,
                AlbedoColor = new Color(0.28f, 0.98f, 0.56f, 0.08f)
            };

            for (int dz = -radius; dz <= radius; dz++)
            {
                for (int dx = -radius; dx <= radius; dx++)
                {
                    Vector2I coord = new(center.X + dx, center.Y + dz);
                    Rect2 rect = _streamer.GetChunkWorldRect(coord);
                    float cx = rect.Position.X + rect.Size.X * 0.5f;
                    float cz = rect.Position.Y + rect.Size.Y * 0.5f;
                    float cy = TerrainElevation.SampleBaseTerrainHeight(cx, cz, _doc);

                    if (dx == 0 && dz == 0)
                    {
                        var centerPlane = new MeshInstance3D
                        {
                            Mesh = new BoxMesh { Size = new Vector3(cs - 0.3f, 0.02f, cs - 0.3f) },
                            MaterialOverride = centerTileMat,
                            Position = new Vector3(cx, cy + 0.04f, cz)
                        };
                        _chunkGridGizmoRoot.AddChild(centerPlane);
                    }

                    float northY = TerrainElevation.SampleBaseTerrainHeight(cx, rect.Position.Y, _doc);
                    var northStrip = new MeshInstance3D
                    {
                        Mesh = new BoxMesh { Size = new Vector3(cs, 0.05f, 0.10f) },
                        MaterialOverride = activeBorderMat,
                        Position = new Vector3(cx, northY + 0.05f, rect.Position.Y)
                    };
                    float westY = TerrainElevation.SampleBaseTerrainHeight(rect.Position.X, cz, _doc);
                    var westStrip = new MeshInstance3D
                    {
                        Mesh = new BoxMesh { Size = new Vector3(0.10f, 0.05f, cs) },
                        MaterialOverride = activeBorderMat,
                        Position = new Vector3(rect.Position.X, westY + 0.05f, cz)
                    };
                    _chunkGridGizmoRoot.AddChild(northStrip);
                    _chunkGridGizmoRoot.AddChild(westStrip);
                }
            }
        }

        private void RebuildGizmoOverlays()
        {
            foreach (Node child in _gizmoRoot.GetChildren())
            {
                if (child == _cursorPreviewNode || child == _chunkGridGizmoRoot)
                    continue;
                child.QueueFree();
            }

            if (!_builderActive) return;

            Vector2 serverCenter = _doc.ServerCenter;

            // 1. Render Red Translucent Server-RS StaticObstacle AABB Boxes using O(1) Spatial Hash Grid query around camera!
            if (_showServerAabbs)
            {
                var aabbMat = new StandardMaterial3D
                {
                    Transparency = BaseMaterial3D.TransparencyEnum.Alpha,
                    ShadingMode = BaseMaterial3D.ShadingModeEnum.Unshaded,
                    AlbedoColor = new Color(1.0f, 0.25f, 0.22f, 0.36f)
                };

                float activeRadiusMeters = (_streamer.ActiveChunkRadius + 0.75f) * _streamer.ChunkSizeWorld;
                _doc.QueryObstaclesNear(_camFocus, activeRadiusMeters, _nearbyObstaclesBuffer);

                foreach (var obs in _nearbyObstaclesBuffer)
                {
                    float wx0 = (obs.MinX - serverCenter.X) * VerticalSliceRoot.ServerCoordScale;
                    float wz0 = (obs.MinY - serverCenter.Y) * VerticalSliceRoot.ServerCoordScale;
                    float wx1 = (obs.MaxX - serverCenter.X) * VerticalSliceRoot.ServerCoordScale;
                    float wz1 = (obs.MaxY - serverCenter.Y) * VerticalSliceRoot.ServerCoordScale;

                    float w = Mathf.Max(0.2f, Mathf.Abs(wx1 - wx0));
                    float d = Mathf.Max(0.2f, Mathf.Abs(wz1 - wz0));
                    float cx = (wx0 + wx1) * 0.5f;
                    float cz = (wz0 + wz1) * 0.5f;
                    float groundY = TerrainElevation.SampleBaseTerrainHeight(cx, cz, _doc);

                    var box = new BoxMesh { Size = new Vector3(w, 0.35f, d) };
                    var meshInst = new MeshInstance3D
                    {
                        Mesh = box,
                        MaterialOverride = aabbMat,
                        Position = new Vector3(cx, groundY + 0.18f, cz)
                    };
                    _gizmoRoot.AddChild(meshInst);
                }
            }

            // 2. Render 3D Altitude Terrace Rings (Golden rings showing elevated plateaus & hills)
            if (_showElevationContours)
            {
                var terraceMat = new StandardMaterial3D
                {
                    Transparency = BaseMaterial3D.TransparencyEnum.Alpha,
                    ShadingMode = BaseMaterial3D.ShadingModeEnum.Unshaded,
                    AlbedoColor = new Color(0.98f, 0.82f, 0.32f, 0.22f)
                };

                foreach (var t in _doc.HeightTerraces)
                {
                    float topY = TerrainElevation.SampleBaseTerrainHeight(t.X, t.Z, _doc);
                    float plateauRadius = t.Radius * (1.0f - t.Falloff * 0.5f);
                    var cyl = new CylinderMesh
                    {
                        TopRadius = plateauRadius,
                        BottomRadius = plateauRadius,
                        Height = 0.06f,
                        RadialSegments = 36
                    };
                    var ring = new MeshInstance3D
                    {
                        Mesh = cyl,
                        MaterialOverride = terraceMat,
                        Position = new Vector3(t.X, topY + 0.05f, t.Z)
                    };

                    var label3D = new Label3D
                    {
                        Text = $"[ALTITUDE: {t.Id}]\nElev: {topY:+0.0;-0.0}m (R={t.Radius:0}m)",
                        Billboard = BaseMaterial3D.BillboardModeEnum.Enabled,
                        FontSize = 22,
                        OutlineSize = 7,
                        Modulate = new Color(1.0f, 0.92f, 0.48f),
                        Position = new Vector3(0f, 1.15f, 0f)
                    };
                    ring.AddChild(label3D);
                    _gizmoRoot.AddChild(ring);
                }
            }

            // 3. Render Stage 2 Route Splines, Ground-ID Zones & Spawn Areas
            if (_showSpawnZones)
            {
                var routeMat = new StandardMaterial3D
                {
                    Transparency = BaseMaterial3D.TransparencyEnum.Alpha,
                    ShadingMode = BaseMaterial3D.ShadingModeEnum.Unshaded,
                    AlbedoColor = new Color(0.96f, 0.78f, 0.38f, 0.28f)
                };

                foreach (var route in _doc.Routes)
                {
                    if (route.Points == null || route.Points.Count < 2)
                        continue;

                    for (int i = 0; i < route.Points.Count - 1; i++)
                    {
                        var p0 = route.Points[i];
                        var p1 = route.Points[i + 1];
                        if (p0 == null || p1 == null || p0.Length < 2 || p1.Length < 2)
                            continue;

                        Vector2 a = new(p0[0], p0[1]);
                        Vector2 b = new(p1[0], p1[1]);
                        Vector2 mid = (a + b) * 0.5f;
                        float segLen = a.DistanceTo(b);
                        if (segLen < 0.2f)
                            continue;

                        float angleY = Mathf.Atan2(b.X - a.X, b.Y - a.Y);
                        float midY = TerrainElevation.SampleBaseTerrainHeight(mid.X, mid.Y, _doc);
                        var ribbon = new MeshInstance3D
                        {
                            Mesh = new BoxMesh { Size = new Vector3(route.Width, 0.05f, segLen) },
                            MaterialOverride = routeMat,
                            Position = new Vector3(mid.X, midY + 0.06f, mid.Y),
                            Rotation = new Vector3(0f, angleY, 0f)
                        };
                        if (i == 0)
                        {
                            var rLabel = new Label3D
                            {
                                Text = $"[ROUTE: {route.Id}]\nground_id: {route.GroundId} (W={route.Width:0.1}m)",
                                Billboard = BaseMaterial3D.BillboardModeEnum.Enabled,
                                FontSize = 20,
                                OutlineSize = 6,
                                Modulate = new Color(1.0f, 0.88f, 0.52f),
                                Position = new Vector3(0f, 0.95f, 0f)
                            };
                            ribbon.AddChild(rLabel);
                        }
                        _gizmoRoot.AddChild(ribbon);
                    }
                }

                var zoneMat = new StandardMaterial3D
                {
                    Transparency = BaseMaterial3D.TransparencyEnum.Alpha,
                    ShadingMode = BaseMaterial3D.ShadingModeEnum.Unshaded,
                    AlbedoColor = new Color(0.20f, 0.78f, 1.0f, 0.16f)
                };
                var bossZoneMat = new StandardMaterial3D
                {
                    Transparency = BaseMaterial3D.TransparencyEnum.Alpha,
                    ShadingMode = BaseMaterial3D.ShadingModeEnum.Unshaded,
                    AlbedoColor = new Color(1.0f, 0.76f, 0.18f, 0.24f)
                };

                foreach (var zone in _doc.SpawnAreas)
                {
                    float wx = (zone.X - serverCenter.X) * VerticalSliceRoot.ServerCoordScale;
                    float wz = (zone.Y - serverCenter.Y) * VerticalSliceRoot.ServerCoordScale;
                    float ww = zone.Width * VerticalSliceRoot.ServerCoordScale;
                    float wd = zone.Height * VerticalSliceRoot.ServerCoordScale;
                    float cx = wx + ww * 0.5f;
                    float cz = wz + wd * 0.5f;
                    float groundY = TerrainElevation.SampleBaseTerrainHeight(cx, cz, _doc);

                    bool isBoss = zone.MobType.Contains("thorncrown") || zone.Id.Contains("boss");
                    var box = new BoxMesh { Size = new Vector3(ww, 0.08f, wd) };
                    var zoneMesh = new MeshInstance3D
                    {
                        Mesh = box,
                        MaterialOverride = isBoss ? bossZoneMat : zoneMat,
                        Position = new Vector3(cx, groundY + 0.05f, cz)
                    };

                    var label3D = new Label3D
                    {
                        Text = $"[SPAWN: {zone.Id}]\n{zone.MobType} \u00d7{zone.Count}",
                        Billboard = BaseMaterial3D.BillboardModeEnum.Enabled,
                        FontSize = 26,
                        OutlineSize = 8,
                        Modulate = isBoss ? new Color(1.0f, 0.88f, 0.35f) : new Color(0.55f, 0.92f, 1.0f),
                        Position = new Vector3(0f, 1.6f, 0f)
                    };
                    zoneMesh.AddChild(label3D);
                    _gizmoRoot.AddChild(zoneMesh);
                }
            }
        }

        public override void _Input(InputEvent @event)
        {
            if (@event is InputEventKey key && key.Pressed && !key.Echo)
            {
                if (key.Keycode == Key.F2)
                {
                    SetBuilderActive(!_builderActive);
                    GetViewport().SetInputAsHandled();
                    return;
                }
                if (key.Keycode == Key.P && _builderActive)
                {
                    _root.TogglePeacefulMode();
                    GetViewport().SetInputAsHandled();
                    return;
                }

                if (!_builderActive) return;

                if (key.Keycode == Key.S && (key.MetaPressed || key.CtrlPressed))
                {
                    SaveUnifiedMap();
                    GetViewport().SetInputAsHandled();
                }
                else if (key.Keycode == Key.T)
                {
                    CycleWorldTimeFromBuilder();
                    GetViewport().SetInputAsHandled();
                }
                else if (key.Keycode == Key.R)
                {
                    double nextDeg = (((_rotSlider?.Value ?? 0) + 45.0) % 360.0);
                    if (_rotSlider != null) _rotSlider.Value = nextDeg;
                    GetViewport().SetInputAsHandled();
                }
                else if (key.Keycode == Key.Bracketleft)
                {
                    if (_scaleSlider != null) _scaleSlider.Value = Math.Max(0.5, _scaleSlider.Value - 0.1);
                    GetViewport().SetInputAsHandled();
                }
                else if (key.Keycode == Key.Bracketright)
                {
                    if (_scaleSlider != null) _scaleSlider.Value = Math.Min(3.0, _scaleSlider.Value + 0.1);
                    GetViewport().SetInputAsHandled();
                }
                else if (key.Keycode == Key.Z)
                {
                    RemoveLastPlacedProp();
                    GetViewport().SetInputAsHandled();
                }
            }

            if (!_builderActive) return;

            if (@event is InputEventMouseButton mb)
            {
                Vector2 mousePos = mb.Position;
                bool overUi = IsPointOverBuilderUi(mousePos);

                if (mb.ButtonIndex == MouseButton.Right)
                {
                    _rightMouseOrbiting = mb.Pressed;
                }
                else if (mb.ButtonIndex == MouseButton.WheelUp && mb.Pressed && !overUi)
                {
                    _camDistance = Mathf.Clamp(_camDistance - 2.2f, 6.0f, 140.0f);
                }
                else if (mb.ButtonIndex == MouseButton.WheelDown && mb.Pressed && !overUi)
                {
                    _camDistance = Mathf.Clamp(_camDistance + 2.2f, 6.0f, 140.0f);
                }
                else if (mb.ButtonIndex == MouseButton.Left && mb.Pressed && !overUi)
                {
                    if (TryIntersectGroundPlane(mousePos, out Vector3 hit))
                    {
                        _cursorWorldPos = hit;
                        UpdateCursorPreviewTransform();
                        PlacePropAt(hit);
                    }
                }
            }
            else if (@event is InputEventMouseMotion mm)
            {
                if (_rightMouseOrbiting)
                {
                    _camYaw -= mm.Relative.X * 0.0065f;
                    _camPitch = Mathf.Clamp(_camPitch + mm.Relative.Y * 0.0055f, 0.22f, 1.35f);
                }
                else if (!IsPointOverBuilderUi(mm.Position))
                {
                    if (TryIntersectGroundPlane(mm.Position, out Vector3 hit))
                    {
                        _cursorWorldPos = hit;
                        UpdateCursorPreviewTransform();

                        Vector2I chunk = _streamer.WorldToChunkCoord(hit);
                        if (_cursorCoordLabel != null)
                        {
                            float slopeDeg = TerrainElevation.SampleSlopeDegrees(hit.X, hit.Z, _doc);
                            string slopeTag = slopeDeg > TerrainElevation.MaxWalkableSlopeDeg ? "CLIFF >35\u00b0" : "WALKABLE";
                            string groundId = _doc.ResolveGroundIdAt(hit.X, hit.Z, out _, out _);
                            _cursorCoordLabel.Text =
                                $"({hit.X:0.0}, Alt {hit.Y:+0.0;-0.0}m, {hit.Z:0.0}) | Ground: {groundId} | {slopeDeg:0.0}\u00b0 [{slopeTag}] | Chunk ({chunk.X},{chunk.Y})";
                        }
                    }
                }
            }
        }

        private bool IsPointOverBuilderUi(Vector2 pos)
        {
            if (_dockPanel != null && _dockPanel.Visible && _dockPanel.GetGlobalRect().HasPoint(pos))
                return true;
            if (_topBanner != null && _topBanner.Visible && _topBanner.GetGlobalRect().HasPoint(pos))
                return true;
            return false;
        }

        /// <summary>
        /// Intersects the mouse ray with the 3D elevated terrain surface using 4-step heightfield refinement.
        /// </summary>
        private bool TryIntersectGroundPlane(Vector2 screenPos, out Vector3 hitPoint)
        {
            hitPoint = Vector3.Zero;
            var cam = _root.MainCamera;
            if (cam == null) return false;

            Vector3 rayOrigin = cam.ProjectRayOrigin(screenPos);
            Vector3 rayDir = cam.ProjectRayNormal(screenPos);
            if (Mathf.Abs(rayDir.Y) < 0.0001f) return false;

            float t = -rayOrigin.Y / rayDir.Y;
            if (t <= 0f || t > 600f) return false;

            Vector3 p = rayOrigin + rayDir * t;
            // Refine intersection against the actual 3D terrain heightfield Y = SampleHeight(x, z)
            for (int iter = 0; iter < 4; iter++)
            {
                float h = TerrainElevation.SampleHeight(p.X, p.Z, _doc);
                t = (h - rayOrigin.Y) / rayDir.Y;
                p = rayOrigin + rayDir * Mathf.Clamp(t, 0.5f, 600f);
            }

            float halfW = _doc.HalfWidthWorld(VerticalSliceRoot.ServerCoordScale) - 1.0f;
            float halfH = _doc.HalfHeightWorld(VerticalSliceRoot.ServerCoordScale) - 1.0f;
            float clampedX = Mathf.Clamp(p.X, -halfW, halfW);
            float clampedZ = Mathf.Clamp(p.Z, -halfH, halfH);
            float finalY = TerrainElevation.SampleHeight(clampedX, clampedZ, _doc);

            hitPoint = new Vector3(clampedX, finalY, clampedZ);
            return true;
        }

        public void UpdateBuilderCamera(float dt)
        {
            SyncTimeControlsFromCycle();

            if (!_builderActive || _root.MainCamera == null) return;

            float panSpeed = 16.0f * (_camDistance / 20.0f);
            Vector2 pan = Vector2.Zero;
            if (Godot.Input.IsKeyPressed(Key.W) || Godot.Input.IsKeyPressed(Key.Up)) pan.Y -= 1f;
            if (Godot.Input.IsKeyPressed(Key.S) || Godot.Input.IsKeyPressed(Key.Down)) pan.Y += 1f;
            if (Godot.Input.IsKeyPressed(Key.A) || Godot.Input.IsKeyPressed(Key.Left)) pan.X -= 1f;
            if (Godot.Input.IsKeyPressed(Key.S) && (Godot.Input.IsKeyPressed(Key.Meta) || Godot.Input.IsKeyPressed(Key.Ctrl))) pan = Vector2.Zero;
            if (Godot.Input.IsKeyPressed(Key.D) || Godot.Input.IsKeyPressed(Key.Right)) pan.X += 1f;

            if (pan.LengthSquared() > 0.001f)
            {
                Vector2 rotated = pan.Normalized().Rotated(-_camYaw);
                float maxHalfX = _doc.HalfWidthWorld(VerticalSliceRoot.ServerCoordScale);
                float maxHalfZ = _doc.HalfHeightWorld(VerticalSliceRoot.ServerCoordScale);
                _camFocus.X = Mathf.Clamp(_camFocus.X + rotated.X * panSpeed * dt, -maxHalfX, maxHalfX);
                _camFocus.Z = Mathf.Clamp(_camFocus.Z + rotated.Y * panSpeed * dt, -maxHalfZ, maxHalfZ);
                _camFocus.Y = TerrainElevation.SampleBaseTerrainHeight(_camFocus.X, _camFocus.Z, _doc);

                if (_streamer.UpdateStreaming(_camFocus))
                {
                    RebuildChunkGridGizmos();
                    RebuildGizmoOverlays();
                    UpdateStatsLabel();
                }
            }
            else
            {
                _camFocus.Y = Mathf.Lerp(_camFocus.Y, TerrainElevation.SampleBaseTerrainHeight(_camFocus.X, _camFocus.Z, _doc), dt * 8.0f);
            }

            float horiz = _camDistance * Mathf.Cos(_camPitch);
            float vert = _camDistance * Mathf.Sin(_camPitch);
            Vector3 offset = new Vector3(
                Mathf.Sin(_camYaw) * horiz,
                vert,
                Mathf.Cos(_camYaw) * horiz);

            _root.MainCamera.Position = _root.MainCamera.Position.Lerp(_camFocus + offset, dt * 10.0f);
            _root.MainCamera.LookAt(_camFocus, Vector3.Up);
            UpdateCursorPreviewTransform();

            // Also run Smart Camera LOS Occlusion in Studio Mode toward the cursor / player focus!
            int prevFaded = _occluder.CurrentlyFadedPropCount;
            _occluder.Update(dt, _root.MainCamera.GlobalPosition, _cursorWorldPos + new Vector3(0f, 1.2f, 0f), _root.PlayerAvatar?.GlobalPosition);
            if (_occluder.CurrentlyFadedPropCount != prevFaded)
            {
                UpdateStatsLabel();
            }
        }
    }
}

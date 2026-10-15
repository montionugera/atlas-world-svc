using System;
using System.Collections.Generic;
using Godot;
using AtlasWorld.Client.World;

namespace AtlasWorld.Client.UI.Widgets
{
    /// <summary>
    /// Native macOS / Godot 4 In-Engine 3D Map Builder Dock &amp; Viewport Controller.
    /// Supports:
    /// 1. Dynamic Map Size Expansion (1000x1000 / 2000x2000 / 4000x4000 server units)
    /// 2. On-Demand Spatial Chunk Streaming (MapChunkStreamer) with 3D chunk boundary gizmos
    /// 3. 3D Altitude &amp; Terraced Elevation Sculpting (+ Add Hill/Terrace, - Add Valley, Amplitude slider)
    /// 4. Smart Auto-Transparent Camera LOS Occlusion Fader (SmartCameraOccluder) with live opacity slider
    /// 5. World Time &amp; Day/Night Atmosphere Control (24h Slider, Dawn/Noon/Sunset/Night presets, Auto-Advance &amp; Speed, Top Banner Quick Pill)
    /// 6. Browsing 3D glTF assets from res://assets/nature &amp; res://assets/dungeon and exporting to content/maps/freja-south-gate.json
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
        private Vector3 _camFocus = new(0f, 0f, -4f);
        private float _camYaw = 0.28f;
        private float _camPitch = 0.72f;
        private float _camDistance = 26.0f;
        private bool _rightMouseOrbiting = false;

        // UI Elements
        private PanelContainer? _dockPanel;
        private PanelContainer? _topBanner;
        private Button? _toggleBuilderBtn;
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
        private readonly List<Button> _catalogButtons = new();
        private readonly List<(float size, Button btn)> _mapSizeButtons = new();
        private readonly List<(WorldDayPhase phase, Button btn)> _timePresetButtons = new();

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
            _streamer.UpdateStreaming(_camFocus, forceReload: true);
            RebuildGizmoOverlays();
            RebuildChunkGridGizmos();
            SelectCatalogAsset(0);
            RefreshMapSizeButtons();
            SyncTimeControlsFromCycle();

            if (OS.GetEnvironment("ATLAS_MAP_BUILDER") == "1")
            {
                SetBuilderActive(true);
            }
        }

        private void BuildUi()
        {
            AnchorsPreset = (int)LayoutPreset.FullRect;
            MouseFilter = MouseFilterEnum.Ignore;

            // 1. Top-Center Map Builder Toggle Pill & Live Altitude / Chunk / World Time Status Banner
            _topBanner = new PanelContainer
            {
                Name = "BuilderTopBanner",
                AnchorLeft = 0.5f,
                AnchorRight = 0.5f,
                OffsetLeft = -465f,
                OffsetTop = 10f,
                OffsetRight = 465f,
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
                ContentMarginLeft = 12,
                ContentMarginRight = 12,
                ContentMarginTop = 5,
                ContentMarginBottom = 5
            };
            _topBanner.AddThemeStyleboxOverride("panel", bannerStyle);

            var bannerHBox = new HBoxContainer();
            bannerHBox.AddThemeConstantOverride("separation", 10);
            _topBanner.AddChild(bannerHBox);

            _toggleBuilderBtn = new Button
            {
                Text = "\ud83d\uddfa MAP BUILDER [F2]: OFF",
                CustomMinimumSize = new Vector2(170, 26)
            };
            _toggleBuilderBtn.AddThemeFontSizeOverride("font_size", 11);
            _toggleBuilderBtn.Pressed += () => SetBuilderActive(!_builderActive);
            bannerHBox.AddChild(_toggleBuilderBtn);

            _cursorCoordLabel = new Label
            {
                Text = "World (0.0, +0.0m, 0.0) | Chunk (0,0) | Server (500, 500)",
                SizeFlagsHorizontal = SizeFlags.ExpandFill
            };
            _cursorCoordLabel.AddThemeFontSizeOverride("font_size", 11);
            _cursorCoordLabel.AddThemeColorOverride("font_color", new Color(0.86f, 0.92f, 1.0f));
            bannerHBox.AddChild(_cursorCoordLabel);

            _topBannerTimeBtn = new Button
            {
                Text = "\u2600 10:30 DAY [T]",
                CustomMinimumSize = new Vector2(128, 26),
                TooltipText = "Click or press [T] to cycle World Time (Dawn / Noon / Sunset / Night)"
            };
            _topBannerTimeBtn.AddThemeFontSizeOverride("font_size", 11);
            _topBannerTimeBtn.Pressed += CycleWorldTimeFromBuilder;
            bannerHBox.AddChild(_topBannerTimeBtn);

            var quickSaveBtn = new Button
            {
                Text = "\ud83d\udcbe SAVE JSON (Cmd+S)",
                CustomMinimumSize = new Vector2(138, 26)
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
                OffsetRight = 374f,
                OffsetBottom = 892f,
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
                ContentMarginTop = 9,
                ContentMarginBottom = 9,
                ShadowColor = new Color(0f, 0f, 0f, 0.55f),
                ShadowSize = 8
            };
            _dockPanel.AddThemeStyleboxOverride("panel", dockStyle);
            AddChild(_dockPanel);

            var vbox = new VBoxContainer();
            vbox.AddThemeConstantOverride("separation", 4);
            _dockPanel.AddChild(vbox);

            var title = new Label
            {
                Text = "ATLAS 3D MAP BUILDER (ALTITUDE + TIME + CHUNKS)",
                Modulate = new Color(0.98f, 0.85f, 0.45f)
            };
            title.AddThemeFontSizeOverride("font_size", 11);
            vbox.AddChild(title);

            _statsSummaryLabel = new Label
            {
                Text = "Map: freja-south-gate (1000x1000)",
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
                Text = "Smart LOS Fade: Active (0 props faded)",
                Modulate = new Color(0.62f, 0.90f, 1.0f)
            };
            _occlusionStatusLabel.AddThemeFontSizeOverride("font_size", 10);
            vbox.AddChild(_occlusionStatusLabel);

            vbox.AddChild(new HSeparator());

            // Section 1: Map Size Expansion & On-Demand Chunk Streaming
            var scaleHeader = new Label
            {
                Text = "1. MAP EXPANSION & ON-DEMAND CHUNK STREAMING",
                Modulate = new Color(0.95f, 0.88f, 0.65f)
            };
            scaleHeader.AddThemeFontSizeOverride("font_size", 10);
            vbox.AddChild(scaleHeader);

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
                    CustomMinimumSize = new Vector2(0, 23)
                };
                sBtn.AddThemeFontSizeOverride("font_size", 10);
                sBtn.Pressed += () => ApplyMapResize(targetSize);
                _mapSizeButtons.Add((targetSize, sBtn));
                sizeBtnRow.AddChild(sBtn);
            }
            vbox.AddChild(sizeBtnRow);

            var radiusRow = new HBoxContainer();
            var radiusLbl = new Label { Text = "Load Radius:", CustomMinimumSize = new Vector2(86, 0) };
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
                UpdateStatsLabel();
            };
            radiusRow.AddChild(radiusLbl);
            radiusRow.AddChild(_chunkRadiusSlider);
            radiusRow.AddChild(_chunkRadiusValLabel);
            vbox.AddChild(radiusRow);

            vbox.AddChild(new HSeparator());

            // Section 2: 3D Altitude & Smart Camera Occlusion Transparency
            var altHeader = new Label
            {
                Text = "2. 3D ALTITUDE & SMART CAMERA OCCLUSION FADE",
                Modulate = new Color(0.95f, 0.88f, 0.65f)
            };
            altHeader.AddThemeFontSizeOverride("font_size", 10);
            vbox.AddChild(altHeader);

            var ampRow = new HBoxContainer();
            var ampLbl = new Label { Text = "Hill Height:", CustomMinimumSize = new Vector2(86, 0) };
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
            vbox.AddChild(ampRow);

            var terraceBtnRow = new HBoxContainer();
            terraceBtnRow.AddThemeConstantOverride("separation", 4);
            var addHillBtn = new Button
            {
                Text = "\u25b2 +Hill (+2.2m)",
                SizeFlagsHorizontal = SizeFlags.ExpandFill,
                CustomMinimumSize = new Vector2(0, 23)
            };
            addHillBtn.AddThemeFontSizeOverride("font_size", 10);
            addHillBtn.Pressed += () => SculptTerraceAtCursor(2.2f, 11.5f, 0.48f);

            var addCliffBtn = new Button
            {
                Text = "\u26f0 +Cliff (+4.2m)",
                SizeFlagsHorizontal = SizeFlags.ExpandFill,
                CustomMinimumSize = new Vector2(0, 23)
            };
            addCliffBtn.AddThemeFontSizeOverride("font_size", 10);
            addCliffBtn.Pressed += () => SculptTerraceAtCursor(4.2f, 9.5f, 0.16f);

            var addValleyBtn = new Button
            {
                Text = "\u25bc +Valley (-1.6m)",
                SizeFlagsHorizontal = SizeFlags.ExpandFill,
                CustomMinimumSize = new Vector2(0, 23)
            };
            addValleyBtn.AddThemeFontSizeOverride("font_size", 10);
            addValleyBtn.Pressed += () => SculptTerraceAtCursor(-1.6f, 11.0f, 0.48f);

            terraceBtnRow.AddChild(addHillBtn);
            terraceBtnRow.AddChild(addCliffBtn);
            terraceBtnRow.AddChild(addValleyBtn);
            vbox.AddChild(terraceBtnRow);

            var occToggle = new CheckBox
            {
                Text = "Auto-Transparent Blocking Objects (Camera LOS)",
                ButtonPressed = _occluder.Enabled
            };
            occToggle.AddThemeFontSizeOverride("font_size", 10);
            occToggle.Toggled += on =>
            {
                _occluder.Enabled = on;
                UpdateStatsLabel();
            };
            vbox.AddChild(occToggle);

            var occSliderRow = new HBoxContainer();
            var occLbl = new Label { Text = "Block Fade:", CustomMinimumSize = new Vector2(86, 0) };
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
            vbox.AddChild(occSliderRow);

            vbox.AddChild(new HSeparator());

            // Section 3: World Time & Day/Night Atmosphere Control
            var timeHeader = new Label
            {
                Text = "3. WORLD TIME & DAY/NIGHT ATMOSPHERE [T]",
                Modulate = new Color(0.98f, 0.85f, 0.45f)
            };
            timeHeader.AddThemeFontSizeOverride("font_size", 10);
            vbox.AddChild(timeHeader);

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
            vbox.AddChild(timeRow);

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
                    CustomMinimumSize = new Vector2(0, 22)
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
            vbox.AddChild(timePresetRow);

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
            vbox.AddChild(timeSpeedRow);

            vbox.AddChild(new HSeparator());

            // Section 4: Asset Palette
            var paletteHeader = new Label
            {
                Text = "4. 3D GLB ASSET PALETTE (Click to Arm Brush)",
                Modulate = new Color(0.95f, 0.88f, 0.65f)
            };
            paletteHeader.AddThemeFontSizeOverride("font_size", 10);
            vbox.AddChild(paletteHeader);

            var scroll = new ScrollContainer
            {
                CustomMinimumSize = new Vector2(320f, 118f),
                HorizontalScrollMode = ScrollContainer.ScrollMode.Disabled
            };
            vbox.AddChild(scroll);

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
                    CustomMinimumSize = new Vector2(152f, 32f),
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
            vbox.AddChild(_selectedAssetLabel);

            vbox.AddChild(new HSeparator());

            // Section 5: Brush Transform & Server Collision Controls
            var brushHeader = new Label
            {
                Text = "5. BRUSH TRANSFORM & GIZMOS",
                Modulate = new Color(0.95f, 0.88f, 0.65f)
            };
            brushHeader.AddThemeFontSizeOverride("font_size", 10);
            vbox.AddChild(brushHeader);

            var scaleRow = new HBoxContainer();
            var scaleLbl = new Label { Text = "Scale ([ / ]):", CustomMinimumSize = new Vector2(86, 0) };
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
            vbox.AddChild(scaleRow);

            var rotRow = new HBoxContainer();
            var rotLbl = new Label { Text = "Rotate (R):", CustomMinimumSize = new Vector2(86, 0) };
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
            vbox.AddChild(rotRow);

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
            vbox.AddChild(_blocksMoveCheck);

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
                Text = "Spawns",
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
                Text = "\uff0b Place Prop (L-Click)",
                SizeFlagsHorizontal = SizeFlags.ExpandFill,
                CustomMinimumSize = new Vector2(0, 24)
            };
            stampBtn.AddThemeFontSizeOverride("font_size", 10);
            stampBtn.Pressed += () => PlacePropAt(_cursorWorldPos);

            var undoBtn = new Button
            {
                Text = "\u232b Undo Last (Z)",
                SizeFlagsHorizontal = SizeFlags.ExpandFill,
                CustomMinimumSize = new Vector2(0, 24)
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
                Text = "\ud83d\udcbe Save Map JSON",
                SizeFlagsHorizontal = SizeFlags.ExpandFill,
                CustomMinimumSize = new Vector2(0, 25)
            };
            saveBtn.AddThemeFontSizeOverride("font_size", 10);
            saveBtn.Pressed += SaveUnifiedMap;

            var playBtn = new Button
            {
                Text = "\u25b6 Playtest Here (F2)",
                SizeFlagsHorizontal = SizeFlags.ExpandFill,
                CustomMinimumSize = new Vector2(0, 25)
            };
            playBtn.AddThemeFontSizeOverride("font_size", 10);
            playBtn.Pressed += () => SetBuilderActive(false);

            actRow2.AddChild(saveBtn);
            actRow2.AddChild(playBtn);
            vbox.AddChild(actRow2);

            _saveFeedbackLabel = new Label
            {
                Text = "WASD Pan | R-Drag Orbit | L-Click Place | [T] Cycle Time | Cmd+S Save",
                Modulate = new Color(0.75f, 0.84f, 0.96f),
                AutowrapMode = TextServer.AutowrapMode.WordSmart
            };
            _saveFeedbackLabel.AddThemeFontSizeOverride("font_size", 10);
            vbox.AddChild(_saveFeedbackLabel);

            UpdateStatsLabel();
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
                _selectedAssetLabel.Text = $"Armed: {item.Label} ({(item.DefaultBlocksMovement ? "Solid Collider" : "Pass-Through")})";
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
            float groundY = TerrainElevation.SampleHeight(worldPos.X, worldPos.Z, _doc);

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
            _doc.RebuildStaticObstacles(_doc.ServerCenter, VerticalSliceRoot.ServerCoordScale);
            _streamer.AddPropIncremental(newProp, _camFocus);
            RebuildGizmoOverlays();
            UpdateStatsLabel();

            Vector2I chunk = _streamer.WorldToChunkCoord(worldPos);
            if (_saveFeedbackLabel != null)
            {
                _saveFeedbackLabel.Text =
                    $"Placed '{item.Label}' at ({newProp.X:0.0}, Alt {newProp.Y:+0.0;-0.0}m, {newProp.Z:0.0}) in Chunk ({chunk.X},{chunk.Y}).";
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
                _saveFeedbackLabel.Text = $"Removed '{removed.Id}'. ({_doc.Props.Count} props remaining)";
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
                        $"\u2713 Saved {_doc.Width:0}\u00d7{_doc.Height:0} map ({_doc.Props.Count} props, {_doc.HeightTerraces.Count} terraces, Time {_root.DayNightCycle.FormattedClockString}) to content/maps/{_doc.MapId}.json";
                    _saveFeedbackLabel.Modulate = new Color(0.45f, 1.0f, 0.65f);
                }
            }
        }

        public void UpdateStatsLabel()
        {
            _doc.RebuildStaticObstacles(_doc.ServerCenter, VerticalSliceRoot.ServerCoordScale);
            if (_statsSummaryLabel != null)
            {
                float worldW = _doc.Width * VerticalSliceRoot.ServerCoordScale;
                float worldH = _doc.Height * VerticalSliceRoot.ServerCoordScale;
                _statsSummaryLabel.Text =
                    $"Size: {_doc.Width:0}\u00d7{_doc.Height:0} ({worldW:0}m\u00d7{worldH:0}m) | Terraces: {_doc.HeightTerraces.Count} | AABBs: {_doc.StaticObstacles.Count}";
            }
            if (_streamingStatusLabel != null)
            {
                Vector2I c = _streamer.CurrentCenterChunk;
                _streamingStatusLabel.Text =
                    $"On-Demand Chunks: {_streamer.LoadedChunkCount}/{_streamer.TotalNonEmptyChunks} Active @ ({c.X},{c.Y}) | Props: {_streamer.LoadedPropCount}/{_streamer.TotalPropCount}";
            }
            if (_occlusionStatusLabel != null)
            {
                _occlusionStatusLabel.Text = _occluder.Enabled
                    ? $"Smart Camera LOS Fade: ON ({_occluder.CurrentlyFadedPropCount} blocking props auto-faded / {_occluder.RegisteredPropCount} tracked)"
                    : "Smart Camera LOS Fade: OFF";
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
                    float cy = TerrainElevation.SampleHeight(cx, cz, _doc);

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

                    float northY = TerrainElevation.SampleHeight(cx, rect.Position.Y, _doc);
                    var northStrip = new MeshInstance3D
                    {
                        Mesh = new BoxMesh { Size = new Vector3(cs, 0.05f, 0.10f) },
                        MaterialOverride = activeBorderMat,
                        Position = new Vector3(cx, northY + 0.05f, rect.Position.Y)
                    };
                    float westY = TerrainElevation.SampleHeight(rect.Position.X, cz, _doc);
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
            _doc.RebuildStaticObstacles(serverCenter, VerticalSliceRoot.ServerCoordScale);

            // 1. Render Red Translucent Server-RS StaticObstacle AABB Boxes (snapped to 3D Terrain Altitude!)
            if (_showServerAabbs)
            {
                var aabbMat = new StandardMaterial3D
                {
                    Transparency = BaseMaterial3D.TransparencyEnum.Alpha,
                    ShadingMode = BaseMaterial3D.ShadingModeEnum.Unshaded,
                    AlbedoColor = new Color(1.0f, 0.25f, 0.22f, 0.36f)
                };

                foreach (var obs in _doc.StaticObstacles)
                {
                    float wx0 = (obs.MinX - serverCenter.X) * VerticalSliceRoot.ServerCoordScale;
                    float wz0 = (obs.MinY - serverCenter.Y) * VerticalSliceRoot.ServerCoordScale;
                    float wx1 = (obs.MaxX - serverCenter.X) * VerticalSliceRoot.ServerCoordScale;
                    float wz1 = (obs.MaxY - serverCenter.Y) * VerticalSliceRoot.ServerCoordScale;

                    float w = Mathf.Max(0.2f, Mathf.Abs(wx1 - wx0));
                    float d = Mathf.Max(0.2f, Mathf.Abs(wz1 - wz0));
                    float cx = (wx0 + wx1) * 0.5f;
                    float cz = (wz0 + wz1) * 0.5f;
                    float groundY = TerrainElevation.SampleHeight(cx, cz, _doc);

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
                    float topY = TerrainElevation.SampleHeight(t.X, t.Z, _doc);
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

            // 3. Render Cyan/Gold Server-RS Spawn Area Zones with 3D Labels (snapped to 3D Terrain Altitude!)
            if (_showSpawnZones)
            {
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
                    float groundY = TerrainElevation.SampleHeight(cx, cz, _doc);

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

                        Vector2 serverCenter = _doc.ServerCenter;
                        int sx = (int)Mathf.Round(serverCenter.X + (hit.X / VerticalSliceRoot.ServerCoordScale));
                        int sy = (int)Mathf.Round(serverCenter.Y + (hit.Z / VerticalSliceRoot.ServerCoordScale));
                        Vector2I chunk = _streamer.WorldToChunkCoord(hit);
                        if (_cursorCoordLabel != null)
                        {
                            float slopeDeg = TerrainElevation.SampleSlopeDegrees(hit.X, hit.Z, _doc);
                            string slopeTag = slopeDeg > TerrainElevation.MaxWalkableSlopeDeg ? "CLIFF BLOCKED >38\u00b0" : "WALKABLE";
                            _cursorCoordLabel.Text =
                                $"World ({hit.X:0.0}, Alt {hit.Y:+0.0;-0.0}m, {hit.Z:0.0}) | Slope {slopeDeg:0.0}\u00b0 [{slopeTag}] | Chunk ({chunk.X},{chunk.Y})";
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

            float maxHalfX = _doc.HalfWidthWorld(VerticalSliceRoot.ServerCoordScale) - 1.5f;
            float maxHalfZ = _doc.HalfHeightWorld(VerticalSliceRoot.ServerCoordScale) - 1.5f;
            float clampedX = Mathf.Clamp(p.X, -maxHalfX, maxHalfX);
            float clampedZ = Mathf.Clamp(p.Z, -maxHalfZ, maxHalfZ);
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
                _camFocus.Y = TerrainElevation.SampleHeight(_camFocus.X, _camFocus.Z, _doc);

                if (_streamer.UpdateStreaming(_camFocus))
                {
                    RebuildChunkGridGizmos();
                    UpdateStatsLabel();
                }
            }
            else
            {
                _camFocus.Y = Mathf.Lerp(_camFocus.Y, TerrainElevation.SampleHeight(_camFocus.X, _camFocus.Z, _doc), dt * 8.0f);
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

using System;
using System.Collections.Generic;
using Godot;
using AtlasWorld.Client.World;

namespace AtlasWorld.Client.UI.Widgets
{
    /// <summary>
    /// Native macOS / Godot 4 In-Engine 3D Map Builder Dock &amp; Viewport Controller.
    /// Allows browsing 3D glTF assets from res://assets/nature &amp; res://assets/dungeon,
    /// raycast-placing props on the ground plane, toggling server-rs AABB movement collision,
    /// inspecting 3D server spawn zones, and one-click saving to content/maps/freja-south-gate.json.
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
        private Node3D _propsRoot = null!;
        private Node3D _gizmoRoot = null!;
        private Node3D? _cursorPreviewNode;
        private MeshInstance3D? _cursorRingMesh;

        private bool _builderActive = false;
        private int _selectedAssetIndex = 0;
        private float _placementRotY = 0f;
        private float _placementScale = 1.4f;
        private bool _placementBlocksMovement = true;
        private bool _showServerAabbs = true;
        private bool _showSpawnZones = true;
        private Vector3 _cursorWorldPos = new(0f, 0f, -5f);

        // Free-fly / Orbit Builder Camera state
        private Vector3 _camFocus = new(0f, 0f, -4f);
        private float _camYaw = 0.28f;
        private float _camPitch = 0.72f;
        private float _camDistance = 24.0f;
        private bool _rightMouseOrbiting = false;

        // UI Elements
        private PanelContainer? _dockPanel;
        private PanelContainer? _topBanner;
        private Button? _toggleBuilderBtn;
        private Label? _selectedAssetLabel;
        private Label? _cursorCoordLabel;
        private Label? _statsSummaryLabel;
        private Label? _saveFeedbackLabel;
        private CheckBox? _blocksMoveCheck;
        private HSlider? _scaleSlider;
        private Label? _scaleValLabel;
        private HSlider? _rotSlider;
        private Label? _rotValLabel;
        private readonly List<Button> _catalogButtons = new();
        private readonly List<(UnifiedMapProp prop, Node3D node)> _spawnedProps = new();

        public bool IsBuilderActive => _builderActive;

        public void Initialize(VerticalSliceRoot root, UnifiedMapDocument doc, Node3D propsRoot)
        {
            _root = root;
            _doc = doc;
            _propsRoot = propsRoot;

            _gizmoRoot = new Node3D { Name = "MapBuilderGizmos", Visible = false };
            _root.AddChild(_gizmoRoot);

            BuildUi();
            RebuildPropsFromDocument();
            RebuildGizmoOverlays();
            SelectCatalogAsset(0);

            if (OS.GetEnvironment("ATLAS_MAP_BUILDER") == "1")
            {
                SetBuilderActive(true);
            }
        }

        private void BuildUi()
        {
            AnchorsPreset = (int)LayoutPreset.FullRect;
            MouseFilter = MouseFilterEnum.Ignore;

            // 1. Top-Center Map Builder Toggle Pill & Status Banner
            _topBanner = new PanelContainer
            {
                Name = "BuilderTopBanner",
                AnchorLeft = 0.5f,
                AnchorRight = 0.5f,
                OffsetLeft = -310f,
                OffsetTop = 10f,
                OffsetRight = 310f,
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
            bannerHBox.AddThemeConstantOverride("separation", 12);
            _topBanner.AddChild(bannerHBox);

            _toggleBuilderBtn = new Button
            {
                Text = "🗺 MAP BUILDER [F2]: OFF",
                CustomMinimumSize = new Vector2(180, 26)
            };
            _toggleBuilderBtn.AddThemeFontSizeOverride("font_size", 11);
            _toggleBuilderBtn.Pressed += () => SetBuilderActive(!_builderActive);
            bannerHBox.AddChild(_toggleBuilderBtn);

            _cursorCoordLabel = new Label
            {
                Text = "World (0.0, 0.0)  |  Server (500, 500)",
                SizeFlagsHorizontal = SizeFlags.ExpandFill
            };
            _cursorCoordLabel.AddThemeFontSizeOverride("font_size", 11);
            _cursorCoordLabel.AddThemeColorOverride("font_color", new Color(0.86f, 0.92f, 1.0f));
            bannerHBox.AddChild(_cursorCoordLabel);

            var quickSaveBtn = new Button
            {
                Text = "💾 SAVE JSON (Cmd+S)",
                CustomMinimumSize = new Vector2(142, 26)
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
                OffsetTop = 54f,
                OffsetRight = 344f,
                OffsetBottom = 720f,
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
                ContentMarginTop = 10,
                ContentMarginBottom = 10,
                ShadowColor = new Color(0f, 0f, 0f, 0.55f),
                ShadowSize = 8
            };
            _dockPanel.AddThemeStyleboxOverride("panel", dockStyle);
            AddChild(_dockPanel);

            var vbox = new VBoxContainer();
            vbox.AddThemeConstantOverride("separation", 7);
            _dockPanel.AddChild(vbox);

            var title = new Label
            {
                Text = "ATLAS 3D MAP BUILDER (MAC STUDIO)",
                Modulate = new Color(0.98f, 0.85f, 0.45f)
            };
            title.AddThemeFontSizeOverride("font_size", 13);
            vbox.AddChild(title);

            _statsSummaryLabel = new Label
            {
                Text = "Map: freja-south-gate (1000x1000)",
                Modulate = new Color(0.72f, 0.86f, 0.98f)
            };
            _statsSummaryLabel.AddThemeFontSizeOverride("font_size", 11);
            vbox.AddChild(_statsSummaryLabel);

            vbox.AddChild(new HSeparator());

            // Asset Palette Header
            var paletteHeader = new Label
            {
                Text = "1. 3D GLB ASSET PALETTE (Click to Arm Brush)",
                Modulate = new Color(0.95f, 0.88f, 0.65f)
            };
            paletteHeader.AddThemeFontSizeOverride("font_size", 11);
            vbox.AddChild(paletteHeader);

            var scroll = new ScrollContainer
            {
                CustomMinimumSize = new Vector2(300f, 210f),
                HorizontalScrollMode = ScrollContainer.ScrollMode.Disabled
            };
            vbox.AddChild(scroll);

            var grid = new GridContainer
            {
                Columns = 2,
                SizeFlagsHorizontal = SizeFlags.ExpandFill
            };
            grid.AddThemeConstantOverride("h_separation", 6);
            grid.AddThemeConstantOverride("v_separation", 5);
            scroll.AddChild(grid);

            for (int i = 0; i < AssetCatalog.Length; i++)
            {
                int idx = i;
                var item = AssetCatalog[i];
                var btn = new Button
                {
                    Text = $"{item.Label}\n[{item.Category}]",
                    CustomMinimumSize = new Vector2(142f, 38f),
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
            _selectedAssetLabel.AddThemeFontSizeOverride("font_size", 11);
            vbox.AddChild(_selectedAssetLabel);

            vbox.AddChild(new HSeparator());

            // Brush Transform & Server Collision Controls
            var brushHeader = new Label
            {
                Text = "2. BRUSH TRANSFORM & SERVER-RS COLLIDER",
                Modulate = new Color(0.95f, 0.88f, 0.65f)
            };
            brushHeader.AddThemeFontSizeOverride("font_size", 11);
            vbox.AddChild(brushHeader);

            // Scale Slider
            var scaleRow = new HBoxContainer();
            var scaleLbl = new Label { Text = "Scale ([ / ]):", CustomMinimumSize = new Vector2(90, 0) };
            scaleLbl.AddThemeFontSizeOverride("font_size", 11);
            _scaleSlider = new HSlider
            {
                MinValue = 0.5,
                MaxValue = 3.0,
                Step = 0.05,
                Value = _placementScale,
                SizeFlagsHorizontal = SizeFlags.ExpandFill
            };
            _scaleValLabel = new Label { Text = "1.40x", CustomMinimumSize = new Vector2(44, 0), HorizontalAlignment = HorizontalAlignment.Right };
            _scaleValLabel.AddThemeFontSizeOverride("font_size", 11);
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

            // Rotation Slider
            var rotRow = new HBoxContainer();
            var rotLbl = new Label { Text = "Rotate (R):", CustomMinimumSize = new Vector2(90, 0) };
            rotLbl.AddThemeFontSizeOverride("font_size", 11);
            _rotSlider = new HSlider
            {
                MinValue = 0.0,
                MaxValue = 360.0,
                Step = 15.0,
                Value = 0.0,
                SizeFlagsHorizontal = SizeFlags.ExpandFill
            };
            _rotValLabel = new Label { Text = "0°", CustomMinimumSize = new Vector2(44, 0), HorizontalAlignment = HorizontalAlignment.Right };
            _rotValLabel.AddThemeFontSizeOverride("font_size", 11);
            _rotSlider.ValueChanged += val =>
            {
                _placementRotY = Mathf.DegToRad((float)val);
                _rotValLabel.Text = $"{val:0}°";
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
            _blocksMoveCheck.AddThemeFontSizeOverride("font_size", 11);
            _blocksMoveCheck.Toggled += on =>
            {
                _placementBlocksMovement = on;
                UpdateCursorPreviewTransform();
            };
            vbox.AddChild(_blocksMoveCheck);

            vbox.AddChild(new HSeparator());

            // 3. Server Overlay Toggles
            var overlayHeader = new Label
            {
                Text = "3. AUTHORITATIVE OVERLAYS & ACTIONS",
                Modulate = new Color(0.95f, 0.88f, 0.65f)
            };
            overlayHeader.AddThemeFontSizeOverride("font_size", 11);
            vbox.AddChild(overlayHeader);

            var aabbToggle = new CheckBox
            {
                Text = "Show Server-RS Red AABB Colliders",
                ButtonPressed = true
            };
            aabbToggle.AddThemeFontSizeOverride("font_size", 11);
            aabbToggle.Toggled += on =>
            {
                _showServerAabbs = on;
                RebuildGizmoOverlays();
            };
            vbox.AddChild(aabbToggle);

            var spawnToggle = new CheckBox
            {
                Text = "Show Server-RS Mob Spawn Zones",
                ButtonPressed = true
            };
            spawnToggle.AddThemeFontSizeOverride("font_size", 11);
            spawnToggle.Toggled += on =>
            {
                _showSpawnZones = on;
                RebuildGizmoOverlays();
            };
            vbox.AddChild(spawnToggle);

            // Action Buttons Row 1: Place at Cursor / Undo Last
            var actRow1 = new HBoxContainer();
            actRow1.AddThemeConstantOverride("separation", 6);
            var stampBtn = new Button
            {
                Text = "＋ Place Prop (L-Click)",
                SizeFlagsHorizontal = SizeFlags.ExpandFill,
                CustomMinimumSize = new Vector2(0, 28)
            };
            stampBtn.AddThemeFontSizeOverride("font_size", 11);
            stampBtn.Pressed += () => PlacePropAt(_cursorWorldPos);

            var undoBtn = new Button
            {
                Text = "⌫ Undo Last (Z)",
                SizeFlagsHorizontal = SizeFlags.ExpandFill,
                CustomMinimumSize = new Vector2(0, 28)
            };
            undoBtn.AddThemeFontSizeOverride("font_size", 11);
            undoBtn.Pressed += RemoveLastPlacedProp;

            actRow1.AddChild(stampBtn);
            actRow1.AddChild(undoBtn);
            vbox.AddChild(actRow1);

            // Action Buttons Row 2: Save Map / Playtest Switch
            var actRow2 = new HBoxContainer();
            actRow2.AddThemeConstantOverride("separation", 6);
            var saveBtn = new Button
            {
                Text = "💾 Save Map JSON",
                SizeFlagsHorizontal = SizeFlags.ExpandFill,
                CustomMinimumSize = new Vector2(0, 30)
            };
            saveBtn.AddThemeFontSizeOverride("font_size", 11);
            saveBtn.Pressed += SaveUnifiedMap;

            var playBtn = new Button
            {
                Text = "▶ Playtest Here (F2)",
                SizeFlagsHorizontal = SizeFlags.ExpandFill,
                CustomMinimumSize = new Vector2(0, 30)
            };
            playBtn.AddThemeFontSizeOverride("font_size", 11);
            playBtn.Pressed += () => SetBuilderActive(false);

            actRow2.AddChild(saveBtn);
            actRow2.AddChild(playBtn);
            vbox.AddChild(actRow2);

            _saveFeedbackLabel = new Label
            {
                Text = "Controls: WASD Pan | R-Drag Orbit | Scroll Zoom | L-Click Place",
                Modulate = new Color(0.75f, 0.84f, 0.96f),
                AutowrapMode = TextServer.AutowrapMode.WordSmart
            };
            _saveFeedbackLabel.AddThemeFontSizeOverride("font_size", 10);
            vbox.AddChild(_saveFeedbackLabel);

            UpdateStatsLabel();
        }

        public void SetBuilderActive(bool active)
        {
            _builderActive = active;
            if (_dockPanel != null) _dockPanel.Visible = active;
            if (_gizmoRoot != null) _gizmoRoot.Visible = active;

            if (_toggleBuilderBtn != null)
            {
                _toggleBuilderBtn.Text = active
                    ? "🗺 MAP BUILDER [F2]: ON (STUDIO)"
                    : "🗺 MAP BUILDER [F2]: OFF (PLAY)";
                _toggleBuilderBtn.Modulate = active
                    ? new Color(0.45f, 1.0f, 0.65f)
                    : Colors.White;
            }

            // Hide game HUD clutter while in full Studio Map Builder mode so the 3D canvas is clean
            _root.SetGameHudVisible(!active);

            if (active)
            {
                if (_root.PlayerAvatar != null)
                {
                    _camFocus = new Vector3(_root.PlayerAvatar.Position.X, 0f, _root.PlayerAvatar.Position.Z - 3f);
                }
                EnsureCursorPreview();
                RebuildGizmoOverlays();
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

        public void RebuildPropsFromDocument()
        {
            foreach (var (_, node) in _spawnedProps)
            {
                if (GodotObject.IsInstanceValid(node))
                    node.QueueFree();
            }
            _spawnedProps.Clear();

            foreach (var prop in _doc.Props)
            {
                SpawnPropNode(prop);
            }
            UpdateStatsLabel();
        }

        private void SpawnPropNode(UnifiedMapProp prop)
        {
            if (!ResourceLoader.Exists(prop.AssetPath))
                return;

            var scene = GD.Load<PackedScene>(prop.AssetPath);
            if (scene?.Instantiate() is Node3D instance)
            {
                instance.Name = prop.Id;
                instance.Position = new Vector3(prop.X, prop.Y, prop.Z);
                instance.Rotation = new Vector3(0f, prop.RotY, 0f);
                instance.Scale = Vector3.One * prop.Scale;
                EntityView.ApplyAnimeToonShading(instance, EntityKind.Npc);
                _propsRoot.AddChild(instance);
                _spawnedProps.Add((prop, instance));
            }
        }

        public void PlacePropAt(Vector3 worldPos)
        {
            var item = AssetCatalog[_selectedAssetIndex];
            string id = $"{item.Category.ToLowerInvariant().Replace(" ", "_")}_{_doc.Props.Count + 1:00}";

            var newProp = new UnifiedMapProp
            {
                Id = id,
                AssetPath = item.AssetPath,
                X = Mathf.Round(worldPos.X * 10f) / 10f,
                Y = 0f,
                Z = Mathf.Round(worldPos.Z * 10f) / 10f,
                RotY = Mathf.Round(_placementRotY * 100f) / 100f,
                Scale = Mathf.Round(_placementScale * 100f) / 100f,
                BlocksMovement = _placementBlocksMovement,
                ColliderHalfExtent = item.DefaultColliderHalfExtent
            };

            _doc.Props.Add(newProp);
            _doc.RebuildStaticObstacles(VerticalSliceRoot.ServerArenaCenter, VerticalSliceRoot.ServerCoordScale);
            SpawnPropNode(newProp);
            RebuildGizmoOverlays();
            UpdateStatsLabel();

            if (_saveFeedbackLabel != null)
            {
                _saveFeedbackLabel.Text = $"Placed '{item.Label}' at World ({newProp.X:0.0}, {newProp.Z:0.0}) — Press Cmd+S to save.";
                _saveFeedbackLabel.Modulate = new Color(0.55f, 1.0f, 0.68f);
            }
        }

        public void RemoveLastPlacedProp()
        {
            if (_spawnedProps.Count == 0 || _doc.Props.Count == 0)
                return;

            var last = _spawnedProps[^1];
            if (GodotObject.IsInstanceValid(last.node))
                last.node.QueueFree();

            _spawnedProps.RemoveAt(_spawnedProps.Count - 1);
            _doc.Props.RemoveAt(_doc.Props.Count - 1);
            _doc.RebuildStaticObstacles(VerticalSliceRoot.ServerArenaCenter, VerticalSliceRoot.ServerCoordScale);
            RebuildGizmoOverlays();
            UpdateStatsLabel();

            if (_saveFeedbackLabel != null)
            {
                _saveFeedbackLabel.Text = $"Removed '{last.prop.Id}'. ({_doc.Props.Count} props remaining)";
                _saveFeedbackLabel.Modulate = new Color(1.0f, 0.84f, 0.45f);
            }
        }

        public void SaveUnifiedMap()
        {
            if (_doc.SaveToDisk(VerticalSliceRoot.ServerArenaCenter, VerticalSliceRoot.ServerCoordScale, out string path))
            {
                RebuildGizmoOverlays();
                UpdateStatsLabel();
                if (_saveFeedbackLabel != null)
                {
                    _saveFeedbackLabel.Text = $"✓ Saved {_doc.Props.Count} props & {_doc.StaticObstacles.Count} server AABBs to content/maps/{_doc.MapId}.json";
                    _saveFeedbackLabel.Modulate = new Color(0.45f, 1.0f, 0.65f);
                }
            }
        }

        private void UpdateStatsLabel()
        {
            _doc.RebuildStaticObstacles(VerticalSliceRoot.ServerArenaCenter, VerticalSliceRoot.ServerCoordScale);
            if (_statsSummaryLabel != null)
            {
                _statsSummaryLabel.Text =
                    $"Props: {_doc.Props.Count}  |  Server AABBs: {_doc.StaticObstacles.Count}  |  Spawn Zones: {_doc.SpawnAreas.Count}";
            }
        }

        private void RebuildGizmoOverlays()
        {
            foreach (Node child in _gizmoRoot.GetChildren())
            {
                if (child == _cursorPreviewNode) continue;
                child.QueueFree();
            }

            if (!_builderActive) return;

            _doc.RebuildStaticObstacles(VerticalSliceRoot.ServerArenaCenter, VerticalSliceRoot.ServerCoordScale);

            // 1. Render Red Translucent Server-RS StaticObstacle AABB Boxes
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
                    float wx0 = (obs.MinX - VerticalSliceRoot.ServerArenaCenter.X) * VerticalSliceRoot.ServerCoordScale;
                    float wz0 = (obs.MinY - VerticalSliceRoot.ServerArenaCenter.Y) * VerticalSliceRoot.ServerCoordScale;
                    float wx1 = (obs.MaxX - VerticalSliceRoot.ServerArenaCenter.X) * VerticalSliceRoot.ServerCoordScale;
                    float wz1 = (obs.MaxY - VerticalSliceRoot.ServerArenaCenter.Y) * VerticalSliceRoot.ServerCoordScale;

                    float w = Mathf.Max(0.2f, Mathf.Abs(wx1 - wx0));
                    float d = Mathf.Max(0.2f, Mathf.Abs(wz1 - wz0));
                    float cx = (wx0 + wx1) * 0.5f;
                    float cz = (wz0 + wz1) * 0.5f;

                    var box = new BoxMesh { Size = new Vector3(w, 0.32f, d) };
                    var meshInst = new MeshInstance3D
                    {
                        Mesh = box,
                        MaterialOverride = aabbMat,
                        Position = new Vector3(cx, 0.16f, cz)
                    };
                    _gizmoRoot.AddChild(meshInst);
                }
            }

            // 2. Render Cyan/Gold Server-RS Spawn Area Zones with 3D Labels
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
                    float wx = (zone.X - VerticalSliceRoot.ServerArenaCenter.X) * VerticalSliceRoot.ServerCoordScale;
                    float wz = (zone.Y - VerticalSliceRoot.ServerArenaCenter.Y) * VerticalSliceRoot.ServerCoordScale;
                    float ww = zone.Width * VerticalSliceRoot.ServerCoordScale;
                    float wd = zone.Height * VerticalSliceRoot.ServerCoordScale;
                    float cx = wx + ww * 0.5f;
                    float cz = wz + wd * 0.5f;

                    bool isBoss = zone.MobType.Contains("thorncrown") || zone.Id.Contains("boss");
                    var box = new BoxMesh { Size = new Vector3(ww, 0.08f, wd) };
                    var zoneMesh = new MeshInstance3D
                    {
                        Mesh = box,
                        MaterialOverride = isBoss ? bossZoneMat : zoneMat,
                        Position = new Vector3(cx, 0.04f, cz)
                    };

                    var label3D = new Label3D
                    {
                        Text = $"[SPAWN: {zone.Id}]\n{zone.MobType} ×{zone.Count}",
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
                    _camDistance = Mathf.Clamp(_camDistance - 1.8f, 6.0f, 65.0f);
                }
                else if (mb.ButtonIndex == MouseButton.WheelDown && mb.Pressed && !overUi)
                {
                    _camDistance = Mathf.Clamp(_camDistance + 1.8f, 6.0f, 65.0f);
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
                    _camPitch = Mathf.Clamp(_camPitch + mm.Relative.Y * 0.0055f, 0.25f, 1.35f);
                }
                else if (!IsPointOverBuilderUi(mm.Position))
                {
                    if (TryIntersectGroundPlane(mm.Position, out Vector3 hit))
                    {
                        _cursorWorldPos = hit;
                        UpdateCursorPreviewTransform();

                        int sx = (int)Mathf.Round(VerticalSliceRoot.ServerArenaCenter.X + (hit.X / VerticalSliceRoot.ServerCoordScale));
                        int sy = (int)Mathf.Round(VerticalSliceRoot.ServerArenaCenter.Y + (hit.Z / VerticalSliceRoot.ServerCoordScale));
                        if (_cursorCoordLabel != null)
                        {
                            _cursorCoordLabel.Text = $"Cursor World ({hit.X:0.0}, {hit.Z:0.0})  |  Server ({sx}, {sy})";
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

        private bool TryIntersectGroundPlane(Vector2 screenPos, out Vector3 hitPoint)
        {
            hitPoint = Vector3.Zero;
            var cam = _root.MainCamera;
            if (cam == null) return false;

            Vector3 rayOrigin = cam.ProjectRayOrigin(screenPos);
            Vector3 rayDir = cam.ProjectRayNormal(screenPos);
            if (Mathf.Abs(rayDir.Y) < 0.0001f) return false;

            float t = -rayOrigin.Y / rayDir.Y;
            if (t <= 0f || t > 250f) return false;

            Vector3 p = rayOrigin + rayDir * t;
            hitPoint = new Vector3(
                Mathf.Clamp(p.X, -48f, 48f),
                0f,
                Mathf.Clamp(p.Z, -48f, 48f));
            return true;
        }

        public void UpdateBuilderCamera(float dt)
        {
            if (!_builderActive || _root.MainCamera == null) return;

            float panSpeed = 14.0f * (_camDistance / 20.0f);
            Vector2 pan = Vector2.Zero;
            if (Godot.Input.IsKeyPressed(Key.W) || Godot.Input.IsKeyPressed(Key.Up)) pan.Y -= 1f;
            if (Godot.Input.IsKeyPressed(Key.S) || Godot.Input.IsKeyPressed(Key.Down)) pan.Y += 1f;
            if (Godot.Input.IsKeyPressed(Key.A) || Godot.Input.IsKeyPressed(Key.Left)) pan.X -= 1f;
            if (Godot.Input.IsKeyPressed(Key.D) || Godot.Input.IsKeyPressed(Key.Right)) pan.X += 1f;

            if (pan.LengthSquared() > 0.001f)
            {
                Vector2 rotated = pan.Normalized().Rotated(-_camYaw);
                _camFocus += new Vector3(rotated.X, 0f, rotated.Y) * panSpeed * dt;
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
        }
    }
}

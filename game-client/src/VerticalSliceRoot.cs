using System;
using System.Collections.Generic;
using Godot;
using Atlas.Protocol;
using AtlasWorld.Client.Core;
using AtlasWorld.Client.Content;
using AtlasWorld.Client.Audio;
using AtlasWorld.Client.World;
using AtlasWorld.Client.Net;
using AtlasWorld.Client.Meta;
using AtlasWorld.Client.UI;
using AtlasWorld.Client.UI.Panels;
using AtlasWorld.Client.UI.Widgets;

namespace AtlasWorld.Client
{
    /// <summary>
    /// Root controller for the Godot 4 + server-rs (Rust ECS) Vertical Slice.
    /// Unified with the internal client library:
    /// 1. Config.Load() &amp; ServerRsConnection (WebSocket + FlatBuffers)
    /// 2. EntityManager &amp; SnapshotInterpolator (live 20 Hz EntityDelta + GameEvent ingestion)
    /// 3. AnimationController + AssetRegistry loop overrides + AudioRegistry 3D SFX
    /// 4. Joymify Design System + MetaShell (Character, Inventory, Skills, Quests, Loadout)
    /// 5. Split-screen WardrobeModal with real 3D Weapon GLB attachment
    /// 6. 3D World Monsters (showcase + live server-rs mobs/bots/projectiles) with 3D overhead nameplates, HP bars &amp; target ring
    /// 7. Authoritative Player HP/SP, ROX Auto-Combat AFK loop, Quest Kill Tracker, Live Minimap Radar, DevTuningDrawer &amp; Mac 3D Map Builder
    /// 8. Scalable Map Expansion (1000x1000 -> 2000x2000 -> 4000x4000) &amp; On-Demand Spatial Chunk Streaming (MapChunkStreamer)
    /// 9. 3D Altitude &amp; Terraced Elevation (TerrainElevation) + Smart Auto-Transparent Camera Occlusion Fader (SmartCameraOccluder)
    /// </summary>
    public partial class VerticalSliceRoot : Node3D
    {
        public const float ServerCoordScale = 0.1f;
        public const float MeleeAttackRangeWorld = 3.5f;
        public const int PlayerScaleMultiplier = 148;
        public static Vector2 ServerArenaCenter { get; private set; } = new(500f, 500f);

        [Export] public ServerRsConnection Connection = null!;
        [Export] public Node3D PlayerAvatar = null!;
        [Export] public Camera3D MainCamera = null!;
        [Export] public ChatBox ChatWidget = null!;
        [Export] public RichTextLabel StatusLabel = null!;
        [Export] public MobileControlsOverlay MobileControls = null!;
        [Export] public PlayerFrame PlayerStatusFrame = null!;
        [Export] public TopBar NavigationTopBar = null!;
        [Export] public WardrobeModal EquipmentWardrobeModal = null!;
        [Export] public TargetFrame TargetBossFrame = null!;
        [Export] public FloatingCombatText CombatText = null!;
        [Export] public ExpBar PlayerExpBar = null!;

        private Config _config = null!;
        private EntityManager _entityManager = null!;
        private AnimationController? _playerAnimController;
        private AnimationPlayer? _animPlayer;
        private MetaShell? _metaShell;
        private DevTuningDrawer? _tuningDrawer;
        private MapBuilderDock? _mapBuilderDock;
        private UnifiedMapDocument _mapDoc = null!;
        private MapChunkStreamer? _chunkStreamer;
        private readonly SmartCameraOccluder _cameraOccluder = new();
        private Node3D? _meadowRingRoot;

        private Vector2 _touchMoveIntent = Vector2.Zero;
        private float _basePlayerSpeed = 4.6f; // Matches server-rs default derived speed (46.0 * 0.1 = 4.6 u/s)
        private float _playerSpeed = 4.6f;
        private float _meleeRangeWorld = MeleeAttackRangeWorld;
        private float _customSafeInset = 18.0f;
        private float _actionClusterScale = 1.0f;
        private float _dashDuration = 0f;
        private float _attackAnimHoldSec = 0f;
        private bool _wasMovingLastFrame = false;
        private bool _autoApproachAttackPending = false;
        private bool _autoCombatEnabled = false;
        private float _autoAttackTimerSec = 0f;
        private int _currentSp = 3200;
        private const int MaxSp = 3200;
        private float _spRegenAccum = 0f;
        private float _respawnRequestCooldownSec = 0f;

        // Quest progression state
        private int _questStage = 1;
        private int _questKillCount = 0;
        private int _questKillGoal = 5;
        private Label? _questTitleLabel;
        private Label? _questTargetLabel;
        private Label? _questHintLabel;

        // Camera orbit & zoom state
        private float _cameraYaw = 0f;
        private float _cameraPitch = 0.56f;
        private float _cameraDistance = 6.2f;

        // 3D World Monsters & Target Ring
        private sealed class WorldMobEntry
        {
            public string Name = "";
            public string TitleBadge = "";
            public string ElementType = "";
            public long CurrentHp;
            public long MaxHp;
            public int BarSegments;
            public Node3D Root = null!;
            public AnimationController? Anim;
            public MeshInstance3D? HpFillBar;
        }

        private readonly List<WorldMobEntry> _worldMobs = new();
        private Node3D? _worldMobsContainer;
        private int _selectedMobIndex = 0;
        private uint _selectedServerTargetWireId = 0;
        private string _selectedServerTargetId = "";
        private MeshInstance3D? _targetRingMesh;
        private float _pulseTime = 0f;

        public EntityManager Entities => _entityManager;
        public bool IsAutoCombatEnabled => _autoCombatEnabled;
        public SmartCameraOccluder CameraOccluder => _cameraOccluder;

        public override void _Ready()
        {
            // 1. Initialize EntityManager + SnapshotInterpolator for live server-rs entities
            _entityManager = new EntityManager
            {
                Name = "EntityManager",
                SuppressOwnPlayerView = true
            };
            AddChild(_entityManager);

            if (OS.GetEnvironment("ATLAS_VERIFY_VERTICAL_SLICE") == "1")
            {
                SetPhysicsProcess(false);
                int code = VerifyVerticalSliceProbe.Run(this);
                GetTree().Quit(code);
                return;
            }
            if (OS.GetEnvironment("ATLAS_VERIFY_ENTITYVIEW") == "1")
            {
                SetPhysicsProcess(false);
                int code = EntityViewVerify.Run(this);
                GetTree().Quit(code);
                return;
            }
            if (OS.GetEnvironment("ATLAS_VERIFY_ANIM") == "1")
            {
                SetPhysicsProcess(false);
                int code = AnimationVerify.Run(this);
                GetTree().Quit(code);
                return;
            }
            if (OS.GetEnvironment("ATLAS_VERIFY_FACING") == "1")
            {
                SetPhysicsProcess(false);
                int code = FacingVerify.Run(this);
                GetTree().Quit(code);
                return;
            }

            GD.Print("[VerticalSliceRoot] Initializing Unified Godot 4 Mobile MMORPG Slice...");

            _config = Config.Load();

            // 2. Initialize Player Avatar & AnimationController from internal library
            if (PlayerAvatar != null)
            {
                // Apply Ragnarok Origin anime cel-shading + warm rim light to local PlayerAvatar
                EntityView.ApplyAnimeToonShading(PlayerAvatar, EntityKind.Player);

                // player_knight.glb faces +Z in model space; rotating Y by Pi faces -Z (away from camera into the world)
                PlayerAvatar.Rotation = new Vector3(0f, Mathf.Pi, 0f);

                var animOverrides = AssetRegistry.Instance?.ResolveAnimOverrides("player") ?? new Dictionary<string, string>
                {
                    ["idle"] = "Idle",
                    ["walk"] = "Walking_A",
                    ["run"] = "Running_A",
                    ["attack"] = "1H_Melee_Attack_Slice_Diagonal",
                    ["death"] = "Death_A"
                };

                _playerAnimController = new AnimationController(PlayerAvatar, animOverrides);
                _animPlayer = PlayerAvatar.FindChild("AnimationPlayer", true, false) as AnimationPlayer;

                if (_animPlayer != null)
                {
                    SetClipLoop(_animPlayer, "Idle", Animation.LoopModeEnum.Linear);
                    SetClipLoop(_animPlayer, "Walking_A", Animation.LoopModeEnum.Linear);
                    SetClipLoop(_animPlayer, "Running_A", Animation.LoopModeEnum.Linear);
                }

                _playerAnimController.Update(isAlive: true, velocity: Vector3.Zero, isAttacking: false);

                // Also ensure Wardrobe PreviewAvatar loops its Idle animation and uses anime cel-shading
                if (EquipmentWardrobeModal?.PreviewAvatar != null)
                {
                    EntityView.ApplyAnimeToonShading(EquipmentWardrobeModal.PreviewAvatar, EntityKind.Player);
                    var previewAnim = EquipmentWardrobeModal.PreviewAvatar.FindChild("AnimationPlayer", true, false) as AnimationPlayer;
                    if (previewAnim != null && previewAnim.HasAnimation("Idle"))
                    {
                        SetClipLoop(previewAnim, "Idle", Animation.LoopModeEnum.Linear);
                        previewAnim.Play("Idle");
                    }
                }
            }

            // 3. Populate Stylized Meadow Foliage Ring via On-Demand MapChunkStreamer & Spawn 3D World Monsters
            PopulateMeadowEnvironment();
            SpawnWorldMonsters();

            // 4. Apply Joymify Design System Theme to all UI controls & instantiate MetaShell + DevTuningDrawer + MapBuilderDock
            var joymifyTheme = ThemeBuilder.Build();
            var uiNode = GetNodeOrNull("UI");
            if (uiNode != null)
            {
                _tuningDrawer = new DevTuningDrawer { Name = "DevTuningDrawer" };
                uiNode.AddChild(_tuningDrawer);
                _tuningDrawer.ValuesChanged += ApplyTuningValues;
                _tuningDrawer.AutoCombatToggleRequested += ToggleAutoCombat;

                // Only attach MapBuilderDock in Map Builder Studio mode or when toggled via F2 on desktop
                if (!OS.HasFeature("mobile"))
                {
                    _mapBuilderDock = new MapBuilderDock { Name = "MapBuilderDock" };
                    uiNode.AddChild(_mapBuilderDock);
                    if (_chunkStreamer != null)
                    {
                        _mapBuilderDock.Initialize(this, _mapDoc, _chunkStreamer, _cameraOccluder);
                    }
                }

                foreach (Node child in uiNode.GetChildren())
                {
                    if (child is Control ctrl)
                    {
                        ctrl.Theme = joymifyTheme;
                    }
                }
            }

            _metaShell = new MetaShell();
            AddChild(_metaShell);

            if (_tuningDrawer != null)
            {
                ApplyTuningValues(_tuningDrawer.Current);
            }

            // Apply iOS Safe Area insets so notch / home-indicator never clip HUD controls
            ApplyMobileSafeArea();
            GetViewport().SizeChanged += ApplyMobileSafeArea;

            // Wire QuestTracker labels and tap to toggle ROX Auto-Combat
            var questTracker = GetNodeOrNull<Control>("UI/HUD/QuestTracker");
            if (questTracker != null)
            {
                _questTitleLabel = questTracker.GetNodeOrNull<Label>("VBox/QuestTitle");
                _questTargetLabel = questTracker.GetNodeOrNull<Label>("VBox/QuestTarget");
                _questHintLabel = questTracker.GetNodeOrNull<Label>("VBox/QuestHint");
                UpdateQuestTrackerDisplay();

                questTracker.MouseFilter = Control.MouseFilterEnum.Stop;
                questTracker.GuiInput += (@event) =>
                {
                    bool tapped = (@event is InputEventScreenTouch t && t.Pressed) ||
                                  (@event is InputEventMouseButton m && m.ButtonIndex == MouseButton.Left && m.Pressed);
                    if (tapped)
                    {
                        ToggleAutoCombat();
                    }
                };
            }

            // 5. Connect to server-rs via Config endpoint and wire RawSnapshotReceived -> EntityManager
            if (Connection != null)
            {
                Connection.Connected += OnServerConnected;
                Connection.Disconnected += OnServerDisconnected;
                Connection.SnapshotReceived += OnSnapshotReceived;
                Connection.RawSnapshotReceived += OnRawSnapshotReceived;

                UpdateStatusText($"[color=#{Design.Palette.Info.ToHtml(false)}]\u25cf Server: Connecting...[/color]");
                Connection.ConnectToHost(_config.ServerRsEndpoint);
                _entityManager.SetOwnPlayer(Connection.LocalWireId.ToString());
            }

            if (ChatWidget != null)
            {
                ChatWidget.MessageSent += OnChatMessageSent;
                ChatWidget.AppendSystemMessage("Atlas World Mobile MMORPG Ready. Tap [AUTO] or Quest Tracker for AFK Combat.");
            }

            // 6. Wire Mobile Controls Overlay + Cooldown visuals
            if (MobileControls != null)
            {
                MobileControls.MoveIntentChanged += dir =>
                {
                    _touchMoveIntent = dir;
                };

                MobileControls.ActionTriggered += action =>
                {
                    switch (action)
                    {
                        case "attack":
                            MobileControls.AttackBtn?.TriggerCooldown(0.45f);
                            TriggerAttack();
                            break;
                        case "dash":
                            MobileControls.DashBtn?.TriggerCooldown(2.5f);
                            TriggerDash();
                            break;
                        case "skill_1":
                            MobileControls.Skill1Btn?.TriggerCooldown(4.0f);
                            TriggerSkill(1);
                            break;
                        case "skill_2":
                            MobileControls.Skill2Btn?.TriggerCooldown(6.0f);
                            TriggerSkill(2);
                            break;
                        case "skill_3":
                            MobileControls.Skill3Btn?.TriggerCooldown(8.0f);
                            TriggerSkill(3);
                            break;
                        case "potion_hp":
                            MobileControls.PotionHpBtn?.TriggerCooldown(1.5f);
                            TriggerPotion("hp");
                            break;
                        case "potion_sp":
                            MobileControls.PotionSpBtn?.TriggerCooldown(1.5f);
                            TriggerPotion("sp");
                            break;
                        case "target_switch":
                            MobileControls.TargetBtn?.TriggerCooldown(0.3f);
                            TriggerTargetSwitch();
                            break;
                        case "auto_combat":
                            ToggleAutoCombat();
                            break;
                    }
                };
            }

            // 7. Wire TopBar to MetaShell & WardrobeModal
            if (NavigationTopBar != null)
            {
                NavigationTopBar.BagPressed += () => _metaShell?.OpenTab("Inventory");
                NavigationTopBar.WardrobePressed += () => EquipmentWardrobeModal?.Open();
                NavigationTopBar.QuestPressed += () => _metaShell?.OpenTab("Quests");
                NavigationTopBar.SkillsPressed += () => _metaShell?.OpenTab("Skills");
                NavigationTopBar.ShopPressed += () => _metaShell?.OpenTab("Loadout");
            }

            // 8. Wire Wardrobe 3D Weapon Attachment to Live PlayerAvatar
            if (EquipmentWardrobeModal != null)
            {
                EquipmentWardrobeModal.ItemEquipped += (slot, itemId) =>
                {
                    ChatWidget?.AppendPlayerMessage("Wardrobe", $"Equipped {slot}: {itemId}!");
                    if (PlayerAvatar != null)
                    {
                        WardrobeModal.AttachEquipmentToAvatar(PlayerAvatar, itemId);
                        EntityView.ApplyAnimeToonShading(PlayerAvatar, EntityKind.Player);
                        AudioRegistry.Instance?.Play("sfx:attack", PlayerAvatar.GlobalPosition);
                        var tween = CreateTween();
                        tween.TweenProperty(PlayerAvatar, "scale", new Vector3(1.18f, 0.88f, 1.18f), 0.1);
                        tween.TweenProperty(PlayerAvatar, "scale", Vector3.One, 0.15);
                    }
                };
            }

            // Optional test camera pose to demonstrate Smart Camera LOS Occlusion Fading & 3D Altitude
            if (OS.GetEnvironment("ATLAS_TEST_OCCLUSION_POSE") == "1" && PlayerAvatar != null)
            {
                float tx = -15.6f;
                float tz = -12.6f;
                float ty = TerrainElevation.SampleHeight(tx, tz, _mapDoc);
                PlayerAvatar.Position = new Vector3(tx, ty, tz);
                _cameraYaw = -0.35f;
                _cameraPitch = 0.34f;
                _cameraDistance = 6.8f;
                _chunkStreamer?.UpdateStreaming(PlayerAvatar.Position, forceReload: true);
            }

            // Optional auto-combat startup flag for automated Mac tests (ATLAS_AUTO_COMBAT_ON_START=1)
            if (OS.GetEnvironment("ATLAS_AUTO_COMBAT_ON_START") == "1")
            {
                GetTree().CreateTimer(0.6).Timeout += () => SetAutoCombat(true);
            }

            // Optional screenshot capture on desktop when ATLAS_CAPTURE_SCREENSHOT=1 (never stalls iOS GPU)
            if (!OS.HasFeature("mobile") && OS.GetEnvironment("ATLAS_CAPTURE_SCREENSHOT") == "1")
            {
                double delay = double.TryParse(OS.GetEnvironment("ATLAS_SCREENSHOT_DELAY"), out double customDelay)
                    ? customDelay
                    : 2.0;
                GetTree().CreateTimer(delay).Timeout += () =>
                {
                    var img = GetViewport()?.GetTexture()?.GetImage();
                    if (img != null)
                    {
                        img.SavePng("/tmp/atlas_actual_render.png");
                        GD.Print("[VerticalSliceRoot] Auto-screenshot captured to /tmp/atlas_actual_render.png");
                    }
                    if (OS.GetEnvironment("ATLAS_QUIT_AFTER_SCREENSHOT") == "1")
                    {
                        GetTree().Quit(0);
                    }
                };
            }
        }

        private void ApplyTuningValues(DevTuningDrawer.TuningValues v)
        {
            _cameraPitch = v.CameraPitch;
            _cameraDistance = v.CameraDistance;
            if (MainCamera != null)
            {
                MainCamera.Fov = v.CameraFov;
            }
            _basePlayerSpeed = v.PlayerSpeed;
            _meleeRangeWorld = v.MeleeRange;
            _customSafeInset = v.SafeAreaInset;
            _actionClusterScale = v.ActionClusterScale;
            ApplyMobileSafeArea();
        }

        public void SetGameHudVisible(bool visible)
        {
            if (PlayerStatusFrame != null) PlayerStatusFrame.Visible = visible;
            if (NavigationTopBar != null) NavigationTopBar.Visible = visible;
            if (TargetBossFrame != null) TargetBossFrame.Visible = visible;
            if (MobileControls != null) MobileControls.Visible = visible;
            if (ChatWidget != null) ChatWidget.Visible = visible;
            if (PlayerExpBar != null) PlayerExpBar.Visible = visible;
            if (_tuningDrawer != null) _tuningDrawer.Visible = visible;

            var hud = GetNodeOrNull<Control>("UI/HUD");
            if (hud != null) hud.Visible = visible;
        }

        private void ToggleAutoCombat()
        {
            SetAutoCombat(!_autoCombatEnabled);
        }

        public void SetAutoCombat(bool enabled)
        {
            _autoCombatEnabled = enabled;
            MobileControls?.AutoBtn?.SetToggled(_autoCombatEnabled);
            UpdateQuestTrackerDisplay();

            if (_autoCombatEnabled)
            {
                if (string.IsNullOrEmpty(_selectedServerTargetId))
                    LockNearestServerMob();
                ChatWidget?.AppendSystemMessage("[Auto-Combat] ON \u2014 Auto-hunting nearby Freja monsters.");
            }
            else
            {
                _autoApproachAttackPending = false;
                ChatWidget?.AppendSystemMessage("[Auto-Combat] OFF \u2014 Manual control resumed.");
            }
        }

        private void UpdateQuestTrackerDisplay()
        {
            if (_questTitleLabel != null)
            {
                _questTitleLabel.Text = $"[Main] Ch.{_questStage} Midnight Bells";
            }
            if (_questTargetLabel != null)
            {
                _questTargetLabel.Text = $"Purge Freja Monsters ({_questKillCount} / {_questKillGoal})";
            }
            if (_questHintLabel != null)
            {
                _questHintLabel.Text = _autoCombatEnabled
                    ? "\u25cf Auto-Hunting Active (Tap to pause)"
                    : "\u25b8 Tap or [AUTO] to auto-hunt";
                _questHintLabel.Modulate = _autoCombatEnabled
                    ? new Color(0.35f, 1.0f, 0.58f, 1f)
                    : new Color(0.95f, 0.90f, 0.58f, 0.95f);
            }
        }

        private void RecordQuestMonsterKill()
        {
            _questKillCount++;
            if (_questKillCount >= _questKillGoal)
            {
                int completedStage = _questStage;
                _questStage++;
                _questKillCount = 0;
                _questKillGoal = Math.Min(15, 5 + (_questStage - 1) * 2);

                if (PlayerExpBar != null)
                {
                    PlayerExpBar.BaseExpPercent = Mathf.Wrap(PlayerExpBar.BaseExpPercent + 25.0f, 0f, 100f);
                    PlayerExpBar.JobExpPercent = Mathf.Wrap(PlayerExpBar.JobExpPercent + 25.0f, 0f, 100f);
                    PlayerExpBar.UpdateDisplay();
                }

                Vector2 centerScreen = GetViewport()?.GetVisibleRect().Size * 0.5f ?? new Vector2(640, 360);
                CombatText?.SpawnSkillShout(centerScreen + new Vector2(0, -110), $"QUEST CH.{completedStage} COMPLETE!");
                ChatWidget?.AppendSystemMessage($"[Quest] Chapter {completedStage} Complete! Reward: +25% Base/Job EXP.");
            }
            UpdateQuestTrackerDisplay();
        }

        private static void SetClipLoop(AnimationPlayer player, string clipName, Animation.LoopModeEnum mode)
        {
            if (player.HasAnimation(clipName))
            {
                var anim = player.GetAnimation(clipName);
                if (anim != null) anim.LoopMode = mode;
            }
        }

        private void ApplyMobileSafeArea()
        {
            Rect2I safeArea = DisplayServer.GetDisplaySafeArea();
            Vector2I windowSize = DisplayServer.WindowGetSize();
            if (windowSize.X <= 0 || windowSize.Y <= 0) return;

            float leftInset = Mathf.Max(_customSafeInset, safeArea.Position.X * 0.5f);
            float rightInset = Mathf.Max(_customSafeInset, (windowSize.X - (safeArea.Position.X + safeArea.Size.X)) * 0.5f);

            if (PlayerStatusFrame != null)
            {
                PlayerStatusFrame.OffsetLeft = leftInset;
                PlayerStatusFrame.OffsetRight = leftInset + 320f;
            }

            var questTracker = GetNodeOrNull<Control>("UI/HUD/QuestTracker");
            if (questTracker != null)
            {
                questTracker.OffsetLeft = leftInset;
                questTracker.OffsetRight = leftInset + 240f;
            }

            if (StatusLabel != null)
            {
                StatusLabel.OffsetLeft = leftInset;
                StatusLabel.OffsetRight = leftInset + 240f;
            }

            _tuningDrawer?.SetLeftInset(leftInset);

            if (MobileControls?.Joystick != null)
            {
                MobileControls.Joystick.OffsetLeft = leftInset + 26f;
                MobileControls.Joystick.OffsetRight = leftInset + 200f;
            }

            var actionCluster = MobileControls?.GetNodeOrNull<Control>("ActionCluster");
            if (actionCluster != null)
            {
                actionCluster.OffsetRight = -rightInset;
                actionCluster.OffsetLeft = -rightInset - 335f;
                actionCluster.PivotOffset = new Vector2(335f, 325f);
                actionCluster.Scale = Vector2.One * _actionClusterScale;
            }
        }

        /// <summary>
        /// Synchronizes ServerArenaCenter, dynamically resizes and subdivides the 3D meadow Floor PlaneMesh,
        /// uploads 3D Altitude &amp; Terrace shader uniforms to the GPU vertex shader, and snaps static scene props
        /// to their terrain elevation.
        /// </summary>
        public void SyncMapFloorAndBounds()
        {
            if (_mapDoc == null)
                return;

            ServerArenaCenter = _mapDoc.ServerCenter;
            TerrainElevation.GlobalAmplitude = _mapDoc.TerrainAmplitude;

            if (_entityManager != null)
            {
                _entityManager.MapDocument = _mapDoc;
            }

            var floorNode = GetNodeOrNull<MeshInstance3D>("Floor");
            if (floorNode?.Mesh is PlaneMesh plane)
            {
                float worldW = _mapDoc.Width * ServerCoordScale;
                float worldH = _mapDoc.Height * ServerCoordScale;
                float floorW = Mathf.Max(200f, worldW * 1.35f);
                float floorH = Mathf.Max(200f, worldH * 1.35f);
                plane.Size = new Vector2(floorW, floorH);
                // High vertex subdivision so rolling hills and sculpted terraces deform smoothly
                plane.SubdivideWidth = 140;
                plane.SubdivideDepth = 140;
            }

            if (floorNode?.GetSurfaceOverrideMaterial(0) is ShaderMaterial shaderMat)
            {
                shaderMat.SetShaderParameter("terrain_amplitude", _mapDoc.TerrainAmplitude);
                int tCount = Math.Min(16, _mapDoc.HeightTerraces.Count);
                shaderMat.SetShaderParameter("terrace_count", tCount);

                var vec4Array = new Godot.Collections.Array<Vector4>();
                var falloffArray = new Godot.Collections.Array<float>();
                for (int i = 0; i < 16; i++)
                {
                    if (i < tCount)
                    {
                        var t = _mapDoc.HeightTerraces[i];
                        vec4Array.Add(new Vector4(t.X, t.Z, t.Radius, t.Height));
                        falloffArray.Add(t.Falloff);
                    }
                    else
                    {
                        vec4Array.Add(Vector4.Zero);
                        falloffArray.Add(0.45f);
                    }
                }
                shaderMat.SetShaderParameter("terrace_data", vec4Array);
                shaderMat.SetShaderParameter("terrace_falloff", falloffArray);
            }

            // Snap static scene props (Trees, Rocks, Bushes, CobblestonePath, Props) to the 3D terrain altitude
            var envProps = GetNodeOrNull<Node3D>("EnvironmentProps");
            if (envProps != null)
            {
                foreach (Node group in envProps.GetChildren())
                {
                    if (group is not Node3D group3D || group3D == _meadowRingRoot)
                        continue;

                    bool isPathTile = group3D.Name == "CobblestonePath";
                    foreach (Node prop in group3D.GetChildren())
                    {
                        if (prop is Node3D prop3D)
                        {
                            float groundY = TerrainElevation.SampleHeight(prop3D.Position.X, prop3D.Position.Z, _mapDoc);
                            prop3D.Position = new Vector3(
                                prop3D.Position.X,
                                groundY + (isPathTile ? 0.02f : 0f),
                                prop3D.Position.Z);
                        }
                    }
                }
            }
        }

        /// <summary>
        /// Loads the unified map JSON (content/maps/freja-south-gate.json), initializes
        /// the On-Demand Spatial Chunk Streamer (MapChunkStreamer), and registers all 3D props
        /// with SmartCameraOccluder so any prop blocking the camera auto-fades cleanly.
        /// </summary>
        private void PopulateMeadowEnvironment()
        {
            var envProps = GetNodeOrNull<Node3D>("EnvironmentProps");
            if (envProps == null)
                return;

            // Upgrade existing static scene props to warm anime toon shading
            EntityView.ApplyAnimeToonShading(envProps, EntityKind.Npc);
            _cameraOccluder.RegisterEnvironmentHierarchy(envProps);

            _meadowRingRoot = new Node3D { Name = "MeadowRing" };
            envProps.AddChild(_meadowRingRoot);

            _mapDoc = UnifiedMapDocument.LoadOrDefault("freja-south-gate");
            SyncMapFloorAndBounds();

            _chunkStreamer = new MapChunkStreamer(_meadowRingRoot, _mapDoc, _cameraOccluder);
            Vector3 initialFocus = PlayerAvatar?.Position ?? Vector3.Zero;
            _chunkStreamer.UpdateStreaming(initialFocus, forceReload: true);
        }

        private void SpawnWorldMonsters()
        {
            _worldMobsContainer = new Node3D { Name = "WorldMonsters" };
            AddChild(_worldMobsContainer);

            // Golden pulsing target selection ring
            var ringCyl = new CylinderMesh
            {
                TopRadius = 1.15f,
                BottomRadius = 1.15f,
                Height = 0.03f,
                RadialSegments = 32
            };
            var ringMat = new StandardMaterial3D
            {
                Transparency = BaseMaterial3D.TransparencyEnum.Alpha,
                ShadingMode = BaseMaterial3D.ShadingModeEnum.Unshaded,
                AlbedoColor = new Color(1.0f, 0.84f, 0.22f, 0.55f)
            };
            _targetRingMesh = new MeshInstance3D
            {
                Name = "TargetSelectionRing",
                Mesh = ringCyl,
                MaterialOverride = ringMat,
                Position = new Vector3(0f, 0.04f, 0f)
            };
            AddChild(_targetRingMesh);

            // 1. MVP Boss: Lv.60 Drake (using orc_brute.glb)
            SpawnSingleMonster(
                _worldMobsContainer,
                assetKey: "mob:aggressive",
                fallbackPath: "res://assets/characters/orc_brute.glb",
                name: "Lv.60 Drake",
                badge: "MVP Boss",
                element: "Undead / Water",
                hp: 1280000,
                maxHp: 1500000,
                segments: 4,
                pos: new Vector3(0f, TerrainElevation.SampleHeight(0f, -4.8f, _mapDoc), -4.8f),
                scale: 1.35f,
                nameColor: new Color(1.0f, 0.86f, 0.32f, 1f)
            );

            // 2. Elite Mob: Lv.58 Bramble Stalker (using mob_spear_thrower.glb)
            SpawnSingleMonster(
                _worldMobsContainer,
                assetKey: "mob:spear_thrower",
                fallbackPath: "res://assets/characters/mob_spear_thrower.glb",
                name: "Lv.58 Bramble Stalker",
                badge: "Elite Mob",
                element: "Earth / Insect",
                hp: 420000,
                maxHp: 420000,
                segments: 2,
                pos: new Vector3(3.8f, TerrainElevation.SampleHeight(3.8f, -3.6f, _mapDoc), -3.6f),
                scale: 1.05f,
                nameColor: new Color(1.0f, 0.55f, 0.45f, 1f)
            );

            UpdateTargetRingPosition();
        }

        private void SpawnSingleMonster(
            Node3D parent,
            string assetKey,
            string fallbackPath,
            string name,
            string badge,
            string element,
            long hp,
            long maxHp,
            int segments,
            Vector3 pos,
            float scale,
            Color nameColor)
        {
            Node3D? mobRoot = null;
            if (AssetRegistry.Instance != null)
            {
                var packed = AssetRegistry.Instance.Resolve(assetKey, out ResolveTier tier);
                if (tier != ResolveTier.Capsule)
                {
                    mobRoot = packed?.Instantiate() as Node3D;
                }
            }
            if (mobRoot == null && ResourceLoader.Exists(fallbackPath))
            {
                mobRoot = GD.Load<PackedScene>(fallbackPath)?.Instantiate() as Node3D;
            }
            if (mobRoot == null)
            {
                mobRoot = new Node3D();
            }

            EntityView.ApplyAnimeToonShading(mobRoot, EntityKind.Mob);

            mobRoot.Position = pos;
            mobRoot.Scale = Vector3.One * scale;
            // Face +Z toward the player at origin
            mobRoot.Rotation = new Vector3(0f, 0f, 0f);
            parent.AddChild(mobRoot);

            var animOverrides = AssetRegistry.Instance?.ResolveAnimOverrides(assetKey);
            var animCtrl = new AnimationController(mobRoot, animOverrides);
            animCtrl.Update(isAlive: true, velocity: Vector3.Zero, isAttacking: false);

            // Overhead 3D Billboard Nameplate
            var nameLabel = new Label3D
            {
                Text = $"[{badge}] {name}",
                PixelSize = 0.0065f,
                FontSize = 20,
                OutlineSize = 6,
                Modulate = nameColor,
                OutlineModulate = new Color(0.05f, 0.05f, 0.08f, 0.95f),
                Billboard = BaseMaterial3D.BillboardModeEnum.Enabled,
                Position = new Vector3(0f, 2.30f, 0f)
            };
            mobRoot.AddChild(nameLabel);

            // Overhead 3D HP Bar background & crimson fill
            var hpBgMesh = new MeshInstance3D
            {
                Mesh = new BoxMesh { Size = new Vector3(1.10f, 0.085f, 0.03f) },
                Position = new Vector3(0f, 2.02f, 0f),
                MaterialOverride = new StandardMaterial3D
                {
                    ShadingMode = BaseMaterial3D.ShadingModeEnum.Unshaded,
                    BillboardMode = BaseMaterial3D.BillboardModeEnum.Enabled,
                    BillboardKeepScale = true,
                    AlbedoColor = new Color(0.08f, 0.08f, 0.12f, 0.9f)
                }
            };
            mobRoot.AddChild(hpBgMesh);

            var hpFillMesh = new MeshInstance3D
            {
                Mesh = new BoxMesh { Size = new Vector3(1.06f, 0.062f, 0.04f) },
                Position = new Vector3(0f, 2.02f, 0.01f),
                MaterialOverride = new StandardMaterial3D
                {
                    ShadingMode = BaseMaterial3D.ShadingModeEnum.Unshaded,
                    BillboardMode = BaseMaterial3D.BillboardModeEnum.Enabled,
                    BillboardKeepScale = true,
                    AlbedoColor = new Color(0.92f, 0.18f, 0.18f, 1f)
                }
            };
            mobRoot.AddChild(hpFillMesh);

            _worldMobs.Add(new WorldMobEntry
            {
                Name = name,
                TitleBadge = badge,
                ElementType = element,
                CurrentHp = hp,
                MaxHp = maxHp,
                BarSegments = segments,
                Root = mobRoot,
                Anim = animCtrl,
                HpFillBar = hpFillMesh
            });
        }

        private Node3D? GetActiveTargetRoot()
        {
            if (_entityManager != null &&
                !string.IsNullOrEmpty(_selectedServerTargetId) &&
                _entityManager.TryGetEntityView(_selectedServerTargetId, out EntityView? serverView) &&
                serverView != null &&
                serverView.Alive &&
                GodotObject.IsInstanceValid(serverView.Root))
            {
                return serverView.Root;
            }

            if (_worldMobs.Count > 0 && (_worldMobsContainer == null || _worldMobsContainer.Visible))
            {
                var target = _worldMobs[_selectedMobIndex % _worldMobs.Count];
                if (GodotObject.IsInstanceValid(target.Root))
                    return target.Root;
            }
            return null;
        }

        private bool LockNearestServerMob()
        {
            if (_entityManager == null || _entityManager.Count == 0)
                return false;

            Vector3 playerPos = PlayerAvatar?.Position ?? Vector3.Zero;
            EntityView? nearestMob = null;
            float bestDistSq = float.MaxValue;
            foreach (var kv in _entityManager.Views)
            {
                if (kv.Value.Kind == EntityKind.Mob && kv.Value.Alive && GodotObject.IsInstanceValid(kv.Value.Root))
                {
                    float dSq = kv.Value.Root.Position.DistanceSquaredTo(playerPos);
                    if (dSq < bestDistSq)
                    {
                        bestDistSq = dSq;
                        nearestMob = kv.Value;
                    }
                }
            }
            if (nearestMob != null)
            {
                SelectServerTarget(nearestMob, announceInChat: false);
                return true;
            }
            return false;
        }

        private void SelectServerTarget(EntityView serverMob, bool announceInChat)
        {
            if (_entityManager != null)
            {
                foreach (var kv in _entityManager.Views)
                {
                    kv.Value.SetSelectedTarget(kv.Value.WireId == serverMob.WireId);
                }
            }

            _selectedServerTargetId = serverMob.WireId.ToString();
            _selectedServerTargetWireId = serverMob.WireId;

            string mobName = EntityKeys.FormatMobDisplayName(serverMob.RawMobType);
            string badge = EntityKeys.FormatMobBadge(serverMob.RawMobType);
            string elem = EntityKeys.FormatMobElement(serverMob.RawMobType);

            if (TargetBossFrame != null)
            {
                TargetBossFrame.TargetName = mobName;
                TargetBossFrame.TitleBadge = badge;
                TargetBossFrame.ElementType = elem;
                TargetBossFrame.CurrentHp = (long)Mathf.Round(serverMob.CurrentHealth);
                TargetBossFrame.MaxHp = (long)Mathf.Max(1f, Mathf.Round(serverMob.MaxHealth));
                TargetBossFrame.BarSegments = badge == "MVP Boss" ? 4 : 2;
                TargetBossFrame.UpdateDisplay();
            }

            UpdateTargetRingPosition();
            if (announceInChat)
            {
                ChatWidget?.AppendSystemMessage($"Target locked (Live Server): {mobName} [#{serverMob.WireId % 1000:D3}]");
            }
        }

        private void UpdateTargetRingPosition()
        {
            if (_targetRingMesh == null) return;
            Node3D? targetRoot = GetActiveTargetRoot();
            if (targetRoot != null)
            {
                float groundY = TerrainElevation.SampleHeight(targetRoot.Position.X, targetRoot.Position.Z, _mapDoc);
                _targetRingMesh.Position = new Vector3(targetRoot.Position.X, groundY + 0.04f, targetRoot.Position.Z);
            }
        }

        public override void _UnhandledInput(InputEvent @event)
        {
            if (_mapBuilderDock != null && _mapBuilderDock.IsBuilderActive)
                return;

            // Camera orbit on right-side screen drag or right-mouse drag
            if (@event is InputEventScreenDrag touchDrag)
            {
                float viewportWidth = GetViewport()?.GetVisibleRect().Size.X ?? 1280f;
                // Only orbit when dragging on the upper/right half outside the bottom-left thumbstick
                if (touchDrag.Position.X > viewportWidth * 0.32f || touchDrag.Position.Y < (GetViewport()?.GetVisibleRect().Size.Y ?? 720f) * 0.55f)
                {
                    _cameraYaw -= touchDrag.Relative.X * 0.006f;
                    _cameraPitch = Mathf.Clamp(_cameraPitch + touchDrag.Relative.Y * 0.004f, 0.25f, 1.15f);
                }
            }
            else if (@event is InputEventMouseMotion mouseMotion && (mouseMotion.ButtonMask & MouseButtonMask.Right) != 0)
            {
                _cameraYaw -= mouseMotion.Relative.X * 0.006f;
                _cameraPitch = Mathf.Clamp(_cameraPitch + mouseMotion.Relative.Y * 0.004f, 0.25f, 1.15f);
            }
            else if (@event is InputEventMouseButton wheel)
            {
                if (wheel.ButtonIndex == MouseButton.WheelUp && wheel.Pressed)
                    _cameraDistance = Mathf.Clamp(_cameraDistance - 0.45f, 3.5f, 11.0f);
                else if (wheel.ButtonIndex == MouseButton.WheelDown && wheel.Pressed)
                    _cameraDistance = Mathf.Clamp(_cameraDistance + 0.45f, 3.5f, 11.0f);
            }

            if (@event is InputEventKey keyEvent && keyEvent.Pressed && !keyEvent.Echo)
            {
                var focusOwner = GetViewport()?.GuiGetFocusOwner();
                bool isTyping = focusOwner is LineEdit or TextEdit;

                if (keyEvent.Keycode == Key.Quoteleft || keyEvent.Keycode == Key.F10)
                {
                    _tuningDrawer?.ToggleDrawer();
                    GetViewport()?.SetInputAsHandled();
                    return;
                }

                if (keyEvent.Keycode == Key.Escape)
                {
                    if (EquipmentWardrobeModal != null && EquipmentWardrobeModal.Visible)
                    {
                        EquipmentWardrobeModal.Close();
                        GetViewport()?.SetInputAsHandled();
                        return;
                    }
                    if (_metaShell != null && _metaShell.Visible)
                    {
                        _metaShell.SetOpen(false);
                        GetViewport()?.SetInputAsHandled();
                        return;
                    }
                    if (ChatWidget != null && ChatWidget.IsExpanded)
                    {
                        ChatWidget.SetExpanded(false);
                        GetViewport()?.SetInputAsHandled();
                        return;
                    }
                    focusOwner?.ReleaseFocus();
                    GetViewport()?.SetInputAsHandled();
                    return;
                }

                if (keyEvent.Keycode == Key.Enter || keyEvent.Keycode == Key.KpEnter)
                {
                    if (ChatWidget != null)
                    {
                        if (!ChatWidget.IsExpanded)
                        {
                            ChatWidget.SetExpanded(true);
                            ChatWidget.InputField?.GrabFocus();
                        }
                        else if (isTyping)
                        {
                            ChatWidget.Submit();
                        }
                        else
                        {
                            ChatWidget.InputField?.GrabFocus();
                        }
                        GetViewport()?.SetInputAsHandled();
                        return;
                    }
                }

                if (isTyping)
                {
                    return;
                }

                // Gameplay desktop keyboard shortcuts
                switch (keyEvent.Keycode)
                {
                    case Key.Space:
                        MobileControls?.AttackBtn?.TriggerCooldown(0.45f);
                        TriggerAttack();
                        GetViewport()?.SetInputAsHandled();
                        break;
                    case Key.Shift:
                        MobileControls?.DashBtn?.TriggerCooldown(2.5f);
                        TriggerDash();
                        GetViewport()?.SetInputAsHandled();
                        break;
                    case Key.Key1:
                    case Key.Q:
                    case Key.J:
                        MobileControls?.Skill1Btn?.TriggerCooldown(4.0f);
                        TriggerSkill(1);
                        GetViewport()?.SetInputAsHandled();
                        break;
                    case Key.Key2:
                    case Key.E:
                    case Key.K:
                        MobileControls?.Skill2Btn?.TriggerCooldown(6.0f);
                        TriggerSkill(2);
                        GetViewport()?.SetInputAsHandled();
                        break;
                    case Key.Key3:
                    case Key.R:
                    case Key.L:
                        MobileControls?.Skill3Btn?.TriggerCooldown(8.0f);
                        TriggerSkill(3);
                        GetViewport()?.SetInputAsHandled();
                        break;
                    case Key.F1:
                        MobileControls?.PotionHpBtn?.TriggerCooldown(1.5f);
                        TriggerPotion("hp");
                        GetViewport()?.SetInputAsHandled();
                        break;
                    case Key.F3:
                        MobileControls?.PotionSpBtn?.TriggerCooldown(1.5f);
                        TriggerPotion("sp");
                        GetViewport()?.SetInputAsHandled();
                        break;
                    case Key.Tab:
                        MobileControls?.TargetBtn?.TriggerCooldown(0.3f);
                        TriggerTargetSwitch();
                        GetViewport()?.SetInputAsHandled();
                        break;
                    case Key.Z:
                        ToggleAutoCombat();
                        GetViewport()?.SetInputAsHandled();
                        break;
                    case Key.B:
                    case Key.I:
                        if (EquipmentWardrobeModal != null)
                        {
                            if (EquipmentWardrobeModal.Visible)
                                EquipmentWardrobeModal.Close();
                            else
                                EquipmentWardrobeModal.Open();
                            GetViewport()?.SetInputAsHandled();
                        }
                        break;
                    case Key.M:
                    case Key.C:
                        _metaShell?.Toggle();
                        GetViewport()?.SetInputAsHandled();
                        break;
                    case Key.F12:
                        var img = GetViewport()?.GetTexture()?.GetImage();
                        if (img != null)
                        {
                            img.SavePng("/tmp/atlas_actual_render.png");
                            GD.Print("[VerticalSliceRoot] Screenshot saved to /tmp/atlas_actual_render.png");
                        }
                        GetViewport()?.SetInputAsHandled();
                        break;
                }
            }
        }

        private void OnServerConnected()
        {
            _entityManager.Reset();
            if (Connection != null)
            {
                _entityManager.SetOwnPlayer(Connection.LocalWireId.ToString());
                // Send an initial neutral ClientInput packet so server-rs spawns our PlayerAvatar immediately
                Connection.SendInput(0f, 0f);
            }
            UpdateStatusText($"[color=#{Design.Palette.Success.ToHtml(false)}]\u25cf Server Connected (2567)[/color]");
            ChatWidget?.AppendSystemMessage("Connected to server-rs WebSocket gateway.");
        }

        private void OnServerDisconnected(int code, string reason)
        {
            _entityManager.Reset();
            _selectedServerTargetId = "";
            _selectedServerTargetWireId = 0;
            _autoApproachAttackPending = false;
            if (_worldMobsContainer != null)
            {
                _worldMobsContainer.Visible = true;
            }
            UpdateStatusText($"[color=#{Design.Palette.Warn.ToHtml(false)}]\u25cb Offline Simulation ({reason})[/color]");
        }

        private void OnRawSnapshotReceived(WorldSnapshot snapshot)
        {
            // 1. Ingest all entity deltas + removed IDs into EntityManager / SnapshotInterpolator
            _entityManager.IngestServerRsSnapshot(snapshot, ServerCoordScale, ServerArenaCenter);

            // Hide offline static showcase monsters once live server-rs entities are streaming
            if (_worldMobsContainer != null && _entityManager.Count > 0)
            {
                _worldMobsContainer.Visible = false;
            }

            // Sync authoritative own-player HP & Respawn state into PlayerFrame
            if (_entityManager.HasOwnPlayerState && PlayerStatusFrame != null)
            {
                int scaledHp = Mathf.Max(0, (int)Mathf.Round(_entityManager.OwnPlayerHealth * PlayerScaleMultiplier));
                int scaledMaxHp = Mathf.Max(1, (int)Mathf.Round(_entityManager.OwnPlayerMaxHealth * PlayerScaleMultiplier));
                PlayerStatusFrame.SetHp(scaledHp, scaledMaxHp);

                if (!_entityManager.OwnPlayerAlive && _respawnRequestCooldownSec <= 0f)
                {
                    _respawnRequestCooldownSec = 2.0f;
                    Connection?.SendInput(0f, 0f, respawn: true);
                    ChatWidget?.AppendSystemMessage("Defeated in battle! Respawning at Freja Sanctuary...");
                }
            }

            // Auto-select nearest live server-rs mob if none is currently locked
            if (string.IsNullOrEmpty(_selectedServerTargetId) && _entityManager.Count > 0)
            {
                LockNearestServerMob();
            }

            // 2. If currently targeting a live server-rs mob, keep TargetFrame synced to its authoritative HP
            if (!string.IsNullOrEmpty(_selectedServerTargetId))
            {
                if (_entityManager.TryGetEntityView(_selectedServerTargetId, out EntityView? targetView) &&
                    targetView != null && targetView.Alive)
                {
                    if (TargetBossFrame != null)
                    {
                        TargetBossFrame.CurrentHp = (long)Mathf.Round(targetView.CurrentHealth);
                        TargetBossFrame.MaxHp = (long)Mathf.Max(1f, Mathf.Round(targetView.MaxHealth));
                        TargetBossFrame.UpdateDisplay();
                    }
                }
                else
                {
                    // Target died or despawned on the server -> immediately lock next nearest if Auto-Combat is active
                    _selectedServerTargetId = "";
                    _selectedServerTargetWireId = 0;
                    _autoApproachAttackPending = false;
                    if (_autoCombatEnabled)
                    {
                        LockNearestServerMob();
                    }
                }
            }

            // 3. Process server-rs authoritative GameEvents (Hit / Kill) -> 3D-to-2D FloatingCombatText
            uint myWireId = Connection?.LocalWireId ?? 0;
            int evCount = snapshot.EventsLength;
            for (int i = 0; i < evCount; i++)
            {
                GameEvent? evOpt = snapshot.Events(i);
                if (!evOpt.HasValue)
                    continue;

                GameEvent ev = evOpt.Value;
                if (ev.Kind == GameEventKind.Hit && ev.Amount > 0f)
                {
                    bool involvedLocal = (myWireId != 0 && (ev.SourceId == myWireId || ev.TargetId == myWireId)) ||
                                         (_selectedServerTargetWireId != 0 && ev.TargetId == _selectedServerTargetWireId);
                    if (!involvedLocal)
                        continue;

                    long dmgAmount = Math.Max(1L, (long)Mathf.Round(ev.Amount * 28f)); // Scaled to RPG display numbers
                    bool isCrit = ev.Amount >= 25f;
                    Vector2 screenPos = GetViewport()?.GetVisibleRect().Size * 0.5f ?? new Vector2(640, 360);
                    screenPos += new Vector2(0, -85);

                    if (_entityManager.TryGetEntityView(ev.TargetId.ToString(), out EntityView? hitView) &&
                        hitView != null && GodotObject.IsInstanceValid(hitView.Root) && MainCamera != null)
                    {
                        Vector3 headWorldPos = hitView.Root.GlobalPosition + new Vector3(0f, 2.2f, 0f);
                        if (!MainCamera.IsPositionBehind(headWorldPos))
                        {
                            screenPos = MainCamera.UnprojectPosition(headWorldPos);
                        }
                        var tween = CreateTween();
                        tween.TweenProperty(hitView.Root, "scale", Vector3.One * 1.14f, 0.06);
                        tween.TweenProperty(hitView.Root, "scale", Vector3.One, 0.11);
                    }
                    else if (ev.TargetId == myWireId && PlayerAvatar != null && MainCamera != null)
                    {
                        Vector3 headWorldPos = PlayerAvatar.GlobalPosition + new Vector3(0f, 2.1f, 0f);
                        if (!MainCamera.IsPositionBehind(headWorldPos))
                        {
                            screenPos = MainCamera.UnprojectPosition(headWorldPos);
                        }
                    }

                    AudioRegistry.Instance?.Play("sfx:hit", PlayerAvatar?.GlobalPosition ?? Vector3.Zero);
                    CombatText?.SpawnDamage(screenPos, dmgAmount, isCrit);
                }
                else if (ev.Kind == GameEventKind.Kill && myWireId != 0 && ev.SourceId == myWireId)
                {
                    if (PlayerExpBar != null)
                    {
                        PlayerExpBar.BaseExpPercent = Mathf.Wrap(PlayerExpBar.BaseExpPercent + 8.0f, 0f, 100f);
                        PlayerExpBar.JobExpPercent = Mathf.Wrap(PlayerExpBar.JobExpPercent + 8.0f, 0f, 100f);
                        PlayerExpBar.UpdateDisplay();
                    }
                    ChatWidget?.AppendSystemMessage("Defeated monster! (+8.0% Base/Job EXP)");
                    RecordQuestMonsterKill();
                }
            }
        }

        private void OnSnapshotReceived(int tick, ulong serverTimeMs, int entityCount)
        {
            UpdateStatusText(
                $"[color=#{Design.Palette.Success.ToHtml(false)}]\u25cf Ch.1 Freja | Tick {tick} | Entities: {entityCount}[/color]");
        }

        private void UpdateStatusText(string bbcode)
        {
            if (StatusLabel != null)
            {
                StatusLabel.Text = bbcode;
            }
        }

        public override void _PhysicsProcess(double delta)
        {
            float dt = (float)delta;
            _pulseTime += dt;

            // When Mac 3D Map Builder Studio is active, drive the free-fly / orbit studio camera
            if (_mapBuilderDock != null && _mapBuilderDock.IsBuilderActive)
            {
                _mapBuilderDock.UpdateBuilderCamera(dt);
                return;
            }

            if (_respawnRequestCooldownSec > 0f)
                _respawnRequestCooldownSec -= dt;
            if (_autoAttackTimerSec > 0f)
                _autoAttackTimerSec -= dt;

            // Passive SP regeneration (+80 SP/sec)
            if (_currentSp < MaxSp)
            {
                _spRegenAccum += dt * 80f;
                if (_spRegenAccum >= 1f)
                {
                    int add = (int)_spRegenAccum;
                    _spRegenAccum -= add;
                    _currentSp = Math.Min(MaxSp, _currentSp + add);
                    PlayerStatusFrame?.SetSp(_currentSp, MaxSp);
                }
            }

            // Animate target selection ring scale pulse & track live interpolated target position
            UpdateTargetRingPosition();
            if (_targetRingMesh != null)
            {
                float s = 1.0f + 0.08f * Mathf.Sin(_pulseTime * 5.0f);
                _targetRingMesh.Scale = new Vector3(s, 1f, s);
            }

            // Update live Minimap Radar dots every frame
            if (NavigationTopBar != null && PlayerAvatar != null)
            {
                NavigationTopBar.UpdateRadar(
                    PlayerAvatar.Position,
                    PlayerAvatar.Rotation.Y,
                    _entityManager?.Views,
                    _selectedServerTargetId);
            }

            if (_attackAnimHoldSec > 0f)
            {
                _attackAnimHoldSec -= dt;
            }

            // Suppress movement while typing in Chat or when a modal/shell captures input
            var focusOwner = GetViewport()?.GuiGetFocusOwner();
            if (focusOwner is LineEdit or TextEdit || MetaGateway.CapturesInput)
            {
                if (_wasMovingLastFrame)
                {
                    _wasMovingLastFrame = false;
                    _entityManager?.SetLocalMoveHeld(false);
                    Connection?.SendInput(0f, 0f, targetId: _selectedServerTargetWireId);
                }
                if (_attackAnimHoldSec <= 0f)
                {
                    _playerAnimController?.Update(isAlive: true, velocity: Vector3.Zero, isAttacking: false);
                }
                return;
            }

            // Keyboard input (WASD + Arrow keys)
            float vx = 0f, vy = 0f;
            if (Godot.Input.IsKeyPressed(Key.A) || Godot.Input.IsKeyPressed(Key.Left)) vx -= 1f;
            if (Godot.Input.IsKeyPressed(Key.D) || Godot.Input.IsKeyPressed(Key.Right)) vx += 1f;
            if (Godot.Input.IsKeyPressed(Key.W) || Godot.Input.IsKeyPressed(Key.Up)) vy -= 1f;
            if (Godot.Input.IsKeyPressed(Key.S) || Godot.Input.IsKeyPressed(Key.Down)) vy += 1f;

            Vector2 keyboardDir = new Vector2(vx, vy);
            if (keyboardDir.LengthSquared() > 0.001f)
            {
                keyboardDir = keyboardDir.Normalized();
            }

            Vector2 rawInput = keyboardDir != Vector2.Zero ? keyboardDir : _touchMoveIntent;

            // Rotate movement vector by camera yaw so W/Up always moves forward relative to camera view
            Vector2 rotatedInput = rawInput.Rotated(-_cameraYaw);
            Vector3 direction = new Vector3(rotatedInput.X, 0f, rotatedInput.Y);

            // Manual movement overrides auto-approach for the current frame
            if (direction.LengthSquared() > 0.001f)
            {
                _autoApproachAttackPending = false;
            }
            else if (_autoCombatEnabled && PlayerAvatar != null)
            {
                // ROX Auto-Combat AFK Loop:
                // 1. Ensure a live server mob is targeted (or fallback to showcase mob)
                if (string.IsNullOrEmpty(_selectedServerTargetId))
                {
                    LockNearestServerMob();
                }

                Node3D? targetRoot = GetActiveTargetRoot();
                if (targetRoot != null)
                {
                    Vector3 toTarget = targetRoot.Position - PlayerAvatar.Position;
                    toTarget.Y = 0f;
                    float dist = toTarget.Length();
                    if (dist > _meleeRangeWorld * 0.88f)
                    {
                        direction = toTarget / dist;
                    }
                    else if (_autoAttackTimerSec <= 0f)
                    {
                        // Auto-replenish SP if low during AFK farming
                        if (_currentSp < 320 && (MobileControls?.PotionSpBtn == null || MobileControls.PotionSpBtn.IsReady))
                        {
                            MobileControls?.PotionSpBtn?.TriggerCooldown(1.5f);
                            TriggerPotion("sp");
                        }

                        // Cycle off-cooldown skills first, then basic melee swing
                        if (MobileControls?.Skill1Btn != null && MobileControls.Skill1Btn.IsReady && _currentSp >= 240)
                        {
                            MobileControls.Skill1Btn.TriggerCooldown(4.0f);
                            TriggerSkill(1);
                            _autoAttackTimerSec = 0.85f;
                        }
                        else if (MobileControls?.Skill2Btn != null && MobileControls.Skill2Btn.IsReady && _currentSp >= 320)
                        {
                            MobileControls.Skill2Btn.TriggerCooldown(6.0f);
                            TriggerSkill(2);
                            _autoAttackTimerSec = 0.85f;
                        }
                        else if (MobileControls?.Skill3Btn != null && MobileControls.Skill3Btn.IsReady && _currentSp >= 200)
                        {
                            MobileControls.Skill3Btn.TriggerCooldown(8.0f);
                            TriggerSkill(3);
                            _autoAttackTimerSec = 0.85f;
                        }
                        else
                        {
                            MobileControls?.AttackBtn?.TriggerCooldown(0.45f);
                            ExecuteMeleeSwing();
                            _autoAttackTimerSec = 0.80f;
                        }
                    }
                }
            }
            else if (_autoApproachAttackPending && PlayerAvatar != null)
            {
                Node3D? targetRoot = GetActiveTargetRoot();
                if (targetRoot != null)
                {
                    Vector3 toTarget = targetRoot.Position - PlayerAvatar.Position;
                    toTarget.Y = 0f;
                    float dist = toTarget.Length();
                    if (dist > _meleeRangeWorld * 0.88f)
                    {
                        direction = toTarget / dist;
                    }
                    else
                    {
                        _autoApproachAttackPending = false;
                        ExecuteMeleeSwing();
                    }
                }
                else
                {
                    _autoApproachAttackPending = false;
                }
            }

            if (_dashDuration > 0f)
            {
                _dashDuration -= dt;
                _playerSpeed = 16.0f;
            }
            else
            {
                _playerSpeed = _basePlayerSpeed;
            }

            bool isMoving = PlayerAvatar != null && direction.LengthSquared() > 0.001f;
            _entityManager?.SetLocalMoveHeld(isMoving);

            if (isMoving && PlayerAvatar != null)
            {
                Vector3 normDir = direction.Normalized();
                Vector3 velocity = normDir * (_playerSpeed * 2.0f); // Exceeds 8.0f sprint threshold in AnimationController
                PlayerAvatar.Position += normDir * _playerSpeed * dt;

                // Softly reconcile PlayerAvatar position toward server-rs authoritative coordinates if drift builds up
                if (_entityManager != null && _entityManager.HasOwnPlayerState && _dashDuration <= 0f)
                {
                    Vector3 serverPos = _entityManager.OwnPlayerServerPosition;
                    float driftSq = PlayerAvatar.Position.DistanceSquaredTo(serverPos);
                    if (driftSq > 36.0f)
                    {
                        PlayerAvatar.Position = serverPos;
                    }
                    else if (driftSq > 0.25f)
                    {
                        PlayerAvatar.Position = PlayerAvatar.Position.Lerp(serverPos, dt * 3.5f);
                    }
                }

                // Snap PlayerAvatar Y altitude smoothly to the 3D terrain elevation
                float targetGroundY = TerrainElevation.SampleHeight(PlayerAvatar.Position.X, PlayerAvatar.Position.Z, _mapDoc);
                PlayerAvatar.Position = new Vector3(
                    PlayerAvatar.Position.X,
                    Mathf.Lerp(PlayerAvatar.Position.Y, targetGroundY, dt * 16.0f),
                    PlayerAvatar.Position.Z);

                // Stream 3D chunks in/out on demand as the player walks across the map
                _chunkStreamer?.UpdateStreaming(PlayerAvatar.Position);

                // player_knight.glb faces +Z in local space:
                // Atan2(direction.X, direction.Z) yields Pi when moving -Z (into scene) and 0 when moving +Z (toward camera)
                float targetAngle = Mathf.Atan2(normDir.X, normDir.Z);
                float currentAngle = PlayerAvatar.Rotation.Y;
                float smoothAngle = Mathf.LerpAngle(currentAngle, targetAngle, dt * 14.0f);
                PlayerAvatar.Rotation = new Vector3(0f, smoothAngle, 0f);

                // Update minimap coordinates in TopBar
                int mapX = (int)Mathf.Round(ServerArenaCenter.X + (PlayerAvatar.Position.X / ServerCoordScale));
                int mapY = (int)Mathf.Round(ServerArenaCenter.Y + (PlayerAvatar.Position.Z / ServerCoordScale));
                NavigationTopBar?.SetLocation("Freja", mapX, mapY);

                // Always allow movement to interrupt any completed or ongoing attack hold so the character never feels frozen!
                _attackAnimHoldSec = 0f;
                _playerAnimController?.Update(isAlive: true, velocity: velocity, isAttacking: false);

                // Stream FlatBuffers movement intent to server-rs
                var (targetId, targetX, targetY) = ResolveServerAimTarget();
                Connection?.SendInput(normDir.X, normDir.Z, targetId: targetId, targetX: targetX, targetY: targetY);
                _wasMovingLastFrame = true;
            }
            else
            {
                if (_wasMovingLastFrame)
                {
                    // Send a zero-velocity stop frame so server-rs halts our avatar immediately
                    var (targetId, targetX, targetY) = ResolveServerAimTarget();
                    Connection?.SendInput(0f, 0f, targetId: targetId, targetX: targetX, targetY: targetY);
                    _wasMovingLastFrame = false;
                }
                else if (PlayerAvatar != null && _entityManager != null && _entityManager.HasOwnPlayerState && _dashDuration <= 0f && OS.GetEnvironment("ATLAS_TEST_OCCLUSION_POSE") != "1")
                {
                    // Gently settle onto server-rs authoritative stop position
                    Vector3 serverPos = _entityManager.OwnPlayerServerPosition;
                    if (PlayerAvatar.Position.DistanceSquaredTo(serverPos) > 0.04f)
                    {
                        PlayerAvatar.Position = PlayerAvatar.Position.Lerp(serverPos, dt * 6.0f);
                    }
                }

                if (PlayerAvatar != null)
                {
                    float groundY = TerrainElevation.SampleHeight(PlayerAvatar.Position.X, PlayerAvatar.Position.Z, _mapDoc);
                    PlayerAvatar.Position = new Vector3(
                        PlayerAvatar.Position.X,
                        Mathf.Lerp(PlayerAvatar.Position.Y, groundY, dt * 16.0f),
                        PlayerAvatar.Position.Z);
                }

                if (_attackAnimHoldSec <= 0f)
                {
                    _playerAnimController?.Update(isAlive: true, velocity: Vector3.Zero, isAttacking: false);
                }
            }

            // Smooth spherical follow camera & Smart Auto-Transparent Camera Occlusion Fader
            if (MainCamera != null && PlayerAvatar != null)
            {
                Vector3 focusTarget = PlayerAvatar.Position + new Vector3(0f, 1.25f, 0f);
                float horizDist = _cameraDistance * Mathf.Cos(_cameraPitch);
                float vertDist = _cameraDistance * Mathf.Sin(_cameraPitch);

                Vector3 offset = new Vector3(
                    Mathf.Sin(_cameraYaw) * horizDist,
                    vertDist,
                    Mathf.Cos(_cameraYaw) * horizDist
                );

                Vector3 desiredCamPos = focusTarget + offset;
                // Prevent camera from dipping underground when orbiting near a steep hill slope
                float camGroundY = TerrainElevation.SampleHeight(desiredCamPos.X, desiredCamPos.Z, _mapDoc);
                desiredCamPos.Y = Mathf.Max(desiredCamPos.Y, camGroundY + 0.85f);

                MainCamera.Position = MainCamera.Position.Lerp(desiredCamPos, dt * 8.0f);
                MainCamera.LookAt(focusTarget, Vector3.Up);

                // Automatically fade any 3D tree, pillar, boulder, or wall blocking the camera -> player/target LOS!
                Node3D? activeTarget = GetActiveTargetRoot();
                _cameraOccluder.Update(
                    dt,
                    MainCamera.GlobalPosition,
                    focusTarget,
                    activeTarget?.GlobalPosition);
            }
        }

        private (uint targetId, float targetX, float targetY) ResolveServerAimTarget()
        {
            Node3D? targetRoot = GetActiveTargetRoot();
            if (targetRoot != null)
            {
                float sx = ServerArenaCenter.X + (targetRoot.Position.X / ServerCoordScale);
                float sy = ServerArenaCenter.Y + (targetRoot.Position.Z / ServerCoordScale);
                return (_selectedServerTargetWireId, sx, sy);
            }
            return (0u, 0f, 0f);
        }

        private void TriggerAttack()
        {
            // Ensure we have a target locked if live server mobs exist
            if (string.IsNullOrEmpty(_selectedServerTargetId) && _entityManager != null && _entityManager.Count > 0)
            {
                LockNearestServerMob();
            }

            Node3D? targetRoot = GetActiveTargetRoot();
            if (PlayerAvatar != null && targetRoot != null && !string.IsNullOrEmpty(_selectedServerTargetId))
            {
                Vector3 toTarget = targetRoot.Position - PlayerAvatar.Position;
                toTarget.Y = 0f;
                float dist = toTarget.Length();

                // If target is outside server-rs melee attack range (40 server units = 4.0 world units),
                // automatically sprint into melee range and swing on arrival (ROX mobile auto-approach)!
                if (dist > _meleeRangeWorld)
                {
                    _autoApproachAttackPending = true;
                    return;
                }
            }

            ExecuteMeleeSwing();
        }

        private void ExecuteMeleeSwing()
        {
            GD.Print("[VerticalSliceRoot] Attack triggered!");
            _attackAnimHoldSec = 0.55f;

            // Face currently selected target monster when attacking
            Node3D? targetRoot = GetActiveTargetRoot();
            if (PlayerAvatar != null && targetRoot != null)
            {
                Vector3 toTarget = targetRoot.Position - PlayerAvatar.Position;
                toTarget.Y = 0f;
                if (toTarget.LengthSquared() > 0.01f)
                {
                    PlayerAvatar.Rotation = new Vector3(0f, Mathf.Atan2(toTarget.X, toTarget.Z), 0f);
                }
            }

            _playerAnimController?.Update(isAlive: true, velocity: Vector3.Zero, isAttacking: true);
            AudioRegistry.Instance?.Play("sfx:attack", PlayerAvatar?.GlobalPosition ?? Vector3.Zero);

            var (targetId, targetX, targetY) = ResolveServerAimTarget();
            Connection?.SendInput(0f, 0f, attack: true, targetId: targetId, targetX: targetX, targetY: targetY);

            // When connected to live server-rs, authoritative GameEventKind.Hit drives damage & HP bars;
            // only run local damage simulation when offline.
            if (string.IsNullOrEmpty(_selectedServerTargetId))
            {
                long dmg = (long)GD.RandRange(420, 640);
                bool isCrit = GD.Randf() > 0.65f;
                if (isCrit) dmg = (long)(dmg * 1.85f);
                ApplyOfflineDamageToShowcaseTarget(dmg, isCrit);
            }
        }

        private void TriggerDash()
        {
            GD.Print("[VerticalSliceRoot] Dash triggered!");
            _autoApproachAttackPending = false;
            _dashDuration = 0.30f;
            _attackAnimHoldSec = 0.35f;
            if (_animPlayer != null && _animPlayer.HasAnimation("Dodge_Forward"))
            {
                _animPlayer.Play("Dodge_Forward");
                _animPlayer.Queue("Idle");
            }
            AudioRegistry.Instance?.Play("sfx:attack", PlayerAvatar?.GlobalPosition ?? Vector3.Zero);

            Vector3 forward = PlayerAvatar != null
                ? new Vector3(Mathf.Sin(PlayerAvatar.Rotation.Y), 0f, Mathf.Cos(PlayerAvatar.Rotation.Y))
                : new Vector3(0f, 0f, -1f);
            Connection?.SendInput(forward.X, forward.Z, skillSlot: 5, targetId: _selectedServerTargetWireId);

            Vector2 centerScreen = GetViewport()?.GetVisibleRect().Size * 0.5f ?? new Vector2(640, 360);
            CombatText?.SpawnSkillShout(centerScreen + new Vector2(0, -45), "Wind Dash!");
        }

        private void TriggerSkill(int slot)
        {
            int spCost = slot switch
            {
                1 => 240,
                2 => 320,
                3 => 200,
                _ => 150
            };

            if (_currentSp < spCost)
            {
                ChatWidget?.AppendSystemMessage("Not enough SP! Use a Mana Potion [F3].");
                return;
            }

            _currentSp = Math.Max(0, _currentSp - spCost);
            PlayerStatusFrame?.SetSp(_currentSp, MaxSp);

            GD.Print($"[VerticalSliceRoot] Skill {slot} triggered!");
            string skillName = slot switch
            {
                1 => "Meteor Strike!!",
                2 => "Blizzard Storm!!",
                3 => "Aegis Shield!!",
                _ => $"Skill {slot}"
            };

            // Map UI button slot -> server-rs skill_execution.rs slot:
            // UI 1 (Meteor) -> server slot 1 ("skill_1")
            // UI 2 (Blizzard) -> server slot 3 ("skill_3")
            // UI 3 (Aegis / Precision) -> server slot 2 ("skill_2")
            byte serverSkillSlot = slot switch
            {
                1 => 1,
                2 => 3,
                3 => 2,
                _ => (byte)slot
            };

            _attackAnimHoldSec = 0.65f;
            if (_animPlayer != null && _animPlayer.HasAnimation("Spellcast_Raise"))
            {
                _animPlayer.Play("Spellcast_Raise");
                _animPlayer.Queue("Idle");
            }
            AudioRegistry.Instance?.Play("sfx:attack", PlayerAvatar?.GlobalPosition ?? Vector3.Zero);

            var (targetId, targetX, targetY) = ResolveServerAimTarget();
            Connection?.SendInput(0f, 0f, attack: false, skillSlot: serverSkillSlot, targetId: targetId, targetX: targetX, targetY: targetY);

            Vector2 centerScreen = GetViewport()?.GetVisibleRect().Size * 0.5f ?? new Vector2(640, 360);
            CombatText?.SpawnSkillShout(centerScreen + new Vector2(0, -65), skillName);

            // Offline fallback damage when not targeting a live server-rs entity
            if (string.IsNullOrEmpty(_selectedServerTargetId))
            {
                long dmg = slot switch
                {
                    1 => (long)GD.RandRange(2800, 4200),
                    2 => (long)GD.RandRange(1950, 2900),
                    _ => 0
                };

                if (dmg > 0)
                {
                    ApplyOfflineDamageToShowcaseTarget(dmg, isCrit: true);
                }
            }
        }

        private void ApplyOfflineDamageToShowcaseTarget(long dmg, bool isCrit)
        {
            TargetBossFrame?.ApplyDamage(dmg);

            Vector2 spawnPos = GetViewport()?.GetVisibleRect().Size * 0.5f ?? new Vector2(640, 360);
            spawnPos += new Vector2(0, -85);

            if (_worldMobs.Count > 0)
            {
                var mob = _worldMobs[_selectedMobIndex % _worldMobs.Count];
                mob.CurrentHp = Math.Max(0, mob.CurrentHp - dmg);
                if (mob.CurrentHp == 0)
                {
                    mob.CurrentHp = mob.MaxHp; // Respawn HP for continuous testing
                    RecordQuestMonsterKill();
                }

                float frac = mob.MaxHp > 0 ? Mathf.Clamp((float)mob.CurrentHp / mob.MaxHp, 0.01f, 1f) : 1f;
                if (mob.HpFillBar != null)
                {
                    mob.HpFillBar.Scale = new Vector3(frac, 1f, 1f);
                }

                if (MainCamera != null && GodotObject.IsInstanceValid(mob.Root))
                {
                    Vector3 headWorldPos = mob.Root.GlobalPosition + new Vector3(0f, 2.2f, 0f);
                    if (!MainCamera.IsPositionBehind(headWorldPos))
                    {
                        spawnPos = MainCamera.UnprojectPosition(headWorldPos);
                    }

                    var tween = CreateTween();
                    float baseScale = (_selectedMobIndex % _worldMobs.Count) == 0 ? 1.35f : 1.05f;
                    tween.TweenProperty(mob.Root, "scale", Vector3.One * (baseScale * 1.14f), 0.07);
                    tween.TweenProperty(mob.Root, "scale", Vector3.One * baseScale, 0.12);
                }
            }

            AudioRegistry.Instance?.Play("sfx:hit", PlayerAvatar?.GlobalPosition ?? Vector3.Zero);
            CombatText?.SpawnDamage(spawnPos, dmg, isCrit);
        }

        private void TriggerPotion(string type)
        {
            Vector2 centerScreen = GetViewport()?.GetVisibleRect().Size * 0.5f ?? new Vector2(640, 360);
            if (type == "hp")
            {
                if (_entityManager != null && !_entityManager.OwnPlayerAlive)
                {
                    Connection?.SendInput(0f, 0f, respawn: true);
                }
                PlayerStatusFrame?.SetHp(14850, 14850);
                ChatWidget?.AppendSystemMessage("Used [Health Potion] (+4,500 HP).");
                CombatText?.SpawnDamage(centerScreen + new Vector2(0, -40), 4500, false);
            }
            else
            {
                _currentSp = MaxSp;
                PlayerStatusFrame?.SetSp(_currentSp, MaxSp);
                ChatWidget?.AppendSystemMessage("Used [Mana Potion] (+1,200 SP).");
                CombatText?.SpawnDamage(centerScreen + new Vector2(0, -40), 1200, false);
            }
        }

        private void TriggerTargetSwitch()
        {
            var liveServerMobs = new List<EntityView>();
            Vector3 playerPos = PlayerAvatar?.Position ?? Vector3.Zero;

            foreach (var kv in _entityManager.Views)
            {
                if (kv.Value.Kind == EntityKind.Mob && kv.Value.Alive && GodotObject.IsInstanceValid(kv.Value.Root))
                {
                    liveServerMobs.Add(kv.Value);
                }
            }

            liveServerMobs.Sort((a, b) =>
                a.Root.Position.DistanceSquaredTo(playerPos).CompareTo(b.Root.Position.DistanceSquaredTo(playerPos)));

            // If live server-rs mobs are present, cycle exclusively through the nearest 6 live server mobs
            if (liveServerMobs.Count > 0)
            {
                int maxServerTargets = Math.Min(6, liveServerMobs.Count);
                _selectedMobIndex = (_selectedMobIndex + 1) % maxServerTargets;
                SelectServerTarget(liveServerMobs[_selectedMobIndex], announceInChat: true);
                return;
            }

            // Offline fallback: cycle showcase monsters
            if (_worldMobs.Count == 0) return;
            _selectedMobIndex = (_selectedMobIndex + 1) % _worldMobs.Count;
            _selectedServerTargetId = "";
            _selectedServerTargetWireId = 0;
            var mob = _worldMobs[_selectedMobIndex];

            if (TargetBossFrame != null)
            {
                TargetBossFrame.TargetName = mob.Name;
                TargetBossFrame.TitleBadge = mob.TitleBadge;
                TargetBossFrame.ElementType = mob.ElementType;
                TargetBossFrame.CurrentHp = mob.CurrentHp;
                TargetBossFrame.MaxHp = mob.MaxHp;
                TargetBossFrame.BarSegments = mob.BarSegments;
                TargetBossFrame.UpdateDisplay();
            }

            UpdateTargetRingPosition();
            ChatWidget?.AppendSystemMessage($"Target locked: {mob.Name} [{mob.TitleBadge}]");
        }

        private void OnChatMessageSent(string msg)
        {
            GD.Print($"[VerticalSliceRoot] Chat message sent: {msg}");
            ChatWidget?.AppendPlayerMessage("You", msg);
        }
    }
}

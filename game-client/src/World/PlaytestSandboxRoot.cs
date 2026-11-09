using System;
using System.Collections.Generic;
using Godot;
using Atlas.Protocol;
using AtlasWorld.Client.Audio;
using AtlasWorld.Client.Content;
using AtlasWorld.Client.Core;
using AtlasWorld.Client.Net;
using AtlasWorld.Client.UI;
using AtlasWorld.Client.UI.Widgets;

namespace AtlasWorld.Client.World
{
    /// <summary>
    /// Interactive Playtest Sandbox Client (F-188).
    /// Shares the real AtlasWorld.Client.World engine code (UnifiedMapDocument, TerrainElevation,
    /// MapChunkStreamer, DayNightCycleController, SmartCameraOccluder, AssetRegistry, EntityView,
    /// AnimationController, CharacterCustomization, WeaponSocket, ServerRsConnection) without any
    /// legacy ROX mobile HUD/timers.
    ///
    /// Designed for fast interactive testing of:
    /// 1. Walk (0.9 m/s) &amp; Run (3.0 m/s) locomotion + TerrainElevation obstacle/slope collision.
    /// 2. Upper-body attack blending while moving + 1-2-3 combo rotation + reactive Target Dummies.
    /// 3. Live Hair Color tinting, 1H Sword look swapping, and Character Rig switching (Maro Folk Girl,
    ///    Watch Sergeant, Knight, and any future Linde Folk / Silme Seers pipelineCharacter entries).
    /// 4. Landmark teleportation, Map switching (maro-bell / freja-south-gate), and real-time
    ///    foot-grounding telemetry (lowest ankle/foot delta in mm).
    /// </summary>
    public sealed partial class PlaytestSandboxRoot : Node3D
    {
        public const float WalkSpeedMetersPerSec = 0.90f;
        public const float RunSpeedMetersPerSec = 3.00f;
        public const float InteractiveWalkSpeedMetersPerSec = 1.90f;
        public const float InteractiveRunSpeedMetersPerSec = 5.80f;
        public const float InteractiveSprintSpeedMetersPerSec = 8.80f;
        public const float MeleeRangeMeters = 2.60f;

        [Export] public ServerRsConnection? Connection;
        [Export] public Camera3D? MainCamera;
        [Export] public MeshInstance3D? FloorMesh;
        [Export] public Node3D? EnvironmentProps;
        [Export] public FloatingCombatText? CombatText;

        private Config _config = null!;
        private UnifiedMapDocument _mapDoc = null!;
        private MapChunkStreamer? _chunkStreamer;
        private Node3D? _mapChunksRoot;
        private readonly SmartCameraOccluder _cameraOccluder = new();
        private readonly DayNightCycleController _dayNightCycle = new();
        private EntityManager? _entityManager;

        // Active player avatar state
        private Node3D? _avatarContainer;
        private Node3D? _avatarModel;
        private AnimationController? _animController;
        private AnimationPlayer? _animPlayer;
        private Skeleton3D? _skeleton;
        private WeaponSocket? _weaponSocket;
        private float _restMinFootY = 0.078f;

        private readonly List<string> _availableAvatarKeys = new();
        private int _avatarIndex = 0;
        private int _hairPresetIndex = 0;
        private int _weaponIndex = 0;
        private int _landmarkIndex = 0;

        private static readonly string[] WeaponOptions =
        {
            "sword", "kk_sword_a", "kk_sword_b", "claymore", "axe", "unarmed"
        };

        private static readonly (string Label, float X, float Z, float Yaw)[] MaroBellLandmarks =
        {
            ("Bell Terrace (Dummies)", 0.0f, -15.5f, Mathf.Pi),
            ("Arrival Gate (Scale Row)", 0.0f, 68.0f, Mathf.Pi),
            ("Market Bend (Amber Shop)", -6.0f, 32.0f, Mathf.Pi),
            ("Lantern Row (Bram House)", 6.0f, -8.0f, Mathf.Pi),
        };

        // Movement, gait, stance & camera state
        private bool _runGaitEnabled = true;
        private bool _relaxedStanceEnabled = true;
        private float _combatWeaponRevealTimer = 0f;
        private float _currentSpeedMetersPerSec = 0f;
        private Vector3 _lastVelocity = Vector3.Zero;
        private float _attackHoldTimer = 0f;
        private int _comboCounter = 0;
        private float _cameraYaw = 0f;
        private float _cameraPitch = 0.28f;
        private float _cameraDistance = 2.6f;
        private bool _faceZoomActive = false;
        private bool _liveServerConnected = false;

        private static bool IsHeadlessProbe => OS.GetEnvironment("ATLAS_VERIFY_PLAYTEST_SANDBOX") == "1";

        // Target dummies in Bell Terrace Plaza
        public sealed class SandboxDummy
        {
            public string Id = "";
            public string Name = "";
            public long CurrentHp;
            public long MaxHp;
            public Node3D Root = null!;
            public AnimationController? Anim;
            public MeshInstance3D? HpFillBar;
            public Label3D? HpLabel;
            public Vector3 BasePosition;
            public float BaseScale = 1.0f;
        }

        private readonly List<SandboxDummy> _dummies = new();
        private Node3D? _dummiesRoot;
        private int _selectedDummyIndex = 0;
        private MeshInstance3D? _targetRing;
        private float _pulseTime = 0f;

        // UI references
        private Label? _telemetryLabel;
        private Label? _actionBannerLabel;
        private Button? _stanceButton;
        private Button? _gaitButton;
        private Button? _zoomButton;
        private Button? _hairButton;
        private Button? _weaponButton;
        private Button? _rigButton;
        private Button? _landmarkButton;
        private Button? _mapButton;
        private Button? _netButton;

        // Public accessors for PlaytestSandboxVerify & external inspection
        public string ActiveMapId => _mapDoc?.MapId ?? "";
        public string ActiveAvatarKey => _availableAvatarKeys.Count > 0 ? _availableAvatarKeys[_avatarIndex] : "";
        public string ActiveHairPresetName => CharacterCustomization.HairColorPresets[_hairPresetIndex].Name;
        public Color ActiveHairColor => CharacterCustomization.HairColorPresets[_hairPresetIndex].Color;
        public string ActiveWeaponKey => WeaponOptions[_weaponIndex];
        public bool IsRunGait => _runGaitEnabled;
        public bool IsRelaxedStance => _relaxedStanceEnabled;
        public bool IsWeaponCurrentlyVisible => _weaponSocket?.Equipped != null && _weaponSocket.Equipped.Visible;
        public float CameraDistance => _cameraDistance;
        public Node3D? AvatarNode => _avatarContainer;
        public Node3D? AvatarModelNode => _avatarModel;
        public Skeleton3D? AvatarSkeleton => _skeleton;
        public AnimationController? AvatarAnimation => _animController;
        public WeaponSocket? AvatarWeaponSocket => _weaponSocket;
        public IReadOnlyList<SandboxDummy> Dummies => _dummies;
        public float LastFootMinDeltaMeters { get; private set; }

        public override void _Ready()
        {
            WindowBadge.Apply(sandbox: true);
            _config = Config.Load();
            DiscoverAvailableAvatars();

            string initialMap = OS.GetEnvironment("ATLAS_MAP_ID");
            if (string.IsNullOrWhiteSpace(initialMap))
                initialMap = "maro-bell";

            SetupWorldInfrastructure(initialMap.Trim());
            BuildPlaytestHud();
            SpawnOrReplaceAvatar(_availableAvatarKeys[_avatarIndex]);
            TeleportToLandmark(0);
            RefreshUiLabels("Playtest Sandbox ready — WASD move, Space/Click attack, [1-6] Hair, [E] Sword, [R] Rig.");

            if (OS.GetEnvironment("ATLAS_VERIFY_PLAYTEST_SANDBOX") == "1" && GetParent() == GetTree().Root)
            {
                AddChild(new PlaytestSandboxVerify { Name = "PlaytestSandboxVerify" });
            }
        }

        private void DiscoverAvailableAvatars()
        {
            _availableAvatarKeys.Clear();
            _availableAvatarKeys.Add(PipelineCharVerify.MaroGirlKey);
            if (AssetRegistry.Instance != null)
            {
                foreach (string key in AssetRegistry.Instance.GetPlayableAvatarKeys())
                {
                    if (!_availableAvatarKeys.Contains(key))
                        _availableAvatarKeys.Add(key);
                }
            }
            if (!_availableAvatarKeys.Contains("player"))
                _availableAvatarKeys.Add("player");
        }

        private void SetupWorldInfrastructure(string mapId)
        {
            if (EnvironmentProps == null)
            {
                EnvironmentProps = GetNodeOrNull<Node3D>("EnvironmentProps");
                if (EnvironmentProps == null)
                {
                    EnvironmentProps = new Node3D { Name = "EnvironmentProps" };
                    AddChild(EnvironmentProps);
                }
            }

            if (FloorMesh == null)
                FloorMesh = GetNodeOrNull<MeshInstance3D>("Floor");

            if (MainCamera == null)
                MainCamera = GetNodeOrNull<Camera3D>("Camera3D");
            if (MainCamera != null)
                MainCamera.Near = 0.02f;

            if (Connection == null)
                Connection = GetNodeOrNull<ServerRsConnection>("ServerRsConnection");

            if (_entityManager == null)
            {
                _entityManager = new EntityManager
                {
                    Name = "EntityManager",
                    SuppressOwnPlayerView = true,
                    Visible = false,
                };
                AddChild(_entityManager);
            }

            LoadMap(mapId);
        }

        public void LoadMap(string mapId)
        {
            _mapDoc = UnifiedMapDocument.LoadOrDefault(mapId);
            TerrainElevation.GlobalAmplitude = _mapDoc.TerrainAmplitude;

            if (_entityManager != null)
                _entityManager.MapDocument = _mapDoc;

            if (FloorMesh != null)
            {
                float floorW = Mathf.Max(200f, _mapDoc.Width * 1.35f);
                float floorH = Mathf.Max(200f, _mapDoc.Height * 1.35f);
                Material? mat = FloorMesh.GetSurfaceOverrideMaterial(0);
                FloorMesh.Mesh = TerrainElevation.BuildTerrainMesh(floorW, floorH, _mapDoc);
                if (mat != null)
                    FloorMesh.SetSurfaceOverrideMaterial(0, mat);
            }

            if (_mapChunksRoot != null && GodotObject.IsInstanceValid(_mapChunksRoot))
            {
                _mapChunksRoot.GetParent()?.RemoveChild(_mapChunksRoot);
                _mapChunksRoot.QueueFree();
            }

            _mapChunksRoot = new Node3D { Name = "MapChunks" };
            EnvironmentProps!.AddChild(_mapChunksRoot);

            _chunkStreamer = new MapChunkStreamer(_mapChunksRoot, _mapDoc, _cameraOccluder);
            _dayNightCycle.Initialize(this, _mapDoc);

            SpawnTargetDummies();

            Vector3 focus = _avatarContainer?.Position ?? new Vector3(0f, 0f, -15.5f);
            _chunkStreamer.UpdateStreaming(focus, forceReload: true);
        }

        private void SpawnTargetDummies()
        {
            _dummies.Clear();
            if (_dummiesRoot != null && GodotObject.IsInstanceValid(_dummiesRoot))
            {
                _dummiesRoot.GetParent()?.RemoveChild(_dummiesRoot);
                _dummiesRoot.QueueFree();
            }

            _dummiesRoot = new Node3D { Name = "SandboxDummies" };
            AddChild(_dummiesRoot);

            if (_targetRing == null || !GodotObject.IsInstanceValid(_targetRing))
            {
                _targetRing = new MeshInstance3D
                {
                    Name = "TargetRing",
                    Mesh = new CylinderMesh { TopRadius = 0.65f, BottomRadius = 0.65f, Height = 0.025f, RadialSegments = 28 },
                    MaterialOverride = new StandardMaterial3D
                    {
                        Transparency = BaseMaterial3D.TransparencyEnum.Alpha,
                        ShadingMode = BaseMaterial3D.ShadingModeEnum.Unshaded,
                        AlbedoColor = new Color(1.0f, 0.84f, 0.24f, 0.60f),
                    }
                };
                AddChild(_targetRing);
            }

            // Place 3 interactive combat dummies in front of the Great Bell plaza (or near origin on Freja)
            float baseZ = _mapDoc.MapId == "maro-bell" ? -18.2f : -4.5f;
            var specs = new (string Id, string Name, string AssetKey, Vector3 Offset, float Scale, long Hp)[]
            {
                ("dummy-center", "Bell Plaza Guard Dummy", PipelineCharVerify.Key, new Vector3(0.0f, 0f, baseZ), 1.0f, 5000),
                ("dummy-left", "Feral Brute Dummy", "mob:aggressive", new Vector3(-2.1f, 0f, baseZ - 0.6f), 0.85f, 8000),
                ("dummy-right", "Spear Scout Dummy", "mob:spear_thrower", new Vector3(2.1f, 0f, baseZ - 0.6f), 0.85f, 4000),
            };

            foreach (var sp in specs)
            {
                Node3D? model = null;
                if (AssetRegistry.Instance != null)
                {
                    PackedScene scene = AssetRegistry.Instance.Resolve(sp.AssetKey, out _);
                    model = scene.Instantiate() as Node3D;
                }
                model ??= new Node3D();

                var holder = new Node3D { Name = sp.Id };
                float groundY = TerrainElevation.SampleHeight(sp.Offset.X, sp.Offset.Z, _mapDoc, 0f);
                holder.Position = new Vector3(sp.Offset.X, groundY, sp.Offset.Z);
                holder.Scale = Vector3.One * sp.Scale;
                _dummiesRoot.AddChild(holder);
                holder.AddChild(model);

                EntityView.ApplyAnimeToonShading(model, EntityKind.Mob);
                var overrides = AssetRegistry.Instance?.ResolveAnimOverrides(sp.AssetKey);
                var variants = AssetRegistry.Instance?.ResolveAnimVariants(sp.AssetKey);
                var anim = new AnimationController(model, overrides, variants) { InCombat = true };
                anim.Update(isAlive: true, velocity: Vector3.Zero);

                var nameLabel = new Label3D
                {
                    Text = $"{sp.Name}\n{sp.Hp:N0} / {sp.Hp:N0} HP",
                    PixelSize = 0.0045f,
                    FontSize = 18,
                    OutlineSize = 5,
                    Modulate = new Color(1.0f, 0.92f, 0.55f, 1f),
                    OutlineModulate = new Color(0.05f, 0.06f, 0.10f, 0.95f),
                    Billboard = BaseMaterial3D.BillboardModeEnum.Enabled,
                    Position = new Vector3(0f, 1.38f, 0f),
                };
                holder.AddChild(nameLabel);

                var hpBg = new MeshInstance3D
                {
                    Mesh = new BoxMesh { Size = new Vector3(0.82f, 0.06f, 0.02f) },
                    Position = new Vector3(0f, 1.20f, 0f),
                    MaterialOverride = new StandardMaterial3D
                    {
                        ShadingMode = BaseMaterial3D.ShadingModeEnum.Unshaded,
                        BillboardMode = BaseMaterial3D.BillboardModeEnum.Enabled,
                        BillboardKeepScale = true,
                        AlbedoColor = new Color(0.08f, 0.09f, 0.14f, 0.90f),
                    }
                };
                holder.AddChild(hpBg);

                var hpFill = new MeshInstance3D
                {
                    Mesh = new BoxMesh { Size = new Vector3(0.78f, 0.044f, 0.025f) },
                    Position = new Vector3(0f, 1.20f, 0.008f),
                    MaterialOverride = new StandardMaterial3D
                    {
                        ShadingMode = BaseMaterial3D.ShadingModeEnum.Unshaded,
                        BillboardMode = BaseMaterial3D.BillboardModeEnum.Enabled,
                        BillboardKeepScale = true,
                        AlbedoColor = new Color(0.94f, 0.24f, 0.24f, 1f),
                    }
                };
                holder.AddChild(hpFill);

                _dummies.Add(new SandboxDummy
                {
                    Id = sp.Id,
                    Name = sp.Name,
                    CurrentHp = sp.Hp,
                    MaxHp = sp.Hp,
                    Root = holder,
                    Anim = anim,
                    HpFillBar = hpFill,
                    HpLabel = nameLabel,
                    BasePosition = holder.Position,
                    BaseScale = sp.Scale,
                });
            }

            _selectedDummyIndex = 0;
            UpdateTargetRing();
        }

        public void SpawnOrReplaceAvatar(string avatarKey)
        {
            Vector3 oldPos = _avatarContainer?.Position ?? new Vector3(0f, 0f, -15.5f);
            Vector3 oldRot = _avatarContainer?.Rotation ?? new Vector3(0f, Mathf.Pi, 0f);

            if (_avatarContainer == null)
            {
                _avatarContainer = GetNodeOrNull<Node3D>("PlayerAvatar");
                if (_avatarContainer == null)
                {
                    _avatarContainer = new Node3D { Name = "PlayerAvatar" };
                    AddChild(_avatarContainer);
                }
            }

            foreach (Node child in _avatarContainer.GetChildren())
            {
                if (child.Name == "DropShadow")
                    continue;
                _avatarContainer.RemoveChild(child);
                child.QueueFree();
            }

            Node3D? instanced = null;
            if (AssetRegistry.Instance != null)
            {
                PackedScene packed = AssetRegistry.Instance.Resolve(avatarKey, out _);
                instanced = packed.Instantiate() as Node3D;
            }
            instanced ??= new Node3D { Name = "FallbackAvatar" };
            instanced.Name = "AvatarModel";
            _avatarContainer.AddChild(instanced);
            _avatarModel = instanced;

            // Apply chibi scale factor only for legacy oversized models; pipelineCharacter / 0.94m models stay 1.0x
            float scaleFactor = EntityView.ResolveChibiScaleFactor(
                avatarKey == "player" ? EntityKind.Player : EntityKind.Npc,
                avatarKey);
            _avatarModel.Scale = Vector3.One * scaleFactor;

            EntityView.ApplyAnimeToonShading(_avatarModel, EntityKind.Player);

            var overrides = AssetRegistry.Instance?.ResolveAnimOverrides(avatarKey);
            var variants = AssetRegistry.Instance?.ResolveAnimVariants(avatarKey);
            _animController = new AnimationController(_avatarModel, overrides, variants)
            {
                UseFeminineRelaxedPosture = IsFeminineAvatar(avatarKey),
                InCombat = !_relaxedStanceEnabled,
            };
            _animController.EnableManualTick(true);
            _animPlayer = FindFirst<AnimationPlayer>(_avatarModel);
            _skeleton = FindFirst<Skeleton3D>(_avatarModel);
            _weaponSocket = new WeaponSocket(_avatarModel);

            if (_skeleton != null)
            {
                int lf = FindFootBone(_skeleton, left: true);
                int rf = FindFootBone(_skeleton, left: false);
                if (lf >= 0 && rf >= 0)
                {
                    _restMinFootY = Mathf.Min(
                        _skeleton.GetBoneGlobalRest(lf).Origin.Y,
                        _skeleton.GetBoneGlobalRest(rf).Origin.Y);
                }
            }

            _avatarContainer.Position = oldPos;
            _avatarContainer.Rotation = oldRot;

            ApplyCurrentHairColor();
            ApplyCurrentWeapon();
            SyncStanceAndWeaponVisibility();

            _animController.Update(isAlive: true, velocity: Vector3.Zero, isAttacking: false);
            _animController.Tick(0.0);
            SampleFootGrounding();
        }

        private static bool IsFeminineAvatar(string avatarKey)
        {
            if (string.IsNullOrEmpty(avatarKey))
                return false;
            return avatarKey.Contains("maro_folk_girl", StringComparison.OrdinalIgnoreCase) ||
                   avatarKey.Contains("girl", StringComparison.OrdinalIgnoreCase) ||
                   avatarKey.Contains("female", StringComparison.OrdinalIgnoreCase) ||
                   avatarKey.Contains("linde", StringComparison.OrdinalIgnoreCase) ||
                   avatarKey.Contains("silme", StringComparison.OrdinalIgnoreCase);
        }

        public void SetRelaxedStance(bool relaxed)
        {
            _relaxedStanceEnabled = relaxed;
            _combatWeaponRevealTimer = 0f;
            if (relaxed)
            {
                _attackHoldTimer = 0f;
                _animController?.ClearUpperBodyAttack();
            }
            SyncStanceAndWeaponVisibility();
            _animController?.Update(isAlive: true, velocity: _lastVelocity, isAttacking: false);
            _animController?.Tick(0.20);
            SampleFootGrounding();
            RefreshUiLabels(_relaxedStanceEnabled
                ? "Stance -> Relaxed (Unarmed, Feminine Idle/Walk/Run)"
                : $"Stance -> Armed ({ActiveWeaponKey} Drawn)");
        }

        public void ToggleRelaxedStance() => SetRelaxedStance(!_relaxedStanceEnabled);

        private void SyncStanceAndWeaponVisibility()
        {
            bool showWeapon = (!_relaxedStanceEnabled || _combatWeaponRevealTimer > 0f) && ActiveWeaponKey != "unarmed";
            if (_weaponSocket?.Equipped != null && GodotObject.IsInstanceValid(_weaponSocket.Equipped))
            {
                _weaponSocket.Equipped.Visible = showWeapon;
            }
            if (_animController != null)
            {
                _animController.InCombat = !_relaxedStanceEnabled || _combatWeaponRevealTimer > 0f;
            }
        }

        public void SetCameraDistance(float distance)
        {
            _cameraDistance = Mathf.Clamp(distance, CameraZoom.MinDistance, CameraZoom.MaxDistance);
            _faceZoomActive = _cameraDistance <= 0.85f;
        }

        public void ToggleFaceZoom()
        {
            if (_cameraDistance > 0.90f)
            {
                _faceZoomActive = true;
                _cameraDistance = 0.56f;
                _cameraPitch = 0.06f;
                if (_avatarContainer != null)
                {
                    // Orbit camera in front of the character's face
                    _cameraYaw = _avatarContainer.Rotation.Y;
                }
                RefreshUiLabels("Camera -> Face Close-Up Zoom (0.56 m)");
            }
            else
            {
                _faceZoomActive = false;
                _cameraDistance = 2.60f;
                _cameraPitch = 0.28f;
                RefreshUiLabels("Camera -> Gameplay View (2.60 m)");
            }
        }

        public void SetHairPresetIndex(int index)
        {
            var presets = CharacterCustomization.HairColorPresets;
            _hairPresetIndex = ((index % presets.Count) + presets.Count) % presets.Count;
            ApplyCurrentHairColor();
            RefreshUiLabels($"Hair Color -> {ActiveHairPresetName}");
        }

        public void CycleHairColor() => SetHairPresetIndex(_hairPresetIndex + 1);

        private void ApplyCurrentHairColor()
        {
            if (_avatarModel == null)
                return;
            var preset = CharacterCustomization.HairColorPresets[_hairPresetIndex];
            CharacterCustomization.SetHairColor(_avatarModel, preset.Color);
        }

        public void SetWeaponIndex(int index)
        {
            _weaponIndex = ((index % WeaponOptions.Length) + WeaponOptions.Length) % WeaponOptions.Length;
            if (!IsHeadlessProbe && ActiveWeaponKey != "unarmed")
                _combatWeaponRevealTimer = 2.4f;
            ApplyCurrentWeapon();
            SyncStanceAndWeaponVisibility();
            RefreshUiLabels($"Weapon -> {ActiveWeaponKey}");
        }

        public void CycleWeapon() => SetWeaponIndex(_weaponIndex + 1);

        private void ApplyCurrentWeapon()
        {
            if (_weaponSocket == null || _avatarModel == null)
                return;
            string key = WeaponOptions[_weaponIndex];
            if (key == "unarmed")
            {
                _weaponSocket.Unequip();
            }
            else
            {
                _weaponSocket.EquipByKey(key);
                EntityView.ApplyAnimeToonShading(_avatarModel, EntityKind.Player);
                ApplyCurrentHairColor();
            }
            SyncStanceAndWeaponVisibility();
        }

        public void CycleAvatarRig()
        {
            if (_availableAvatarKeys.Count == 0)
                return;
            _avatarIndex = (_avatarIndex + 1) % _availableAvatarKeys.Count;
            SpawnOrReplaceAvatar(_availableAvatarKeys[_avatarIndex]);
            RefreshUiLabels($"Character Rig -> {ActiveAvatarKey}");
        }

        public void SetGaitRun(bool run)
        {
            _runGaitEnabled = run;
            float spd = _runGaitEnabled ? InteractiveRunSpeedMetersPerSec : InteractiveWalkSpeedMetersPerSec;
            RefreshUiLabels(_runGaitEnabled ? $"Gait -> Run ({spd:F1} m/s)" : $"Gait -> Walk ({spd:F1} m/s)");
        }

        public void ToggleGait() => SetGaitRun(!_runGaitEnabled);

        public void TeleportToLandmark(int index)
        {
            _landmarkIndex = ((index % MaroBellLandmarks.Length) + MaroBellLandmarks.Length) % MaroBellLandmarks.Length;
            var lm = MaroBellLandmarks[_landmarkIndex];
            if (_avatarContainer != null)
            {
                float x = _mapDoc.MapId == "maro-bell" ? lm.X : 0f;
                float z = _mapDoc.MapId == "maro-bell" ? lm.Z : -2.5f;
                float y = TerrainElevation.SampleHeight(x, z, _mapDoc, 0f);
                _avatarContainer.Position = new Vector3(x, y, z);
                _avatarContainer.Rotation = new Vector3(0f, lm.Yaw, 0f);
                _chunkStreamer?.UpdateStreaming(_avatarContainer.Position, forceReload: true);
                SampleFootGrounding();
            }
            RefreshUiLabels($"Teleported -> {lm.Label}");
        }

        public void CycleLandmark() => TeleportToLandmark(_landmarkIndex + 1);

        public void ToggleMap()
        {
            string nextMap = _mapDoc.MapId == "maro-bell" ? "freja-south-gate" : "maro-bell";
            LoadMap(nextMap);
            TeleportToLandmark(0);
            RefreshUiLabels($"Map Switched -> {nextMap}");
        }

        public void ToggleLiveServerConnection()
        {
            if (Connection == null)
                return;

            if (!_liveServerConnected)
            {
                _liveServerConnected = true;
                if (_entityManager != null)
                {
                    _entityManager.Visible = true;
                    _entityManager.SetProcess(true);
                }
                Connection.RawSnapshotReceived -= OnRawSnapshot;
                Connection.RawSnapshotReceived += OnRawSnapshot;
                Connection.ConnectToHost(_config.ServerRsEndpoint);
                RefreshUiLabels($"Connecting to server-rs ({_config.ServerRsEndpoint})...");
            }
            else
            {
                _liveServerConnected = false;
                Connection.RawSnapshotReceived -= OnRawSnapshot;
                Connection.DisconnectFromHost();
                if (_entityManager != null)
                {
                    _entityManager.Reset();
                    _entityManager.Visible = false;
                    _entityManager.SetProcess(false);
                }
                RefreshUiLabels("Switched to Offline Local Sandbox.");
            }
        }

        public override void _ExitTree()
        {
            if (Connection != null)
            {
                Connection.RawSnapshotReceived -= OnRawSnapshot;
                Connection.DisconnectFromHost();
            }
        }

        private void OnRawSnapshot(WorldSnapshot snap)
        {
            _entityManager?.IngestServerRsSnapshot(snap, 1.0f, _mapDoc.ServerCenter);
        }

        /// <summary>
        /// Programmatic movement step for both interactive _PhysicsProcess and headless verification probes.
        /// Moves the character along <paramref name="worldDirection"/> at the current gait speed (or custom override),
        /// resolves terrain/obstacle collisions, updates AnimationController, and samples foot grounding.
        /// </summary>
        public void StepMovement(Vector3 worldDirection, float dt, float? speedOverride = null)
        {
            if (_avatarContainer == null)
                return;

            if (IsHeadlessProbe && _attackHoldTimer > 0f)
                _attackHoldTimer = Mathf.Max(0f, _attackHoldTimer - dt);

            float defaultSpeed = IsHeadlessProbe
                ? (_runGaitEnabled ? RunSpeedMetersPerSec : WalkSpeedMetersPerSec)
                : (_runGaitEnabled ? InteractiveRunSpeedMetersPerSec : InteractiveWalkSpeedMetersPerSec);
            float targetSpeed = speedOverride ?? defaultSpeed;
            bool moving = worldDirection.LengthSquared() > 0.0001f;

            if (moving)
            {
                Vector3 norm = worldDirection.Normalized();
                _currentSpeedMetersPerSec = targetSpeed;
                _lastVelocity = norm * targetSpeed;

                float curX = _avatarContainer.Position.X;
                float curY = _avatarContainer.Position.Y;
                float curZ = _avatarContainer.Position.Z;
                float nextX = curX + norm.X * targetSpeed * dt;
                float nextZ = curZ + norm.Z * targetSpeed * dt;

                Vector2 resolved = TerrainElevation.ResolveSteepSlopeMove(
                    curX, curZ, nextX, nextZ, _mapDoc, out _, out _, curY);
                float groundY = TerrainElevation.SampleHeight(resolved.X, resolved.Y, _mapDoc, curY);
                _avatarContainer.Position = new Vector3(resolved.X, groundY, resolved.Y);

                float targetAngle = Mathf.Atan2(norm.X, norm.Z);
                float smoothAngle = Mathf.LerpAngle(_avatarContainer.Rotation.Y, targetAngle, Mathf.Clamp(dt * 14f, 0f, 1f));
                _avatarContainer.Rotation = new Vector3(0f, smoothAngle, 0f);

                _chunkStreamer?.UpdateStreaming(_avatarContainer.Position);
                if (_animPlayer != null && !IsHeadlessProbe)
                {
                    _animPlayer.SpeedScale = targetSpeed >= InteractiveSprintSpeedMetersPerSec - 0.2f
                        ? 1.32f
                        : (targetSpeed >= 2.4f ? 1.15f : 1.0f);
                }
                _animController?.Update(isAlive: true, velocity: _lastVelocity, isAttacking: false);
                _animController?.Tick(dt);

                if (_liveServerConnected)
                    Connection?.SendInput(norm.X, norm.Z);
            }
            else
            {
                _currentSpeedMetersPerSec = 0f;
                _lastVelocity = Vector3.Zero;
                float groundY = TerrainElevation.SampleHeight(
                    _avatarContainer.Position.X, _avatarContainer.Position.Z, _mapDoc, _avatarContainer.Position.Y);
                _avatarContainer.Position = new Vector3(_avatarContainer.Position.X, groundY, _avatarContainer.Position.Z);

                if (_attackHoldTimer <= 0f)
                {
                    if (_animPlayer != null && !IsHeadlessProbe)
                        _animPlayer.SpeedScale = 1.0f;
                    _animController?.Update(isAlive: true, velocity: Vector3.Zero, isAttacking: false);
                }
                _animController?.Tick(dt);
            }

            SampleFootGrounding();
            RefreshUiLabels();
        }

        public void TriggerSandboxAttack()
        {
            if (_avatarContainer == null || _animController == null)
                return;

            _comboCounter = (_comboCounter % 3) + 1;
            _attackHoldTimer = 0.50f;
            _combatWeaponRevealTimer = 1.85f;
            SyncStanceAndWeaponVisibility();

            // Face nearest dummy within melee range if standing still
            SandboxDummy? hitDummy = FindNearestDummyInRange(MeleeRangeMeters);
            if (hitDummy != null && _currentSpeedMetersPerSec < 0.05f)
            {
                Vector3 toDummy = hitDummy.Root.Position - _avatarContainer.Position;
                toDummy.Y = 0f;
                if (toDummy.LengthSquared() > 0.001f)
                    _avatarContainer.Rotation = new Vector3(0f, Mathf.Atan2(toDummy.X, toDummy.Z), 0f);
            }

            if (_animController.IsCombatMapped)
            {
                _animController.InCombat = true;
                _animController.Attack();
                _animController.Update(isAlive: true, velocity: _lastVelocity, isAttacking: true);
            }
            else
            {
                _animController.Update(isAlive: true, velocity: Vector3.Zero, isAttacking: true);
            }

            AudioRegistry.Instance?.Play("sfx:attack", _avatarContainer.GlobalPosition);

            if (hitDummy != null)
            {
                ApplyHitToDummy(hitDummy);
            }
            else
            {
                RefreshUiLabels($"Attack Combo #{_comboCounter} ({(_animController.IsUpperBodyAttackActive ? "Upper-Body Blend" : _animController.CurrentClip)})");
            }

            SampleFootGrounding();
        }

        private SandboxDummy? FindNearestDummyInRange(float maxRange)
        {
            if (_avatarContainer == null || _dummies.Count == 0)
                return null;
            SandboxDummy? best = null;
            float bestDistSq = maxRange * maxRange;
            foreach (SandboxDummy d in _dummies)
            {
                if (!GodotObject.IsInstanceValid(d.Root))
                    continue;
                float dSq = d.Root.Position.DistanceSquaredTo(_avatarContainer.Position);
                if (dSq <= bestDistSq)
                {
                    bestDistSq = dSq;
                    best = d;
                }
            }
            return best;
        }

        private void ApplyHitToDummy(SandboxDummy dummy)
        {
            long baseDmg = 340 + (_comboCounter * 115);
            bool isCrit = _comboCounter == 3;
            long dmg = isCrit ? (long)(baseDmg * 1.6f) : baseDmg;

            dummy.CurrentHp = Math.Max(0, dummy.CurrentHp - dmg);
            if (dummy.CurrentHp == 0)
            {
                dummy.CurrentHp = dummy.MaxHp; // Auto-reset dummy HP after KO so playtesting is continuous
            }

            if (dummy.HpLabel != null)
                dummy.HpLabel.Text = $"{dummy.Name}\n{dummy.CurrentHp:N0} / {dummy.MaxHp:N0} HP";

            if (dummy.HpFillBar != null)
            {
                float frac = Mathf.Clamp((float)dummy.CurrentHp / dummy.MaxHp, 0.02f, 1.0f);
                dummy.HpFillBar.Scale = new Vector3(frac, 1f, 1f);
            }

            if (dummy.Anim != null && dummy.Anim.IsCombatMapped)
            {
                dummy.Anim.Hit();
                dummy.Anim.Update(isAlive: true, velocity: Vector3.Zero);
            }

            if (GodotObject.IsInstanceValid(dummy.Root) && IsInsideTree())
            {
                var tween = CreateTween();
                tween.TweenProperty(dummy.Root, "scale", Vector3.One * (dummy.BaseScale * 1.14f), 0.06);
                tween.TweenProperty(dummy.Root, "scale", Vector3.One * dummy.BaseScale, 0.11);
            }

            AudioRegistry.Instance?.Play("sfx:hit", dummy.Root.GlobalPosition);

            if (CombatText != null && MainCamera != null && !MainCamera.IsPositionBehind(dummy.Root.GlobalPosition))
            {
                Vector2 screenPos = MainCamera.UnprojectPosition(dummy.Root.GlobalPosition + new Vector3(0f, 1.35f, 0f));
                CombatText.SpawnDamage(screenPos, dmg, isCrit);
            }

            _selectedDummyIndex = _dummies.IndexOf(dummy);
            UpdateTargetRing();
            RefreshUiLabels($"Hit {dummy.Name} for {dmg:N0} dmg! (Combo #{_comboCounter}, HP {dummy.CurrentHp:N0}/{dummy.MaxHp:N0})");
        }

        private void UpdateTargetRing()
        {
            if (_targetRing == null || _dummies.Count == 0)
                return;
            var d = _dummies[Math.Clamp(_selectedDummyIndex, 0, _dummies.Count - 1)];
            if (GodotObject.IsInstanceValid(d.Root))
            {
                _targetRing.Position = d.Root.Position + new Vector3(0f, 0.03f, 0f);
            }
        }

        public float SampleFootGrounding()
        {
            if (_skeleton == null)
            {
                LastFootMinDeltaMeters = 0f;
                return 0f;
            }
            int lf = FindFootBone(_skeleton, left: true);
            int rf = FindFootBone(_skeleton, left: false);
            if (lf < 0 || rf < 0)
            {
                LastFootMinDeltaMeters = 0f;
                return 0f;
            }

            float ly = (_skeleton.GlobalTransform * _skeleton.GetBoneGlobalPose(lf)).Origin.Y;
            float ry = (_skeleton.GlobalTransform * _skeleton.GetBoneGlobalPose(rf)).Origin.Y;
            float restLy = (_skeleton.GlobalTransform * _skeleton.GetBoneGlobalRest(lf)).Origin.Y;
            float restRy = (_skeleton.GlobalTransform * _skeleton.GetBoneGlobalRest(rf)).Origin.Y;
            LastFootMinDeltaMeters = Mathf.Min(ly, ry) - Mathf.Min(restLy, restRy);
            return LastFootMinDeltaMeters;
        }

        private static int FindFootBone(Skeleton3D skel, bool left)
        {
            string[] names = left
                ? new[] { "LeftFoot", "mixamorig_LeftFoot", "foot.l" }
                : new[] { "RightFoot", "mixamorig_RightFoot", "foot.r" };
            foreach (string n in names)
            {
                int idx = skel.FindBone(n);
                if (idx >= 0)
                    return idx;
            }
            return -1;
        }

        public override void _PhysicsProcess(double delta)
        {
            if (IsHeadlessProbe)
                return;

            float dt = (float)delta;
            _pulseTime += dt;
            _dayNightCycle.Update(dt, _mapDoc);

            if (_attackHoldTimer > 0f)
                _attackHoldTimer -= dt;

            if (_combatWeaponRevealTimer > 0f)
            {
                _combatWeaponRevealTimer -= dt;
                if (_combatWeaponRevealTimer <= 0f)
                {
                    _combatWeaponRevealTimer = 0f;
                    SyncStanceAndWeaponVisibility();
                }
            }

            if (_targetRing != null)
            {
                float s = 1.0f + 0.06f * Mathf.Sin(_pulseTime * 5.0f);
                _targetRing.Scale = new Vector3(s, 1f, s);
            }

            float vx = 0f, vz = 0f;
            if (Godot.Input.IsKeyPressed(Key.A) || Godot.Input.IsKeyPressed(Key.Left)) vx -= 1f;
            if (Godot.Input.IsKeyPressed(Key.D) || Godot.Input.IsKeyPressed(Key.Right)) vx += 1f;
            if (Godot.Input.IsKeyPressed(Key.W) || Godot.Input.IsKeyPressed(Key.Up)) vz -= 1f;
            if (Godot.Input.IsKeyPressed(Key.S) || Godot.Input.IsKeyPressed(Key.Down)) vz += 1f;

            Vector2 rawInput = new(vx, vz);
            if (rawInput.LengthSquared() > 0.001f)
                rawInput = rawInput.Normalized().Rotated(-_cameraYaw);

            // Shift in Run mode boosts to Sprint (8.8 m/s); Shift in Walk mode runs (5.8 m/s)
            bool shiftHeld = Godot.Input.IsKeyPressed(Key.Shift);
            float speed = _runGaitEnabled
                ? (shiftHeld ? InteractiveSprintSpeedMetersPerSec : InteractiveRunSpeedMetersPerSec)
                : (shiftHeld ? InteractiveRunSpeedMetersPerSec : InteractiveWalkSpeedMetersPerSec);

            StepMovement(new Vector3(rawInput.X, 0f, rawInput.Y), dt, speed);

            if (MainCamera != null && _avatarContainer != null)
            {
                // As camera zooms closer (< 2.0m down to 0.35m), smoothly elevate focus from body (0.52m) to face/eyes (0.65m)
                float closeT = Mathf.Clamp(1.0f - ((_cameraDistance - 0.45f) / 1.55f), 0f, 1f);
                float focusHeight = Mathf.Lerp(0.52f, 0.65f, closeT);
                Vector3 focus = _avatarContainer.Position + new Vector3(0f, focusHeight, 0f);
                float hDist = _cameraDistance * Mathf.Cos(_cameraPitch);
                float vDist = _cameraDistance * Mathf.Sin(_cameraPitch);
                Vector3 offset = new(Mathf.Sin(_cameraYaw) * hDist, vDist, Mathf.Cos(_cameraYaw) * hDist);
                Vector3 desired = focus + offset;
                float camFloor = TerrainElevation.SampleBaseTerrainHeight(desired.X, desired.Z, _mapDoc);
                desired.Y = Mathf.Max(desired.Y, camFloor + 0.12f);
                MainCamera.Position = MainCamera.Position.Lerp(desired, Mathf.Clamp(dt * 12f, 0f, 1f));
                MainCamera.LookAt(focus, Vector3.Up);
                _cameraOccluder.Update(dt, MainCamera.GlobalPosition, focus, null);
            }

            UpdateTelemetryDisplay();
        }

        public override void _UnhandledInput(InputEvent @event)
        {
            if (@event is InputEventMouseMotion mm &&
                (mm.ButtonMask & (MouseButtonMask.Right | MouseButtonMask.Left)) != 0)
            {
                _cameraYaw -= mm.Relative.X * 0.006f;
                _cameraPitch = Mathf.Clamp(_cameraPitch + mm.Relative.Y * 0.004f, -0.25f, 1.25f);
                return;
            }

            if (@event is InputEventMouseButton mb && mb.Pressed)
            {
                if (mb.ButtonIndex == MouseButton.WheelUp)
                {
                    SetCameraDistance(CameraZoom.Zoomed(_cameraDistance, -1));
                    return;
                }
                if (mb.ButtonIndex == MouseButton.WheelDown)
                {
                    SetCameraDistance(CameraZoom.Zoomed(_cameraDistance, +1));
                    return;
                }
            }

            if (@event is InputEventKey key && key.Pressed && !key.Echo)
            {
                switch (key.Keycode)
                {
                    case Key.Space:
                    case Key.F:
                        TriggerSandboxAttack();
                        GetViewport()?.SetInputAsHandled();
                        break;
                    case Key.C:
                        ToggleRelaxedStance();
                        GetViewport()?.SetInputAsHandled();
                        break;
                    case Key.Z:
                        ToggleFaceZoom();
                        GetViewport()?.SetInputAsHandled();
                        break;
                    case Key.Equal:
                    case Key.Plus:
                        SetCameraDistance(CameraZoom.Zoomed(_cameraDistance, -1));
                        GetViewport()?.SetInputAsHandled();
                        break;
                    case Key.Minus:
                        SetCameraDistance(CameraZoom.Zoomed(_cameraDistance, +1));
                        GetViewport()?.SetInputAsHandled();
                        break;
                    case Key.G:
                        ToggleGait();
                        GetViewport()?.SetInputAsHandled();
                        break;
                    case Key.H:
                        CycleHairColor();
                        GetViewport()?.SetInputAsHandled();
                        break;
                    case Key.Key1:
                    case Key.Key2:
                    case Key.Key3:
                    case Key.Key4:
                    case Key.Key5:
                    case Key.Key6:
                        SetHairPresetIndex((int)key.Keycode - (int)Key.Key1);
                        GetViewport()?.SetInputAsHandled();
                        break;
                    case Key.E:
                        CycleWeapon();
                        GetViewport()?.SetInputAsHandled();
                        break;
                    case Key.Q:
                        SetWeaponIndex(_weaponIndex - 1);
                        GetViewport()?.SetInputAsHandled();
                        break;
                    case Key.R:
                        CycleAvatarRig();
                        GetViewport()?.SetInputAsHandled();
                        break;
                    case Key.T:
                        CycleLandmark();
                        GetViewport()?.SetInputAsHandled();
                        break;
                    case Key.M:
                        ToggleMap();
                        GetViewport()?.SetInputAsHandled();
                        break;
                    case Key.N:
                        ToggleLiveServerConnection();
                        GetViewport()?.SetInputAsHandled();
                        break;
                    case Key.Tab:
                        if (_dummies.Count > 0)
                        {
                            _selectedDummyIndex = (_selectedDummyIndex + 1) % _dummies.Count;
                            UpdateTargetRing();
                            RefreshUiLabels($"Selected Target -> {_dummies[_selectedDummyIndex].Name}");
                        }
                        GetViewport()?.SetInputAsHandled();
                        break;
                }
            }
        }

        private void BuildPlaytestHud()
        {
            var uiLayer = GetNodeOrNull<CanvasLayer>("UI");
            if (uiLayer == null)
            {
                uiLayer = new CanvasLayer { Name = "UI" };
                AddChild(uiLayer);
            }

            var theme = ThemeBuilder.Build();

            // Top-left Telemetry & Foot-Grounding Inspector Card
            var topCard = new PanelContainer
            {
                Name = "PlaytestTelemetryCard",
                Position = new Vector2(16f, 14f),
                CustomMinimumSize = new Vector2(460f, 128f),
                Theme = theme,
            };
            var cardStyle = new StyleBoxFlat
            {
                BgColor = new Color(0.06f, 0.09f, 0.14f, 0.88f),
                BorderColor = new Color(0.92f, 0.78f, 0.38f, 0.90f),
                BorderWidthLeft = 3,
                BorderWidthTop = 1,
                BorderWidthRight = 1,
                BorderWidthBottom = 1,
                CornerRadiusTopLeft = 8,
                CornerRadiusTopRight = 8,
                CornerRadiusBottomLeft = 8,
                CornerRadiusBottomRight = 8,
                ContentMarginLeft = 12,
                ContentMarginRight = 12,
                ContentMarginTop = 8,
                ContentMarginBottom = 8,
            };
            topCard.AddThemeStyleboxOverride("panel", cardStyle);
            uiLayer.AddChild(topCard);

            var topVBox = new VBoxContainer();
            topVBox.AddThemeConstantOverride("separation", 4);
            topCard.AddChild(topVBox);

            var title = new Label
            {
                Text = "ATLAS PLAYTEST SANDBOX — SHARED WORLD ENGINE",
                Modulate = new Color(1.0f, 0.88f, 0.42f, 1f),
            };
            title.AddThemeFontSizeOverride("font_size", 13);
            topVBox.AddChild(title);

            _telemetryLabel = new Label
            {
                Name = "TelemetryLabel",
                Text = "Initializing...",
                Modulate = new Color(0.92f, 0.96f, 1.0f, 0.98f),
            };
            _telemetryLabel.AddThemeFontSizeOverride("font_size", 12);
            topVBox.AddChild(_telemetryLabel);

            _actionBannerLabel = new Label
            {
                Name = "ActionBannerLabel",
                Text = "",
                Modulate = new Color(0.48f, 0.96f, 0.68f, 1f),
            };
            _actionBannerLabel.AddThemeFontSizeOverride("font_size", 11);
            topVBox.AddChild(_actionBannerLabel);

            // Bottom Interactive Control Dock (clickable buttons + hotkey hints)
            var bottomDock = new PanelContainer
            {
                Name = "PlaytestBottomDock",
                AnchorLeft = 0.5f,
                AnchorRight = 0.5f,
                AnchorTop = 1.0f,
                AnchorBottom = 1.0f,
                OffsetLeft = -660f,
                OffsetRight = 660f,
                OffsetTop = -84f,
                OffsetBottom = -14f,
                GrowHorizontal = Control.GrowDirection.Both,
                Theme = theme,
            };
            bottomDock.AddThemeStyleboxOverride("panel", cardStyle);
            uiLayer.AddChild(bottomDock);

            var dockVBox = new VBoxContainer();
            dockVBox.AddThemeConstantOverride("separation", 4);
            bottomDock.AddChild(dockVBox);

            var btnRow = new HBoxContainer
            {
                Alignment = BoxContainer.AlignmentMode.Center,
            };
            btnRow.AddThemeConstantOverride("separation", 6);
            dockVBox.AddChild(btnRow);

            var attackBtn = MakeButton("⚔ Attack [Space]", TriggerSandboxAttack);
            btnRow.AddChild(attackBtn);

            _stanceButton = MakeButton("🌿 Stance: Relax [C]", ToggleRelaxedStance);
            btnRow.AddChild(_stanceButton);

            _gaitButton = MakeButton("🏃 Gait: Run 5.8m/s [G]", ToggleGait);
            btnRow.AddChild(_gaitButton);

            _zoomButton = MakeButton("📷 Face Zoom [Z]", ToggleFaceZoom);
            btnRow.AddChild(_zoomButton);

            _hairButton = MakeButton("🎨 Hair [H / 1-6]", CycleHairColor);
            btnRow.AddChild(_hairButton);

            _weaponButton = MakeButton("🗡 Sword [Q/E]", CycleWeapon);
            btnRow.AddChild(_weaponButton);

            _rigButton = MakeButton("🧑 Rig [R]", CycleAvatarRig);
            btnRow.AddChild(_rigButton);

            _landmarkButton = MakeButton("📍 Teleport [T]", CycleLandmark);
            btnRow.AddChild(_landmarkButton);

            _mapButton = MakeButton("🗺 Map [M]", ToggleMap);
            btnRow.AddChild(_mapButton);

            _netButton = MakeButton("🌐 Offline [N]", ToggleLiveServerConnection);
            btnRow.AddChild(_netButton);

            var helpRow = new Label
            {
                HorizontalAlignment = HorizontalAlignment.Center,
                Text = "Controls: [WASD] Move  |  [Shift] Sprint 8.8m/s  |  [C] Relax/Armed Stance  |  [Z / Scroll / +-] Face Zoom (0.35m..30m)  |  [Drag] Orbit  |  [Space] Attack",
                Modulate = new Color(0.76f, 0.84f, 0.94f, 0.90f),
            };
            helpRow.AddThemeFontSizeOverride("font_size", 11);
            dockVBox.AddChild(helpRow);
        }

        private static Button MakeButton(string text, Action onClick)
        {
            var btn = new Button
            {
                Text = text,
                FocusMode = Control.FocusModeEnum.None,
                CustomMinimumSize = new Vector2(84f, 30f),
            };
            btn.AddThemeFontSizeOverride("font_size", 11);
            btn.Pressed += onClick;
            return btn;
        }

        private void RefreshUiLabels(string? bannerMsg = null)
        {
            if (!string.IsNullOrEmpty(bannerMsg) && _actionBannerLabel != null)
                _actionBannerLabel.Text = $"▸ {bannerMsg}";

            if (_stanceButton != null)
                _stanceButton.Text = _relaxedStanceEnabled ? "🌿 Relax [C]" : "⚔ Armed [C]";
            if (_gaitButton != null)
                _gaitButton.Text = _runGaitEnabled
                    ? $"🏃 Run {InteractiveRunSpeedMetersPerSec:F1}m/s [G]"
                    : $"🚶 Walk {InteractiveWalkSpeedMetersPerSec:F1}m/s [G]";
            if (_zoomButton != null)
                _zoomButton.Text = _faceZoomActive ? "📷 Body [Z]" : "📷 Face [Z]";
            if (_hairButton != null)
                _hairButton.Text = $"🎨 {ActiveHairPresetName.Split(' ')[0]} [H]";
            if (_weaponButton != null)
                _weaponButton.Text = $"🗡 {ActiveWeaponKey} [E]";
            if (_rigButton != null)
                _rigButton.Text = $"🧑 {ShortKey(ActiveAvatarKey)} [R]";
            if (_landmarkButton != null)
                _landmarkButton.Text = $"📍 {MaroBellLandmarks[_landmarkIndex].Label.Split(' ')[0]} [T]";
            if (_mapButton != null)
                _mapButton.Text = $"🗺 {ActiveMapId} [M]";
            if (_netButton != null)
                _netButton.Text = _liveServerConnected ? "🌐 Live [N]" : "🌐 Local [N]";

            UpdateTelemetryDisplay();
        }

        private void UpdateTelemetryDisplay()
        {
            if (_telemetryLabel == null)
                return;

            Vector3 pos = _avatarContainer?.Position ?? Vector3.Zero;
            string baseState = _animController?.CurrentState ?? "idle";
            string baseClip = _animController?.CurrentClip ?? "idle";
            string stanceLabel = (_relaxedStanceEnabled && _combatWeaponRevealTimer <= 0f)
                ? "Relaxed (Unarmed)"
                : $"Armed ({ActiveWeaponKey})";
            string upperLayer = (_animController != null && _animController.IsUpperBodyAttackActive)
                ? $"ACTIVE ({_animController.UpperBodyAttackClip} {_animController.UpperBodyAttackTime:F2}/{_animController.UpperBodyAttackLength:F2}s)"
                : "off";
            float footMm = LastFootMinDeltaMeters * 1000f;
            string groundStatus = footMm >= -25.0f ? "GROUNDED" : "SINKING";

            _telemetryLabel.Text =
                $"Map: {ActiveMapId}  |  Pos: ({pos.X:F1}, {pos.Y:F2}, {pos.Z:F1}) m  |  Speed: {_currentSpeedMetersPerSec:F2} m/s  |  Zoom: {_cameraDistance:F2} m\n" +
                $"Rig: {ActiveAvatarKey}  |  Stance: {stanceLabel}  |  Hair: {ActiveHairPresetName}\n" +
                $"Locomotion: {baseState} ({baseClip})  |  Upper-Body Attack: {upperLayer}\n" +
                $"Foot Grounding: {footMm:+0.0;-0.0;0.0} mm vs rest ankle ({groundStatus})";
        }

        private static string ShortKey(string key)
        {
            int colon = key.IndexOf(':');
            return colon >= 0 && colon + 1 < key.Length ? key[(colon + 1)..] : key;
        }

        private static T? FindFirst<T>(Node? node) where T : Node
        {
            if (node == null)
                return null;
            if (node is T hit)
                return hit;
            foreach (Node child in node.GetChildren())
            {
                T? found = FindFirst<T>(child);
                if (found != null)
                    return found;
            }
            return null;
        }
    }
}

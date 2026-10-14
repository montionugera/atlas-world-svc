using System;
using System.Collections.Generic;
using Godot;
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
    /// 1. Config.Load() & ServerRsConnection (WebSocket + FlatBuffers)
    /// 2. AnimationController + AssetRegistry loop overrides + AudioRegistry 3D SFX
    /// 3. Joymify Design System + MetaShell (Character, Inventory, Skills, Quests, Loadout)
    /// 4. Split-screen WardrobeModal with real 3D Weapon GLB attachment
    /// 5. 3D World Monsters (MVP Boss Drake & Elite Bramble Stalker) with 3D overhead nameplates, HP bars & target ring
    /// 6. Responsive iPad mini safe-area adaptation, touch camera orbit/zoom, and desktop keyboard navigation
    /// </summary>
    public partial class VerticalSliceRoot : Node3D
    {
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
        private AnimationController? _playerAnimController;
        private AnimationPlayer? _animPlayer;
        private MetaShell? _metaShell;

        private Vector2 _touchMoveIntent = Vector2.Zero;
        private float _playerSpeed = 6.5f;
        private float _dashDuration = 0f;
        private float _attackAnimHoldSec = 0f;

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
        private int _selectedMobIndex = 0;
        private MeshInstance3D? _targetRingMesh;
        private float _pulseTime = 0f;

        public override void _Ready()
        {
            GD.Print("[VerticalSliceRoot] Initializing Unified Godot 4 Mobile MMORPG Slice...");

            _config = Config.Load();

            // 1. Initialize Player Avatar & AnimationController from internal library
            if (PlayerAvatar != null)
            {
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

                // Also ensure Wardrobe PreviewAvatar loops its Idle animation
                if (EquipmentWardrobeModal?.PreviewAvatar != null)
                {
                    var previewAnim = EquipmentWardrobeModal.PreviewAvatar.FindChild("AnimationPlayer", true, false) as AnimationPlayer;
                    if (previewAnim != null && previewAnim.HasAnimation("Idle"))
                    {
                        SetClipLoop(previewAnim, "Idle", Animation.LoopModeEnum.Linear);
                        previewAnim.Play("Idle");
                    }
                }
            }

            // 2. Spawn 3D World Monsters with Overhead Nameplates, HP Bars & Target Ring
            SpawnWorldMonsters();

            // 3. Apply Joymify Design System Theme to all UI controls & instantiate MetaShell
            var joymifyTheme = ThemeBuilder.Build();
            var uiNode = GetNodeOrNull("UI");
            if (uiNode != null)
            {
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

            // Apply iOS Safe Area insets so notch / home-indicator never clip HUD controls
            ApplyMobileSafeArea();
            GetViewport().SizeChanged += ApplyMobileSafeArea;

            // 4. Connect to server-rs via Config endpoint
            if (Connection != null)
            {
                Connection.Connected += OnServerConnected;
                Connection.Disconnected += OnServerDisconnected;
                Connection.SnapshotReceived += OnSnapshotReceived;

                UpdateStatusText($"[color=#{Design.Palette.Info.ToHtml(false)}]● Server: Connecting...[/color]");
                Connection.ConnectToHost(_config.ServerRsEndpoint);
            }

            if (ChatWidget != null)
            {
                ChatWidget.MessageSent += OnChatMessageSent;
                ChatWidget.AppendSystemMessage("Atlas World Mobile MMORPG Ready. WASD/Joystick to move, Drag right screen to orbit camera.");
            }

            // 5. Wire Mobile Controls Overlay + Cooldown visuals
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
                    }
                };
            }

            // 6. Wire TopBar to MetaShell & WardrobeModal
            if (NavigationTopBar != null)
            {
                NavigationTopBar.BagPressed += () => _metaShell?.OpenTab("Inventory");
                NavigationTopBar.WardrobePressed += () => EquipmentWardrobeModal?.Open();
                NavigationTopBar.QuestPressed += () => _metaShell?.OpenTab("Quests");
                NavigationTopBar.SkillsPressed += () => _metaShell?.OpenTab("Skills");
                NavigationTopBar.ShopPressed += () => _metaShell?.OpenTab("Loadout");
            }

            // 7. Wire Wardrobe 3D Weapon Attachment to Live PlayerAvatar
            if (EquipmentWardrobeModal != null)
            {
                EquipmentWardrobeModal.ItemEquipped += (slot, itemId) =>
                {
                    ChatWidget?.AppendPlayerMessage("Wardrobe", $"Equipped {slot}: {itemId}!");
                    if (PlayerAvatar != null)
                    {
                        WardrobeModal.AttachEquipmentToAvatar(PlayerAvatar, itemId);
                        AudioRegistry.Instance?.Play("sfx:attack", PlayerAvatar.GlobalPosition);
                        var tween = CreateTween();
                        tween.TweenProperty(PlayerAvatar, "scale", new Vector3(1.18f, 0.88f, 1.18f), 0.1);
                        tween.TweenProperty(PlayerAvatar, "scale", Vector3.One, 0.15);
                    }
                };
            }

            // Optional screenshot capture on desktop when ATLAS_CAPTURE_SCREENSHOT=1 (never stalls iOS GPU)
            if (!OS.HasFeature("mobile") && OS.GetEnvironment("ATLAS_CAPTURE_SCREENSHOT") == "1")
            {
                GetTree().CreateTimer(1.2).Timeout += () =>
                {
                    var img = GetViewport()?.GetTexture()?.GetImage();
                    if (img != null)
                    {
                        img.SavePng("/tmp/atlas_actual_render.png");
                        GD.Print("[VerticalSliceRoot] Auto-screenshot captured to /tmp/atlas_actual_render.png");
                    }
                };
            }
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

            float leftInset = Mathf.Max(14f, safeArea.Position.X * 0.5f);
            float rightInset = Mathf.Max(14f, (windowSize.X - (safeArea.Position.X + safeArea.Size.X)) * 0.5f);

            if (PlayerStatusFrame != null)
            {
                PlayerStatusFrame.OffsetLeft = leftInset;
                PlayerStatusFrame.OffsetRight = leftInset + 320f;
            }

            if (MobileControls?.Joystick != null)
            {
                MobileControls.Joystick.OffsetLeft = leftInset + 26f;
                MobileControls.Joystick.OffsetRight = leftInset + 200f;
            }

            var actionCluster = MobileControls?.GetNodeOrNull<Control>("ActionCluster");
            if (actionCluster != null)
            {
                actionCluster.OffsetRight = -rightInset;
                actionCluster.OffsetLeft = -rightInset - 325f;
            }
        }

        private void SpawnWorldMonsters()
        {
            var mobsContainer = new Node3D { Name = "WorldMonsters" };
            AddChild(mobsContainer);

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
                mobsContainer,
                assetKey: "mob:aggressive",
                fallbackPath: "res://assets/characters/orc_brute.glb",
                name: "Lv.60 Drake",
                badge: "MVP Boss",
                element: "Undead / Water",
                hp: 1280000,
                maxHp: 1500000,
                segments: 4,
                pos: new Vector3(0f, 0f, -4.8f),
                scale: 1.35f,
                nameColor: new Color(1.0f, 0.86f, 0.32f, 1f)
            );

            // 2. Elite Mob: Lv.58 Bramble Stalker (using mob_spear_thrower.glb)
            SpawnSingleMonster(
                mobsContainer,
                assetKey: "mob:spear_thrower",
                fallbackPath: "res://assets/characters/mob_spear_thrower.glb",
                name: "Lv.58 Bramble Stalker",
                badge: "Elite Mob",
                element: "Earth / Insect",
                hp: 420000,
                maxHp: 420000,
                segments: 2,
                pos: new Vector3(3.8f, 0f, -3.6f),
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
                var packed = AssetRegistry.Instance.Resolve(assetKey, out _);
                mobRoot = packed?.Instantiate() as Node3D;
            }
            if (mobRoot == null && ResourceLoader.Exists(fallbackPath))
            {
                mobRoot = GD.Load<PackedScene>(fallbackPath)?.Instantiate() as Node3D;
            }
            if (mobRoot == null)
            {
                mobRoot = new Node3D();
            }

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
                PixelSize = 0.0085f,
                FontSize = 26,
                OutlineSize = 8,
                Modulate = nameColor,
                OutlineModulate = new Color(0.05f, 0.05f, 0.08f, 0.95f),
                Billboard = BaseMaterial3D.BillboardModeEnum.Enabled,
                Position = new Vector3(0f, 2.35f, 0f)
            };
            mobRoot.AddChild(nameLabel);

            // Overhead 3D HP Bar background & crimson fill
            var hpBgMesh = new MeshInstance3D
            {
                Mesh = new BoxMesh { Size = new Vector3(1.35f, 0.11f, 0.04f) },
                Position = new Vector3(0f, 2.05f, 0f),
                MaterialOverride = new StandardMaterial3D
                {
                    ShadingMode = BaseMaterial3D.ShadingModeEnum.Unshaded,
                    BillboardMode = BaseMaterial3D.BillboardModeEnum.Enabled,
                    AlbedoColor = new Color(0.08f, 0.08f, 0.12f, 0.9f)
                }
            };
            mobRoot.AddChild(hpBgMesh);

            var hpFillMesh = new MeshInstance3D
            {
                Mesh = new BoxMesh { Size = new Vector3(1.30f, 0.08f, 0.05f) },
                Position = new Vector3(0f, 2.05f, 0.01f),
                MaterialOverride = new StandardMaterial3D
                {
                    ShadingMode = BaseMaterial3D.ShadingModeEnum.Unshaded,
                    BillboardMode = BaseMaterial3D.BillboardModeEnum.Enabled,
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

        private void UpdateTargetRingPosition()
        {
            if (_targetRingMesh == null || _worldMobs.Count == 0) return;
            var target = _worldMobs[_selectedMobIndex];
            if (GodotObject.IsInstanceValid(target.Root))
            {
                _targetRingMesh.Position = new Vector3(target.Root.Position.X, 0.04f, target.Root.Position.Z);
            }
        }

        public override void _UnhandledInput(InputEvent @event)
        {
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
                    case Key.F2:
                        MobileControls?.PotionSpBtn?.TriggerCooldown(1.5f);
                        TriggerPotion("sp");
                        GetViewport()?.SetInputAsHandled();
                        break;
                    case Key.Tab:
                        MobileControls?.TargetBtn?.TriggerCooldown(0.3f);
                        TriggerTargetSwitch();
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
            UpdateStatusText($"[color=#{Design.Palette.Success.ToHtml(false)}]● Server Connected (2567)[/color]");
            ChatWidget?.AppendSystemMessage("Connected to server-rs WebSocket gateway.");
        }

        private void OnServerDisconnected(int code, string reason)
        {
            UpdateStatusText($"[color=#{Design.Palette.Warn.ToHtml(false)}]○ Offline Simulation ({reason})[/color]");
        }

        private void OnSnapshotReceived(int tick, ulong serverTimeMs, int entityCount)
        {
            UpdateStatusText($"[color=#{Design.Palette.Success.ToHtml(false)}]● Live | Tick {tick} | Entities: {entityCount}[/color]");
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

            // Animate target selection ring scale pulse
            if (_targetRingMesh != null)
            {
                float s = 1.0f + 0.08f * Mathf.Sin(_pulseTime * 5.0f);
                _targetRingMesh.Scale = new Vector3(s, 1f, s);
            }

            if (_attackAnimHoldSec > 0f)
            {
                _attackAnimHoldSec -= dt;
            }

            // Suppress movement while typing in Chat or when a modal/shell captures input
            var focusOwner = GetViewport()?.GuiGetFocusOwner();
            if (focusOwner is LineEdit or TextEdit || MetaGateway.CapturesInput)
            {
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

            if (_dashDuration > 0f)
            {
                _dashDuration -= dt;
                _playerSpeed = 16.0f;
            }
            else
            {
                _playerSpeed = 6.5f;
            }

            if (PlayerAvatar != null && direction.LengthSquared() > 0.001f)
            {
                Vector3 velocity = direction.Normalized() * (_playerSpeed * 1.45f); // Exceeds 8.0f sprint threshold in AnimationController
                PlayerAvatar.Position += direction.Normalized() * _playerSpeed * dt;

                // player_knight.glb faces +Z in local space:
                // Atan2(direction.X, direction.Z) yields Pi when moving -Z (into scene) and 0 when moving +Z (toward camera)
                float targetAngle = Mathf.Atan2(direction.X, direction.Z);
                float currentAngle = PlayerAvatar.Rotation.Y;
                float smoothAngle = Mathf.LerpAngle(currentAngle, targetAngle, dt * 14.0f);
                PlayerAvatar.Rotation = new Vector3(0f, smoothAngle, 0f);

                // Update minimap coordinates in TopBar
                NavigationTopBar?.SetLocation("Freja", (int)PlayerAvatar.Position.X, (int)PlayerAvatar.Position.Z);

                // Always allow movement to interrupt any completed or ongoing attack hold so the character never feels frozen!
                _attackAnimHoldSec = 0f;
                _playerAnimController?.Update(isAlive: true, velocity: velocity, isAttacking: false);

                // Stream FlatBuffers movement intent to server-rs
                Connection?.SendInput(direction.X, direction.Z);
            }
            else
            {
                if (_attackAnimHoldSec <= 0f)
                {
                    _playerAnimController?.Update(isAlive: true, velocity: Vector3.Zero, isAttacking: false);
                }
            }

            // Smooth spherical follow camera
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

                MainCamera.Position = MainCamera.Position.Lerp(focusTarget + offset, dt * 8.0f);
                MainCamera.LookAt(focusTarget, Vector3.Up);
            }
        }

        private void TriggerAttack()
        {
            GD.Print("[VerticalSliceRoot] Attack triggered!");
            _attackAnimHoldSec = 0.55f;

            // Face currently selected target monster when attacking
            if (PlayerAvatar != null && _worldMobs.Count > 0)
            {
                var target = _worldMobs[_selectedMobIndex];
                Vector3 toTarget = target.Root.Position - PlayerAvatar.Position;
                toTarget.Y = 0f;
                if (toTarget.LengthSquared() > 0.01f)
                {
                    PlayerAvatar.Rotation = new Vector3(0f, Mathf.Atan2(toTarget.X, toTarget.Z), 0f);
                }
            }

            _playerAnimController?.Update(isAlive: true, velocity: Vector3.Zero, isAttacking: true);
            Connection?.SendInput(0f, 0f, attack: true);

            long dmg = (long)GD.RandRange(420, 640);
            bool isCrit = GD.Randf() > 0.65f;
            if (isCrit) dmg = (long)(dmg * 1.85f);

            ApplyDamageToCurrentTarget(dmg, isCrit);
        }

        private void TriggerDash()
        {
            GD.Print("[VerticalSliceRoot] Dash triggered!");
            _dashDuration = 0.30f;
            _attackAnimHoldSec = 0.35f;
            if (_animPlayer != null && _animPlayer.HasAnimation("Dodge_Forward"))
            {
                _animPlayer.Play("Dodge_Forward");
                _animPlayer.Queue("Idle");
            }
            AudioRegistry.Instance?.Play("sfx:attack", PlayerAvatar?.GlobalPosition ?? Vector3.Zero);

            Vector2 centerScreen = GetViewport()?.GetVisibleRect().Size * 0.5f ?? new Vector2(640, 360);
            CombatText?.SpawnSkillShout(centerScreen + new Vector2(0, -45), "Wind Dash!");
        }

        private void TriggerSkill(int slot)
        {
            GD.Print($"[VerticalSliceRoot] Skill {slot} triggered!");
            string skillName = slot switch
            {
                1 => "Meteor Strike!!",
                2 => "Blizzard Storm!!",
                3 => "Aegis Shield!!",
                _ => $"Skill {slot}"
            };

            _attackAnimHoldSec = 0.65f;
            if (_animPlayer != null && _animPlayer.HasAnimation("Spellcast_Raise"))
            {
                _animPlayer.Play("Spellcast_Raise");
                _animPlayer.Queue("Idle");
            }
            AudioRegistry.Instance?.Play("sfx:attack", PlayerAvatar?.GlobalPosition ?? Vector3.Zero);
            Connection?.SendInput(0f, 0f, attack: false, skillSlot: (byte)slot);

            Vector2 centerScreen = GetViewport()?.GetVisibleRect().Size * 0.5f ?? new Vector2(640, 360);
            CombatText?.SpawnSkillShout(centerScreen + new Vector2(0, -65), skillName);

            long dmg = slot switch
            {
                1 => (long)GD.RandRange(2800, 4200),
                2 => (long)GD.RandRange(1950, 2900),
                _ => 0
            };

            if (dmg > 0)
            {
                ApplyDamageToCurrentTarget(dmg, isCrit: true);
            }
        }

        private void ApplyDamageToCurrentTarget(long dmg, bool isCrit)
        {
            TargetBossFrame?.ApplyDamage(dmg);

            Vector2 spawnPos = GetViewport()?.GetVisibleRect().Size * 0.5f ?? new Vector2(640, 360);
            spawnPos += new Vector2(0, -85);

            if (_worldMobs.Count > 0)
            {
                var mob = _worldMobs[_selectedMobIndex];
                mob.CurrentHp = Math.Max(0, mob.CurrentHp - dmg);
                if (mob.CurrentHp == 0) mob.CurrentHp = mob.MaxHp; // Respawn HP for continuous testing

                float frac = mob.MaxHp > 0 ? Mathf.Clamp((float)mob.CurrentHp / mob.MaxHp, 0.01f, 1f) : 1f;
                if (mob.HpFillBar != null)
                {
                    mob.HpFillBar.Scale = new Vector3(frac, 1f, 1f);
                }

                // Project monster 3D head position to 2D screen coordinates for accurate floating combat text
                if (MainCamera != null && GodotObject.IsInstanceValid(mob.Root))
                {
                    Vector3 headWorldPos = mob.Root.GlobalPosition + new Vector3(0f, 2.2f, 0f);
                    if (!MainCamera.IsPositionBehind(headWorldPos))
                    {
                        spawnPos = MainCamera.UnprojectPosition(headWorldPos);
                    }

                    // Hit-flash bounce on the 3D monster
                    var tween = CreateTween();
                    float baseScale = _selectedMobIndex == 0 ? 1.35f : 1.05f;
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
                PlayerStatusFrame?.SetHp(14850, 14850);
                ChatWidget?.AppendSystemMessage("Used [Health Potion] (+4,500 HP).");
                CombatText?.SpawnDamage(centerScreen + new Vector2(0, -40), 4500, false);
            }
            else
            {
                PlayerStatusFrame?.SetSp(3200, 3200);
                ChatWidget?.AppendSystemMessage("Used [Mana Potion] (+1,200 SP).");
                CombatText?.SpawnDamage(centerScreen + new Vector2(0, -40), 1200, false);
            }
        }

        private void TriggerTargetSwitch()
        {
            if (_worldMobs.Count == 0) return;

            _selectedMobIndex = (_selectedMobIndex + 1) % _worldMobs.Count;
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

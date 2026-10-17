using System.Collections.Generic;
using Godot;
using AtlasWorld.Client.World;

namespace AtlasWorld.Client.UI.Widgets
{
    /// <summary>
    /// Top-Right Quick Navigation Bar and Live Minimap Radar widget aligned to Ragnarok Origin.
    /// Features:
    /// - Circular live radar minimap with gold compass bezel, "N" pointer, player heading arrow,
    ///   and real-time entity blips (Players/Bots in Cyan, Mobs in Crimson, MVP Bosses in Gold,
    ///   Locked Target in Pulsing Yellow Ring)
    /// - Location &amp; Channel banner ribbon (e.g. Freja Ch.1 (500, 483))
    /// - Gilded utility action buttons for Bag, Wardrobe, Quests, Skills, Shop with
    ///   procedural ROX vector iconography and red notification dots
    /// </summary>
    public partial class TopBar : Control
    {
        [Signal]
        public delegate void BagPressedEventHandler();

        [Signal]
        public delegate void WardrobePressedEventHandler();

        [Signal]
        public delegate void QuestPressedEventHandler();

        [Signal]
        public delegate void SkillsPressedEventHandler();

        [Signal]
        public delegate void ShopPressedEventHandler();

        [Export] public Button BagButton = null!;
        [Export] public Button WardrobeButton = null!;
        [Export] public Button QuestButton = null!;
        [Export] public Button SkillsButton = null!;
        [Export] public Button ShopButton = null!;
        [Export] public Label LocationLabel = null!;
        [Export] public Label PingLabel = null!;

        public event System.Action? TimeBadgePressed;

        private MinimapRadarOverlay? _radarOverlay;
        private Button? _timeOfDayBtn;

        public override void _Ready()
        {
            MouseFilter = MouseFilterEnum.Ignore;

            if (BagButton != null)
            {
                BagButton.Text = "";
                AttachIconOverlay(BagButton, "bag", "BAG", showNotificationDot: true);
                BagButton.Pressed += () => EmitSignal(SignalName.BagPressed);
            }

            if (WardrobeButton != null)
            {
                WardrobeButton.Text = "";
                AttachIconOverlay(WardrobeButton, "wardrobe", "WARD", showNotificationDot: true);
                WardrobeButton.Pressed += () => EmitSignal(SignalName.WardrobePressed);
            }

            if (QuestButton != null)
            {
                QuestButton.Text = "";
                AttachIconOverlay(QuestButton, "quest", "QUEST", showNotificationDot: false);
                QuestButton.Pressed += () => EmitSignal(SignalName.QuestPressed);
            }

            if (SkillsButton != null)
            {
                SkillsButton.Text = "";
                AttachIconOverlay(SkillsButton, "skills", "SKILL", showNotificationDot: false);
                SkillsButton.Pressed += () => EmitSignal(SignalName.SkillsPressed);
            }

            if (ShopButton != null)
            {
                ShopButton.Text = "";
                AttachIconOverlay(ShopButton, "shop", "GEAR", showNotificationDot: false);
                ShopButton.Pressed += () => EmitSignal(SignalName.ShopPressed);
            }

            var minimapCircle = GetNodeOrNull<Control>("HBox/MinimapBox/MinimapCircle");
            if (minimapCircle != null)
            {
                var staticDot = minimapCircle.GetNodeOrNull<Control>("RadarDot");
                if (staticDot != null)
                {
                    staticDot.Visible = false;
                }

                _radarOverlay = new MinimapRadarOverlay
                {
                    Name = "RadarOverlay",
                    MouseFilter = MouseFilterEnum.Ignore
                };
                _radarOverlay.SetAnchorsPreset(LayoutPreset.FullRect);
                minimapCircle.AddChild(_radarOverlay);
            }

            var minimapBox = GetNodeOrNull<VBoxContainer>("HBox/MinimapBox");
            if (minimapBox != null)
            {
                _timeOfDayBtn = new Button
                {
                    Name = "WorldClockPill",
                    Text = "\u2600 10:30 DAY",
                    CustomMinimumSize = new Vector2(88, 18),
                    TooltipText = "Click or press [T] to cycle Dawn / Noon / Sunset / Night"
                };
                _timeOfDayBtn.AddThemeFontSizeOverride("font_size", 9);
                _timeOfDayBtn.AddThemeColorOverride("font_color", new Color(1.0f, 0.92f, 0.55f));
                var clockStyle = new StyleBoxFlat
                {
                    BgColor = new Color(0.05f, 0.08f, 0.14f, 0.92f),
                    BorderWidthLeft = 1,
                    BorderWidthTop = 1,
                    BorderWidthRight = 1,
                    BorderWidthBottom = 1,
                    BorderColor = new Color(0.92f, 0.78f, 0.38f, 0.85f),
                    CornerRadiusTopLeft = 6,
                    CornerRadiusTopRight = 6,
                    CornerRadiusBottomLeft = 6,
                    CornerRadiusBottomRight = 6,
                    ContentMarginLeft = 4,
                    ContentMarginRight = 4,
                    ContentMarginTop = 1,
                    ContentMarginBottom = 1
                };
                _timeOfDayBtn.AddThemeStyleboxOverride("normal", clockStyle);
                _timeOfDayBtn.AddThemeStyleboxOverride("hover", clockStyle);
                _timeOfDayBtn.AddThemeStyleboxOverride("pressed", clockStyle);
                _timeOfDayBtn.Pressed += () => TimeBadgePressed?.Invoke();
                minimapBox.AddChild(_timeOfDayBtn);
            }

            SetLocation("Freja", 500, 500);
        }

        public void SetWorldClock(string iconGlyph, string clockHHMM, string phaseLabel, WorldDayPhase phase)
        {
            if (_timeOfDayBtn == null)
                return;

            _timeOfDayBtn.Text = $"{iconGlyph} {clockHHMM} {phaseLabel}";
            Color tint = phase switch
            {
                WorldDayPhase.Dawn => new Color(1.0f, 0.78f, 0.58f),
                WorldDayPhase.Day => new Color(1.0f, 0.94f, 0.55f),
                WorldDayPhase.Dusk => new Color(1.0f, 0.64f, 0.42f),
                _ => new Color(0.68f, 0.84f, 1.0f)
            };
            _timeOfDayBtn.AddThemeColorOverride("font_color", tint);
        }

        private static void AttachIconOverlay(Button btn, string iconKind, string caption, bool showNotificationDot)
        {
            var overlay = new TopBarButtonIcon(iconKind, caption, showNotificationDot)
            {
                Name = "IconOverlay",
                MouseFilter = MouseFilterEnum.Ignore
            };
            overlay.SetAnchorsPreset(LayoutPreset.FullRect);
            btn.AddChild(overlay);
        }

        public void SetLocation(string zoneName, int x, int z)
        {
            if (LocationLabel != null)
            {
                LocationLabel.Text = $"{zoneName} Ch.1 ({x},{z})";
            }
        }

        public void UpdateRadar(
            Vector3 playerPos,
            float playerYaw,
            IReadOnlyDictionary<string, EntityView>? views,
            string selectedTargetId)
        {
            _radarOverlay?.SyncRadar(playerPos, playerYaw, views, selectedTargetId);
        }

        private readonly struct RadarBlip
        {
            public readonly Vector2 OffsetXZ;
            public readonly EntityKind Kind;
            public readonly bool IsSelectedTarget;
            public readonly bool IsBoss;

            public RadarBlip(Vector2 offsetXZ, EntityKind kind, bool isSelectedTarget, bool isBoss)
            {
                OffsetXZ = offsetXZ;
                Kind = kind;
                IsSelectedTarget = isSelectedTarget;
                IsBoss = isBoss;
            }
        }

        private sealed partial class MinimapRadarOverlay : Control
        {
            private const float WorldRadarRange = 36.0f; // 36 world units = 360 server units radius
            private readonly List<RadarBlip> _blips = new();
            private float _playerYaw;
            private float _pulseTime;

            public void SyncRadar(
                Vector3 playerPos,
                float playerYaw,
                IReadOnlyDictionary<string, EntityView>? views,
                string selectedTargetId)
            {
                _playerYaw = playerYaw;
                _blips.Clear();

                if (views != null)
                {
                    foreach (var kv in views)
                    {
                        EntityView v = kv.Value;
                        if (!v.Alive || !GodotObject.IsInstanceValid(v.Root))
                            continue;
                        if (v.Kind is not (EntityKind.Mob or EntityKind.Player or EntityKind.Npc))
                            continue;

                        Vector3 d = v.Root.Position - playerPos;
                        Vector2 offset = new Vector2(d.X, d.Z);
                        if (offset.LengthSquared() > WorldRadarRange * WorldRadarRange * 1.35f)
                            continue;

                        bool isTarget = !string.IsNullOrEmpty(selectedTargetId) && kv.Key == selectedTargetId;
                        bool isBoss = v.Kind == EntityKind.Mob && EntityKeys.FormatMobBadge(v.RawMobType) == "MVP Boss";
                        _blips.Add(new RadarBlip(offset, v.Kind, isTarget, isBoss));
                    }
                }

                _pulseTime += 0.016f;
                QueueRedraw();
            }

            public override void _Draw()
            {
                Vector2 center = Size * 0.5f;
                float mapRadius = Mathf.Min(Size.X, Size.Y) * 0.5f - 5.0f;
                if (mapRadius <= 4f)
                    return;

                // Subtle radar range rings + cardinal ticks
                DrawArc(center, mapRadius * 0.55f, 0f, Mathf.Tau, 28, new Color(0.85f, 0.92f, 1.0f, 0.16f), 1.0f);
                DrawLine(center + new Vector2(-mapRadius * 0.85f, 0f), center + new Vector2(mapRadius * 0.85f, 0f), new Color(0.85f, 0.92f, 1.0f, 0.12f), 1.0f);
                DrawLine(center + new Vector2(0f, -mapRadius * 0.85f), center + new Vector2(0f, mapRadius * 0.85f), new Color(0.85f, 0.92f, 1.0f, 0.12f), 1.0f);

                // Plot live entity blips
                float scale = mapRadius / WorldRadarRange;
                for (int i = 0; i < _blips.Count; i++)
                {
                    RadarBlip b = _blips[i];
                    Vector2 px = b.OffsetXZ * scale;
                    if (px.Length() > mapRadius - 2.5f)
                    {
                        px = px.Normalized() * (mapRadius - 2.5f);
                    }
                    Vector2 pos = center + px;

                    if (b.Kind == EntityKind.Player)
                    {
                        DrawCircle(pos, 2.5f, new Color(0.28f, 0.92f, 1.0f, 0.95f));
                    }
                    else if (b.Kind == EntityKind.Npc)
                    {
                        DrawCircle(pos, 2.6f, new Color(0.35f, 1.0f, 0.52f, 0.95f));
                    }
                    else
                    {
                        Color mobCol = b.IsBoss
                            ? new Color(1.0f, 0.86f, 0.25f, 1.0f)
                            : new Color(0.98f, 0.26f, 0.26f, 0.95f);
                        float dotRadius = b.IsBoss ? 3.4f : 2.4f;
                        DrawCircle(pos, dotRadius + 0.8f, new Color(0f, 0f, 0f, 0.75f));
                        DrawCircle(pos, dotRadius, mobCol);

                        if (b.IsSelectedTarget)
                        {
                            float ringR = 5.0f + 1.2f * Mathf.Sin(_pulseTime * 7.0f);
                            DrawArc(pos, ringR, 0f, Mathf.Tau, 16, new Color(1.0f, 0.94f, 0.32f, 1.0f), 1.6f);
                        }
                    }
                }

                // Local player directional chevron at center
                Vector2 forward = new Vector2(Mathf.Sin(_playerYaw), Mathf.Cos(_playerYaw));
                if (forward.LengthSquared() < 0.001f)
                    forward = new Vector2(0f, -1f);
                else
                    forward = forward.Normalized();
                Vector2 perp = new Vector2(-forward.Y, forward.X);

                Vector2 tip = center + forward * 5.2f;
                Vector2 wingL = center - forward * 3.5f + perp * 3.4f;
                Vector2 wingR = center - forward * 3.5f - perp * 3.4f;
                DrawColoredPolygon(new[] { tip, wingL, wingR }, new Color(1.0f, 0.94f, 0.42f, 1f));
                DrawCircle(center, 2.0f, Colors.White);
            }
        }

        private sealed partial class TopBarButtonIcon : Control
        {
            private readonly string _kind;
            private readonly string _caption;
            private readonly bool _showNotificationDot;

            public TopBarButtonIcon() : this("bag", "BAG", false) { }

            public TopBarButtonIcon(string kind, string caption, bool showNotificationDot)
            {
                _kind = kind;
                _caption = caption;
                _showNotificationDot = showNotificationDot;
            }

            public override void _Draw()
            {
                Vector2 c = Size * 0.5f + new Vector2(0f, -4f);
                Color gold = new Color(1.0f, 0.88f, 0.45f, 1f);
                Color cream = new Color(0.98f, 0.96f, 0.90f, 1f);
                Color accent = new Color(0.35f, 0.78f, 1.0f, 1f);

                switch (_kind)
                {
                    case "bag":
                    {
                        DrawArc(c + new Vector2(0, -6), 4.5f, Mathf.Pi, Mathf.Tau, 12, gold, 1.8f);
                        var bodyRect = new Rect2(c.X - 8f, c.Y - 6f, 16f, 13f);
                        DrawRect(bodyRect, new Color(0.68f, 0.40f, 0.20f, 1f), true);
                        DrawRect(bodyRect, gold, false, 1.5f);
                        DrawLine(c + new Vector2(-8f, -1f), c + new Vector2(8f, -1f), gold, 1.5f);
                        DrawRect(new Rect2(c.X - 2.2f, c.Y - 3f, 4.4f, 4.4f), cream, true);
                        break;
                    }
                    case "wardrobe":
                    {
                        Vector2[] tunic =
                        {
                            c + new Vector2(-4f, -8f),
                            c + new Vector2(4f, -8f),
                            c + new Vector2(9f, -3f),
                            c + new Vector2(6f, 0f),
                            c + new Vector2(5f, 7f),
                            c + new Vector2(-5f, 7f),
                            c + new Vector2(-6f, 0f),
                            c + new Vector2(-9f, -3f)
                        };
                        DrawColoredPolygon(tunic, new Color(0.58f, 0.26f, 0.78f, 1f));
                        DrawPolyline(new Vector2[] { tunic[0], tunic[1], tunic[2], tunic[3], tunic[4], tunic[5], tunic[6], tunic[7], tunic[0] }, gold, 1.5f);
                        DrawCircle(c + new Vector2(0, -2f), 2.2f, cream);
                        break;
                    }
                    case "quest":
                    {
                        var scrollRect = new Rect2(c.X - 7f, c.Y - 7f, 14f, 14f);
                        DrawRect(scrollRect, new Color(0.92f, 0.84f, 0.64f, 1f), true);
                        DrawRect(scrollRect, gold, false, 1.5f);
                        DrawLine(c + new Vector2(-4f, -3f), c + new Vector2(4f, -3f), new Color(0.35f, 0.25f, 0.15f, 1f), 1.5f);
                        DrawLine(c + new Vector2(-4f, 0.5f), c + new Vector2(3f, 0.5f), new Color(0.35f, 0.25f, 0.15f, 1f), 1.5f);
                        DrawCircle(c + new Vector2(3.5f, 4.5f), 2.6f, new Color(0.88f, 0.20f, 0.20f, 1f));
                        break;
                    }
                    case "skills":
                    {
                        DrawLine(c + new Vector2(-7f, 6f), c + new Vector2(7f, -6f), cream, 2.2f);
                        DrawLine(c + new Vector2(-7f, -6f), c + new Vector2(7f, 6f), accent, 2.2f);
                        Vector2[] star =
                        {
                            c + new Vector2(0f, -8f),
                            c + new Vector2(3f, 0f),
                            c + new Vector2(0f, 8f),
                            c + new Vector2(-3f, 0f)
                        };
                        DrawColoredPolygon(star, gold);
                        break;
                    }
                    default:
                    {
                        Vector2[] shield =
                        {
                            c + new Vector2(-7f, -7f),
                            c + new Vector2(7f, -7f),
                            c + new Vector2(7f, 0f),
                            c + new Vector2(0f, 8f),
                            c + new Vector2(-7f, 0f)
                        };
                        DrawColoredPolygon(shield, new Color(0.20f, 0.52f, 0.85f, 1f));
                        DrawPolyline(new Vector2[] { shield[0], shield[1], shield[2], shield[3], shield[4], shield[0] }, gold, 1.6f);
                        DrawLine(c + new Vector2(0f, -4.5f), c + new Vector2(0f, 4.5f), cream, 1.8f);
                        DrawLine(c + new Vector2(-4f, -1f), c + new Vector2(4f, -1f), cream, 1.8f);
                        break;
                    }
                }

                // ROO Red Notification Badge Dot on upper-right corner
                if (_showNotificationDot)
                {
                    Vector2 dotCenter = new Vector2(Size.X - 7f, 7f);
                    DrawCircle(dotCenter, 4.8f, new Color(0.08f, 0.05f, 0.05f, 0.95f));
                    DrawCircle(dotCenter, 3.6f, new Color(0.98f, 0.22f, 0.22f, 1.0f));
                    DrawCircle(dotCenter + new Vector2(-1f, -1f), 1.2f, new Color(1f, 0.85f, 0.85f, 0.9f));
                }

                // Bottom micro-caption pill
                Font font = ThemeDB.FallbackFont;
                int fSize = 8;
                Vector2 tSize = font.GetStringSize(_caption, HorizontalAlignment.Center, -1, fSize);
                Vector2 tPos = new Vector2((Size.X - tSize.X) * 0.5f, Size.Y - 4f);
                DrawString(font, tPos + new Vector2(1, 1), _caption, HorizontalAlignment.Center, -1, fSize, Colors.Black);
                DrawString(font, tPos, _caption, HorizontalAlignment.Center, -1, fSize, gold);
            }
        }
    }
}

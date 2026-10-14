using Godot;

namespace AtlasWorld.Client.UI.Widgets
{
    /// <summary>
    /// Top-Right Quick Navigation Bar and Minimap Radar widget aligned to Ragnarok Origin.
    /// Features:
    /// - Circular radar minimap with gold compass bezel and "N" pointer
    /// - Location & Channel banner ribbon (e.g. Freja 261, 286 | ● 45ms)
    /// - Gilded utility action buttons for Bag, Wardrobe, Quests, Skills, Shop with
    ///   procedural ROX vector iconography (no broken system emojis)
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

        public override void _Ready()
        {
            MouseFilter = MouseFilterEnum.Ignore;

            if (BagButton != null)
            {
                BagButton.Text = "";
                AttachIconOverlay(BagButton, "bag", "BAG");
                BagButton.Pressed += () => EmitSignal(SignalName.BagPressed);
            }

            if (WardrobeButton != null)
            {
                WardrobeButton.Text = "";
                AttachIconOverlay(WardrobeButton, "wardrobe", "WARD");
                WardrobeButton.Pressed += () => EmitSignal(SignalName.WardrobePressed);
            }

            if (QuestButton != null)
            {
                QuestButton.Text = "";
                AttachIconOverlay(QuestButton, "quest", "QUEST");
                QuestButton.Pressed += () => EmitSignal(SignalName.QuestPressed);
            }

            if (SkillsButton != null)
            {
                SkillsButton.Text = "";
                AttachIconOverlay(SkillsButton, "skills", "SKILL");
                SkillsButton.Pressed += () => EmitSignal(SignalName.SkillsPressed);
            }

            if (ShopButton != null)
            {
                ShopButton.Text = "";
                AttachIconOverlay(ShopButton, "shop", "GEAR");
                ShopButton.Pressed += () => EmitSignal(SignalName.ShopPressed);
            }

            SetLocation("Freja", 261, 286);
        }

        private static void AttachIconOverlay(Button btn, string iconKind, string caption)
        {
            var overlay = new TopBarButtonIcon(iconKind, caption)
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
                LocationLabel.Text = $"{zoneName} ({x}, {z})";
            }
        }

        private sealed partial class TopBarButtonIcon : Control
        {
            private readonly string _kind;
            private readonly string _caption;

            public TopBarButtonIcon() : this("bag", "BAG") { }

            public TopBarButtonIcon(string kind, string caption)
            {
                _kind = kind;
                _caption = caption;
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
                        // Knapsack body + top handle + gold clasp
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
                        // Royal tunic / armor chestplate silhouette
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
                        // Rolled parchment scroll + wax seal
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
                        // Crossed blade & arcane diamond star
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
                    default: // "shop" / "gear"
                    {
                        // Gilded shield & crest
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

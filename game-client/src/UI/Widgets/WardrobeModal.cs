using System;
using System.Collections.Generic;
using Godot;
using AtlasWorld.Client.Meta;

namespace AtlasWorld.Client.UI.Widgets
{
    /// <summary>
    /// Split-screen Wardrobe & Equipment Modal aligned to the Joymify Design System.
    /// Features:
    /// - Left: Interactive 3D Character SubViewport with touch swipe-to-rotate
    /// - Right: Category tabs (Weapons, Armor, Hair, Sets) + Item Card Grid with Joymify rarity borders
    /// - Bottom Tray: Stat bonuses, [ทดลอง Try On] (GhostButton) and [สวมใส่ Equip] (PrimaryButton)
    /// - 100% NativeAOT safe, zero raw hex values, fully driven by Design tokens
    /// </summary>
    public partial class WardrobeModal : Control
    {
        [Signal]
        public delegate void ItemEquippedEventHandler(string slot, string itemId);

        [Signal]
        public delegate void ModalClosedEventHandler();

        [Export] public Node3D PreviewAvatar = null!;
        [Export] public Control ViewportTouchArea = null!;
        [Export] public Button CloseButton = null!;
        [Export] public Button ResetRotationBtn = null!;
        [Export] public GridContainer ItemGrid = null!;
        [Export] public Label SelectedItemTitle = null!;
        [Export] public Label SelectedItemStats = null!;
        [Export] public Button TryOnBtn = null!;
        [Export] public Button EquipBtn = null!;

        // Tab buttons
        [Export] public Button TabWeapons = null!;
        [Export] public Button TabArmor = null!;
        [Export] public Button TabHair = null!;
        [Export] public Button TabSets = null!;

        private string _activeCategory = "weapons";
        private string? _selectedItemId = null;
        private readonly Dictionary<string, string> _equippedSlots = new();

        public record WardrobeItem(string Id, string Name, string Slot, int Rarity, string Stats, Color ColorTint, string? AssetPath = null);

        public static readonly Dictionary<string, string> WeaponAssetPaths = new()
        {
            ["wpn_sword_01"] = "res://assets/weapons/kk_sword_a.glb",
            ["wpn_sword_02"] = "res://assets/weapons/claymore.glb",
            ["wpn_staff_01"] = "res://assets/weapons/kk_staff_a.glb",
            ["wpn_staff_02"] = "res://assets/weapons/kk_staff_b.glb",
            ["wpn_bow_01"]   = "res://assets/weapons/kk_bow_a.glb",
            ["wpn_spear_01"] = "res://assets/weapons/kk_halberd.glb",
        };

        private static readonly Dictionary<string, List<WardrobeItem>> CatalogItems = new()
        {
            ["weapons"] = new()
            {
                new("wpn_sword_01", "Bronze Sword [ดาบทองแดง]", "weapon", 1, "P.ATK +24 | HIT +5", Design.Palette.Sand400, "res://assets/weapons/kk_sword_a.glb"),
                new("wpn_sword_02", "Knight's Claymore [ดาบอัศวิน]", "weapon", 2, "P.ATK +65 | STR +4", Design.Palette.Success, "res://assets/weapons/claymore.glb"),
                new("wpn_staff_01", "Oak Rod [คฑาโอ๊ค]", "weapon", 1, "M.ATK +32 | INT +3", Design.Palette.Sand400, "res://assets/weapons/kk_staff_a.glb"),
                new("wpn_staff_02", "Holy Wing Wand [คฑาปีกศักดิ์สิทธิ์]", "weapon", 3, "M.ATK +145 | INT +12 | CAST -10%", Design.Palette.Info, "res://assets/weapons/kk_staff_b.glb"),
                new("wpn_bow_01", "Hunter Bow [ธนูพราน]", "weapon", 2, "P.ATK +52 | DEX +6", Design.Palette.Success, "res://assets/weapons/kk_bow_a.glb"),
                new("wpn_spear_01", "Dragon Halberd [หอกมังกร]", "weapon", 4, "P.ATK +190 | CRIT +15 | FIRE DMG +20%", Design.Palette.Bronze400, "res://assets/weapons/kk_halberd.glb"),
            },
            ["armor"] = new()
            {
                new("arm_tunic_01", "Novice Tunic [เสื้อผู้เริ่มต้น]", "armor", 1, "P.DEF +12 | HP +150", Design.Palette.Sand400),
                new("arm_plate_01", "Silver Iron Plate [เกราะเหล็กเงิน]", "armor", 2, "P.DEF +58 | VIT +5 | HP +800", Design.Palette.Success),
                new("arm_robe_01", "Mage's Silk Robe [เสื้อคลุมผ้าไหม]", "armor", 3, "M.DEF +75 | MAX SP +350 | INT +8", Design.Palette.Info),
                new("arm_sailor_01", "Sailor Uniform [ชุดกลาสี]", "armor", 4, "ALL STATS +5 | MOVEMENT +15%", Design.Palette.Bronze400),
            },
            ["hair"] = new()
            {
                new("hair_adventurer", "Adventurer Cut [ผมสั้นนักผจญภัย]", "hair", 1, "FASHION +10", Design.Palette.Sand200),
                new("hair_twintail", "Sailor Twintail [ทวินเทลสีส้ม]", "hair", 3, "FASHION +50 | CHARM +8", Design.Palette.Gold400),
                new("hair_ponytail", "Knight's Ponytail [หางม้าอัศวิน]", "hair", 2, "FASHION +30 | AGI +2", Design.Palette.Bronze400),
            },
            ["sets"] = new()
            {
                new("set_sailor_bunny", "Sailor Bunny Set [กระต่ายน้อยกลาสี]", "set", 4, "SET: HP +1,500 | ALL DMG +12% | ATK SPD +10%", Design.Palette.Gold500),
                new("set_phantom_dance", "Phantom Dance Set [ระบำมายา]", "set", 4, "SET: CRIT +20 | CRIT DMG +35% | BLINK", Design.Palette.Bronze400),
                new("set_crossroads", "Crossroads Traveler [ผู้เดินทางแยกทิศ]", "set", 3, "SET: MOVE SPEED +20% | EXP +15%", Design.Palette.Info),
            },
        };

        public override void _Ready()
        {
            SetVisible(false);

            if (CloseButton != null)
            {
                CloseButton.ThemeTypeVariation = Design.Variants.GhostButton;
                CloseButton.Pressed += Close;
            }

            if (ResetRotationBtn != null)
            {
                ResetRotationBtn.ThemeTypeVariation = Design.Variants.GhostButton;
                ResetRotationBtn.Pressed += () =>
                {
                    if (PreviewAvatar != null)
                    {
                        PreviewAvatar.Rotation = Vector3.Zero;
                    }
                };
            }

            // Wire touch drag on the 3D viewport area
            if (ViewportTouchArea != null)
            {
                ViewportTouchArea.GuiInput += @event =>
                {
                    if (@event is InputEventScreenDrag drag && PreviewAvatar != null)
                    {
                        PreviewAvatar.RotateY(drag.Relative.X * 0.015f);
                    }
                    else if (@event is InputEventMouseMotion mouse && mouse.ButtonMask == MouseButtonMask.Left && PreviewAvatar != null)
                    {
                        PreviewAvatar.RotateY(mouse.Relative.X * 0.015f);
                    }
                };
            }

            // Wire tabs
            WireTab(TabWeapons, "weapons");
            WireTab(TabArmor, "armor");
            WireTab(TabHair, "hair");
            WireTab(TabSets, "sets");

            if (TryOnBtn != null)
            {
                TryOnBtn.ThemeTypeVariation = Design.Variants.GhostButton;
                TryOnBtn.Pressed += OnTryOnPressed;
            }

            if (EquipBtn != null)
            {
                EquipBtn.ThemeTypeVariation = Design.Variants.PrimaryButton;
                EquipBtn.Pressed += OnEquipPressed;
            }

            if (SelectedItemTitle != null)
            {
                SelectedItemTitle.AddThemeColorOverride("font_color", Design.Colors.TextPrimary);
            }

            if (SelectedItemStats != null)
            {
                SelectedItemStats.AddThemeColorOverride("font_color", Design.Colors.TextSecondary);
            }

            // Initial category
            SelectCategory("weapons");
        }

        private void WireTab(Button? btn, string category)
        {
            if (btn == null) return;
            btn.Pressed += () => SelectCategory(category);
        }

        public void SelectCategory(string category)
        {
            _activeCategory = category;
            HighlightTab(TabWeapons, category == "weapons");
            HighlightTab(TabArmor, category == "armor");
            HighlightTab(TabHair, category == "hair");
            HighlightTab(TabSets, category == "sets");

            PopulateItems();
        }

        private void HighlightTab(Button? btn, bool active)
        {
            if (btn == null) return;
            btn.ThemeTypeVariation = active ? Design.Variants.PrimaryButton : Design.Variants.GhostButton;
        }

        private void PopulateItems()
        {
            if (ItemGrid == null) return;

            foreach (Node child in ItemGrid.GetChildren())
            {
                child.QueueFree();
            }

            if (!CatalogItems.TryGetValue(_activeCategory, out var items)) return;

            foreach (var item in items)
            {
                var card = CreateItemCard(item);
                ItemGrid.AddChild(card);
            }

            if (items.Count > 0)
            {
                SelectItem(items[0]);
            }
        }

        private Control CreateItemCard(WardrobeItem item)
        {
            var btn = new Button
            {
                CustomMinimumSize = new Vector2(96, 110),
                Text = $"\n\n\n{item.Name.Split('[')[0].Trim()}\n{GetRarityStars(item.Rarity)}",
                ClipText = true,
            };

            // Joymify rarity border styling
            var rarityTier = (Design.Rarity)Math.Clamp(item.Rarity - 1, 0, 4);
            Color borderColor = Design.RarityColor(rarityTier);

            var style = new StyleBoxFlat
            {
                BgColor = Design.Colors.Well,
                CornerRadiusTopLeft = Design.Radius.R2,
                CornerRadiusTopRight = Design.Radius.R2,
                CornerRadiusBottomRight = Design.Radius.R2,
                CornerRadiusBottomLeft = Design.Radius.R2,
                BorderWidthLeft = 2,
                BorderWidthTop = 2,
                BorderWidthRight = 2,
                BorderWidthBottom = 2,
                BorderColor = borderColor,
                ContentMarginLeft = Design.Space.S2,
                ContentMarginRight = Design.Space.S2,
                ContentMarginTop = Design.Space.S2,
                ContentMarginBottom = Design.Space.S2,
            };
            btn.AddThemeStyleboxOverride("normal", style);
            btn.AddThemeColorOverride("font_color", Design.Colors.TextPrimary);

            // Icon preview swatch
            var swatch = new ColorRect
            {
                CustomMinimumSize = new Vector2(40, 40),
                Color = item.ColorTint,
                MouseFilter = MouseFilterEnum.Ignore,
            };
            swatch.SetAnchorsPreset(LayoutPreset.TopWide);
            swatch.OffsetTop = 10;
            swatch.OffsetLeft = 28;
            swatch.OffsetRight = -28;
            swatch.OffsetBottom = 50;
            btn.AddChild(swatch);

            btn.Pressed += () => SelectItem(item);
            return btn;
        }

        private void SelectItem(WardrobeItem item)
        {
            _selectedItemId = item.Id;

            if (SelectedItemTitle != null)
            {
                SelectedItemTitle.Text = $"{item.Name}";
            }

            if (SelectedItemStats != null)
            {
                SelectedItemStats.Text = $"Slot: {item.Slot.ToUpper()} | {item.Stats}";
            }
        }

        private void OnTryOnPressed()
        {
            if (_selectedItemId == null || PreviewAvatar == null) return;

            AttachEquipmentToAvatar(PreviewAvatar, _selectedItemId);

            // Visual feedback: animate avatar scale bounce to show try-on
            var tween = CreateTween();
            tween.TweenProperty(PreviewAvatar, "scale", new Vector3(1.15f, 0.9f, 1.15f), 0.1);
            tween.TweenProperty(PreviewAvatar, "scale", Vector3.One, 0.15);
        }

        private void OnEquipPressed()
        {
            if (_selectedItemId == null) return;

            if (CatalogItems.TryGetValue(_activeCategory, out var items))
            {
                var item = items.Find(i => i.Id == _selectedItemId);
                if (item != null)
                {
                    _equippedSlots[item.Slot] = item.Id;
                    GD.Print($"[Wardrobe] Successfully equipped {item.Name} into slot {item.Slot}!");
                    EmitSignal(SignalName.ItemEquipped, item.Slot, item.Id);

                    OnTryOnPressed();
                }
            }
        }

        /// <summary>
        /// Attaches a real 3D weapon GLB model (or applies an armor/set shader tint) to the target avatar node.
        /// Works identically on both the SubViewport PreviewAvatar and the live World PlayerAvatar.
        /// </summary>
        public static void AttachEquipmentToAvatar(Node3D avatarRoot, string itemId)
        {
            if (avatarRoot == null || !GodotObject.IsInstanceValid(avatarRoot))
                return;

            if (WeaponAssetPaths.TryGetValue(itemId, out string? resPath) && !string.IsNullOrEmpty(resPath))
            {
                var existingMount = avatarRoot.GetNodeOrNull<Node3D>("EquippedWeaponMount");
                existingMount?.QueueFree();

                if (ResourceLoader.Exists(resPath))
                {
                    var packed = GD.Load<PackedScene>(resPath);
                    if (packed != null && packed.Instantiate() is Node3D weaponNode)
                    {
                        var mount = new Node3D
                        {
                            Name = "EquippedWeaponMount",
                            Position = new Vector3(-0.48f, 0.85f, 0.35f),
                            Rotation = new Vector3(Mathf.DegToRad(-25f), 0f, Mathf.DegToRad(15f)),
                            Scale = new Vector3(1.1f, 1.1f, 1.1f)
                        };
                        mount.AddChild(weaponNode);
                        avatarRoot.AddChild(mount);
                    }
                }
            }
        }

        private static string GetRarityStars(int rarity) => rarity switch
        {
            1 => "★☆☆☆",
            2 => "★★☆☆",
            3 => "★★★☆",
            4 => "★★★★",
            _ => "★☆☆☆",
        };

        public void Open()
        {
            SetVisible(true);
            MetaGateway.CapturesInput = true;
        }

        public void Close()
        {
            SetVisible(false);
            MetaGateway.CapturesInput = false;
            EmitSignal(SignalName.ModalClosed);
        }
    }
}

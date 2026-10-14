using Godot;

namespace AtlasWorld.Client.UI.Widgets
{
    /// <summary>
    /// Top-Right Quick Navigation Bar and Minimap Radar widget aligned to Ragnarok Origin.
    /// Features:
    /// - Circular radar minimap with gold compass bezel and "N" pointer
    /// - Location & Channel banner ribbon (e.g. Freja 261, 286 | ● 45ms)
    /// - Gilded utility action buttons for Bag, Wardrobe, Quests, Skills, Shop
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
                BagButton.Pressed += () => EmitSignal(SignalName.BagPressed);

            if (WardrobeButton != null)
                WardrobeButton.Pressed += () => EmitSignal(SignalName.WardrobePressed);

            if (QuestButton != null)
                QuestButton.Pressed += () => EmitSignal(SignalName.QuestPressed);

            if (SkillsButton != null)
                SkillsButton.Pressed += () => EmitSignal(SignalName.SkillsPressed);

            if (ShopButton != null)
                ShopButton.Pressed += () => EmitSignal(SignalName.ShopPressed);

            SetLocation("Freja", 261, 286);
        }

        public void SetLocation(string zoneName, int x, int z)
        {
            if (LocationLabel != null)
            {
                LocationLabel.Text = $"{zoneName} ({x}, {z})";
            }
        }
    }
}

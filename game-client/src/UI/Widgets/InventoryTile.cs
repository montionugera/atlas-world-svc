using Godot;

namespace AtlasWorld.Client.UI.Widgets
{
    /// <summary>
    /// A single inventory item: a Card with a rarity-coloured border, the item name, and
    /// a qty/equip affordance. Unique items emit <see cref="TilePressedEventHandler"/> with
    /// their instanceId so the panel can drive <c>equip_item</c>.
    /// </summary>
    public sealed partial class InventoryTile : PanelContainer
    {
        [Signal] public delegate void TilePressedEventHandler(string instanceId);

        private readonly string _itemId;
        private readonly string? _instanceId;
        private readonly int _qty;

        public InventoryTile(string itemId, string? instanceId, int qty)
        {
            _itemId = itemId;
            _instanceId = instanceId;
            _qty = qty;
        }

        public override void _Ready()
        {
            ThemeTypeVariation = Design.Variants.Card;
            CustomMinimumSize = new Vector2(140, 84);

            // Rarity border via a per-instance StyleBoxFlat cloned from the Card look.
            Design.Rarity rarity = Design.RarityForKind(Catalog.ItemsById.TryGetValue(_itemId, out ItemDef? d) ? d.Kind : null);
            var box = new StyleBoxFlat
            {
                BgColor = Design.Colors.SurfaceVariant,
                CornerRadiusTopLeft = Design.Radius.R2,
                CornerRadiusTopRight = Design.Radius.R2,
                CornerRadiusBottomLeft = Design.Radius.R2,
                CornerRadiusBottomRight = Design.Radius.R2,
                BorderColor = Design.RarityColor(rarity),
            };
            box.SetBorderWidthAll(2);
            box.SetContentMarginAll(Design.Space.S3);
            AddThemeStyleboxOverride("panel", box);

            var col = new VBoxContainer();
            col.AddThemeConstantOverride("separation", Design.Space.S1);
            AddChild(col);

            var name = new Label
            {
                Text = Catalog.ItemName(_itemId),
                ThemeTypeVariation = Design.Variants.Body,
                AutowrapMode = TextServer.AutowrapMode.WordSmart,
            };
            col.AddChild(name);

            string sub = _instanceId != null
                ? (Catalog.SlotForItem(_itemId) is string slot ? $"equip → {slot}" : "unique")
                : $"x{_qty}";
            var meta = new Label { Text = sub, ThemeTypeVariation = Design.Variants.Caption };
            col.AddChild(meta);

            // Only unique + equippable items are interactive.
            if (_instanceId != null && Catalog.SlotForItem(_itemId) != null)
            {
                MouseDefaultCursorShape = CursorShape.PointingHand;
                GuiInput += OnGuiInput;
            }
        }

        private void OnGuiInput(InputEvent ev)
        {
            if (ev is InputEventMouseButton { Pressed: true, ButtonIndex: MouseButton.Left } && _instanceId != null)
                EmitSignal(SignalName.TilePressed, _instanceId);
        }
    }
}

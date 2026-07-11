using System.Collections.Generic;
using Godot;
using AtlasWorld.Contracts.Meta;
using AtlasWorld.Client.Meta;
using AtlasWorld.Client.UI.Widgets;

namespace AtlasWorld.Client.UI.Panels
{
    /// <summary>
    /// Inventory screen: the three equip slots (weapon/armor/accessory) plus a responsive
    /// grid of owned items with rarity-coloured borders. Tapping a unique equippable item
    /// fires <c>equip_item</c> with {slot, instanceId} — slot is inferred from the item
    /// kind (SlotPicker fallback would go here if a kind mapped to multiple slots).
    /// </summary>
    public sealed partial class InventoryPanel : MetaPanel
    {
        private GridContainer _grid = null!;
        private Label _slotWeapon = null!;
        private Label _slotArmor = null!;
        private Label _slotAccessory = null!;

        private InventoryDoc _inventory = new() { stackables = new(), uniques = new() };
        private EquipmentDoc _equipment = new() { slots = new EquipmentDoc_Slots() };
        private readonly Dictionary<string, string> _instanceToItem = new();

        protected override void OnPanelReady()
        {
            AddTitle("Inventory");

            var slots = new PanelContainer { ThemeTypeVariation = Design.Variants.Well };
            Content.AddChild(slots);
            var slotRow = new HBoxContainer();
            slotRow.AddThemeConstantOverride("separation", Design.Space.S5);
            slots.AddChild(slotRow);
            slotRow.AddChild(SlotColumn("Weapon", out _slotWeapon));
            slotRow.AddChild(SlotColumn("Armor", out _slotArmor));
            slotRow.AddChild(SlotColumn("Accessory", out _slotAccessory));

            Content.AddChild(new Label { Text = "Items", ThemeTypeVariation = Design.Variants.Subheading });

            _grid = new GridContainer { Columns = 3, SizeFlagsHorizontal = SizeFlags.ExpandFill };
            _grid.AddThemeConstantOverride("h_separation", Design.Space.S3);
            _grid.AddThemeConstantOverride("v_separation", Design.Space.S3);
            Content.AddChild(_grid);
        }

        public override void Refresh()
        {
            Gateway?.RequestDoc(MetaIds.Collections.Inventory);
            Gateway?.RequestDoc(MetaIds.Collections.Equipment);
        }

        /// <summary>Responsive column count from the viewport width (called by the shell).</summary>
        public void SetColumns(int columns)
        {
            if (_grid != null) _grid.Columns = Mathf.Max(1, columns);
        }

        protected override void OnDocLoaded(string collection, string json, bool ok)
        {
            if (collection == MetaIds.Collections.Inventory)
            {
                _inventory = MetaJson.ParseInventoryOrDefault(json);
                RenderGrid();
            }
            else if (collection == MetaIds.Collections.Equipment)
            {
                _equipment = MetaJson.ParseEquipmentOrDefault(json);
                RenderSlots();
            }
        }

        protected override void OnRpcResult(string rpcId, string payload, bool ok, string error)
        {
            if (rpcId != MetaIds.Rpc.EquipItem) return;
            if (ok)
            {
                EquipmentDoc? updated = MetaJson.Parse<EquipmentDoc>(payload);
                if (updated != null)
                {
                    updated.slots ??= new EquipmentDoc_Slots();
                    _equipment = updated;
                    RenderSlots();
                    Toast.Show(this, "Equipped", Toast.Kind.Success);
                }
            }
            else
            {
                Toast.Show(this, $"Equip failed: {error}", Toast.Kind.Danger);
            }
        }

        private void RenderGrid()
        {
            foreach (Node child in _grid.GetChildren()) child.QueueFree();
            _instanceToItem.Clear();

            foreach (InventoryDoc_UniqueItem u in _inventory.uniques)
            {
                _instanceToItem[u.instanceId] = u.itemId;
                var tile = new InventoryTile(u.itemId, u.instanceId, 1);
                tile.TilePressed += OnEquip;
                _grid.AddChild(tile);
            }
            foreach (InventoryDoc_StackableItem s in _inventory.stackables)
                _grid.AddChild(new InventoryTile(s.itemId, null, (int)s.qty));

            if (_inventory.uniques.Count == 0 && _inventory.stackables.Count == 0)
                _grid.AddChild(new Label { Text = "(no items yet)", ThemeTypeVariation = Design.Variants.Caption });
        }

        private void RenderSlots()
        {
            EquipmentDoc_Slots s = _equipment.slots ?? new EquipmentDoc_Slots();
            _slotWeapon.Text = ResolveSlot(s.weapon);
            _slotArmor.Text = ResolveSlot(s.armor);
            _slotAccessory.Text = ResolveSlot(s.accessory);
        }

        private string ResolveSlot(string? instanceId)
        {
            if (string.IsNullOrEmpty(instanceId)) return "—";
            // Equipment stores an instanceId; resolve back to a display name via inventory.
            if (_instanceToItem.TryGetValue(instanceId, out string? itemId))
                return Catalog.ItemName(itemId);
            return instanceId[..System.Math.Min(6, instanceId.Length)];
        }

        private void OnEquip(string instanceId)
        {
            if (!_instanceToItem.TryGetValue(instanceId, out string? itemId)) return;
            string? slot = Catalog.SlotForItem(itemId);
            if (slot == null) return;
            Gateway?.Rpc(MetaIds.Rpc.EquipItem,
                $"{{\"slot\":\"{slot}\",\"instanceId\":\"{instanceId}\"}}");
        }

        private static Control SlotColumn(string label, out Label value)
        {
            var col = new VBoxContainer { SizeFlagsHorizontal = SizeFlags.ExpandFill };
            col.AddThemeConstantOverride("separation", Design.Space.S1);
            col.AddChild(new Label { Text = label, ThemeTypeVariation = Design.Variants.Caption });
            value = new Label { Text = "—", ThemeTypeVariation = Design.Variants.Body };
            col.AddChild(value);
            return col;
        }
    }
}

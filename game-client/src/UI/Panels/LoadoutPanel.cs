using System.Collections.Generic;
using System.Linq;
using Godot;
using AtlasWorld.Contracts.Meta;
using AtlasWorld.Client.Meta;

namespace AtlasWorld.Client.UI.Panels
{
    /// <summary>
    /// Read-only derived-stats summary. IMPORTANT: <c>get_loadout</c> is S2S-only and
    /// MUST NOT be called by a client session (Nakama throws). This panel therefore
    /// assembles the view from the player's OWN storage docs (profile + equipment +
    /// inventory) and computes derived stats with the pinned client-side formula.
    /// </summary>
    public sealed partial class LoadoutPanel : MetaPanel
    {
        private VBoxContainer _stats = null!;

        private ProfileDoc _profile = MetaJson.DefaultProfile();
        private EquipmentDoc _equipment = new() { slots = new EquipmentDoc_Slots() };
        private readonly Dictionary<string, string> _instanceToItem = new();

        protected override void OnPanelReady()
        {
            AddTitle("Loadout");
            Content.AddChild(new Label
            {
                Text = "Derived from your profile + equipment (read-only).",
                ThemeTypeVariation = Design.Variants.Caption,
            });
            _stats = new VBoxContainer { SizeFlagsHorizontal = SizeFlags.ExpandFill };
            _stats.AddThemeConstantOverride("separation", Design.Space.S2);
            Content.AddChild(_stats);
        }

        public override void Refresh()
        {
            Gateway?.RequestDoc(MetaIds.Collections.Profile);
            Gateway?.RequestDoc(MetaIds.Collections.Equipment);
            Gateway?.RequestDoc(MetaIds.Collections.Inventory);
        }

        protected override void OnDocLoaded(string collection, string json, bool ok)
        {
            switch (collection)
            {
                case MetaIds.Collections.Profile: _profile = MetaJson.ParseProfileOrDefault(json); break;
                case MetaIds.Collections.Equipment: _equipment = MetaJson.ParseEquipmentOrDefault(json); break;
                case MetaIds.Collections.Inventory:
                    _instanceToItem.Clear();
                    foreach (InventoryDoc_UniqueItem u in MetaJson.ParseInventoryOrDefault(json).uniques)
                        _instanceToItem[u.instanceId] = u.itemId;
                    break;
                default: return;
            }
            Render();
        }

        private void Render()
        {
            foreach (Node child in _stats.GetChildren()) child.QueueFree();

            string? weaponInstance = _equipment.slots?.weapon;
            string? weaponItemId = weaponInstance != null && _instanceToItem.TryGetValue(weaponInstance, out string? id) ? id : null;

            PrimaryStats a = _profile.allocated ?? new PrimaryStats();
            var d = MetaFormulas.Derived((int)_profile.level, a.str, a.agi, a.@int, a.vit, weaponItemId);

            Row("Weapon", weaponItemId != null ? Catalog.ItemName(weaponItemId) : "—");
            Row("Max Health", d.maxHealth.ToString());
            Row("Physical Atk", d.pAtk.ToString());
            Row("Magic Atk", d.mAtk.ToString());
            Row("Physical Def", d.pDef.ToString());
            Row("Magic Def", d.mDef.ToString());
            Row("Move Speed", d.maxMoveSpeed.ToString("0.0"));
        }

        private void Row(string label, string value)
        {
            var row = new HBoxContainer();
            row.AddChild(new Label { Text = label, ThemeTypeVariation = Design.Variants.Body, SizeFlagsHorizontal = SizeFlags.ExpandFill });
            row.AddChild(new Label { Text = value, ThemeTypeVariation = Design.Variants.Value });
            _stats.AddChild(row);
        }
    }
}

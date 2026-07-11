using Godot;

namespace AtlasWorld.Client.UI.Widgets
{
    /// <summary>
    /// A skill entry with an equipped toggle. The panel enforces the loadout cap (4) and
    /// drives <c>set_skill_loadout</c>; this tile only reflects state + emits toggles.
    /// </summary>
    public sealed partial class SkillTile : PanelContainer
    {
        [Signal] public delegate void ToggledSkillEventHandler(string skillId, bool equipped);

        private readonly string _skillId;
        private readonly int _level;
        private bool _equipped;
        private Button _toggle = null!;

        public SkillTile(string skillId, int level, bool equipped)
        {
            _skillId = skillId;
            _level = level;
            _equipped = equipped;
        }

        public override void _Ready()
        {
            ThemeTypeVariation = Design.Variants.Card;
            var row = new HBoxContainer();
            row.AddThemeConstantOverride("separation", Design.Space.S3);
            AddChild(row);

            var info = new VBoxContainer { SizeFlagsHorizontal = SizeFlags.ExpandFill };
            row.AddChild(info);
            info.AddChild(new Label { Text = Catalog.SkillName(_skillId), ThemeTypeVariation = Design.Variants.Body });
            info.AddChild(new Label { Text = $"Lv {_level}", ThemeTypeVariation = Design.Variants.Caption });

            _toggle = new Button { CustomMinimumSize = new Vector2(96, 36) };
            _toggle.Pressed += () =>
            {
                _equipped = !_equipped;
                EmitSignal(SignalName.ToggledSkill, _skillId, _equipped);
            };
            row.AddChild(_toggle);
            Refresh();
        }

        public void SetEquipped(bool equipped)
        {
            _equipped = equipped;
            if (_toggle != null) Refresh();
        }

        private void Refresh()
        {
            _toggle.Text = _equipped ? "Equipped" : "Equip";
            _toggle.ThemeTypeVariation = _equipped
                ? Design.Variants.PrimaryButton
                : Design.Variants.GhostButton;
        }
    }
}

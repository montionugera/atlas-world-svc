using Godot;

namespace AtlasWorld.Client.UI.Widgets
{
    /// <summary>
    /// One allocatable primary stat: "Label …… value [ + ]". The "+" is a PrimaryButton
    /// (design-system variant). Emits <see cref="AddPressedEventHandler"/> with the stat
    /// key; the panel owns the optimistic allocate + rollback.
    /// </summary>
    public sealed partial class StatRow : HBoxContainer
    {
        [Signal] public delegate void AddPressedEventHandler(string statKey);

        private readonly string _statKey;
        private readonly string _label;
        private Label _value = null!;
        private Button _add = null!;

        public StatRow(string statKey, string label)
        {
            _statKey = statKey;
            _label = label;
        }

        public override void _Ready()
        {
            AddThemeConstantOverride("separation", Design.Space.S3);
            SizeFlagsHorizontal = SizeFlags.ExpandFill;

            var name = new Label { Text = _label, ThemeTypeVariation = Design.Variants.Body };
            name.SizeFlagsHorizontal = SizeFlags.ExpandFill;
            name.VerticalAlignment = VerticalAlignment.Center;
            AddChild(name);

            _value = new Label
            {
                Text = "0",
                ThemeTypeVariation = Design.Variants.Value,
                CustomMinimumSize = new Vector2(48, 0),
                HorizontalAlignment = HorizontalAlignment.Right,
                VerticalAlignment = VerticalAlignment.Center,
            };
            AddChild(_value);

            _add = new Button
            {
                Text = "+",
                ThemeTypeVariation = Design.Variants.PrimaryButton,
                CustomMinimumSize = new Vector2(44, 36),
                Name = $"add_{_statKey}",
            };
            _add.Pressed += () => EmitSignal(SignalName.AddPressed, _statKey);
            AddChild(_add);
        }

        public void UpdateValue(int value, bool canAdd)
        {
            _value.Text = value.ToString();
            _add.Disabled = !canAdd;
        }
    }
}

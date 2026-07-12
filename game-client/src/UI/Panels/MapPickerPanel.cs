using System;
using Godot;

namespace AtlasWorld.Client.UI.Panels
{
    /// <summary>
    /// Compact always-visible map picker (top-left), mirroring the react debug client:
    /// radio options for the three known server maps + a Join button. Emits
    /// <see cref="JoinRequested"/> with the chosen mapId; GameRoot owns the actual
    /// room switch. Purely declarative — no networking in here.
    /// </summary>
    public sealed partial class MapPickerPanel : CanvasLayer
    {
        private static readonly (string Id, string Label)[] Maps =
        {
            ("map-for-play", "Play"),
            ("map-for-test-projectile", "Projectile"),
            ("map-for-test-deflect", "Deflect test"),
        };

        public event Action<string>? JoinRequested;

        private readonly CheckBox[] _options = new CheckBox[Maps.Length];
        private Label _current = null!;

        public override void _Ready()
        {
            Layer = 5;
            Name = "MapPickerPanel";

            // Anchored top-left; only the card itself catches the mouse.
            var root = new Control
            {
                MouseFilter = Control.MouseFilterEnum.Ignore,
                Theme = ThemeBuilder.Build(),
            };
            root.SetAnchorsPreset(Control.LayoutPreset.FullRect);
            AddChild(root);

            var card = new PanelContainer
            {
                ThemeTypeVariation = Design.Variants.Card,
                MouseFilter = Control.MouseFilterEnum.Stop,
            };
            card.SetAnchorsPreset(Control.LayoutPreset.TopLeft);
            card.OffsetLeft = Design.Space.S3;
            card.OffsetTop = Design.Space.S3;
            root.AddChild(card);

            var col = new VBoxContainer();
            col.AddThemeConstantOverride("separation", Design.Space.S2);
            card.AddChild(col);

            var title = new Label { Text = "Map" };
            title.AddThemeColorOverride("font_color", Design.Colors.TextPrimary);
            col.AddChild(title);

            var group = new ButtonGroup();
            for (int i = 0; i < Maps.Length; i++)
            {
                var opt = new CheckBox { Text = Maps[i].Label, ButtonGroup = group };
                _options[i] = opt;
                col.AddChild(opt);
            }
            _options[0].ButtonPressed = true;

            var join = new Button
            {
                Text = "Join",
                ThemeTypeVariation = Design.Variants.PrimaryButton,
            };
            join.Pressed += OnJoinPressed;
            col.AddChild(join);

            _current = new Label { Text = "current: —" };
            _current.AddThemeColorOverride("font_color", Design.Colors.TextMuted);
            col.AddChild(_current);
        }

        private void OnJoinPressed()
        {
            for (int i = 0; i < _options.Length; i++)
            {
                if (_options[i].ButtonPressed)
                {
                    JoinRequested?.Invoke(Maps[i].Id);
                    return;
                }
            }
        }

        /// <summary>Reflect the live room's map (called by GameRoot on every connect).</summary>
        public void SetCurrent(string mapId)
        {
            _current.Text = $"current: {mapId}";
            for (int i = 0; i < Maps.Length; i++)
                _options[i].ButtonPressed = Maps[i].Id == mapId;
        }
    }
}

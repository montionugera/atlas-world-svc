using Godot;

namespace AtlasWorld.Client.UI.Widgets
{
    /// <summary>
    /// Transient feedback banner. Shown for errors (rollback messages) and successes
    /// (claimed reward). Self-removes after a short delay.
    /// </summary>
    public sealed partial class Toast : PanelContainer
    {
        public enum Kind { Info, Success, Danger }

        public static void Show(Node parent, string message, Kind kind = Kind.Info)
        {
            var toast = new Toast(message, kind);
            parent.AddChild(toast);
        }

        private readonly string _message;
        private readonly Kind _kind;

        private Toast(string message, Kind kind)
        {
            _message = message;
            _kind = kind;
        }

        public override void _Ready()
        {
            SetAnchorsPreset(LayoutPreset.CenterBottom);
            Position = new Vector2(0, -80);

            Color accent = _kind switch
            {
                Kind.Success => Design.Colors.Success,
                Kind.Danger => Design.Colors.Danger,
                _ => Design.Colors.Border,
            };
            var box = new StyleBoxFlat
            {
                BgColor = Design.Colors.Surface,
                CornerRadiusTopLeft = Design.Radius.R1,
                CornerRadiusTopRight = Design.Radius.R1,
                CornerRadiusBottomLeft = Design.Radius.R1,
                CornerRadiusBottomRight = Design.Radius.R1,
                BorderColor = accent,
            };
            box.SetBorderWidthAll(1);
            box.SetContentMarginAll(Design.Space.S3);
            AddThemeStyleboxOverride("panel", box);

            AddChild(new Label { Text = _message, ThemeTypeVariation = Design.Variants.Body });

            SceneTreeTimer t = GetTree().CreateTimer(2.5);
            t.Timeout += QueueFree;
        }
    }
}

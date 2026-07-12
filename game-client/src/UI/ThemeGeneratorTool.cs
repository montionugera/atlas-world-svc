using Godot;

namespace AtlasWorld.Client.UI
{
    /// <summary>
    /// Headless generator that materialises the token-built <see cref="Theme"/> to
    /// <c>res://ui/atlas_theme.tres</c> as an inspectable artifact, then quits. Run with:
    /// <c>Godot --headless --path game-client res://scenes/tools/GenerateTheme.tscn</c>.
    /// The runtime UI does NOT depend on this file existing — <see cref="Panels.MetaShell"/>
    /// applies <see cref="ThemeBuilder.Build"/> directly — this is purely for verification /
    /// editor inspection.
    /// </summary>
    public sealed partial class ThemeGeneratorTool : Node
    {
        public const string OutputPath = "res://ui/atlas_theme.tres";

        public override void _Ready()
        {
            Theme theme = ThemeBuilder.Build();
            Error err = ResourceSaver.Save(theme, OutputPath);
            if (err == Error.Ok)
                GD.Print($"[ThemeGenerator] saved {OutputPath} OK");
            else
                GD.PushError($"[ThemeGenerator] save failed: {err}");
            GetTree().Quit(err == Error.Ok ? 0 : 1);
        }
    }
}

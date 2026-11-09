using System;
using Godot;

namespace AtlasWorld.Client.UI.Widgets
{
    /// <summary>
    /// Lightweight diagnostics HUD for the Maro Bell POC-00 baseline (F-205).
    /// Displays authoritative room mapId, 3D world coordinates, 2D server simulation
    /// coordinates, connection state, frame time (ms), and active POC beat.
    /// </summary>
    public sealed partial class MaroBellPocDiagnosticsHud : CanvasLayer
    {
        public string MapId { get; private set; } = "maro-bell";
        public string ActiveBeat { get; private set; } = "POC-00";
        public Vector3 WorldPosition { get; private set; }
        public Vector2 ServerPosition { get; private set; }
        public bool IsServerConnected { get; private set; }
        public float FrameTimeMs { get; private set; }

        private PanelContainer? _panel;
        private Label? _label;

        public override void _Ready()
        {
            Layer = 15;

            _panel = new PanelContainer
            {
                Name = "PocDiagnosticsPanel",
                CustomMinimumSize = new Vector2(320, 96),
            };
            _panel.SetAnchorsPreset(Control.LayoutPreset.TopRight);
            _panel.Position = new Vector2(-340, 16);

            var style = new StyleBoxFlat
            {
                BgColor = new Color(0.06f, 0.08f, 0.11f, 0.85f),
                BorderColor = new Color(0.28f, 0.42f, 0.56f, 0.75f),
                BorderWidthLeft = 1,
                BorderWidthTop = 1,
                BorderWidthRight = 1,
                BorderWidthBottom = 1,
                CornerRadiusTopLeft = 4,
                CornerRadiusTopRight = 4,
                CornerRadiusBottomLeft = 4,
                CornerRadiusBottomRight = 4,
                ContentMarginLeft = 10,
                ContentMarginTop = 8,
                ContentMarginRight = 10,
                ContentMarginBottom = 8,
            };
            _panel.AddThemeStyleboxOverride("panel", style);

            _label = new Label
            {
                Name = "DiagnosticsLabel",
                Text = FormatDiagnosticsSummary(MapId, WorldPosition, ServerPosition, IsServerConnected, FrameTimeMs, ActiveBeat),
            };
            _label.AddThemeFontSizeOverride("font_size", 11);
            _label.AddThemeColorOverride("font_color", new Color(0.92f, 0.95f, 0.98f));

            _panel.AddChild(_label);
            AddChild(_panel);
        }

        public static string FormatDiagnosticsSummary(
            string mapId,
            Vector3 worldPos,
            Vector2 serverPos,
            bool connected,
            float frameTimeMs,
            string activeBeat)
        {
            string conn = connected ? "Connected" : "Offline";
            return $"[{mapId}] Beat: {activeBeat}\n" +
                   $"World: ({worldPos.X:F1}, {worldPos.Y:F1}, {worldPos.Z:F1}) | Server: ({serverPos.X:F1}, {serverPos.Y:F1})\n" +
                   $"Net: {conn} | Frame: {frameTimeMs:F1}ms\n" +
                   $"Contract: 1u=1m | 20Hz | 35°";
        }

        public void UpdateDiagnostics(
            string mapId,
            Vector3 worldPos,
            Vector2 serverCenter,
            bool connected,
            double deltaSec,
            string activeBeat = "POC-00")
        {
            MapId = mapId;
            ActiveBeat = activeBeat;
            WorldPosition = worldPos;
            ServerPosition = new Vector2(serverCenter.X + worldPos.X, serverCenter.Y + worldPos.Z);
            IsServerConnected = connected;
            FrameTimeMs = (float)(deltaSec * 1000.0);

            if (_label != null)
            {
                _label.Text = FormatDiagnosticsSummary(MapId, WorldPosition, ServerPosition, IsServerConnected, FrameTimeMs, ActiveBeat);
            }
        }
    }
}

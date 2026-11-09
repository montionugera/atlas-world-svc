using Godot;

namespace AtlasWorld.Client
{
    /// <summary>F-197: a distinct Dock/window icon and title for the game vs the playtest sandbox.</summary>
    public static class WindowBadge
    {
        public static readonly Color GameColor = new Color(0.16f, 0.42f, 0.86f);
        public static readonly Color SandboxColor = new Color(0.95f, 0.50f, 0.10f);

        /// <summary>128x128: colour tile, white emblem (diamond = game, square = sandbox).</summary>
        public static Image MakeIcon(bool sandbox)
        {
            const int n = 128;
            var img = Image.CreateEmpty(n, n, false, Image.Format.Rgba8);
            Color bg = sandbox ? SandboxColor : GameColor;
            for (int y = 0; y < n; y++)
            for (int x = 0; x < n; x++)
            {
                float dx = Mathf.Abs(x - n / 2f), dy = Mathf.Abs(y - n / 2f);
                bool inTile = dx < 60f && dy < 60f && (dx + dy) < 108f;
                bool emblem = sandbox ? (dx < 26f && dy < 26f) : (dx + dy < 36f);
                img.SetPixel(x, y, !inTile ? new Color(0, 0, 0, 0) : emblem ? Colors.White : bg);
            }
            return img;
        }

        public static void Apply(bool sandbox)
        {
            if (OS.GetEnvironment("ATLAS_VERIFY_WINDOW_BADGE") == "1")
            {
                Image a = MakeIcon(false), b = MakeIcon(true);
                bool ok = a.GetPixel(64, 20) != b.GetPixel(64, 20) && a.GetData() != b.GetData();
                GD.Print(ok ? "[WindowBadge] VERDICT PASS" : "[WindowBadge] VERDICT FAIL");
                return;
            }
            DisplayServer.WindowSetTitle(sandbox ? "Atlas - SANDBOX" : "Atlas - GAME");
            DisplayServer.SetIcon(MakeIcon(sandbox));
        }
    }
}

using System;
using Godot;

namespace AtlasWorld.Client
{
    /// <summary>F-197: a distinct Dock/window icon and title for the game vs the playtest sandbox.</summary>
    public static class WindowBadge
    {
        public static readonly Color GameColor = new Color(0.16f, 0.42f, 0.86f);
        public static readonly Color SandboxColor = new Color(0.95f, 0.50f, 0.10f);

        /// <summary>Loads the macOS squircle artwork icon (res://icon_sandbox.png vs res://icon.png), with .pck and procedural fallbacks.</summary>
        public static Image MakeIcon(bool sandbox)
        {
            string resPath = sandbox ? "res://icon_sandbox.png" : "res://icon.png";
            string absPath = ProjectSettings.GlobalizePath(resPath);
            if (System.IO.File.Exists(absPath))
            {
                var loaded = Image.LoadFromFile(absPath);
                if (loaded != null && !loaded.IsEmpty())
                {
                    return loaded;
                }
            }

            if (ResourceLoader.Exists(resPath, nameof(Texture2D)))
            {
                var texImg = GD.Load<Texture2D>(resPath)?.GetImage();
                if (texImg != null && !texImg.IsEmpty())
                {
                    return texImg;
                }
            }

            const int n = 128;
            var img = Image.CreateEmpty(n, n, false, Image.Format.Rgba8);
            Color bg = sandbox ? SandboxColor : GameColor;
            for (int y = 0; y < n; y++)
            for (int x = 0; y < n; x++)
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
                Color pa = a.GetPixel(a.GetWidth() / 2, (a.GetHeight() * 3) / 10);
                Color pb = b.GetPixel(b.GetWidth() / 2, (b.GetHeight() * 3) / 10);
                bool ok = pa != pb && !a.GetData().AsSpan().SequenceEqual(b.GetData());
                GD.Print(ok ? "[WindowBadge] VERDICT PASS" : "[WindowBadge] VERDICT FAIL");
                (Engine.GetMainLoop() as SceneTree)?.Quit(ok ? 0 : 1);
                return;
            }
            DisplayServer.WindowSetTitle(sandbox ? "Atlas - SANDBOX" : "Atlas - GAME");
            DisplayServer.SetIcon(MakeIcon(sandbox));
        }
    }
}

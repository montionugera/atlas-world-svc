using Godot;

namespace AtlasWorld.Client.Audio
{
    /// <summary>
    /// Headless self-check for the positional combat-SFX PoC. Audio can't be "heard"
    /// headless, so this asserts the OBSERVABLE contract instead: <see cref="AudioRegistry"/>
    /// resolves each mapped event key to a real <see cref="AudioStream"/>, <see cref="AudioRegistry.Play"/>
    /// spawns a positioned, playing <see cref="AudioStreamPlayer3D"/> with that stream, and
    /// an unknown key no-ops without throwing. Follows the project's env-gated probe
    /// pattern: <c>GameRoot</c> runs this when <c>ATLAS_VERIFY_SFX=1</c>, prints per-case
    /// <c>PASS</c>/<c>FAIL</c> lines and a verdict, and returns a process exit code
    /// (0 = all pass, 1 = any fail).
    /// </summary>
    public static class AudioVerify
    {
        public static int Run()
        {
            GD.Print("[AudioVerify] BEGIN");
            int failures = 0;

            AudioRegistry? reg = AudioRegistry.Instance;
            if (reg == null)
            {
                GD.PrintErr("[AudioVerify]   FAIL  AudioRegistry autoload not ready");
                GD.PrintErr("[AudioVerify] RESULT: FAIL (registry unavailable)");
                return 1;
            }

            // Part 1 — every mapped combat event resolves to a real, loaded stream.
            failures += ReportResolves(reg, "sfx:attack");
            failures += ReportResolves(reg, "sfx:hit");
            failures += ReportResolves(reg, "sfx:death");

            // Part 2 — Play() spawns a positioned, playing 3D one-shot carrying that stream.
            failures += ReportPlay(reg, "sfx:attack", new Vector3(3f, 0f, -2f));
            failures += ReportPlay(reg, "sfx:hit", new Vector3(-1.5f, 0f, 4f));
            failures += ReportPlay(reg, "sfx:death", new Vector3(0f, 0f, 0f));

            // Part 3 — an unknown key never throws and never spawns a player.
            int before = reg.GetChildCount();
            bool threw = false;
            AudioStreamPlayer3D? unknownResult = null;
            try
            {
                unknownResult = reg.Play("sfx:does_not_exist", Vector3.Zero);
            }
            catch
            {
                threw = true;
            }
            int after = reg.GetChildCount();
            failures += Report("unknown key never throws", !threw);
            failures += Report("unknown key returns null (no player)", unknownResult == null);
            failures += Report("unknown key spawns no child node", after == before);

            if (failures == 0)
                GD.Print("[AudioVerify] RESULT: PASS (all cases)");
            else
                GD.PrintErr($"[AudioVerify] RESULT: FAIL ({failures} case(s))");

            return failures == 0 ? 0 : 1;
        }

        private static int ReportResolves(AudioRegistry reg, string eventKey)
        {
            AudioStream? stream = reg.ResolveStream(eventKey);
            return Report($"'{eventKey}' resolves to a non-null AudioStream", stream != null);
        }

        private static int ReportPlay(AudioRegistry reg, string eventKey, Vector3 pos)
        {
            AudioStreamPlayer3D? player = reg.Play(eventKey, pos);
            bool ok = player != null &&
                      GodotObject.IsInstanceValid(player) &&
                      player.Stream != null &&
                      player.GlobalPosition.IsEqualApprox(pos) &&
                      player.Playing;
            string detail = player == null
                ? "<null>"
                : $"stream={(player.Stream != null)} pos={player.GlobalPosition} playing={player.Playing}";
            return Report($"Play('{eventKey}', {pos}) → positioned, playing 3D one-shot ({detail})", ok);
        }

        private static int Report(string name, bool ok)
        {
            GD.Print($"[AudioVerify]   {(ok ? "PASS" : "FAIL")}  {name}");
            return ok ? 0 : 1;
        }
    }
}

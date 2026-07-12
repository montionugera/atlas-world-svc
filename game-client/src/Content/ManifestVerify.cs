using Godot;

namespace AtlasWorld.Client.Content
{
    /// <summary>
    /// Headless self-check for <see cref="AssetManifest"/>. There is no xunit/nunit
    /// harness in this client, so verification follows the project's env-gated probe
    /// pattern: <c>GameRoot</c> runs this when <c>ATLAS_VERIFY_MANIFEST=1</c>, it
    /// exercises the loader against the committed fixtures under
    /// <c>res://assets/tests/</c>, prints a per-case <c>PASS</c>/<c>FAIL</c> line and a
    /// final verdict, and returns a process exit code (0 = all pass, 1 = any fail).
    /// </summary>
    public static class ManifestVerify
    {
        private const string ValidFixture = "res://assets/tests/manifest_valid.json";
        private const string PartialFixture = "res://assets/tests/manifest_partial.json";
        private const string MalformedFixture = "res://assets/tests/manifest_malformed.json";
        private const string MissingFixture = "res://assets/tests/does_not_exist.json";

        public static int Run()
        {
            GD.Print("[ManifestVerify] BEGIN");
            int failures = 0;

            // Case 1: a known id resolves (hit).
            {
                AssetManifest m = AssetManifest.Load(ValidFixture);
                bool hit = m.TryGet("mob:spear_thrower", out AssetEntry entry);
                bool ok = hit
                    && entry != null
                    && entry.Scene == "res://assets/characters/spear_thrower.glb"
                    && entry.Kind == "character"
                    && entry.License == "CC0";
                failures += Report("hit: mob:spear_thrower resolves with fields", ok);
            }

            // Case 2: an unknown id misses (false, no throw, no null-ref).
            {
                AssetManifest m = AssetManifest.Load(ValidFixture);
                bool miss = m.TryGet("mob:does_not_exist", out AssetEntry entry);
                bool ok = !miss && entry == null;
                failures += Report("miss: unknown id returns false", ok);
            }

            // Case 3: All exposes every entry.
            {
                AssetManifest m = AssetManifest.Load(ValidFixture);
                bool ok = m.All.Count == 2 && m.Version == 1;
                failures += Report("All lists all entries; version parsed", ok);
            }

            // Case 4: a well-formed but incomplete entry loads with empty defaults
            //         (defensive on missing fields — no null-ref).
            {
                AssetManifest m = AssetManifest.Load(PartialFixture);
                bool hit = m.TryGet("npc:elder", out AssetEntry entry);
                bool ok = hit
                    && entry != null
                    && entry.Scene == "res://assets/characters/elder.glb"
                    && entry.Source == ""
                    && entry.License == ""
                    && entry.Tier == ""
                    && entry.Kind == "";
                failures += Report("partial entry loads with empty-string defaults", ok);
            }

            // Case 5: malformed JSON yields a clear AssetManifestException (not null-ref).
            {
                bool threwClear = false;
                string msg = "";
                try
                {
                    AssetManifest.Load(MalformedFixture);
                }
                catch (AssetManifestException ex)
                {
                    threwClear = true;
                    msg = ex.Message;
                }
                bool ok = threwClear && msg.Contains(MalformedFixture) && msg.Length > 0;
                failures += Report($"malformed JSON throws AssetManifestException [{msg}]", ok);
            }

            // Case 6: a missing file yields a clear AssetManifestException.
            {
                bool threwClear = false;
                try
                {
                    AssetManifest.Load(MissingFixture);
                }
                catch (AssetManifestException)
                {
                    threwClear = true;
                }
                failures += Report("missing file throws AssetManifestException", threwClear);
            }

            // Case 7: the real committed manifest loads. Task 7 (Stage 0.5) mapped every
            // character key (player/npc/mob:*) to a seed asset — 8 entries — while
            // projectiles/zones stay unmapped until a later stage, so assert "at least the
            // character set" rather than an exact count that would drift with every stage.
            {
                AssetManifest m = AssetManifest.Load("res://assets/manifest.json");
                bool ok = m.Version == 1 && m.All.Count >= 8
                    && m.TryGet("player", out AssetEntry playerEntry) && playerEntry.Tier == "seed";
                failures += Report("real manifest.json loads (character keys mapped, Stage 0.5)", ok);
            }

            if (failures == 0)
                GD.Print("[ManifestVerify] RESULT: PASS (all cases)");
            else
                GD.PrintErr($"[ManifestVerify] RESULT: FAIL ({failures} case(s))");

            return failures == 0 ? 0 : 1;
        }

        private static int Report(string name, bool ok)
        {
            GD.Print($"[ManifestVerify]   {(ok ? "PASS" : "FAIL")}  {name}");
            return ok ? 0 : 1;
        }
    }
}

using System.Collections.Generic;
using Godot;
using AtlasWorld.Client.Content;

namespace AtlasWorld.Client.World
{
    /// <summary>
    /// Headless self-check for <see cref="AnimationController"/>. There is no xunit/nunit
    /// harness in this client, so verification follows the project's env-gated probe
    /// pattern: <c>GameRoot</c> runs this when <c>ATLAS_VERIFY_ANIM=1</c>, it exercises the
    /// controller against a real seed glTF (loaded through the committed manifest, so the
    /// clip names are the ACTUAL ones on the model, not a fixture), prints per-case
    /// <c>PASS</c>/<c>FAIL</c> lines and a verdict, and returns a process exit code
    /// (0 = all pass, 1 = any fail).
    ///
    /// Covers: idle/walk/sprint speed thresholds, dead → die, attacking → attack-melee-right,
    /// priority ordering (dead beats attacking beats speed), and that a missing/overridden
    /// clip name never throws.
    /// </summary>
    public static class AnimationVerify
    {
        public static int Run(Node host)
        {
            GD.Print("[AnimationVerify] BEGIN");
            int failures = 0;

            AssetRegistry? reg = AssetRegistry.Instance;
            if (reg == null)
            {
                GD.PrintErr("[AnimationVerify]   FAIL  AssetRegistry autoload not ready");
                GD.PrintErr("[AnimationVerify] RESULT: FAIL (registry unavailable)");
                return 1;
            }

            PackedScene scene = reg.Resolve(EntityKeys.Player, out ResolveTier tier);
            failures += Report($"player resolves to seed tier (tier={tier})", tier == ResolveTier.Seed);

            if (scene.Instantiate() is not Node3D modelRoot)
            {
                GD.PrintErr("[AnimationVerify]   FAIL  player scene did not instance a Node3D");
                GD.PrintErr("[AnimationVerify] RESULT: FAIL (bad instance)");
                return 1;
            }
            host.AddChild(modelRoot);

            var anim = new AnimationController(modelRoot);
            failures += Report("AnimationController found a real AnimationPlayer", anim.HasPlayer);

            // still → idle (looped)
            anim.Update(isAlive: true, velocity: Vector3.Zero, isAttacking: false);
            failures += ReportClip(modelRoot, "still → idle", "idle");

            // moving, below sprint threshold → walk
            anim.Update(isAlive: true, velocity: new Vector3(1.5f, 0f, 0f), isAttacking: false);
            failures += ReportClip(modelRoot, "moving (slow) → walk", "walk");

            // moving, above sprint threshold → sprint
            anim.Update(isAlive: true, velocity: new Vector3(12f, 0f, 0f), isAttacking: false);
            failures += ReportClip(modelRoot, "moving (fast) → sprint", "sprint");

            // attacking beats speed
            anim.Update(isAlive: true, velocity: new Vector3(12f, 0f, 0f), isAttacking: true);
            failures += ReportClip(modelRoot, "attacking (while moving) → attack-melee-right", "attack-melee-right");

            // dead beats attacking and speed
            anim.Update(isAlive: false, velocity: new Vector3(12f, 0f, 0f), isAttacking: true);
            failures += ReportClip(modelRoot, "dead (while attacking+moving) → die", "die");

            // Edge-triggered: repeating the SAME dead state does not restart the one-shot —
            // CurrentAnimation stays "die" (this also proves the no-op path doesn't throw).
            anim.Update(isAlive: false, velocity: Vector3.Zero, isAttacking: false);
            failures += ReportClip(modelRoot, "dead again (edge-trigger no-op) → still die", "die");

            modelRoot.QueueFree();

            // A clip override that names a nonexistent animation must never throw — it warns
            // once and leaves that frame's animation state untouched.
            {
                var overrideMap = new Dictionary<string, string> { ["idle"] = "definitely_not_a_real_clip" };
                if (scene.Instantiate() is not Node3D brokenModel)
                {
                    failures += Report("missing-clip fixture instantiated", false);
                }
                else
                {
                    host.AddChild(brokenModel);
                    var brokenAnim = new AnimationController(brokenModel, overrideMap);
                    bool threw = false;
                    try
                    {
                        brokenAnim.Update(isAlive: true, velocity: Vector3.Zero, isAttacking: false);
                    }
                    catch
                    {
                        threw = true;
                    }
                    failures += Report("missing/overridden clip never throws", !threw);
                    brokenModel.QueueFree();
                }
            }

            if (failures == 0)
                GD.Print("[AnimationVerify] RESULT: PASS (all cases)");
            else
                GD.PrintErr($"[AnimationVerify] RESULT: FAIL ({failures} case(s))");

            return failures == 0 ? 0 : 1;
        }

        private static int ReportClip(Node3D modelRoot, string label, string expectedClip)
        {
            AnimationPlayer? player = FindPlayer(modelRoot);
            bool ok = player != null && player.IsPlaying() && player.CurrentAnimation == expectedClip;
            string got = player?.CurrentAnimation ?? "<no player>";
            return Report($"{label} (CurrentAnimation={got}, IsPlaying={player?.IsPlaying()})", ok);
        }

        private static AnimationPlayer? FindPlayer(Node node)
        {
            if (node is AnimationPlayer player)
                return player;
            foreach (Node child in node.GetChildren())
            {
                AnimationPlayer? found = FindPlayer(child);
                if (found != null)
                    return found;
            }
            return null;
        }

        private static int Report(string name, bool ok)
        {
            GD.Print($"[AnimationVerify]   {(ok ? "PASS" : "FAIL")}  {name}");
            return ok ? 0 : 1;
        }
    }
}

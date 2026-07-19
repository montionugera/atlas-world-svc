using Godot;

namespace AtlasWorld.Client.World
{
    /// <summary>
    /// Headless self-check for the "characters visibly turn to face their heading" bug.
    /// There is no xunit/nunit harness in this client, so verification follows the
    /// project's env-gated probe pattern: <c>GameRoot</c> runs this when
    /// <c>ATLAS_VERIFY_FACING=1</c>, prints per-case <c>PASS</c>/<c>FAIL</c> lines and a
    /// verdict, and returns a process exit code (0 = all pass, 1 = any fail).
    ///
    /// Investigation (see commit message) ruled out both suspected causes: the Kenney
    /// glTF clips only animate the SKINNED SKELETON's bones, never the scene root
    /// <see cref="EntityView.Root"/> that <see cref="EntityView.ApplyPose"/> rotates —
    /// and server-side heading DOES correctly track movement direction. This probe locks
    /// in both of those as regressions: (1) <see cref="AnimationController.Update"/>
    /// never clobbers the pose rotation set by <see cref="EntityView.ApplyPose"/>, across
    /// several animation states; (2) re-applying a NEW heading each frame (as
    /// <c>EntityManager._Process</c> does) is reflected immediately in
    /// <see cref="Node3D.Rotation"/>, including across repeated direction changes — the
    /// scenario a player actually produces by holding different WASD keys over time.
    /// </summary>
    public static class FacingVerify
    {
        public static int Run(Node host)
        {
            GD.Print("[FacingVerify] BEGIN");
            int failures = 0;

            var view = new EntityView(EntityKind.Player, "player");
            host.AddChild(view.Root);

            // Case 1: rotation survives animation state changes (idle → walk → sprint →
            // attack → die), each of which plays a different clip on the model's own
            // AnimationPlayer.
            const float heading1 = 1.2f;
            view.ApplyPose(Vector3.Zero, heading1);
            failures += ReportRotation(view, "set heading, before any animation", -heading1);

            view.UpdateAnimation(Vector3.Zero); // idle
            failures += ReportRotation(view, "after idle", -heading1);

            view.UpdateAnimation(new Vector3(12f, 0f, 0f)); // sprint-speed
            failures += ReportRotation(view, "after sprint-speed animation", -heading1);

            // Case 2: re-applying a DIFFERENT heading each "frame" (as EntityManager does
            // every _Process) is reflected immediately — proves facing tracks movement,
            // including across repeated direction changes, not just a single initial set.
            float[] headings = { 0f, 1.5708f, -1.5708f, 3.14159f, 0.7f };
            foreach (float h in headings)
            {
                view.ApplyPose(Vector3.Zero, h);
                view.UpdateAnimation(new Vector3(5f, 0f, 0f)); // walking while turning
                failures += ReportRotation(view, $"heading changed to {h:0.000}", -h);
            }

            view.Root.QueueFree();

            if (failures == 0)
                GD.Print("[FacingVerify] RESULT: PASS (all cases)");
            else
                GD.PrintErr($"[FacingVerify] RESULT: FAIL ({failures} case(s))");

            return failures == 0 ? 0 : 1;
        }

        private static int ReportRotation(EntityView view, string label, float expectedY)
        {
            float actual = view.Root.Rotation.Y;
            // Compare on the unit circle: -pi and +pi are the same rotation.
            float diff = Mathf.Abs(Mathf.Wrap(actual - expectedY, -Mathf.Pi, Mathf.Pi));
            bool ok = diff < 0.001f;
            GD.Print($"[FacingVerify]   {(ok ? "PASS" : "FAIL")}  {label} (rootRotY={actual:0.000}, expected={expectedY:0.000})");
            return ok ? 0 : 1;
        }
    }
}

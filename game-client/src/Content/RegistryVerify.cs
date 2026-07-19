using Godot;
using AtlasWorld.Client.World;

namespace AtlasWorld.Client.Content
{
    /// <summary>
    /// Headless self-check for <see cref="AssetRegistry"/>. There is no xunit/nunit harness
    /// in this client, so verification follows the project's env-gated probe pattern:
    /// <c>GameRoot</c> runs this when <c>ATLAS_VERIFY_REGISTRY=1</c>, it exercises the
    /// three-tier resolver against committed fixtures under <c>res://assets/tests/</c>,
    /// prints a per-case <c>PASS</c>/<c>FAIL</c> line and a final verdict, and returns a
    /// process exit code (0 = all pass, 1 = any fail).
    ///
    /// Covers the four resolution outcomes: bespoke hit, seed hit, broken path → capsule,
    /// unknown id → capsule — plus that the capsule tier actually instances the reused
    /// <see cref="EntityVisuals"/> primitive and that resolution never throws.
    /// </summary>
    public static class RegistryVerify
    {
        private const string Fixture = "res://assets/tests/registry_fixture.json";

        public static int Run()
        {
            GD.Print("[RegistryVerify] BEGIN");
            int failures = 0;

            var registry = new AssetRegistry();
            registry.LoadManifest(Fixture);

            // Case 1: a bespoke entry whose scene loads → returns it, tier=Bespoke.
            {
                PackedScene scene = registry.Resolve("mob:bespoke_hit", out ResolveTier tier);
                bool ok = scene != null && tier == ResolveTier.Bespoke && CanInstance(scene);
                failures += Report("bespoke hit → loads scene, tier=Bespoke", ok);
            }

            // Case 2: a seed entry whose scene loads → returns it, tier=Seed.
            {
                PackedScene scene = registry.Resolve("mob:seed_hit", out ResolveTier tier);
                bool ok = scene != null && tier == ResolveTier.Seed && CanInstance(scene);
                failures += Report("seed hit → loads scene, tier=Seed", ok);
            }

            // Case 3: an entry pointing at a missing res:// path → capsule + warning, no throw.
            {
                PackedScene scene = registry.Resolve("mob:broken_path", out ResolveTier tier);
                bool ok = scene != null && tier == ResolveTier.Capsule && CapsuleHasBody(scene);
                failures += Report("broken path → capsule fallback (no throw)", ok);
            }

            // Case 4: an id absent from the manifest → capsule + warning, no throw.
            {
                PackedScene scene = registry.Resolve("mob:never_declared", out ResolveTier tier);
                bool ok = scene != null && tier == ResolveTier.Capsule && CapsuleHasBody(scene);
                failures += Report("unknown id → capsule fallback (no throw)", ok);
            }

            // Case 5: the capsule tier maps key form → primitive kind (player capsule).
            {
                PackedScene scene = registry.Resolve("player", out ResolveTier tier);
                bool ok = scene != null && tier == ResolveTier.Capsule && CapsuleHasBody(scene);
                failures += Report("player → capsule tier instances a body", ok);
            }

            // Case 6: resolution is total even with a broken manifest — everything → capsule.
            {
                var empty = new AssetRegistry();
                empty.LoadManifest("res://assets/tests/does_not_exist.json"); // logs, does not throw
                PackedScene scene = empty.Resolve("mob:anything", out ResolveTier tier);
                bool ok = scene != null && tier == ResolveTier.Capsule && CapsuleHasBody(scene);
                empty.Free();
                failures += Report("missing manifest → registry still resolves to capsule", ok);
            }

            registry.Free();

            if (failures == 0)
                GD.Print("[RegistryVerify] RESULT: PASS (all cases)");
            else
                GD.PrintErr($"[RegistryVerify] RESULT: FAIL ({failures} case(s))");

            return failures == 0 ? 0 : 1;
        }

        /// <summary>A PackedScene instances without error to a non-null node.</summary>
        private static bool CanInstance(PackedScene scene)
        {
            Node? node = scene.Instantiate();
            bool ok = node != null;
            node?.Free();
            return ok;
        }

        /// <summary>
        /// A capsule PackedScene instances to a <see cref="Node3D"/> that carries the reused
        /// <see cref="EntityVisuals"/> mesh child — proving the primitive survived packing.
        /// </summary>
        private static bool CapsuleHasBody(PackedScene scene)
        {
            Node? node = scene.Instantiate();
            bool ok = node is Node3D && node.GetChildCount() > 0 && HasMesh(node);
            node?.Free();
            return ok;
        }

        private static bool HasMesh(Node node)
        {
            if (node is MeshInstance3D)
                return true;
            foreach (Node child in node.GetChildren())
                if (HasMesh(child))
                    return true;
            return false;
        }

        private static int Report(string name, bool ok)
        {
            GD.Print($"[RegistryVerify]   {(ok ? "PASS" : "FAIL")}  {name}");
            return ok ? 0 : 1;
        }
    }
}

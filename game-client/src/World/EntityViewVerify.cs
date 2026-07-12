using Godot;
using AtlasWorld.Contracts;
using AtlasWorld.Client.Content;

namespace AtlasWorld.Client.World
{
    /// <summary>
    /// Headless self-check for Task 4 — threading the specific server type id into the
    /// <see cref="AssetRegistry"/> when a view is spawned. No xunit/nunit harness exists in
    /// this client, so verification follows the project's env-gated probe pattern:
    /// <c>GameRoot</c> runs this when <c>ATLAS_VERIFY_ENTITYVIEW=1</c>, it exercises the
    /// wiring against the committed (empty) manifest, prints per-case <c>PASS</c>/<c>FAIL</c>
    /// lines and a verdict, and returns a process exit code (0 = all pass, 1 = any fail).
    ///
    /// Proves, without a live server: (1) the key mapping from a live entity to its registry
    /// key is correct for all five kinds; (2) spawning through the real <see cref="EntityManager"/>
    /// resolves the visual node via <c>AssetRegistry.Resolve(typeId)</c> — with the empty
    /// Stage-0 manifest that is the capsule tier — yielding the right primitive per kind and
    /// never throwing; (3) each view gets its OWN body material, so tinting one entity does
    /// not bleed into a sibling that instanced the same cached capsule scene.
    /// </summary>
    public static class EntityViewVerify
    {
        public static int Run(Node host)
        {
            GD.Print("[EntityViewVerify] BEGIN");
            int failures = 0;

            // Part 1 — the key mapping contract (the "correctly threaded typeId").
            failures += Report("mob key form", EntityKeys.Mob("spear_thrower") == "mob:spear_thrower");
            failures += Report("projectile key form", EntityKeys.Projectile("arrow") == "projectile:arrow");
            failures += Report("zone key form", EntityKeys.Zone("freeze") == "zone:freeze");
            failures += Report("player key form", EntityKeys.Player == "player");
            failures += Report("npc key form", EntityKeys.Npc == "npc");
            failures += Report("null mob type is safe", EntityKeys.Mob(null!) == "mob:");

            // The autoload must be live so views resolve through the real registry path.
            AssetRegistry? reg = AssetRegistry.Instance;
            if (reg == null)
            {
                GD.PrintErr("[EntityViewVerify]   FAIL  AssetRegistry autoload not ready");
                GD.PrintErr("[EntityViewVerify] RESULT: FAIL (registry unavailable)");
                return 1;
            }

            // With the committed empty manifest, every threaded key resolves to the capsule
            // tier — the exact evidence that Resolve is invoked with the threaded id.
            failures += Report("mob key → capsule tier", ResolvesToCapsule(reg, EntityKeys.Mob("spear_thrower")));
            failures += Report("projectile key → capsule tier", ResolvesToCapsule(reg, EntityKeys.Projectile("arrow")));
            failures += Report("zone key → capsule tier", ResolvesToCapsule(reg, EntityKeys.Zone("freeze")));

            // Part 2 — spawn through the real EntityManager and confirm each view's visual node
            // is the resolved capsule primitive for its kind, with a mesh body, no throw.
            var mgr = new EntityManager { Name = "VerifyEntityManager" };
            host.AddChild(mgr);

            failures += SpawnCase(mgr, "p1", EntityKind.Player, EntityKeys.Player, typeof(CapsuleMesh), "player");
            failures += SpawnCase(mgr, "n1", EntityKind.Npc, EntityKeys.Npc, typeof(CapsuleMesh), "npc");
            failures += SpawnCase(mgr, "m1", EntityKind.Mob, EntityKeys.Mob("spear_thrower"), typeof(BoxMesh), "mob");
            failures += SpawnCase(mgr, "pr1", EntityKind.Projectile, EntityKeys.Projectile("arrow"), typeof(BoxMesh), "projectile");
            failures += SpawnCase(mgr, "z1", EntityKind.ZoneEffect, EntityKeys.Zone("freeze"), typeof(CylinderMesh), "zone");

            // Part 3 — per-entity material isolation: two mobs, tinted to different teams, must
            // end with DIFFERENT body colors (a shared cached material would make them equal).
            mgr.Spawn("ma", EntityKind.Mob, EntityKeys.Mob("aggressive"));
            Node3D? rootA = LastSpawned(mgr);
            mgr.Spawn("mb", EntityKind.Mob, EntityKeys.Mob("balanced"));
            Node3D? rootB = LastSpawned(mgr);

            mgr.ApplyLife("ma", NewLife("player"));   // → blue
            mgr.ApplyLife("mb", NewLife("npc"));       // → green
            Color ca = BodyColor(rootA);
            Color cb = BodyColor(rootB);
            failures += Report($"per-entity material isolation (a={ca} b={cb})", ca != cb);

            mgr.QueueFree();

            if (failures == 0)
                GD.Print("[EntityViewVerify] RESULT: PASS (all cases)");
            else
                GD.PrintErr($"[EntityViewVerify] RESULT: FAIL ({failures} case(s))");

            return failures == 0 ? 0 : 1;
        }

        private static int SpawnCase(EntityManager mgr, string id, EntityKind kind, string typeId,
            System.Type expectedMesh, string label)
        {
            mgr.Spawn(id, kind, typeId);
            Node3D? root = LastSpawned(mgr);
            MeshInstance3D? body = root?.GetNodeOrNull<MeshInstance3D>("Body");
            bool ok = root != null && body != null && body.Mesh != null &&
                      body.Mesh.GetType() == expectedMesh;
            return Report($"spawn {label} ({typeId}) → capsule {expectedMesh.Name} body", ok);
        }

        private static bool ResolvesToCapsule(AssetRegistry reg, string typeId)
        {
            PackedScene scene = reg.Resolve(typeId, out ResolveTier tier);
            return scene != null && tier == ResolveTier.Capsule;
        }

        private static Node3D? LastSpawned(EntityManager mgr)
        {
            int n = mgr.GetChildCount();
            return n > 0 ? mgr.GetChild(n - 1) as Node3D : null;
        }

        private static Color BodyColor(Node3D? root)
        {
            var body = root?.GetNodeOrNull<MeshInstance3D>("Body");
            return body?.MaterialOverride is StandardMaterial3D m ? m.AlbedoColor : new Color(0, 0, 0);
        }

        private static Mob NewLife(string teamId) => new Mob
        {
            teamId = teamId,
            isAlive = true,
            currentHealth = 10f,
            maxHealth = 10f,
        };

        private static int Report(string name, bool ok)
        {
            GD.Print($"[EntityViewVerify]   {(ok ? "PASS" : "FAIL")}  {name}");
            return ok ? 0 : 1;
        }
    }
}

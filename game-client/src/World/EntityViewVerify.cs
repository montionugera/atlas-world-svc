using Godot;
using AtlasWorld.Contracts;
using AtlasWorld.Client.Content;

namespace AtlasWorld.Client.World
{
    /// <summary>
    /// Headless self-check for Task 4 — threading the specific server type id into the
    /// <see cref="AssetRegistry"/> when a view is spawned. No xunit/nunit harness exists in
    /// this client, so verification follows the project's env-gated probe pattern:
    /// <c>GameRoot</c> / <c>VerticalSliceRoot</c> runs this when <c>ATLAS_VERIFY_ENTITYVIEW=1</c>,
    /// exercises the wiring against the committed manifest, prints per-case <c>PASS</c>/<c>FAIL</c>
    /// lines and a verdict, and returns a process exit code (0 = all pass, 1 = any fail).
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

            // Mapped keys resolve to a real glTF tier (Seed or Bespoke) — never the capsule —
            // proving the manifest is actually wired through, not just present.
            failures += Report("mob:spear_thrower (mapped) → real glTF tier", ResolvesToSeed(reg, EntityKeys.Mob("spear_thrower")));
            failures += Report("projectile:arrow (mapped) → seed tier", ResolvesToSeed(reg, EntityKeys.Projectile("arrow")));
            failures += Report("zone:freeze (mapped) → seed tier", ResolvesToSeed(reg, EntityKeys.Zone("freeze")));

            // Keys the manifest does NOT cover — deliberately-unregistered probe-only ids —
            // still resolve to the capsule tier.
            failures += Report("mob key (unmapped) → capsule tier", ResolvesToCapsule(reg, EntityKeys.Mob("unmapped_probe_only")));
            failures += Report("projectile key (unmapped) → capsule tier", ResolvesToCapsule(reg, EntityKeys.Projectile("unmapped_probe_only")));
            failures += Report("zone key (unmapped) → capsule tier", ResolvesToCapsule(reg, EntityKeys.Zone("unmapped_probe_only")));

            // Part 2 — spawn through the real EntityManager.
            var mgr = new EntityManager { Name = "VerifyEntityManager" };
            host.AddChild(mgr);

            failures += SpawnSeedCase(mgr, "p1", EntityKind.Player, EntityKeys.Player, "player");
            failures += SpawnSeedCase(mgr, "n1", EntityKind.Npc, EntityKeys.Npc, "npc");
            failures += SpawnSeedCase(mgr, "m1", EntityKind.Mob, EntityKeys.Mob("spear_thrower"), "mob:spear_thrower");
            failures += SpawnSeedCase(mgr, "pr1", EntityKind.Projectile, EntityKeys.Projectile("arrow"), "projectile:arrow");
            failures += SpawnSeedCase(mgr, "z1", EntityKind.ZoneEffect, EntityKeys.Zone("freeze"), "zone:freeze");
            failures += SpawnCase(mgr, "m0", EntityKind.Mob, EntityKeys.Mob("unmapped_probe_only"), typeof(BoxMesh), "mob (still-unmapped capsule fallback)");
            failures += SpawnCase(mgr, "pr0", EntityKind.Projectile, EntityKeys.Projectile("unmapped_probe_only"), typeof(BoxMesh), "projectile (still-unmapped capsule fallback)");
            failures += SpawnCase(mgr, "z0", EntityKind.ZoneEffect, EntityKeys.Zone("unmapped_probe_only"), typeof(CylinderMesh), "zone (still-unmapped capsule fallback)");

            // Part 3 — per-entity material isolation: two mobs, tinted to different teams, must
            // end with DIFFERENT body colors (a shared cached material would make them equal).
            mgr.Spawn("ma", EntityKind.Mob, EntityKeys.Mob("aggressive_capsule_probe"));
            Node3D? rootA = LastSpawned(mgr);
            mgr.Spawn("mb", EntityKind.Mob, EntityKeys.Mob("balanced_capsule_probe"));
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

        private static bool ResolvesToSeed(AssetRegistry reg, string typeId)
        {
            PackedScene scene = reg.Resolve(typeId, out ResolveTier tier);
            return scene != null && tier is ResolveTier.Seed or ResolveTier.Bespoke;
        }

        private static int SpawnSeedCase(EntityManager mgr, string id, EntityKind kind, string typeId, string label)
        {
            mgr.Spawn(id, kind, typeId);
            Node3D? root = LastSpawned(mgr);
            bool ok = root != null && HasAnyMesh(root) && !IsCapsuleShaped(root);
            return Report($"spawn {label} ({typeId}) → real seed glTF (not capsule)", ok);
        }

        private static bool IsCapsuleShaped(Node3D? root)
        {
            Mesh? mesh = root?.GetNodeOrNull<MeshInstance3D>("Body")?.Mesh;
            return mesh is BoxMesh or CapsuleMesh or CylinderMesh;
        }

        private static bool HasAnyMesh(Node? node)
        {
            if (node == null)
                return false;
            if (node is MeshInstance3D)
                return true;
            foreach (Node child in node.GetChildren())
                if (HasAnyMesh(child))
                    return true;
            return false;
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

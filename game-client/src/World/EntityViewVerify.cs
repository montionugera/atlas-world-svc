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
    /// resolves the visual node via <c>AssetRegistry.Resolve(typeId)</c> — honoring the real,
    /// committed manifest, so a mapped character key yields the loaded seed glTF and a
    /// still-unmapped key (Stage 0.5: projectiles/zones) yields the capsule tier — and never
    /// throws; (3) each view gets its OWN body material, so tinting one entity does not bleed
    /// into a sibling that instanced the same cached capsule scene.
    ///
    /// Task 7 note: the committed manifest now maps <c>player</c>, <c>npc</c>, and all six
    /// <c>mob:*</c> keys to real CC0 seed characters. Cases that need to exercise the
    /// CAPSULE fallback path deliberately use type ids the manifest does NOT cover (still
    /// the right kind, just an id that was never registered) so that coverage of the
    /// "unknown/unmapped id never breaks" contract survives the seed set landing.
    ///
    /// Task 11 note: the committed manifest now also maps all 7 <c>projectile:*</c> keys
    /// (CC0 Quaternius weapon glTF) and all 4 <c>zone:*</c> keys (generated emissive discs).
    /// <c>projectile:arrow</c> and <c>zone:freeze</c> — previously this probe's stand-ins for
    /// "still-unmapped" — now resolve to the Seed tier like the Task 7 characters; the
    /// CAPSULE-fallback cases moved to freshly-unregistered probe-only ids so the
    /// "unknown/unmapped id never breaks" contract keeps being exercised.
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

            // Mapped keys (Task 7 characters + Task 11 projectiles/zones) resolve to the Seed
            // tier — never the capsule — proving the manifest is actually wired through, not
            // just present.
            failures += Report("mob:spear_thrower (mapped) → seed tier", ResolvesToSeed(reg, EntityKeys.Mob("spear_thrower")));
            failures += Report("projectile:arrow (mapped) → seed tier", ResolvesToSeed(reg, EntityKeys.Projectile("arrow")));
            failures += Report("zone:freeze (mapped) → seed tier", ResolvesToSeed(reg, EntityKeys.Zone("freeze")));

            // Keys the manifest does NOT cover — deliberately-unregistered probe-only ids —
            // still resolve to the capsule tier.
            failures += Report("mob key (unmapped) → capsule tier", ResolvesToCapsule(reg, EntityKeys.Mob("unmapped_probe_only")));
            failures += Report("projectile key (unmapped) → capsule tier", ResolvesToCapsule(reg, EntityKeys.Projectile("unmapped_probe_only")));
            failures += Report("zone key (unmapped) → capsule tier", ResolvesToCapsule(reg, EntityKeys.Zone("unmapped_probe_only")));

            // Part 2 — spawn through the real EntityManager. player/npc/mob:spear_thrower
            // (Task 7) and projectile:arrow/zone:freeze (Task 11) are now mapped to real seed
            // glTF scenes: confirm each spawns the LOADED scene, not the capsule.
            // Deliberately-unmapped probe-only ids for each kind confirm the capsule fallback
            // still works.
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
            // Uses type ids OUTSIDE the manifest on purpose — seed/bespoke scenes may not carry
            // a "Body" node at all, so tinting them is a documented no-op (not what this proves).
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
            return scene != null && tier == ResolveTier.Seed;
        }

        /// <summary>
        /// Spawn a mapped character key and confirm the view root is the LOADED seed glTF
        /// scene, not our procedural capsule. Doesn't assume anything about the imported
        /// model's internal node names (no-magic) — instead it proves the negative: the
        /// spawned root carries at least one mesh, but none of them is the "Body" node with
        /// one of our own procedural primitive mesh types, which is the exact, exclusive
        /// signature <see cref="EntityVisuals.CreateView"/> stamps onto every capsule tier.
        /// </summary>
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

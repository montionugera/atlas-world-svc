using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Godot;
using AtlasWorld.Client.Content;

namespace AtlasWorld.Client.World
{
    /// <summary>
    /// F-174 env-gated probe (ATLAS_VERIFY_PIPELINE_CHAR=1), run by VerticalSliceRoot (the main scene; GameRoot never runs).
    /// Unlike the synchronous probes it is a Node, because bone attachments only follow the
    /// skeleton after a process frame. Prints PASS/FAIL lines and exactly one
    /// "[PipelineCharVerify] VERDICT PASS" (exit 0) or "VERDICT FAIL (n)" (exit 1).
    /// Run it with scripts/godot-verify.sh (pinned mono build); PATH godot exits 0 on C# failure.
    /// </summary>
    public sealed partial class PipelineCharVerify : Node
    {
        public const string Key = "npc:lantern_hollow_watch_sergeant";
        public const string MobKey = "mob:aggressive";
        private const string Tag = "[PipelineCharVerify]";
        private int _failures;

        public override async void _Ready()
        {
            GD.Print($"{Tag} BEGIN");
            try
            {
                await RunAll();
            }
            catch (Exception ex)
            {
                Report($"no exception escaped the probe ({ex.GetType().Name}: {ex.Message})", false);
            }
            bool pass = _failures == 0;
            GD.Print(pass ? $"{Tag} VERDICT PASS" : $"{Tag} VERDICT FAIL ({_failures} case(s))");
            GetTree().Quit(pass ? 0 : 1);
        }

        private async Task RunAll()
        {
            AssetRegistry? reg = AssetRegistry.Instance;
            if (!Report("AssetRegistry autoload ready", reg != null))
                return;
            CheckManifest(reg!);
            await CheckStates(reg!); CheckReadyTransitions(reg!); CheckMobBlend(reg!); CheckFallbackOrder();
            await CheckWeaponSwap(reg!);
            CheckEntityViewWiring();
            await NextFrames(1);
        }

        private void CheckManifest(AssetRegistry reg)
        {
            reg.Resolve(Key, out ResolveTier tier);
            Report($"{Key} resolves to the bespoke glb (tier={tier})", tier == ResolveTier.Bespoke);
            IReadOnlyDictionary<string, string> anims = reg.ResolveAnimOverrides(Key);
            IReadOnlyDictionary<string, IReadOnlyList<string>> variants = reg.ResolveAnimVariants(Key);
            Report("anims maps combat_idle → block_idle", anims.GetValueOrDefault("combat_idle") == "block_idle");
            Report("attack variants are [attack, attack_2, attack_3]",
                variants.TryGetValue("attack", out IReadOnlyList<string>? a) && string.Join(",", a) == "attack,attack_2,attack_3");
            Report("anims[attack] keeps the first variant for legacy callers", anims.GetValueOrDefault("attack") == "attack");

            AssetManifest parsed = AssetManifest.Parse(
                "{\"version\":2,\"entries\":{\"x\":{\"scene\":\"res://a.glb\",\"anims\":{\"attack\":[\"a\",3,\"b\"],\"hit\":[],\"idle\":\"i\"}}}}");
            parsed.TryGet("x", out AssetEntry e);
            Report("a list drops non-string elements", e.AnimVariants.TryGetValue("attack", out IReadOnlyList<string>? pa) && string.Join(",", pa) == "a,b");
            Report("an empty list maps nothing", !e.Anims.ContainsKey("hit") && !e.AnimVariants.ContainsKey("hit"));
            Report("a string value is a one-item variant list", e.AnimVariants.TryGetValue("idle", out IReadOnlyList<string>? pi) && pi.Count == 1 && pi[0] == "i");
        }

        private sealed class Spawned
        {
            public Node3D Root = null!;
            public AnimationController Anim = null!;
            public AnimationPlayer Player = null!;
        }

        private Spawned? Spawn(AssetRegistry reg, string key, IReadOnlyDictionary<string, string>? anims = null)
        {
            if (reg.Resolve(key, out _).Instantiate() is not Node3D root)
            {
                Report($"{key} instances a Node3D", false);
                return null;
            }
            AddChild(root);
            var anim = new AnimationController(root, anims ?? reg.ResolveAnimOverrides(key), reg.ResolveAnimVariants(key));
            AnimationPlayer? player = FindFirst<AnimationPlayer>(root);
            if (!Report($"{key} has an AnimationPlayer", player != null))
                return null;
            return new Spawned { Root = root, Anim = anim, Player = player! };
        }

        private bool Expect(Spawned s, string label, string state, string clip) =>
            Report($"{label}: state={s.Anim.CurrentState} clip={s.Player.CurrentAnimation} (want {state}/{clip})",
                s.Anim.CurrentState == state && s.Player.CurrentAnimation == clip && s.Player.IsPlaying());

        /// <summary>Run the current non-looping clip past its end, as frames would.</summary>
        private static void FinishOneShot(AnimationPlayer p) =>
            p.Advance(p.CurrentAnimationLength - p.CurrentAnimationPosition + 0.05);

        private async Task CheckStates(AssetRegistry reg)
        {
            Spawned? s = Spawn(reg, Key);
            if (s == null)
                return;
            Report("sergeant is combat-mapped", s.Anim.IsCombatMapped);

            var loops = new (string clip, Animation.LoopModeEnum mode)[]
            {
                ("idle", Animation.LoopModeEnum.Linear), ("walk", Animation.LoopModeEnum.Linear),
                ("run", Animation.LoopModeEnum.Linear), ("block_idle", Animation.LoopModeEnum.Linear),
                ("block", Animation.LoopModeEnum.Linear), ("attack", Animation.LoopModeEnum.None),
                ("attack_2", Animation.LoopModeEnum.None), ("attack_3", Animation.LoopModeEnum.None),
                ("hit", Animation.LoopModeEnum.None), ("death", Animation.LoopModeEnum.None),
            };
            foreach ((string clip, Animation.LoopModeEnum mode) in loops)
                Report($"loop mode {clip} = {mode}", s.Player.HasAnimation(clip) && s.Player.GetAnimation(clip).LoopMode == mode);

            s.Anim.Update(true, Vector3.Zero);
            Expect(s, "still", "idle", "idle");
            s.Anim.Update(true, new Vector3(1.5f, 0f, 0f));
            Expect(s, "slow", "walk", "walk");
            s.Anim.Update(true, new Vector3(12f, 0f, 0f));
            Expect(s, "fast", "run", "run");

            s.Anim.InCombat = true;
            s.Anim.Update(true, Vector3.Zero);
            Expect(s, "InCombat", "combat_idle", "block_idle");
            s.Anim.Block(true);
            s.Anim.Update(true, Vector3.Zero);
            Expect(s, "Block(true)", "block", "block");
            s.Anim.Block(false);
            s.Anim.Update(true, Vector3.Zero);
            Expect(s, "Block(false)", "combat_idle", "block_idle");

            foreach (string want in new[] { "attack", "attack_2", "attack_3", "attack" })
            {
                s.Anim.Attack();
                s.Anim.Update(true, Vector3.Zero);
                Expect(s, $"Attack() rotates to {want}", "attack", want);
                Report($"attack blend 0.15 s for the combat-mapped sergeant (got {s.Anim.LastBlendSec})",
                    Math.Abs(s.Anim.LastBlendSec - 0.15) < 1e-9);
                s.Anim.Update(true, Vector3.Zero);
                Expect(s, "attack still playing (no restart)", "attack", want);
                FinishOneShot(s.Player);
                s.Anim.Update(true, Vector3.Zero);
                Expect(s, "attack ended in combat", "combat_idle", "block_idle");
            }

            s.Anim.Hit();
            s.Anim.Update(true, Vector3.Zero);
            Expect(s, "Hit()", "hit", "hit");
            FinishOneShot(s.Player);
            s.Anim.Update(true, Vector3.Zero);
            Expect(s, "hit ended in combat", "combat_idle", "block_idle");

            // Spec sequence: idle → combat_idle → attack → combat_idle → idle
            var seq = new List<string>();
            s.Anim.InCombat = false; s.Anim.Update(true, Vector3.Zero); seq.Add(s.Anim.CurrentState);
            s.Anim.InCombat = true; s.Anim.Update(true, Vector3.Zero); seq.Add(s.Anim.CurrentState);
            s.Anim.Attack(); s.Anim.Update(true, Vector3.Zero); seq.Add(s.Anim.CurrentState);
            FinishOneShot(s.Player); s.Anim.Update(true, Vector3.Zero); seq.Add(s.Anim.CurrentState);
            s.Anim.InCombat = false; s.Anim.Update(true, Vector3.Zero); seq.Add(s.Anim.CurrentState);
            Report($"sequence {string.Join("→", seq)}", string.Join("→", seq) == "idle→combat_idle→attack→combat_idle→idle");

            s.Anim.Hit();
            s.Anim.Update(true, Vector3.Zero);
            FinishOneShot(s.Player);
            s.Anim.Update(true, Vector3.Zero);
            Expect(s, "hit out of combat returns to idle", "idle", "idle");

            s.Anim.Update(false, Vector3.Zero);
            Expect(s, "dead", "death", "death");
            Skeleton3D? skel = FindFirst<Skeleton3D>(s.Root);
            int hips = skel?.FindBone("mixamorig_Hips") ?? -1;
            Report("mixamorig_Hips bone found", hips >= 0);
            FinishOneShot(s.Player);
            Transform3D held1 = skel!.GetBonePose(hips);
            s.Player.Advance(0.5);
            s.Anim.Update(false, Vector3.Zero);
            Transform3D held2 = skel.GetBonePose(hips);
            Report("death holds its last frame (no restart, hips pose unchanged)",
                s.Anim.CurrentState == "death" && s.Player.AssignedAnimation == "death" && !s.Player.IsPlaying() && held1.IsEqualApprox(held2));

            s.Root.QueueFree();
            await NextFrames(1);
        }

        private void CheckReadyTransitions(AssetRegistry reg)
        {
            // The sergeant maps no ready_in/ready_out; map them to a real clip to prove the path.
            var anims = new Dictionary<string, string>(reg.ResolveAnimOverrides(Key))
            {
                ["ready_in"] = "idle_look",
                ["ready_out"] = "idle_look",
            };
            Spawned? s = Spawn(reg, Key, anims);
            if (s == null)
                return;
            var seq = new List<string>();
            s.Anim.Update(true, Vector3.Zero); seq.Add(s.Anim.CurrentState);
            s.Anim.InCombat = true; s.Anim.Update(true, Vector3.Zero); seq.Add(s.Anim.CurrentState);
            FinishOneShot(s.Player); s.Anim.Update(true, Vector3.Zero); seq.Add(s.Anim.CurrentState);
            s.Anim.InCombat = false; s.Anim.Update(true, Vector3.Zero); seq.Add(s.Anim.CurrentState);
            FinishOneShot(s.Player); s.Anim.Update(true, Vector3.Zero); seq.Add(s.Anim.CurrentState);
            Report($"mapped ready_in/ready_out: {string.Join("→", seq)}",
                string.Join("→", seq) == "idle→ready_in→combat_idle→ready_out→idle");
            s.Root.QueueFree();
        }

        private void CheckMobBlend(AssetRegistry reg)
        {
            Spawned? m = Spawn(reg, MobKey);
            if (m == null)
                return;
            Report("existing mob is not combat-mapped", !m.Anim.IsCombatMapped);
            m.Anim.Update(true, Vector3.Zero, isAttacking: true);
            Report($"existing mob attack blend stays 0.05 s (got {m.Anim.LastBlendSec})", Math.Abs(m.Anim.LastBlendSec - 0.05) < 1e-9);
            m.Root.QueueFree();
        }

        /// <summary>
        /// The fallback list prefers the pipeline name over the Kenney name: run before sprint,
        /// death before die. Built in code (no glb), so only the order is under test.
        /// </summary>
        private void CheckFallbackOrder()
        {
            var fast = new Vector3(12f, 0f, 0f);
            FallbackCase("run beats sprint", new[] { "idle", "sprint", "run" }, alive: true, fast, want: "run");
            FallbackCase("sprint when run is absent", new[] { "idle", "sprint" }, alive: true, fast, want: "sprint");
            FallbackCase("death beats die", new[] { "idle", "die", "death" }, alive: false, Vector3.Zero, want: "death");
            FallbackCase("die when death is absent", new[] { "idle", "die" }, alive: false, Vector3.Zero, want: "die");
        }

        private void FallbackCase(string label, string[] clips, bool alive, Vector3 velocity, string want)
        {
            var root = new Node3D { Name = "FallbackModel" };
            var player = new AnimationPlayer { Name = "AnimationPlayer" };
            var lib = new AnimationLibrary();
            foreach (string c in clips)
                lib.AddAnimation(c, new Animation { Length = 1f });
            player.AddAnimationLibrary("", lib);
            root.AddChild(player);
            AddChild(root);
            var anim = new AnimationController(root);
            anim.Update(alive, velocity);
            Report($"fallback {label}: [{string.Join(",", clips)}] → {anim.CurrentClip} (want {want})", anim.CurrentClip == want);
            root.QueueFree();
        }

        private async Task CheckWeaponSwap(AssetRegistry reg)
        {
            Spawned? s = Spawn(reg, Key);
            if (s == null)
                return;
            Report("baked held_shaft_r exists before Equip", s.Root.FindChild("held_shaft_r", true, false) != null);
            PackedScene? axe = ResourceLoader.Load<PackedScene>("res://assets/weapons/axe.glb");
            if (!Report("axe.glb loads", axe != null))
                return;

            var socket = new WeaponSocket(s.Root);
            Node3D? equipped = socket.Equip(axe!);
            Report("no held_shaft_r remains after Equip", s.Root.FindChild("held_shaft_r", true, false) == null);
            Report($"one axe node under the hand BoneAttachment3D (bone={socket.Attachment?.BoneName})",
                equipped != null && socket.Attachment != null && socket.Attachment.GetChildCount() == 1 && socket.Attachment.GetChild(0) == equipped);

            Skeleton3D? skel = FindFirst<Skeleton3D>(s.Root);
            int hand = skel?.FindBone("mixamorig_RightHand") ?? -1;
            if (!Report("mixamorig_RightHand bone found", hand >= 0) || equipped == null)
                return;

            double len = s.Player.GetAnimation("attack").Length;
            (Vector3 p1, Vector3 o1) = await SampleAxe(s, skel!, hand, equipped, len * 0.2);
            (Vector3 p2, Vector3 o2) = await SampleAxe(s, skel!, hand, equipped, len * 0.6);
            float moved = p1.DistanceTo(p2);
            float drift = o1.DistanceTo(o2);
            Report($"axe moved {moved * 100f:F1} cm across two attack frames (> 1 cm)", moved > 0.01f);
            Report($"axe offset to mixamorig_RightHand drifted {drift * 1000f:F2} mm (<= 1 mm)", drift <= 0.001f);

            socket.Unequip();
            Report("Unequip leaves 0 children", socket.Attachment!.GetChildCount() == 0 && socket.Equipped == null);
            s.Root.QueueFree();

            // No socket on the model: Equip creates one on prop_weapon_r.
            Spawned? bare = Spawn(reg, Key);
            if (bare == null)
                return;
            foreach (Node n in bare.Root.FindChildren("*", nameof(BoneAttachment3D), true, false))
            {
                n.GetParent().RemoveChild(n);
                n.QueueFree();
            }
            var created = new WeaponSocket(bare.Root);
            created.Equip(axe!);
            Report($"missing socket is created on prop_weapon_r (got {created.Attachment?.BoneName})",
                created.Attachment != null && created.Attachment.BoneName == "prop_weapon_r");
            bare.Root.QueueFree();
            await NextFrames(1);
        }

        private async Task<(Vector3 pos, Vector3 handLocal)> SampleAxe(Spawned s, Skeleton3D skel, int hand, Node3D axe, double t)
        {
            s.Player.Play("attack");
            s.Player.Seek(t, true);
            s.Player.Pause();
            await NextFrames(2); // BoneAttachment3D follows the skeleton on process
            Transform3D handXf = skel.GlobalTransform * skel.GetBoneGlobalPose(hand);
            Vector3 pos = axe.GlobalPosition;
            return (pos, handXf.AffineInverse() * pos);
        }

        private void CheckEntityViewWiring()
        {
            // EntityManager sets isAttacking = (target_id != 0). For a combat-mapped entry that is InCombat.
            var view = new EntityView(EntityKind.Npc, Key);
            AddChild(view.Root);
            // EntityView.cs:208 scales every NPC 0.68 (tuned for 1.6-2.0 u bodies); a 1.05 u
            // pipeline character must render at true size, not 0.71 m.
            float h = WorldHeight(view.Root);
            Report($"pipeline character world height {h:F3} m (want 1.05 m ±5%)", Mathf.Abs(h - 1.05f) <= 0.0525f);
            Report("legacy NPC factor unchanged (0.68)", Math.Abs(EntityView.ResolveChibiScaleFactor(EntityKind.Npc, "npc") - 0.68f) < 1e-6);
            view.ApplyLifeState(isAlive: true, currentHealth: 100f, maxHealth: 100f, isAttacking: true);
            view.UpdateAnimation(Vector3.Zero);
            Report($"target_id → InCombat → combat_idle (state={view.Animation.CurrentState})",
                view.Animation.InCombat && view.Animation.CurrentState == "combat_idle");
            view.NotifyHit();
            view.UpdateAnimation(Vector3.Zero);
            Report($"GameEvent.Hit → hit (state={view.Animation.CurrentState})", view.Animation.CurrentState == "hit");
            view.ApplyLifeState(true, 90f, 100f, isAttacking: false);
            FinishOneShot(FindFirst<AnimationPlayer>(view.Root)!);
            view.UpdateAnimation(Vector3.Zero);
            Report($"no target → idle (state={view.Animation.CurrentState})", !view.Animation.InCombat && view.Animation.CurrentState == "idle");
            view.Root.QueueFree();

            // Legacy entries keep today's meaning: target_id → attack clip.
            var mob = new EntityView(EntityKind.Mob, MobKey);
            AddChild(mob.Root);
            mob.ApplyLifeState(true, 100f, 100f, isAttacking: true);
            mob.UpdateAnimation(Vector3.Zero);
            mob.NotifyHit(); // must be a no-op for a non-combat-mapped entry
            mob.UpdateAnimation(Vector3.Zero);
            Report($"legacy mob: target_id still → attack, Hit is a no-op (state={mob.Animation.CurrentState})",
                mob.Animation.CurrentState == "attack" && !mob.Animation.InCombat);
            mob.Root.QueueFree();
        }

        private static bool IsUnderSkeleton(Node n, Node root)
        {
            for (Node? p = n.GetParent(); p != null && p != root.GetParent(); p = p.GetParent())
                if (p is Skeleton3D)
                    return true;
            return false;
        }

        /// <summary>World-space height of every character mesh (under a Skeleton3D) beneath <paramref name="root"/> (rest-pose AABBs).</summary>
        private static float WorldHeight(Node root)
        {
            Aabb? box = null;
            foreach (Node n in root.FindChildren("*", nameof(MeshInstance3D), true, false))
            {
                var mi = (MeshInstance3D)n;
                if (!IsUnderSkeleton(mi, root))
                    continue; // skip the DropShadow disc and the overhead HP bar quads: not the character
                Aabb a = mi.GlobalTransform * mi.GetAabb();
                box = box is Aabb b ? b.Merge(a) : a;
            }
            return box?.Size.Y ?? 0f;
        }

        private async Task NextFrames(int n)
        {
            for (int i = 0; i < n; i++)
                await ToSignal(GetTree(), SceneTree.SignalName.ProcessFrame);
        }

        private bool Report(string name, bool ok)
        {
            GD.Print($"{Tag}   {(ok ? "PASS" : "FAIL")}  {name}");
            if (!ok)
                _failures++;
            return ok;
        }

        private static T? FindFirst<T>(Node node) where T : Node
        {
            if (node is T hit)
                return hit;
            foreach (Node child in node.GetChildren())
            {
                T? found = FindFirst<T>(child);
                if (found != null)
                    return found;
            }
            return null;
        }
    }
}

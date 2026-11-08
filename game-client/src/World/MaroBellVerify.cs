using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Godot;
using AtlasWorld.Client.Content;

namespace AtlasWorld.Client.World
{
    /// <summary>
    /// F-183 env-gated probe (ATLAS_VERIFY_MARO_BELL=1, run by VerticalSliceRoot): loads content/maps/maro-bell.json,
    /// streams every chunk through MapChunkStreamer and asserts the grey blocks and labels exist and the client
    /// obstacle grid has one rect per solid block. Prints "[MaroBellVerify] VERDICT PASS" (exit 0) or FAIL (exit 1).
    /// With ATLAS_RENDER_MARO_BELL=&lt;dir&gt; in a WINDOWED run it also saves maro-bell-top-down.png and
    /// maro-bell-eye-gate.png (headless has no pixels). Run via scripts/godot-verify.sh.
    /// </summary>
    public sealed partial class MaroBellVerify : Node
    {
        private const string Tag = "[MaroBellVerify]";
        private int _failures;
        private SubViewport? _vp;

        public override async void _Ready()
        {
            try
            {
                await Run();
            }
            catch (Exception ex)
            {
                Report($"no exception escaped the probe ({ex.GetType().Name}: {ex.Message})", false);
            }
            GD.Print(_failures == 0 ? $"{Tag} VERDICT PASS" : $"{Tag} VERDICT FAIL ({_failures} case(s))");
            GetTree().Quit(_failures == 0 ? 0 : 1);
        }

        private async Task Run()
        {
            Report("default map id is freja-south-gate", VerticalSliceRoot.ResolveMapId("") == "freja-south-gate"
                && VerticalSliceRoot.ResolveMapId(null) == "freja-south-gate");
            Report("ATLAS_MAP_ID=maro-bell selects maro-bell", VerticalSliceRoot.ResolveMapId("maro-bell") == "maro-bell");
            // F-190: wheel zoom spans 3.5..30 m and stops at both ends.
            float zoomOut = 6.2f; for (int i = 0; i < 80; i++) zoomOut = CameraZoom.Zoomed(zoomOut, +1);
            float zoomIn = 6.2f; for (int i = 0; i < 80; i++) zoomIn = CameraZoom.Zoomed(zoomIn, -1);
            Report($"zoom clamps at 30 m out and 0.35 m in (got {zoomOut}, {zoomIn})", Mathf.IsEqualApprox(zoomOut, 30f) && Mathf.IsEqualApprox(zoomIn, 0.35f));

            var doc = UnifiedMapDocument.LoadOrDefault("maro-bell");
            int blocks = doc.Structures.Count(s => s.Kind == "block");
            Report($"maro-bell.json loaded ({blocks} block structures, not the fallback doc)", doc.MapId == "maro-bell" && blocks >= 40);
            Report("size is 80 m x 160 m (80 x 160 server units)", doc.Width == 80f && doc.Height == 160f);

            TerrainElevation.GlobalAmplitude = doc.TerrainAmplitude;
            var root = new Node3D { Name = "GreyBox" };
            AddChild(root);
            var streamer = new MapChunkStreamer(root, doc);
            streamer.UpdateStreaming(Vector3.Zero, forceReload: true);

            var spawned = doc.Structures.Where(s => s.Kind == "block")
                .Select(s => (s, node: root.FindChild($"Structure_{s.Id}", true, false))).ToList();
            Report("every block has a Structure node", spawned.All(t => t.node != null));
            Report("every block has a BoxMesh", spawned.All(t => t.node?.GetNodeOrNull<MeshInstance3D>($"Block_{t.s.Id}")?.Mesh is BoxMesh));
            var labelled = spawned.Where(t => t.s.Label != "").ToList();
            Report($"all {labelled.Count} labelled blocks have a Label3D", labelled.Count >= 20
                && labelled.All(t => t.node?.GetNodeOrNull<Label3D>($"Label_{t.s.Id}")?.Text == t.s.Label));
            foreach (string id in new[] { "great-bell", "npc-spot-bram", "npc-spot-pip", "npc-spot-edda", "npc-spot-amber", "npc-spot-reed", "npc-spot-tovin" })
                Report($"label node for {id}", root.FindChild($"Label_{id}", true, false) is Label3D);

            int solid = doc.Structures.Count(s => s.Kind == "block" && s.Solid);
            Report($"client obstacle grid has {solid} solid-block rects (has {doc.StaticObstacles.Count})", doc.StaticObstacles.Count == solid);

            VerifyMaroFolkGirlInTown(root);

            string outDir = OS.GetEnvironment("ATLAS_RENDER_MARO_BELL");
            if (!string.IsNullOrEmpty(outDir))
                await Render(root, outDir);
        }

        private void VerifyMaroFolkGirlInTown(Node3D townRoot)
        {
            AssetRegistry? reg = AssetRegistry.Instance;
            if (reg == null)
                return;
            reg.Resolve(PipelineCharVerify.MaroGirlKey, out ResolveTier tier);
            if (tier != ResolveTier.Bespoke)
                return;

            var girl = new EntityView(EntityKind.Npc, PipelineCharVerify.MaroGirlKey);
            townRoot.AddChild(girl.Root);
            girl.Root.Position = new Vector3(0f, 0f, -18f);
            var socket = new WeaponSocket(girl.Root);
            Node3D? sword = socket.EquipByKey("sword");
            Report("maro_folk_girl spawned in Maro Bell plaza with sword equipped", sword != null);

            girl.Animation.Update(true, Vector3.Zero);
            Report("maro_folk_girl in Maro Bell starts in idle", girl.Animation.CurrentState == "idle");
            girl.Animation.Update(true, new Vector3(0f, 0f, -0.8f));
            Report("maro_folk_girl in Maro Bell blends to walk", girl.Animation.CurrentState == "walk");
            girl.Animation.Update(true, new Vector3(0f, 0f, -3.0f));
            Report("maro_folk_girl in Maro Bell blends to run at 3 m/s", girl.Animation.CurrentState == "run");
            girl.Animation.Attack();
            girl.Animation.Update(true, new Vector3(0f, 0f, -3.0f));
            Report("maro_folk_girl in Maro Bell triggers upper-body attack while running at 3 m/s",
                girl.Animation.CurrentState == "run" && girl.Animation.IsUpperBodyAttackActive);

            girl.Root.QueueFree();
        }

        private async Task Render(Node3D root, string outDir)
        {
            // Own World3D: the main scene's floor, sky and HUD must not leak into the shots (as PipelineStripRender).
            var vp = new SubViewport { Size = new Vector2I(1280, 720), OwnWorld3D = true, RenderTargetUpdateMode = SubViewport.UpdateMode.Always };
            AddChild(vp);
            root.Reparent(vp);
            _vp = vp;
            // Plain ground and the road ribbon, only for the screenshots.
            root.AddChild(new MeshInstance3D
            {
                Mesh = new PlaneMesh { Size = new Vector2(120f, 200f) },
                Position = new Vector3(0f, -0.02f, 0f),
                MaterialOverride = new StandardMaterial3D { AlbedoColor = new Color(0.36f, 0.4f, 0.34f) },
            });
            var doc = UnifiedMapDocument.LoadOrDefault("maro-bell");
            var road = doc.Routes[0];
            for (int i = 0; i < road.Points.Count - 1; i++)
            {
                var a = new Vector3(road.Points[i][0], 0f, road.Points[i][1]);
                var b = new Vector3(road.Points[i + 1][0], 0f, road.Points[i + 1][1]);
                var seg = new MeshInstance3D
                {
                    Mesh = new BoxMesh { Size = new Vector3(road.Width, 0.04f, a.DistanceTo(b)) },
                    MaterialOverride = new StandardMaterial3D { AlbedoColor = new Color(0.2f, 0.2f, 0.22f) },
                };
                root.AddChild(seg);
                seg.Position = (a + b) / 2f;
                seg.LookAt(seg.Position + (b - a), Vector3.Up);
            }
            root.AddChild(new DirectionalLight3D { RotationDegrees = new Vector3(-55f, 30f, 0f) });
            root.AddChild(new WorldEnvironment
            {
                Environment = new Godot.Environment
                {
                    BackgroundMode = Godot.Environment.BGMode.Color, BackgroundColor = new Color(0.7f, 0.78f, 0.88f),
                    AmbientLightSource = Godot.Environment.AmbientSource.Color, AmbientLightColor = new Color(0.7f, 0.7f, 0.75f),
                },
            });
            var cam = new Camera3D { Current = true };
            root.AddChild(cam);

            // Top-down, orthographic: north (-Z) is screen-up, 175 m tall frame holds the whole 160 m map.
            cam.Projection = Camera3D.ProjectionType.Orthogonal;
            cam.Size = 175f;
            cam.Position = new Vector3(0f, 250f, 0f);
            cam.RotationDegrees = new Vector3(-90f, 0f, 0f);
            await Save(outDir, "maro-bell-top-down.png");

            // Eye height 1.0 m at the arrival spawn, looking north to the bell.
            cam.Projection = Camera3D.ProjectionType.Perspective;
            cam.Fov = 70f;
            cam.Far = 600f;
            cam.Position = new Vector3(0f, 1.0f, 71f);
            cam.LookAt(new Vector3(0f, 7f, -66f), Vector3.Up);
            await Save(outDir, "maro-bell-eye-gate.png");

            await RenderMaroFolkGirlInBellTown(root, cam, outDir);
        }

        private async Task RenderMaroFolkGirlInBellTown(Node3D root, Camera3D cam, string outDir)
        {
            AssetRegistry? reg = AssetRegistry.Instance;
            if (reg == null)
                return;
            PackedScene girlScene = reg.Resolve(PipelineCharVerify.MaroGirlKey, out ResolveTier tier);
            if (tier != ResolveTier.Bespoke)
                return;

            IReadOnlyDictionary<string, string> animOverrides = reg.ResolveAnimOverrides(PipelineCharVerify.MaroGirlKey);
            IReadOnlyDictionary<string, IReadOnlyList<string>> animVariants = reg.ResolveAnimVariants(PipelineCharVerify.MaroGirlKey);

            // 1. Wide town showcase shot in Maro Bell plaza (5 poses + hair colors + sword looks in front of Great Bell)
            var showcaseGroup = new Node3D { Name = "MaroGirlShowcase" };
            root.AddChild(showcaseGroup);

            var showcaseSpecs = new (float X, float Z, string State, double NormTime, bool UpperAtk, Color Hair, string Sword)[]
            {
                (-1.60f, -18.0f, "idle", 0.35, false, CharacterCustomization.MaroChestnut, "sword"),
                (-0.80f, -17.8f, "walk", 0.25, false, CharacterCustomization.LindeSilver, "kk_sword_a"),
                ( 0.00f, -17.5f, "run",  0.30, true,  CharacterCustomization.SolarBlonde, "kk_sword_b"),
                ( 0.80f, -17.8f, "attack", 0.45, false, CharacterCustomization.CrimsonRose, "claymore"),
                ( 1.60f, -18.0f, "combat_idle", 0.50, false, CharacterCustomization.SilmeAzure, "axe"),
            };

            foreach (var sp in showcaseSpecs)
            {
                var inst = (Node3D)girlScene.Instantiate();
                showcaseGroup.AddChild(inst);
                EntityView.ApplyAnimeToonShading(inst, EntityKind.Player);
                CharacterCustomization.SetHairColor(inst, sp.Hair);
                new WeaponSocket(inst).EquipByKey(sp.Sword);
                inst.Position = new Vector3(sp.X, 0f, sp.Z);
                inst.Rotation = Vector3.Zero; // faces +Z toward camera

                var anim = new AnimationController(inst, animOverrides, animVariants);
                AnimationPlayer? player = FindAnimationPlayer(inst);
                if (player != null)
                {
                    if (sp.State == "walk")
                        anim.Update(true, new Vector3(0f, 0f, 0.8f));
                    else if (sp.State == "run")
                    {
                        anim.Update(true, new Vector3(0f, 0f, 3.0f));
                        if (sp.UpperAtk)
                        {
                            anim.Attack();
                            anim.Update(true, new Vector3(0f, 0f, 3.0f));
                        }
                    }
                    else if (sp.State == "attack")
                    {
                        anim.InCombat = true;
                        anim.Attack();
                        anim.Update(true, Vector3.Zero);
                    }
                    else if (sp.State == "combat_idle")
                    {
                        anim.InCombat = true;
                        anim.Update(true, Vector3.Zero);
                    }
                    else
                    {
                        anim.Update(true, Vector3.Zero);
                    }

                    player.Seek(player.CurrentAnimationLength * sp.NormTime, true);
                    if (sp.UpperAtk && anim.IsUpperBodyAttackActive)
                        anim.SeekUpperBody(anim.UpperBodyAttackLength * 0.45);
                    player.Pause();
                }
            }

            cam.Fov = 42f;
            cam.Position = new Vector3(0f, 0.92f, -14.2f);
            cam.LookAt(new Vector3(0f, 0.52f, -18.0f), Vector3.Up);
            await Save(outDir, "maro-bell-girl-showcase.png");
            showcaseGroup.QueueFree();
            await ToSignal(GetTree(), SceneTree.SignalName.ProcessFrame);

            // 2. 6-Cell Contact Strip + 24-frame Walk -> Run -> Upper-Body Attack sequence in Maro Bell
            var actor = (Node3D)girlScene.Instantiate();
            root.AddChild(actor);
            EntityView.ApplyAnimeToonShading(actor, EntityKind.Player);
            var weaponSocket = new WeaponSocket(actor);
            weaponSocket.EquipByKey("sword");
            var actorAnim = new AnimationController(actor, animOverrides, animVariants);
            AnimationPlayer? actorPlayer = FindAnimationPlayer(actor);

            string framesDir = System.IO.Path.Combine(outDir, "frames");
            DirAccess.MakeDirRecursiveAbsolute(framesDir);

            // Render 24 frames of the Maro Folk girl walking -> running at 3 m/s -> attacking on upper body while running in Maro Bell
            int totalFrames = 24;
            double[] strideNorms = { 0.12, 0.26, 0.38, 0.62, 0.76, 0.88 };
            for (int f = 0; f < totalFrames; f++)
            {
                float progress = (float)f / (totalFrames - 1);
                float zPos = Mathf.Lerp(-20.2f, -16.8f, progress);
                actor.Position = new Vector3(0f, 0f, zPos);
                actor.Rotation = new Vector3(0f, 0.35f, 0f); // 3/4 view so leg stride & sword swing read clearly

                // Demonstrate live hair color + sword look customization across phases
                if (f < 6)
                {
                    // Phase 1 (frames 0..5): Idle -> Walk (Maro Chestnut + sword.glb)
                    CharacterCustomization.SetHairColor(actor, CharacterCustomization.MaroChestnut);
                    weaponSocket.EquipByKey("sword");
                    actorAnim.ClearUpperBodyAttack();
                    actorAnim.Update(true, f == 0 ? Vector3.Zero : new Vector3(0f, 0f, 0.8f));
                    if (actorPlayer != null)
                    {
                        actorPlayer.Play(actorAnim.CurrentClip);
                        double norm = f == 0 ? 0.35 : strideNorms[f % strideNorms.Length];
                        actorPlayer.Seek(actorPlayer.CurrentAnimationLength * norm, true);
                        actorPlayer.Pause();
                    }
                }
                else if (f < 12)
                {
                    // Phase 2 (frames 6..11): Run at 3 m/s (Linde Elf Silver + kk_sword_a.glb)
                    CharacterCustomization.SetHairColor(actor, CharacterCustomization.LindeSilver);
                    weaponSocket.EquipByKey("kk_sword_a");
                    actorAnim.ClearUpperBodyAttack();
                    actorAnim.Update(true, new Vector3(0f, 0f, 3.0f));
                    if (actorPlayer != null)
                    {
                        actorPlayer.Play(actorAnim.CurrentClip);
                        double norm = strideNorms[(f - 6) % strideNorms.Length];
                        actorPlayer.Seek(actorPlayer.CurrentAnimationLength * norm, true);
                        actorPlayer.Pause();
                    }
                }
                else if (f < 20)
                {
                    // Phase 3 (frames 12..19): Run at 3 m/s + Upper-Body Attack Layer! (Solar Blonde / Crimson Rose + kk_sword_b.glb / claymore.glb)
                    CharacterCustomization.SetHairColor(actor, f < 16 ? CharacterCustomization.SolarBlonde : CharacterCustomization.CrimsonRose);
                    weaponSocket.EquipByKey(f < 16 ? "kk_sword_b" : "claymore");
                    if (!actorAnim.IsUpperBodyAttackActive)
                    {
                        actorAnim.Attack();
                        actorAnim.Update(true, new Vector3(0f, 0f, 3.0f));
                    }
                    if (actorPlayer != null)
                    {
                        actorPlayer.Play(actorAnim.CurrentClip);
                        double runNorm = strideNorms[(f - 12) % strideNorms.Length];
                        actorPlayer.Seek(actorPlayer.CurrentAnimationLength * runNorm, true);
                        double atkNorm = 0.15 + ((f - 12) / 7.0) * 0.75;
                        actorAnim.SeekUpperBody(actorAnim.UpperBodyAttackLength * Math.Clamp(atkNorm, 0.10, 0.90));
                        actorPlayer.Pause();
                    }
                }
                else
                {
                    // Phase 4 (frames 20..23): Full Attack_2 finish in combat stance (Silme Azure + sword.glb)
                    CharacterCustomization.SetHairColor(actor, CharacterCustomization.SilmeAzure);
                    weaponSocket.EquipByKey("sword");
                    actorAnim.ClearUpperBodyAttack();
                    actorAnim.InCombat = true;
                    if (actorAnim.CurrentState != "attack")
                    {
                        actorAnim.Attack();
                        actorAnim.Update(true, Vector3.Zero);
                    }
                    if (actorPlayer != null)
                    {
                        actorPlayer.Play(actorAnim.CurrentClip);
                        double atkNorm = 0.25 + ((f - 20) / 3.0) * 0.60;
                        actorPlayer.Seek(actorPlayer.CurrentAnimationLength * Math.Clamp(atkNorm, 0.15, 0.90), true);
                        actorPlayer.Pause();
                    }
                }

                cam.Fov = 38f;
                cam.Position = new Vector3(0.55f, 0.72f, zPos + 2.05f);
                cam.LookAt(new Vector3(0f, 0.48f, zPos), Vector3.Up);
                await Save(framesDir, $"frame_{f:D2}.png");
            }

            actor.QueueFree();
        }

        private static AnimationPlayer? FindAnimationPlayer(Node node)
        {
            if (node is AnimationPlayer p)
                return p;
            foreach (Node c in node.GetChildren())
            {
                AnimationPlayer? hit = FindAnimationPlayer(c);
                if (hit != null)
                    return hit;
            }
            return null;
        }

        private async Task Save(string dir, string file)
        {
            for (int f = 0; f < 4; f++)
                await ToSignal(RenderingServer.Singleton, RenderingServer.SignalName.FramePostDraw);
            Image img = _vp!.GetTexture().GetImage();
            string path = System.IO.Path.Combine(dir, file);
            Report($"saved {path} ({img.GetWidth()}x{img.GetHeight()})", img.GetWidth() > 0 && img.SavePng(path) == Error.Ok);
        }

        private bool Report(string name, bool ok)
        {
            GD.Print($"{Tag}   {(ok ? "PASS" : "FAIL")}  {name}");
            if (!ok)
                _failures++;
            return ok;
        }
    }
}

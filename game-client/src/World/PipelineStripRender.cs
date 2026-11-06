using System;
using System.Threading.Tasks;
using Godot;
using AtlasWorld.Client.Content;

namespace AtlasWorld.Client.World
{
    /// <summary>
    /// F-174 review artifact: one frame per combat state plus one with the axe swapped in,
    /// composed into a single PNG. Needs a WINDOWED run (headless has no pixels):
    ///   ATLAS_RENDER_PIPELINE_STRIP=$PWD/game-client/studio-cache/renders/out.png Godot --path game-client --resolution 1280x720 \
    ///     --write-movie "$(mktemp -d)/frame.png" --fixed-fps 30 --quit-after 600
    /// The character renders in a SubViewport with its OWN World3D (neutral background, own camera
    /// and light), so the VerticalSlice scene's terrain and props can never fill a cell. Each cell
    /// must change >= 3% of its pixels against a no-character reference frame, or it exits 1.
    /// ATLAS_STRIP_NO_CHARACTER=1 renders an empty node instead (test seam: every cell must FAIL).
    /// The output is a render of a private Asset Studio asset: write it under the gitignored
    /// game-client/studio-cache/renders/, never into a tracked path.
    /// </summary>
    public sealed partial class PipelineStripRender : Node
    {
        private const int CellW = 320;
        private const int CellH = 480;
        private const double MinChanged = 0.03;
        private static readonly Color Bg = new(0.16f, 0.17f, 0.20f);
        private static readonly (string State, bool Axe)[] Frames =
        {
            ("idle", false), ("walk", false), ("run", false), ("combat_idle", false),
            ("attack", false), ("block", false), ("hit", false), ("death", false), ("attack", true),
        };

        public override async void _Ready()
        {
            // async void: an unhandled exception would skip Quit(1) and let --quit-after exit 0.
            try
            {
                await Run();
            }
            catch (Exception e)
            {
                GD.Print($"[PipelineStripRender] FAIL exception: {e.GetType().Name}: {e.Message}");
                GetTree().Quit(1);
            }
        }

        private async Task Run()
        {
            string outPath = OS.GetEnvironment("ATLAS_RENDER_PIPELINE_STRIP");
            // The strip is a render of a private asset and this repo is public: refuse any path that
            // is not inside the gitignored renders dir, `..` escapes included, before any frame.
            string rendersDir = System.IO.Path.GetFullPath(ProjectSettings.GlobalizePath("res://studio-cache/renders"))
                .TrimEnd('/') + "/";
            if (!System.IO.Path.GetFullPath(outPath).StartsWith(rendersDir, StringComparison.Ordinal))
            {
                GD.Print("[PipelineStripRender] FAIL output path must be under game-client/studio-cache/renders/");
                GetTree().Quit(1);
                return;
            }
            bool noCharacter = OS.GetEnvironment("ATLAS_STRIP_NO_CHARACTER") == "1";
            AssetRegistry reg = AssetRegistry.Instance!;

            var vp = new SubViewport
            {
                Size = new Vector2I(CellW, CellH), OwnWorld3D = true, TransparentBg = false,
                RenderTargetUpdateMode = SubViewport.UpdateMode.Always,
            };
            AddChild(vp);
            var stage = new Node3D { Name = "Stage" };
            vp.AddChild(stage);
            var cam = new Camera3D { Position = new Vector3(0f, 0.62f, 2.0f), Fov = 40f, Current = true };
            stage.AddChild(cam);
            cam.LookAt(new Vector3(0f, 0.55f, 0f));
            stage.AddChild(new DirectionalLight3D { RotationDegrees = new Vector3(-40f, 25f, 0f) });
            stage.AddChild(new WorldEnvironment
            {
                Environment = new Godot.Environment
                {
                    BackgroundMode = Godot.Environment.BGMode.Color, BackgroundColor = Bg,
                    AmbientLightSource = Godot.Environment.AmbientSource.Color,
                    AmbientLightColor = new Color(0.65f, 0.65f, 0.7f),
                },
            });
            // Resolve once, before any frame: a capsule fallback (cold cache, no --import) would
            // render nine "non-blank" cells of the wrong thing.
            PackedScene sergeant = reg.Resolve(PipelineCharVerify.Key, out ResolveTier tier);
            GD.Print($"[PipelineStripRender] resolved {PipelineCharVerify.Key} -> {(string.IsNullOrEmpty(sergeant.ResourcePath) ? "<procedural capsule>" : sergeant.ResourcePath)} (tier {tier})");
            if (!noCharacter && tier != ResolveTier.Bespoke)
            {
                GD.Print($"[PipelineStripRender] FAIL resolved to {tier}, not Bespoke — run node scripts/studio-pull.mjs and godot --headless --import first");
                GetTree().Quit(1);
                return;
            }
            PackedScene? axe = ResourceLoader.Load<PackedScene>("res://assets/weapons/axe.glb");
            if (!noCharacter && axe == null)
            {
                GD.Print("[PipelineStripRender] FAIL res://assets/weapons/axe.glb did not load");
                GetTree().Quit(1);
                return;
            }
            Image empty = await Capture(vp); // the same stage with no character: the reference
            Image strip = Image.CreateEmpty(CellW * Frames.Length, CellH, false, Image.Format.Rgba8);
            int blank = 0;
            string prevClip = "";

            for (int i = 0; i < Frames.Length; i++)
            {
                (string state, bool withAxe) = Frames[i];
                string label = state + (withAxe ? "+axe" : "");
                Node3D root;
                string? poseFail = null;
                if (noCharacter)
                {
                    root = new Node3D();
                    stage.AddChild(root);
                }
                else
                {
                    root = (Node3D)sergeant.Instantiate();
                    stage.AddChild(root);
                    var anim = new AnimationController(root, reg.ResolveAnimOverrides(PipelineCharVerify.Key),
                        reg.ResolveAnimVariants(PipelineCharVerify.Key));
                    if (withAxe && new WeaponSocket(root).Equip(axe!) == null)
                        poseFail = "axe not equipped (no hand socket or not a Node3D)";
                    Drive(anim, state);
                    AnimationPlayer player = FindPlayer(root)!;
                    string clip = anim.CurrentClip;
                    if (anim.CurrentState != state)
                        poseFail ??= $"state is '{anim.CurrentState}', wanted '{state}'";
                    else if (string.IsNullOrEmpty(clip) || player.CurrentAnimation != clip)
                        poseFail ??= $"clip '{player.CurrentAnimation}' is not the mapped clip '{clip}'";
                    else if (!withAxe && clip == prevClip)
                        poseFail ??= $"clip '{clip}' repeats the previous cell";
                    if (!withAxe)
                        prevClip = clip;
                    player.Seek(player.CurrentAnimationLength * (state == "death" ? 0.98 : 0.4), true);
                    player.Pause();
                }

                Image shot = await Capture(vp);
                strip.BlitRect(shot, new Rect2I(0, 0, CellW, CellH), new Vector2I(i * CellW, 0));
                double changed = ChangedShare(empty, shot);
                if (poseFail != null)
                {
                    GD.Print($"[PipelineStripRender] FAIL cell {i} ({label}) {poseFail}");
                    blank++;
                }
                else if (changed < MinChanged)
                {
                    GD.Print($"[PipelineStripRender] FAIL cell {i} ({label}) changed {changed:P1} of pixels vs the empty frame (< 3%)");
                    blank++;
                }
                else
                {
                    GD.Print($"[PipelineStripRender] cell {i} ({label}) changed {changed:P1}");
                }
                root.QueueFree();
                await ToSignal(GetTree(), SceneTree.SignalName.ProcessFrame);
            }

            DirAccess.MakeDirRecursiveAbsolute(outPath.GetBaseDir());
            Error err = blank == 0 ? strip.SavePng(outPath) : Error.Failed;
            GD.Print(err == Error.Ok
                ? $"[PipelineStripRender] WROTE {outPath} {strip.GetWidth()}x{strip.GetHeight()}"
                : $"[PipelineStripRender] FAIL save={err} blank={blank}");
            GetTree().Quit(err == Error.Ok ? 0 : 1);
        }

        private async Task<Image> Capture(SubViewport vp)
        {
            for (int f = 0; f < 3; f++)
                await ToSignal(RenderingServer.Singleton, RenderingServer.SignalName.FramePostDraw);
            Image img = vp.GetTexture().GetImage();
            img.Convert(Image.Format.Rgba8);
            return img;
        }

        /// <summary>Share of sampled pixels that differ between two same-size frames.</summary>
        private static double ChangedShare(Image reference, Image shot)
        {
            int changed = 0, total = 0;
            for (int y = 0; y < CellH; y += 2)
            for (int x = 0; x < CellW; x += 2)
            {
                Color p = reference.GetPixel(x, y), q = shot.GetPixel(x, y);
                total++;
                if (Mathf.Abs(p.R - q.R) + Mathf.Abs(p.G - q.G) + Mathf.Abs(p.B - q.B) > 0.1f)
                    changed++;
            }
            return (double)changed / total;
        }

        private static void Drive(AnimationController anim, string state)
        {
            switch (state)
            {
                case "walk": anim.Update(true, new Vector3(1.5f, 0f, 0f)); break;
                case "run": anim.Update(true, new Vector3(12f, 0f, 0f)); break;
                case "combat_idle": anim.InCombat = true; anim.Update(true, Vector3.Zero); break;
                case "attack": anim.InCombat = true; anim.Attack(); anim.Update(true, Vector3.Zero); break;
                case "block": anim.InCombat = true; anim.Block(true); anim.Update(true, Vector3.Zero); break;
                case "hit": anim.InCombat = true; anim.Hit(); anim.Update(true, Vector3.Zero); break;
                case "death": anim.Update(false, Vector3.Zero); break;
                default: anim.Update(true, Vector3.Zero); break;
            }
        }

        private static AnimationPlayer? FindPlayer(Node n)
        {
            if (n is AnimationPlayer p)
                return p;
            foreach (Node c in n.GetChildren())
                if (FindPlayer(c) is AnimationPlayer hit)
                    return hit;
            return null;
        }
    }
}

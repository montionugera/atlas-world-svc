using System;
using System.Collections.Generic;
using System.Linq;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using Godot;
using AtlasWorld.Client.Content;
using AtlasWorld.Client.Core;
using AtlasWorld.Client.UI.Widgets;

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

        [DllImport("libc", EntryPoint = "_exit")]
        private static extern void PosixExit(int status);

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
            int exitCode = _failures == 0 ? 0 : 1;
            GD.Print(_failures == 0 ? $"{Tag} VERDICT PASS" : $"{Tag} VERDICT FAIL ({_failures} case(s))");
            Console.Out.Flush();
            Console.Error.Flush();
            if (!OS.HasFeature("windows"))
            {
                PosixExit(exitCode);
                return;
            }
            GetTree().Quit(exitCode);
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

            // F-205: POC-00 server endpoint resolution & diagnostics HUD
            string endpointWithMap = Config.ResolveServerRsEndpointForMap("ws://127.0.0.1:2567/ws?token=dev-token:test", "maro-bell");
            Report("ResolveServerRsEndpointForMap threads map=maro-bell and does not fall back to map-for-play",
                endpointWithMap.Contains("map=maro-bell") && !endpointWithMap.Contains("map-for-play"));

            string diagSummary = MaroBellPocDiagnosticsHud.FormatDiagnosticsSummary(
                "maro-bell", new Vector3(0f, 0f, 71f), new Vector2(40f, 151f), true, 16.6f, "POC-00");
            Report("MaroBellPocDiagnosticsHud formats mapId, Connected, frame time, POC beat, and 35° slope",
                diagSummary.Contains("maro-bell") && diagSummary.Contains("Connected") && diagSummary.Contains("16.6") && diagSummary.Contains("POC-00") && diagSummary.Contains("35°"));

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
            Report("every block without assetPath has a BoxMesh",
                spawned.Where(t => string.IsNullOrEmpty(t.s.AssetPath))
                       .All(t => t.node?.GetNodeOrNull<MeshInstance3D>($"Block_{t.s.Id}")?.Mesh is BoxMesh));
            var glbBlocks = spawned.Where(t => !string.IsNullOrEmpty(t.s.AssetPath)).ToList();
            Report($"all {glbBlocks.Count} assetPath blocks (2 gates + 14 lanterns + amber-shop + bram-house + tovin-shrine + old-lantern + great-bell + 6 porcelain ribs) have Glb_<id> and no Block_<id> BoxMesh",
                glbBlocks.Count == 27 && glbBlocks.All(t => t.node?.GetNodeOrNull<Node3D>($"Glb_{t.s.Id}") != null
                    && t.node?.GetNodeOrNull($"Block_{t.s.Id}") == null));
            var labelled = spawned.Where(t => t.s.Label != "").ToList();
            Report($"all {labelled.Count} labelled blocks have a Label3D", labelled.Count >= 20
                && labelled.All(t => t.node?.GetNodeOrNull<Label3D>($"Label_{t.s.Id}")?.Text == t.s.Label));
            foreach (string id in new[] { "great-bell", "npc-spot-bram", "npc-spot-pip", "npc-spot-edda", "npc-spot-amber", "npc-spot-reed", "npc-spot-tovin" })
                Report($"label node for {id}", root.FindChild($"Label_{id}", true, false) is Label3D);

            int solid = doc.Structures.Count(s => s.Kind == "block" && s.Solid);
            Report($"client obstacle grid has {solid} solid-block rects (has {doc.StaticObstacles.Count})", doc.StaticObstacles.Count == solid);
            Report("no assetPath block top is walkable (SampleHeight == base terrain)",
                glbBlocks.All(t => Mathf.Abs(
                    TerrainElevation.SampleHeight(t.s.X, t.s.Z, doc, t.s.Hover + t.s.Size.Y + 0.1f)
                    - TerrainElevation.SampleBaseTerrainHeight(t.s.X, t.s.Z, doc)) <= 0.01f));
            Report("barrel props resolved (barrel-gate-01 and barrel-gate-02)",
                root.FindChild("barrel-gate-01", true, false) != null
                && root.FindChild("barrel-gate-02", true, false) != null);
            Report($"E4 MultiMesh grass batches active ({streamer.ActiveMultiMeshBatchCount} batches, {streamer.ActiveGpuInstanceCount} GPU instances)",
                streamer.ActiveMultiMeshBatchCount >= 4 && streamer.ActiveGpuInstanceCount >= 80);
            foreach (string propId in new[] { "wall-face-w-01", "curb-w-01", "low-wall-01", "fence-panel-01", "tree-01", "bush-01", "rock-01", "shop-awning-01", "oil-jar-01", "crate-01", "sign-board-01", "bench-01", "flower-pot-01", "wall-face-w-12", "curb-w-30", "low-wall-18", "fence-panel-06", "tree-15", "bush-35", "rock-21", "shop-awning-02", "oil-jar-04", "crate-04", "sign-board-03", "bench-04", "flower-pot-04" })
                Report($"E4 prop resolved ({propId})", root.FindChild(propId, true, false) != null);
            foreach (string propId in new[] { "bell-sanctuary-arch-01", "guild-hall-01", "inn-tavern-01", "bridge-flank-w-01", "fountain-plaza-01", "windmill-sw-01", "house-blvd-w-01", "house-blvd-w-02", "house-blvd-w-03", "market-stall-01", "market-stall-02", "banner-gate-w-01", "retaining-wall-t12-w-01", "stairs-t12-w-01", "curtain-wall-s-w-01", "bastion-s-w-01", "aqueduct-arch-01", "tree-blossom-plz-01", "tree-cypress-res-01", "tree-cypress-res-02", "bush-lavender-s-01", "planter-box-s-01", "ivy-wall-t12-w-01" })
                Report($"F-224 9-zone urban/foliage prop resolved ({propId})", root.FindChild(propId, true, false) != null);
            double drawCalls = Performance.GetMonitor(Performance.Monitor.RenderTotalDrawCallsInFrame);
            double primitives = Performance.GetMonitor(Performance.Monitor.RenderTotalPrimitivesInFrame);
            double frameMs = Performance.GetMonitor(Performance.Monitor.TimeProcess) * 1000.0;
            GD.Print($"{Tag} PERF draw_calls={drawCalls:F0} primitives={primitives:F0} frame_ms={frameMs:F2} node_props={streamer.LoadedPropCount} gpu_batches={streamer.ActiveMultiMeshBatchCount} gpu_instances={streamer.ActiveGpuInstanceCount}");
            Report("live camera perf monitors sampled", frameMs >= 0.0 && streamer.LoadedPropCount >= 100);

            VerifyMaroFolkGirlInTown(root);
            VerifyPoc01WonderRoadToGreatBell(doc);
            VerifyPoc02WarmthAmberLanternErrand(doc);
            VerifyPoc03PlayfulnessSootMuncherEncounter(doc);
            VerifyPoc04EmotionalMysteryBramOldLantern(doc);
            VerifyPoc05DisturbanceEddaTimeWound(doc);

            string outDir = OS.GetEnvironment("ATLAS_RENDER_MARO_BELL");
            if (!string.IsNullOrEmpty(outDir))
                await Render(root, streamer, outDir);
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

        private void VerifyPoc01WonderRoadToGreatBell(UnifiedMapDocument doc)
        {
            var composition = MaroBellPocController.EvaluateGreatBellRevealComposition(doc, MaroBellPocController.ArrivalSpawnWorld);
            Report("MaroBellPocController.EvaluateGreatBellRevealComposition is valid", composition.IsValid);

            var poc = new MaroBellPocController { Name = "Poc01Verify" };
            AddChild(poc);
            poc.Initialize(doc);

            Report("MaroBellPocController spawns PipView, ReedView, and TovinView",
                poc.PipView != null && poc.ReedView != null && poc.TovinView != null);
            Report("PipView starts in idle animation",
                poc.PipView?.Animation.CurrentState == "idle");
            Report("MaroBellPocController environmental audio events played >= 2 and objective text populated",
                poc.EnvironmentalAudioEventsPlayed >= 2 && !string.IsNullOrEmpty(poc.ObjectiveText));

            poc.StepPlayer(MaroBellPocController.PipWorldPos, true, 0.5);
            Report("StepPlayer to Pip greets Pip, updates beat to POC-01, shows Great Bell dialogue, and sets Amber objective",
                poc.PipGreeted &&
                poc.ActiveBeat == "POC-01" &&
                poc.LastDialogueLine.Contains("Great Bell") &&
                poc.ObjectiveText.Contains("Amber"));

            poc.QueueFree();
        }

        private void VerifyPoc02WarmthAmberLanternErrand(UnifiedMapDocument doc)
        {
            var amberSpot = doc.Structures.FirstOrDefault(s => s.Id == "npc-spot-amber");
            Report("maro-bell.json declares npc-spot-amber at expected world position (1, 28)",
                amberSpot != null && Mathf.IsEqualApprox(amberSpot.X, 1f) && Mathf.IsEqualApprox(amberSpot.Z, 28f));

            var lantern06 = doc.Structures.FirstOrDefault(s => s.Id == "lantern-06");
            Report("maro-bell.json declares workshop lantern-06 near Amber (Z ~ 23.7)",
                lantern06 != null && Mathf.IsEqualApprox(lantern06.Z, 23.7f));

            var poc = new MaroBellPocController { Name = "Poc02Verify" };
            AddChild(poc);
            poc.Initialize(doc);

            Report("MaroBellPocController spawns AmberView at AmberWorldPos",
                poc.AmberView != null && poc.AmberView.Root.Position.DistanceTo(MaroBellPocController.AmberWorldPos) < 0.1f);
            Report("AmberView starts in idle animation",
                poc.AmberView?.Animation.CurrentState == "idle");
            Report("WorkshopLanternNode is initialized unlit",
                poc.WorkshopLanternNode != null && poc.WorkshopLanternLight == null && poc.LanternsLit.Count == 0);

            // 1. Greet Pip first
            poc.InteractWithPip();
            Report("Pip greeting leads to Amber visit objective",
                poc.ObjectiveText.Contains("Amber"));

            // 2. Speak with Amber to start errand
            bool errandStarted = poc.InteractWithAmber();
            Report("InteractWithAmber starts errand and asks to light workshop lantern-06",
                errandStarted &&
                poc.AmberErrandAccepted &&
                !poc.AmberErrandCompleted &&
                poc.ObjectiveText.Contains("lantern-06") &&
                poc.LastDialogueLine.Contains("workshop lantern"));

            // 3. Interact with lantern-06 across the road
            bool lanternLit = poc.TryInteractNearest(MaroBellPocController.Lantern06WorldPos);
            Report("TryInteractNearest at lantern-06 lights the lantern with OmniLight3D and emissive glow",
                lanternLit &&
                poc.LanternsLit.Contains("lantern-06") &&
                poc.WorkshopLanternLight != null &&
                poc.WorkshopLanternGlowMesh != null &&
                poc.ObjectiveText.Contains("Return to Amber"));

            // 4. Return to Amber and complete errand
            bool errandCompleted = poc.TryInteractNearest(MaroBellPocController.AmberWorldPos);
            Report("Return to Amber completes errand, transitions beat to POC-02, rewards oil, and warms dialogue",
                errandCompleted &&
                poc.AmberErrandCompleted &&
                poc.ActiveBeat == "POC-02" &&
                poc.LanternOilCount == 1 &&
                poc.LastDialogueLine.Contains("warmer the road feels already"));

            // 5. Verify idempotency on repeated interactions
            bool retryErrand = poc.CompleteAmberErrand();
            poc.TryInteractNearest(MaroBellPocController.AmberWorldPos);
            Report("Repeated interaction with Amber is idempotent (no duplicate rewards, beat stays POC-02)",
                !retryErrand &&
                poc.AmberErrandCompleted &&
                poc.ActiveBeat == "POC-02" &&
                poc.LanternOilCount == 1 &&
                poc.LanternsLit.Count == 1);

            poc.QueueFree();
        }

        private void VerifyPoc03PlayfulnessSootMuncherEncounter(UnifiedMapDocument doc)
        {
            var poc = new MaroBellPocController { Name = "Poc03Verify" };
            AddChild(poc);
            poc.Initialize(doc);

            Report("MaroBellPocController spawns SootMuncherView at SootMuncherWorldPos",
                poc.SootMuncherView != null && poc.SootMuncherView.Root.Position.DistanceTo(MaroBellPocController.SootMuncherWorldPos) < 0.1f);
            Report("SootMuncherView starts in idle animation with 60 HP",
                poc.SootMuncherView?.Animation.CurrentState == "idle" && poc.SootMuncherHp == 60f);
            Report("ParcelNode is initialized at ParcelWorldPos",
                poc.ParcelNode != null && poc.ParcelNode.Position.DistanceTo(MaroBellPocController.ParcelWorldPos) < 0.1f);

            // 1. Attempt recovering parcel before defeat must fail
            bool earlyParcel = poc.RecoverParcel();
            Report("RecoverParcel before defeating Soot Muncher fails",
                !earlyParcel && !poc.ParcelRecovered);

            // 2. Out-of-range attack check (> 3.0m)
            bool outOfRangeAttack = poc.AttackSootMuncher(5.2f, 35f);
            Report("AttackSootMuncher from 5.2m exceeds 3.0m melee range and fails",
                !outOfRangeAttack && poc.SootMuncherHp == 60f && !poc.SootMuncherDefeated);

            // 3. In-range non-lethal attack damages Soot Muncher and triggers hit
            bool firstHit = poc.AttackSootMuncher(1.5f, 35f);
            Report("In-range attack (1.5m, 35 dmg) damages Soot Muncher to 25 HP",
                firstHit && poc.SootMuncherHp == 25f && !poc.SootMuncherDefeated);

            // 4. In-range lethal attack defeats Soot Muncher
            bool fatalHit = poc.AttackSootMuncher(1.5f, 35f);
            Report("Fatal attack defeats Soot Muncher and updates objective to recover parcel",
                fatalHit && poc.SootMuncherDefeated && poc.SootMuncherHp == 0f && poc.ObjectiveText.Contains("Recover"));

            // 5. Recover parcel after defeat succeeds and updates beat to POC-03
            bool parcelRecovered = poc.RecoverParcel();
            Report("RecoverParcel after defeat succeeds, hides parcel node, and advances beat to POC-03",
                parcelRecovered && poc.ParcelRecovered && poc.ActiveBeat == "POC-03" && poc.ParcelNode?.Visible == false);

            // 6. Deliver parcel to Pip
            bool deliveredToPip = poc.ReturnParcelToPip();
            Report("ReturnParcelToPip completes delivery, triggers Pip gratitude, and advances objective to Bram",
                deliveredToPip && poc.ParcelDeliveredToPip && poc.ObjectiveText.Contains("Bram") && poc.LastDialogueLine.Contains("roasted chestnuts"));

            // 7. Reset encounter restores HP and parcel state
            poc.ResetVerminEncounter();
            Report("ResetVerminEncounter restores HP to 60, resets defeat/recovery flags, and makes parcel visible",
                poc.SootMuncherHp == 60f && !poc.SootMuncherDefeated && !poc.ParcelRecovered && poc.ParcelNode?.Visible == true);

            poc.QueueFree();
        }

        private void VerifyPoc04EmotionalMysteryBramOldLantern(UnifiedMapDocument doc)
        {
            var bramSpot = doc.Structures.FirstOrDefault(s => s.Id == "npc-spot-bram");
            Report("maro-bell.json declares npc-spot-bram at expected world position (-3.5, -24)",
                bramSpot != null && Mathf.IsEqualApprox(bramSpot.X, -3.5f) && Mathf.IsEqualApprox(bramSpot.Z, -24f));

            var oldLantern = doc.Structures.FirstOrDefault(s => s.Id == "old-lantern");
            Report("maro-bell.json declares old-lantern at expected world position (3.5, -38)",
                oldLantern != null && Mathf.IsEqualApprox(oldLantern.X, 3.5f) && Mathf.IsEqualApprox(oldLantern.Z, -38f));

            var poc = new MaroBellPocController { Name = "Poc04Verify" };
            AddChild(poc);
            poc.Initialize(doc);

            Report("MaroBellPocController spawns BramView at BramWorldPos",
                poc.BramView != null && poc.BramView.Root.Position.DistanceTo(MaroBellPocController.BramWorldPos) < 0.1f);
            Report("BramView starts in idle animation",
                poc.BramView?.Animation.CurrentState == "idle");
            Report("OldLanternNode is initialized at OldLanternWorldPos without active light",
                poc.OldLanternNode != null && poc.OldLanternLight == null && !poc.TraceGlimpsed);

            // 1. Speak with Bram
            bool bramSpoken = poc.InteractWithBram();
            bool bramCanonSafe = !poc.LastDialogueLine.Contains("Ninth")
                && !poc.LastDialogueLine.Contains("Cala Knight")
                && !poc.LastDialogueLine.Contains("9th");
            Report("InteractWithBram sets BramSpoken, objective to inspect old lantern, and keeps canon safe (no forbidden reveals)",
                bramSpoken &&
                poc.BramSpoken &&
                bramCanonSafe &&
                poc.ObjectiveText.Contains("old lantern") &&
                poc.LastDialogueLine.Contains("silver solder"));

            // 2. Inspect Old Lantern hero prop
            bool lanternInspected = poc.InspectOldLantern();
            bool inspectCanonSafe = !poc.LastDialogueLine.Contains("Ninth")
                && !poc.LastDialogueLine.Contains("Cala Knight")
                && !poc.LastDialogueLine.Contains("9th");
            Report("InspectOldLantern sets TraceGlimpsed, advances beat to POC-04, creates light/glow, and keeps canon safe",
                lanternInspected &&
                poc.TraceGlimpsed &&
                poc.ActiveBeat == "POC-04" &&
                poc.OldLanternLight != null &&
                poc.OldLanternGlowMesh != null &&
                inspectCanonSafe &&
                poc.ObjectiveText.Contains("Edda") &&
                poc.LastDialogueLine.Contains("patient devotion"));

            // 3. Repeated inspection is idempotent
            bool repeatInspect = poc.InspectOldLantern();
            Report("Repeated InspectOldLantern is idempotent and maintains POC-04 state",
                repeatInspect &&
                poc.TraceGlimpsed &&
                poc.ActiveBeat == "POC-04" &&
                poc.ObjectiveText.Contains("Edda"));

            poc.QueueFree();
        }

        private void VerifyPoc05DisturbanceEddaTimeWound(UnifiedMapDocument doc)
        {
            var eddaSpot = doc.Structures.FirstOrDefault(s => s.Id == "npc-spot-edda");
            Report("maro-bell.json declares npc-spot-edda at expected world position (-3, -57)",
                eddaSpot != null && Mathf.IsEqualApprox(eddaSpot.X, -3.0f) && Mathf.IsEqualApprox(eddaSpot.Z, -57.0f));

            var poc = new MaroBellPocController { Name = "Poc05Verify" };
            AddChild(poc);
            poc.Initialize(doc);

            Report("MaroBellPocController spawns EddaView at EddaWorldPos",
                poc.EddaView != null && poc.EddaView.Root.Position.DistanceTo(MaroBellPocController.EddaWorldPos) < 0.1f);
            Report("EddaView starts in idle animation",
                poc.EddaView?.Animation.CurrentState == "idle");
            Report("TimeWoundLanternNode is initialized with warm light before anomaly",
                poc.TimeWoundLanternNode != null && poc.TimeWoundLanternLight != null && poc.TimeWoundLanternLight.LightEnergy > 1.0f);

            // 1. Speak with Edda about Great Bell timing anomaly
            bool eddaSpoken = poc.InteractWithEdda();
            Report("InteractWithEdda sets EddaSpoken, notes Great Bell timing discrepancy, and sets lantern objective",
                eddaSpoken &&
                poc.EddaSpoken &&
                poc.ObjectiveText.Contains("terrace lantern") &&
                poc.LastDialogueLine.Contains("Three minutes early"));

            // 2. Trigger Time-Wound rapid oil drain
            bool triggered = poc.TriggerTimeWoundEvent();
            Report("TriggerTimeWoundEvent drains oil, dims light to purple/violet chill, and asks to stabilize wick",
                triggered &&
                poc.TimeWoundTriggered &&
                poc.TimeWoundLanternLight != null &&
                poc.TimeWoundLanternLight.LightEnergy < 0.5f &&
                poc.ObjectiveText.Contains("Stabilize") &&
                poc.LastDialogueLine.Contains("drains into nothingness"));

            // 3. Stabilize the cold wick
            bool stabilized = poc.StabilizeTimeWoundLantern();
            Report("StabilizeTimeWoundLantern restores warm spark, advances beat to POC-05, and sets Edda return objective",
                stabilized &&
                poc.TimeWoundStabilized &&
                poc.ActiveBeat == "POC-05" &&
                poc.TimeWoundLanternLight != null &&
                poc.TimeWoundLanternLight.LightEnergy >= 0.7f &&
                poc.ObjectiveText.Contains("Return to Edda") &&
                poc.LastDialogueLine.Contains("stubborn warmth"));

            // 4. Return to Edda to unlock Whispering Glade travel hook
            bool returnToEdda = poc.InteractWithEdda();
            Report("Return to Edda unlocks GladeHookUnlocked and concludes 10-minute POC with hopeful road hook",
                returnToEdda &&
                poc.GladeHookUnlocked &&
                poc.ObjectiveText.Contains("POC Complete") &&
                poc.LastDialogueLine.Contains("Whispering Glade"));

            // 5. Repeated triggers/stabilizations are idempotent
            bool repeatTrigger = poc.TriggerTimeWoundEvent();
            bool repeatStabilize = poc.StabilizeTimeWoundLantern();
            Report("Repeated Time-Wound interactions are idempotent",
                !repeatTrigger && !repeatStabilize && poc.TimeWoundStabilized && poc.ActiveBeat == "POC-05");

            poc.QueueFree();
        }

        private static Texture2D? ExtractAlbedoTexture(MapChunkStreamer streamer, string key)
        {
            Mesh? mesh = streamer.ResolvePrototypeMesh(key);
            if (mesh != null && mesh.GetSurfaceCount() > 0 && mesh.SurfaceGetMaterial(0) is BaseMaterial3D bm && bm.AlbedoTexture != null)
                return bm.AlbedoTexture;
            if (AssetRegistry.Instance is { } reg)
            {
                PackedScene scene = reg.Resolve(key, out ResolveTier tier);
                if (tier != ResolveTier.Capsule && scene.ResourcePath.EndsWith(".glb", StringComparison.OrdinalIgnoreCase))
                {
                    string texPath = scene.ResourcePath[..^4] + "_0.png";
                    if (ResourceLoader.Exists(texPath))
                        return GD.Load<Texture2D>(texPath);
                }
            }
            return null;
        }

        private async Task Render(Node3D root, MapChunkStreamer streamer, string outDir)
        {
            // Own World3D: the main scene's floor, sky and HUD must not leak into the shots (as PipelineStripRender).
            var vp = new SubViewport { Size = new Vector2I(1280, 720), OwnWorld3D = true, RenderTargetUpdateMode = SubViewport.UpdateMode.Always };
            AddChild(vp);
            root.Reparent(vp);
            _vp = vp;
            Texture2D? meadowTex = ExtractAlbedoTexture(streamer, "env:maro-ground-meadow");
            Texture2D? cobbleTex = ExtractAlbedoTexture(streamer, "env:maro-road-cobble");
            Texture2D? plazaTex = ExtractAlbedoTexture(streamer, "env:maro-ground-plaza-flagstone");
            Texture2D? terraceTex = ExtractAlbedoTexture(streamer, "env:maro-ground-terrace-tile");

            // 1. Base Alpine Meadow Floor
            var groundMat = new StandardMaterial3D
            {
                AlbedoColor = meadowTex != null ? new Color(0.95f, 0.98f, 0.92f) : new Color(0.36f, 0.48f, 0.34f),
                Roughness = 0.88f,
            };
            if (meadowTex != null)
            {
                groundMat.AlbedoTexture = meadowTex;
                groundMat.Uv1Scale = new Vector3(36f, 60f, 1f);
            }
            root.AddChild(new MeshInstance3D
            {
                Name = "AlpineMeadowFloor",
                Mesh = new PlaneMesh { Size = new Vector2(160f, 240f) },
                Position = new Vector3(0f, -0.04f, 0f),
                MaterialOverride = groundMat,
            });

            // 2. Southern River & Moat Water Surface + Stone Quay Embankments (Category B1, B2)
            var waterMat = new StandardMaterial3D
            {
                AlbedoColor = new Color(0.14f, 0.48f, 0.64f),
                Metallic = 0.25f,
                Roughness = 0.12f,
                SpecularMode = BaseMaterial3D.SpecularModeEnum.SchlickGgx,
            };
            root.AddChild(new MeshInstance3D
            {
                Name = "river_water_surface",
                Mesh = new BoxMesh { Size = new Vector3(130f, 0.08f, 15.0f) },
                Position = new Vector3(0f, -0.02f, 84.5f),
                MaterialOverride = waterMat,
            });
            // Western & Eastern outer moat channels
            foreach (float moatX in new[] { -38.5f, 38.5f })
            {
                root.AddChild(new MeshInstance3D
                {
                    Mesh = new BoxMesh { Size = new Vector3(6.5f, 0.08f, 156f) },
                    Position = new Vector3(moatX, -0.02f, 0f),
                    MaterialOverride = waterMat,
                });
            }

            var terraceMat = new StandardMaterial3D
            {
                AlbedoColor = terraceTex != null ? new Color(0.96f, 0.94f, 0.90f) : new Color(0.76f, 0.72f, 0.66f),
                Roughness = 0.82f,
            };
            if (terraceTex != null)
            {
                terraceMat.AlbedoTexture = terraceTex;
                terraceMat.Uv1Scale = new Vector3(16f, 2f, 1f);
            }
            // River quay walls on north (z=77.2) and south (z=91.8) banks
            foreach (float bankZ in new[] { 77.2f, 91.8f })
            {
                root.AddChild(new MeshInstance3D
                {
                    Mesh = new BoxMesh { Size = new Vector3(110f, 0.22f, 1.4f) },
                    Position = new Vector3(0f, 0.05f, bankZ),
                    MaterialOverride = terraceMat,
                });
            }

            // 3. Central Circular Flagstone Plaza (Zone 1/2 hub at x=0, z=-10) & Upper Sanctuary Terrace
            var plazaMat = new StandardMaterial3D
            {
                AlbedoColor = plazaTex != null ? new Color(0.98f, 0.96f, 0.93f) : new Color(0.82f, 0.78f, 0.72f),
                Roughness = 0.78f,
            };
            if (plazaTex != null)
            {
                plazaMat.AlbedoTexture = plazaTex;
                plazaMat.Uv1Scale = new Vector3(10f, 10f, 1f);
            }
            root.AddChild(new MeshInstance3D
            {
                Name = "CentralCircularPlaza",
                Mesh = new CylinderMesh { TopRadius = 18.5f, BottomRadius = 18.5f, Height = 0.05f, RadialSegments = 48 },
                Position = new Vector3(0f, 0.015f, -10f),
                MaterialOverride = plazaMat,
            });
            root.AddChild(new MeshInstance3D
            {
                Name = "CentralPlazaOuterCurbRing",
                Mesh = new CylinderMesh { TopRadius = 19.6f, BottomRadius = 19.6f, Height = 0.03f, RadialSegments = 48 },
                Position = new Vector3(0f, 0.005f, -10f),
                MaterialOverride = terraceMat,
            });

            // Adventurer's Guild Courtyard (East Zone 5, x=18, z=-4)
            root.AddChild(new MeshInstance3D
            {
                Name = "GuildCourtyardSurface",
                Mesh = new BoxMesh { Size = new Vector3(18f, 0.04f, 16f) },
                Position = new Vector3(18f, 0.01f, -4f),
                MaterialOverride = plazaMat,
            });

            // Crafting & Bram Courtyard (West Zone 3, x=-15, z=-18)
            root.AddChild(new MeshInstance3D
            {
                Name = "CraftingCourtyardSurface",
                Mesh = new BoxMesh { Size = new Vector3(18f, 0.04f, 20f) },
                Position = new Vector3(-15f, 0.01f, -18f),
                MaterialOverride = terraceMat,
            });

            // Upper Great Bell Sanctuary Terrace (North Zone 1/8, z=-42..-74)
            root.AddChild(new MeshInstance3D
            {
                Name = "SanctuaryLowerTerrace",
                Mesh = new BoxMesh { Size = new Vector3(42f, 0.06f, 32f) },
                Position = new Vector3(0f, 0.01f, -58f),
                MaterialOverride = terraceMat,
            });
            root.AddChild(new MeshInstance3D
            {
                Name = "SanctuaryInnerDais",
                Mesh = new CylinderMesh { TopRadius = 14.5f, BottomRadius = 15.0f, Height = 0.08f, RadialSegments = 48 },
                Position = new Vector3(0f, 0.025f, -64f),
                MaterialOverride = plazaMat,
            });

            // 4. Main Cobblestone Boulevard + Radial Zone Streets (Category C1)
            void AddCobbleRibbon(Vector3 a, Vector3 b, float width, float yHeight = 0.025f)
            {
                float segLen = a.DistanceTo(b);
                if (segLen < 0.1f)
                    return;
                var roadMat = new StandardMaterial3D
                {
                    AlbedoColor = cobbleTex != null ? new Color(0.95f, 0.93f, 0.90f) : new Color(0.46f, 0.44f, 0.42f),
                    Roughness = 0.84f,
                };
                if (cobbleTex != null)
                {
                    roadMat.AlbedoTexture = cobbleTex;
                    roadMat.Uv1Scale = new Vector3(Mathf.Max(1f, width / 4f), Mathf.Max(1f, segLen / 4f), 1f);
                }
                var seg = new MeshInstance3D
                {
                    Mesh = new BoxMesh { Size = new Vector3(width, 0.04f, segLen) },
                    MaterialOverride = roadMat,
                };
                root.AddChild(seg);
                seg.Position = new Vector3((a.X + b.X) * 0.5f, yHeight, (a.Z + b.Z) * 0.5f);
                seg.LookAt(seg.Position + (b - a), Vector3.Up);
            }

            var doc = UnifiedMapDocument.LoadOrDefault("maro-bell");
            var road = doc.Routes[0];
            // Bridge approach from south bank (z=94) to city gate (z=75)
            AddCobbleRibbon(new Vector3(0f, 0f, 94f), new Vector3(0f, 0f, 75f), 8.2f, 0.03f);
            for (int i = 0; i < road.Points.Count - 1; i++)
            {
                var a = new Vector3(road.Points[i][0], 0f, road.Points[i][1]);
                var b = new Vector3(road.Points[i + 1][0], 0f, road.Points[i + 1][1]);
                AddCobbleRibbon(a, b, 9.2f, 0.025f);
            }
            // Radial Zone Streets branching from the Boulevard & Central Plaza
            AddCobbleRibbon(new Vector3(0f, 0f, 16f), new Vector3(-24f, 0f, 16f), 6.0f, 0.02f);
            AddCobbleRibbon(new Vector3(-20f, 0f, 16f), new Vector3(-20f, 0f, -42f), 5.8f, 0.02f);
            AddCobbleRibbon(new Vector3(-20f, 0f, -24f), new Vector3(0f, 0f, -24f), 5.8f, 0.02f);
            AddCobbleRibbon(new Vector3(0f, 0f, -4f), new Vector3(24f, 0f, -4f), 6.5f, 0.02f);
            AddCobbleRibbon(new Vector3(18f, 0f, 16f), new Vector3(18f, 0f, -50f), 5.8f, 0.02f);
            AddCobbleRibbon(new Vector3(0f, 0f, -28f), new Vector3(20f, 0f, -28f), 5.8f, 0.02f);

            // 5. Golden Alpine Sunlight & Sky (Category A3)
            root.AddChild(new DirectionalLight3D
            {
                RotationDegrees = new Vector3(-48f, 28f, 0f),
                LightColor = new Color(1.0f, 0.96f, 0.88f),
                LightEnergy = 1.15f,
                ShadowEnabled = true,
            });
            var skyMat = new ProceduralSkyMaterial
            {
                SkyTopColor = new Color(0.20f, 0.46f, 0.84f),
                SkyHorizonColor = new Color(0.72f, 0.87f, 0.98f),
                GroundBottomColor = new Color(0.28f, 0.36f, 0.26f),
                GroundHorizonColor = new Color(0.64f, 0.80f, 0.90f),
            };
            root.AddChild(new WorldEnvironment
            {
                Environment = new Godot.Environment
                {
                    BackgroundMode = Godot.Environment.BGMode.Sky,
                    Sky = new Sky { SkyMaterial = skyMat },
                    AmbientLightSource = Godot.Environment.AmbientSource.Color,
                    AmbientLightColor = new Color(0.78f, 0.80f, 0.85f),
                    AmbientLightEnergy = 0.88f,
                    TonemapMode = Godot.Environment.ToneMapper.Filmic,
                },
            });
            var cam = new Camera3D { Current = true };
            root.AddChild(cam);

            // Top-down, orthographic: north (-Z) is screen-up, 185 m tall frame holds the whole 160 m map + south river.
            cam.Projection = Camera3D.ProjectionType.Orthogonal;
            cam.Size = 185f;
            cam.Position = new Vector3(0f, 250f, 5f);
            cam.RotationDegrees = new Vector3(-90f, 0f, 0f);
            await Save(outDir, "maro-bell-top-down.png");

            // Eye height 1.0 m at the arrival spawn, looking north to the bell.
            cam.Projection = Camera3D.ProjectionType.Perspective;
            cam.Fov = 70f;
            cam.Far = 600f;
            cam.Position = new Vector3(0f, 1.0f, 71f);
            cam.LookAt(new Vector3(0f, 7f, -66f), Vector3.Up);
            await Save(outDir, "maro-bell-eye-gate.png");

            // AC7: from the town side, looking south at both gate towers and their door openings.
            cam.Position = new Vector3(0f, 1.6f, 66f);
            cam.LookAt(new Vector3(0f, 3.5f, 76f), Vector3.Up);
            await Save(outDir, "maro-bell-gate-towers.png");

            // E4 live game camera (tuning.json 6.2 m / ~32 deg pitch / FOV 60) looking north across the arrival slice.
            cam.Fov = 60f;
            cam.Position = new Vector3(0f, 3.6f, 75.2f);
            cam.LookAt(new Vector3(0f, 0.8f, 60.0f), Vector3.Up);
            await Save(outDir, "maro-bell-live-camera.png", logPerf: true);

            // E4 Amber's oil shop approach shot (z = 28).
            cam.Fov = 55f;
            cam.Position = new Vector3(-4.5f, 2.6f, 35.5f);
            cam.LookAt(new Vector3(5.0f, 2.2f, 28.0f), Vector3.Up);
            await Save(outDir, "maro-bell-amber-shop.png");

            // E4 Slice 2: Bram's lantern house approach shot (z = -24).
            cam.Fov = 55f;
            cam.Position = new Vector3(2.0f, 2.6f, -18.0f);
            cam.LookAt(new Vector3(-8.5f, 2.4f, -24.0f), Vector3.Up);
            await Save(outDir, "maro-bell-bram-house.png");

            // E4 Slice 2: Old Lantern & northern road shot (z = -38).
            cam.Fov = 55f;
            cam.Position = new Vector3(-1.8f, 1.9f, -32.5f);
            cam.LookAt(new Vector3(3.2f, 1.5f, -38.5f), Vector3.Up);
            await Save(outDir, "maro-bell-old-lantern.png");

            // E4 Slice 2: Tovin's archive shrine approach shot (z = -50).
            cam.Fov = 55f;
            cam.Position = new Vector3(-1.5f, 2.8f, -43.0f);
            cam.LookAt(new Vector3(9.5f, 2.5f, -50.0f), Vector3.Up);
            await Save(outDir, "maro-bell-tovin-shrine.png");

            // E4 Slice 2: Great Bell Terrace northern vista shot (z = -66).
            cam.Fov = 60f;
            cam.Position = new Vector3(0f, 3.2f, -49.0f);
            cam.LookAt(new Vector3(0f, 9.5f, -66.0f), Vector3.Up);
            await Save(outDir, "maro-bell-great-bell-terrace.png");

            // =========================================================================
            // F-224 Concept-Matched 5 Camera Shots (Categories F1..F5)
            // =========================================================================
            // F1: Riverside Bridge & South Gate Approach (matches 05-maro-bell-riverside-market.png)
            cam.Fov = 60f;
            cam.Position = new Vector3(-24.0f, 5.2f, 92.0f);
            cam.LookAt(new Vector3(0.0f, 3.0f, 76.0f), Vector3.Up);
            await Save(outDir, "maro-bell-concept-f1-riverside-bridge.png");

            // F2: Main Market Boulevard looking North toward the Bell Sanctuary (matches 10 & 11)
            cam.Fov = 58f;
            cam.Position = new Vector3(0.0f, 2.6f, 62.0f);
            cam.LookAt(new Vector3(0.0f, 5.5f, -66.0f), Vector3.Up);
            await Save(outDir, "maro-bell-concept-f2-market-boulevard.png");

            // F3: Central Circular Plaza with Astrolabe Fountain, Blossom Trees & Guild Hall (matches 10 center)
            cam.Fov = 60f;
            cam.Position = new Vector3(-13.5f, 3.6f, 6.5f);
            cam.LookAt(new Vector3(6.0f, 3.5f, -12.0f), Vector3.Up);
            await Save(outDir, "maro-bell-concept-f3-central-plaza.png");

            // F4: Upper Great Bell Sanctuary Arch & Terrace Stairs (matches 11 top-left)
            cam.Fov = 58f;
            cam.Position = new Vector3(0.0f, 3.8f, -34.0f);
            cam.LookAt(new Vector3(0.0f, 10.5f, -66.0f), Vector3.Up);
            await Save(outDir, "maro-bell-concept-f4-bell-sanctuary.png");

            // F5: 3/4 Bird's-Eye 9-Zone Town Overview (matches 10 & 11 right panel)
            cam.Fov = 52f;
            cam.Position = new Vector3(-52.0f, 56.0f, 108.0f);
            cam.LookAt(new Vector3(0.0f, 2.0f, -5.0f), Vector3.Up);
            await Save(outDir, "maro-bell-concept-f5-birdseye-9zones.png");

            await RenderM1MasterPlanViews(outDir);

            if (OS.GetEnvironment("ATLAS_RENDER_MARO_GIRL_FRAMES") == "1")
                await RenderMaroFolkGirlInBellTown(root, cam, outDir);
        }

        private async Task RenderM1MasterPlanViews(string outDir)
        {
            string m1GlbPath = ProjectSettings.GlobalizePath("res://studio-cache/env/m1/maro_bell_m1_masterplan.glb");
            if (!System.IO.File.Exists(m1GlbPath))
                return;

            var gltfDoc = new GltfDocument();
            var gltfState = new GltfState();
            Error err = gltfDoc.AppendFromFile(m1GlbPath, gltfState);
            Report("F-225 M1 Master Plan GLB loads via GltfDocument", err == Error.Ok);
            if (err != Error.Ok)
                return;

            Node? sceneNode = gltfDoc.GenerateScene(gltfState);
            Report("F-225 M1 Master Plan instantiates Node3D root", sceneNode is Node3D);
            if (sceneNode is not Node3D m1Root)
                return;

            foreach (string requiredNode in new[]
            {
                "M1_ValleyTerrain",
                "M1_River_WaterSurface",
                "M1_Zone9_ThreeArchBridge",
                "M1_Zone1_CentralCircularPlaza_Outer",
                "M1_Sanctuary_RomanesqueArch",
                "M1_ScaleRef_SouthBridge_Body130m",
            })
            {
                Report($"F-225 M1 Master Plan node present ({requiredNode})", m1Root.FindChild(requiredNode, true, false) != null);
            }

            SubViewport? prevVp = _vp;
            var m1Vp = new SubViewport
            {
                Size = new Vector2I(1600, 1200),
                OwnWorld3D = true,
                RenderTargetUpdateMode = SubViewport.UpdateMode.Always,
            };
            AddChild(m1Vp);
            m1Vp.AddChild(m1Root);
            _vp = m1Vp;

            // Spawn 1.30m player character (maro_folk_girl) on the southern approach for scale verification
            if (AssetRegistry.Instance is { } reg)
            {
                PackedScene girlScene = reg.Resolve(PipelineCharVerify.MaroGirlKey, out ResolveTier tier);
                if (tier == ResolveTier.Bespoke)
                {
                    var girl = (Node3D)girlScene.Instantiate();
                    m1Root.AddChild(girl);
                    EntityView.ApplyAnimeToonShading(girl, EntityKind.Player);
                    new WeaponSocket(girl).EquipByKey("sword");
                    girl.Position = new Vector3(-2.2f, 4.10f, 148.0f);
                    girl.Rotation = new Vector3(0f, Mathf.Pi, 0f);
                }
            }

            m1Root.AddChild(new DirectionalLight3D
            {
                RotationDegrees = new Vector3(-46f, 34f, 0f),
                LightColor = new Color(1.0f, 0.95f, 0.86f),
                LightEnergy = 1.15f,
                ShadowEnabled = true,
                DirectionalShadowMaxDistance = 750f,
            });
            var skyMat = new ProceduralSkyMaterial
            {
                SkyTopColor = new Color(0.22f, 0.48f, 0.84f),
                SkyHorizonColor = new Color(0.74f, 0.88f, 0.98f),
                GroundBottomColor = new Color(0.24f, 0.36f, 0.22f),
                GroundHorizonColor = new Color(0.68f, 0.82f, 0.92f),
            };
            m1Root.AddChild(new WorldEnvironment
            {
                Environment = new Godot.Environment
                {
                    BackgroundMode = Godot.Environment.BGMode.Sky,
                    Sky = new Sky { SkyMaterial = skyMat },
                    AmbientLightSource = Godot.Environment.AmbientSource.Sky,
                    AmbientLightColor = new Color(0.76f, 0.82f, 0.90f),
                    AmbientLightEnergy = 0.65f,
                    TonemapMode = Godot.Environment.ToneMapper.Filmic,
                    FogEnabled = true,
                    FogLightColor = new Color(0.74f, 0.86f, 0.96f),
                    FogDensity = 0.0008f,
                    FogSkyAffect = 0.15f,
                },
            });

            var m1Cam = new Camera3D { Current = true, Near = 0.2f, Far = 1400f };
            m1Root.AddChild(m1Cam);

            // M1 View 4 (Required): Godot 4 Player-Eye Southern Ascent View (1.30m eye height on Tier 1A Boulevard Z=+158m, Y=+3.95m+1.30m=+5.25m)
            // showing the stepped ramp (1A->1B), Plaza approach stairs (1B->2A), Central Plaza Astrolabe, Grand Staircase (2A->3), and 52m Great Bell Sanctuary
            m1Cam.Projection = Camera3D.ProjectionType.Perspective;
            m1Cam.Fov = 54f;
            m1Cam.Position = new Vector3(0.0f, 5.25f, 158.0f);
            m1Cam.LookAt(new Vector3(0.0f, 36.0f, -115.0f), Vector3.Up);
            await Save(outDir, "m1_view4_godot_player_eye_south.png");

            // M1 View 4b: Mid-Boulevard Player-Eye View approaching Tier 1->2 Stairs & Central Plaza (Z=+82m, Y=+8.95m+1.30m=+10.25m)
            m1Cam.Fov = 54f;
            m1Cam.Position = new Vector3(0.0f, 10.25f, 82.0f);
            m1Cam.LookAt(new Vector3(0.0f, 40.0f, -115.0f), Vector3.Up);
            await Save(outDir, "m1_view4b_godot_boulevard_eye.png");

            // M1 View 2 (Godot Cross-Check): 3/4 Bird's-Eye Aerial matching Shot 5 (420m Playable Town)
            m1Cam.Fov = 46f;
            m1Cam.Position = new Vector3(-85.0f, 245.0f, 430.0f);
            m1Cam.LookAt(new Vector3(0.0f, 18.0f, -10.0f), Vector3.Up);
            await Save(outDir, "m1_view2_godot_birdseye_shot5.png");

            _vp = prevVp;
            m1Vp.QueueFree();
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

        private async Task Save(string dir, string file, bool logPerf = false)
        {
            await ToSignal(RenderingServer.Singleton, RenderingServer.SignalName.FramePostDraw);
            ulong t0 = Time.GetTicksUsec();
            for (int f = 0; f < 3; f++)
                await ToSignal(RenderingServer.Singleton, RenderingServer.SignalName.FramePostDraw);
            if (logPerf)
            {
                double avgFrameMs = (Time.GetTicksUsec() - t0) / 3000.0;
                GD.Print($"{Tag} LIVE_CAMERA_PERF draw_calls={Performance.GetMonitor(Performance.Monitor.RenderTotalDrawCallsInFrame):F0} primitives={Performance.GetMonitor(Performance.Monitor.RenderTotalPrimitivesInFrame):F0} frame_ms={avgFrameMs:F2}");
            }
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

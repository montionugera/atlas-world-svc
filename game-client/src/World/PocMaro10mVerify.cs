using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Godot;
using AtlasWorld.Client.Content;
using AtlasWorld.Client.Core;
using AtlasWorld.Client.UI.Widgets;

namespace AtlasWorld.Client.World
{
    /// <summary>
    /// F-211 / E-011 env-gated probe (ATLAS_VERIFY_POC_MARO_10M=1, run by VerticalSliceRoot):
    /// Headless end-to-end verification probe for the First 10 Minutes Maro Bell POC (POC-00..POC-06).
    /// Executes the full critical path from arrival to the Time-Wound climax and Whispering Glade hook,
    /// verifies beat timestamp telemetry, and asserts all 7 metrics on the POC Evaluation Scorecard.
    /// Prints "[PocMaro10mVerify] VERDICT PASS" (exit 0) or FAIL (exit 1).
    /// </summary>
    public sealed partial class PocMaro10mVerify : Node
    {
        private const string Tag = "[PocMaro10mVerify]";
        private int _failures;

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

        private void Report(string name, bool ok)
        {
            if (ok)
            {
                GD.Print($"{Tag} PASS: {name}");
            }
            else
            {
                _failures++;
                GD.PrintErr($"{Tag} FAIL: {name}");
            }
        }

        private async Task Run()
        {
            // Beat 00: Baseline integration & layout
            Report("default map id is freja-south-gate", VerticalSliceRoot.ResolveMapId("") == "freja-south-gate");
            Report("ATLAS_MAP_ID=maro-bell selects maro-bell", VerticalSliceRoot.ResolveMapId("maro-bell") == "maro-bell");

            string endpointWithMap = Config.ResolveServerRsEndpointForMap("ws://127.0.0.1:2567/ws?token=dev-token:test", "maro-bell");
            Report("ResolveServerRsEndpointForMap threads map=maro-bell and avoids fallback to map-for-play",
                endpointWithMap.Contains("map=maro-bell") && !endpointWithMap.Contains("map-for-play"));

            string diagSummary = MaroBellPocDiagnosticsHud.FormatDiagnosticsSummary(
                "maro-bell", MaroBellPocController.ArrivalSpawnWorld, new Vector2(40f, 151f), true, 16.6f, "POC-00");
            Report("MaroBellPocDiagnosticsHud formats mapId, Connected, frame time, POC beat, and 35° slope",
                diagSummary.Contains("maro-bell") && diagSummary.Contains("Connected") && diagSummary.Contains("POC-00") && diagSummary.Contains("35°"));

            var doc = UnifiedMapDocument.LoadOrDefault("maro-bell");
            int blocks = doc.Structures.Count(s => s.Kind == "block");
            Report($"maro-bell.json loaded ({blocks} block structures, 80x160m layout)",
                doc.MapId == "maro-bell" && blocks >= 40 && doc.Width == 80f && doc.Height == 160f);

            TerrainElevation.GlobalAmplitude = doc.TerrainAmplitude;
            var pocRoot = new Node3D { Name = "PocMaro10mRoot" };
            AddChild(pocRoot);

            var poc = new MaroBellPocController { Name = "PocMaro10mController" };
            pocRoot.AddChild(poc);
            poc.Initialize(doc);

            Report("POC Controller initializes with POC-00 timestamp and all key NPCs spawned",
                poc.BeatTimestamps.ContainsKey("POC-00") &&
                poc.PipView != null && poc.AmberView != null &&
                poc.BramView != null && poc.EddaView != null && poc.SootMuncherView != null);

            // Beat 01: Wonder — Road to the Great Bell
            var composition = MaroBellPocController.EvaluateGreatBellRevealComposition(doc, MaroBellPocController.ArrivalSpawnWorld);
            Report("Beat 01: Great Bell reveal composition is valid", composition.IsValid);

            poc.StepPlayer(MaroBellPocController.PipWorldPos, true, 0.5);
            bool pipGreeted = poc.InteractWithPip();
            Report("Beat 01: Pip greeted, advances beat to POC-01, sets Amber objective, records timestamp",
                pipGreeted &&
                poc.PipGreeted &&
                poc.ActiveBeat == "POC-01" &&
                poc.BeatTimestamps.ContainsKey("POC-01") &&
                poc.ObjectiveText.Contains("Amber"));

            // Beat 02: Warmth — A Small Kindness
            bool amberSpoken = poc.InteractWithAmber();
            Report("Beat 02: Amber errand accepted, asks to light workshop lantern-06",
                amberSpoken && poc.AmberErrandAccepted && !poc.AmberErrandCompleted);

            bool lanternLit = poc.TryInteractNearest(MaroBellPocController.Lantern06WorldPos);
            Report("Beat 02: Workshop lantern-06 lit with OmniLight3D and emissive glow",
                lanternLit && poc.LanternsLit.Contains("lantern-06") && poc.WorkshopLanternLight != null);

            bool amberDone = poc.TryInteractNearest(MaroBellPocController.AmberWorldPos);
            Report("Beat 02: Return to Amber completes errand, rewards oil, transitions beat to POC-02",
                amberDone &&
                poc.AmberErrandCompleted &&
                poc.ActiveBeat == "POC-02" &&
                poc.LanternOilCount == 1 &&
                poc.BeatTimestamps.ContainsKey("POC-02"));

            // Beat 03: Playfulness — The Missing Delivery
            bool outOfRangeAttack = poc.AttackSootMuncher(5.2f, 35f);
            Report("Beat 03: Out-of-range attack (>3.0m) fails under server authority", !outOfRangeAttack && poc.SootMuncherHp == 60f);

            bool hit1 = poc.AttackSootMuncher(1.5f, 35f);
            bool hit2 = poc.AttackSootMuncher(1.5f, 35f);
            Report("Beat 03: In-range attacks defeat Soot Muncher (HP 60 -> 25 -> 0)",
                hit1 && hit2 && poc.SootMuncherDefeated && Mathf.IsZeroApprox(poc.SootMuncherHp));

            bool parcelRecovered = poc.RecoverParcel();
            Report("Beat 03: Recover parcel succeeds, advances beat to POC-03, records timestamp",
                parcelRecovered && poc.ParcelRecovered && poc.ActiveBeat == "POC-03" && poc.BeatTimestamps.ContainsKey("POC-03"));

            bool parcelDelivered = poc.ReturnParcelToPip();
            Report("Beat 03: Return parcel to Pip completes delivery, advances objective to Bram",
                parcelDelivered && poc.ParcelDeliveredToPip && poc.ObjectiveText.Contains("Bram"));

            // Beat 04: Emotional Mystery — Bram's Old Lantern & First Trace
            bool bramSpoken = poc.InteractWithBram();
            Report("Beat 04: Bram spoken, sets old lantern inspection objective",
                bramSpoken && poc.BramSpoken && poc.ObjectiveText.Contains("old lantern"));

            bool lanternInspected = poc.InspectOldLantern();
            bool canonSafe = !poc.LastDialogueLine.Contains("Ninth")
                && !poc.LastDialogueLine.Contains("Cala Knight")
                && !poc.LastDialogueLine.Contains("9th");
            Report("Beat 04: Old lantern inspected, sets TraceGlimpsed, advances to POC-04, preserves Last Cala Knight canon",
                lanternInspected &&
                poc.TraceGlimpsed &&
                poc.ActiveBeat == "POC-04" &&
                poc.BeatTimestamps.ContainsKey("POC-04") &&
                canonSafe &&
                poc.OldLanternLight != null);

            // Beat 05: Disturbance — A Bell Out of Time & The Impossible Flame
            bool eddaSpoken = poc.InteractWithEdda();
            Report("Beat 05: Edda spoken, notices Great Bell timing anomaly",
                eddaSpoken && poc.EddaSpoken && poc.ObjectiveText.Contains("terrace lantern"));

            bool timeWound = poc.TriggerTimeWoundEvent();
            Report("Beat 05: Time-Wound triggered, drains oil rapidly, shifts light to cold violet",
                timeWound && poc.TimeWoundTriggered && poc.TimeWoundLanternLight != null && poc.TimeWoundLanternLight.LightEnergy < 0.5f);

            bool stabilized = poc.StabilizeTimeWoundLantern();
            Report("Beat 05: Cold wick stabilized, restores warm spark, advances beat to POC-05",
                stabilized && poc.TimeWoundStabilized && poc.ActiveBeat == "POC-05" && poc.BeatTimestamps.ContainsKey("POC-05"));

            bool eddaReturn = poc.InteractWithEdda();
            Report("Beat 05: Return to Edda unlocks Whispering Glade travel hook",
                eddaReturn && poc.GladeHookUnlocked && poc.ObjectiveText.Contains("POC Complete"));

            // Beat 06: Conclude POC, evaluate scorecard and telemetry
            bool concluded = poc.ConcludePoc();
            Report("Beat 06: ConcludePoc advances beat to POC-06 and records timestamp",
                concluded && poc.ActiveBeat == "POC-06" && poc.BeatTimestamps.ContainsKey("POC-06"));

            // Telemetry: Verify all 7 beat timestamps are recorded
            string[] expectedBeats = { "POC-00", "POC-01", "POC-02", "POC-03", "POC-04", "POC-05", "POC-06" };
            bool allBeatsRecorded = expectedBeats.All(b => poc.BeatTimestamps.ContainsKey(b));
            Report("Telemetry: All 7 POC beats (POC-00..POC-06) have recorded timestamps", allBeatsRecorded);

            // Scorecard: Evaluate the 7-metric POC Success Scorecard
            var scorecard = poc.EvaluateScorecard(doc);
            GD.Print("\n" + scorecard.FormatTable());

            Report("Scorecard M-01 (Landmark Discovery): Achieved >= 80%",
                scorecard.Metrics.First(m => m.Id == "M-01").Passed);
            Report("Scorecard M-02 (Movement & Traversal): Achieved >= 90%",
                scorecard.Metrics.First(m => m.Id == "M-02").Passed);
            Report("Scorecard M-03 (Warmth Recall): Achieved >= 70%",
                scorecard.Metrics.First(m => m.Id == "M-03").Passed);
            Report("Scorecard M-04 (Combat Clarity): Achieved >= 80%",
                scorecard.Metrics.First(m => m.Id == "M-04").Passed);
            Report("Scorecard M-05 (Mystery Comprehension): Achieved >= 80%",
                scorecard.Metrics.First(m => m.Id == "M-05").Passed);
            Report("Scorecard M-06 (Curiosity to Continue): Achieved >= 70%",
                scorecard.Metrics.First(m => m.Id == "M-06").Passed);
            Report("Scorecard M-07 (Technical Stability): Achieved = 100%",
                scorecard.Metrics.First(m => m.Id == "M-07").Passed);
            Report("Scorecard: All 7 metrics passed with average score >= 90%",
                scorecard.AllPassed && scorecard.AverageScore >= 90f);

            pocRoot.QueueFree();
            await Task.Yield();
        }
    }
}

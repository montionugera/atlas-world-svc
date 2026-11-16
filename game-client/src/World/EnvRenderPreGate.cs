using System;
using System.Collections.Generic;
using System.Linq;
using System.Runtime.InteropServices;
using Godot;

namespace AtlasWorld.Client.World
{
    public class SightlineResult
    {
        public bool Passed { get; set; }
        public float OcclusionRatio { get; set; }
        public int BlockedRayCount { get; set; }
        public int TotalRayCount { get; set; } = 5;
        public string? BlockingColliderName { get; set; }
        public Vector3 SuggestedCamOffset { get; set; }
        public Vector3 SuggestedCamPos { get; set; }
    }

    public class DeprecatedSweepResult
    {
        public List<Node3D> DeprecatedNodesFound { get; } = new();
        public List<Node3D> HiddenNodes { get; } = new();
        public List<ZFightConflict> ZFightConflicts { get; } = new();
        public bool HasIssues => DeprecatedNodesFound.Count > 0 || ZFightConflicts.Count > 0;
    }

    public class ZFightConflict
    {
        public Node3D NodeA { get; set; } = null!;
        public Node3D NodeB { get; set; } = null!;
        public float DeltaY { get; set; }
        public float XZOverlapRatio { get; set; }
        public string Description { get; set; } = "";
    }

    public class TimeDeltaStripResult
    {
        public bool Passed { get; set; }
        public bool ParameterVaried { get; set; }
        public bool PixelsVaried { get; set; }
        public List<string> Errors { get; } = new();
        public string? ErrorMessage => Errors.Count > 0 ? string.Join("; ", Errors) : null;
    }

    /// <summary>
    /// Environment Pre-Render Sightline, Scene-Deprecation, Strip-Delta &amp; Import Verification Gate.
    /// Provides verification algorithms to prevent occluded cameras, deprecated milestone nodes/z-fighting,
    /// and static shader strip animations.
    /// </summary>
    public static class EnvRenderPreGate
    {
        /// <summary>
        /// Casts 5 rays (center + 4 inner frustum target points) using PhysicsDirectSpaceState3D.
        /// Returns structured pass/fail, blocking collider info, and suggested unoccluded camera position/offset.
        /// </summary>
        public static SightlineResult CheckCameraSightline(
            PhysicsDirectSpaceState3D space,
            Vector3 camPos,
            Aabb targetBounds,
            Rid[]? excludeRids = null,
            float maxOcclusionRatio = 0.4f)
        {
            if (space == null)
                throw new ArgumentNullException(nameof(space));

            Vector3[] targets = GetFiveTargetPoints(targetBounds);
            Godot.Collections.Array<Rid>? exclude = null;
            if (excludeRids != null && excludeRids.Length > 0)
            {
                exclude = new Godot.Collections.Array<Rid>();
                foreach (var r in excludeRids)
                    exclude.Add(r);
            }

            int blocked = 0;
            string? firstColliderName = null;

            foreach (var target in targets)
            {
                var query = PhysicsRayQueryParameters3D.Create(camPos, target);
                if (exclude != null)
                    query.Exclude = exclude;

                var hit = space.IntersectRay(query);
                if (hit != null && hit.Count > 0)
                {
                    blocked++;
                    if (firstColliderName == null && hit.TryGetValue("collider", out Variant colVar))
                    {
                        var colObj = colVar.AsGodotObject();
                        if (colObj is Node n)
                            firstColliderName = n.Name;
                        else if (colObj != null)
                            firstColliderName = colObj.ToString();
                    }
                }
            }

            float ratio = (float)blocked / targets.Length;
            bool passed = ratio <= maxOcclusionRatio;
            Vector3 suggestedPos = camPos;

            if (!passed)
            {
                suggestedPos = ComputeSuggestedCamPos(camPos, targetBounds, targets, testPos =>
                {
                    int hits = 0;
                    foreach (var target in targets)
                    {
                        var query = PhysicsRayQueryParameters3D.Create(testPos, target);
                        if (exclude != null) query.Exclude = exclude;
                        var hit = space.IntersectRay(query);
                        if (hit != null && hit.Count > 0) hits++;
                    }
                    return hits;
                }, maxOcclusionRatio);
            }

            return new SightlineResult
            {
                Passed = passed,
                OcclusionRatio = ratio,
                BlockedRayCount = blocked,
                TotalRayCount = targets.Length,
                BlockingColliderName = firstColliderName,
                SuggestedCamPos = suggestedPos,
                SuggestedCamOffset = suggestedPos - camPos
            };
        }

        /// <summary>
        /// Pure-math 5-ray sightline check against a collection of obstacle bounding boxes (Aabb).
        /// Useful when physics bodies are not yet spawned.
        /// </summary>
        public static SightlineResult CheckRayBoxSightline(
            Vector3 camPos,
            Aabb targetBounds,
            IEnumerable<Aabb> obstacleBoxes,
            float maxOcclusionRatio = 0.4f)
        {
            Vector3[] targets = GetFiveTargetPoints(targetBounds);
            var boxList = obstacleBoxes?.ToList() ?? new List<Aabb>();

            int blocked = 0;
            string? firstColliderName = null;

            foreach (var target in targets)
            {
                bool hitAny = false;
                foreach (var box in boxList)
                {
                    if (RayIntersectsAabb(camPos, target, box))
                    {
                        hitAny = true;
                        if (firstColliderName == null)
                            firstColliderName = $"Aabb({box.Position}, {box.Size})";
                        break;
                    }
                }
                if (hitAny)
                    blocked++;
            }

            float ratio = (float)blocked / targets.Length;
            bool passed = ratio <= maxOcclusionRatio;
            Vector3 suggestedPos = camPos;

            if (!passed)
            {
                suggestedPos = ComputeSuggestedCamPos(camPos, targetBounds, targets, testPos =>
                {
                    int hits = 0;
                    foreach (var target in targets)
                    {
                        bool hit = false;
                        foreach (var box in boxList)
                        {
                            if (RayIntersectsAabb(testPos, target, box))
                            {
                                hit = true;
                                break;
                            }
                        }
                        if (hit) hits++;
                    }
                    return hits;
                }, maxOcclusionRatio);
            }

            return new SightlineResult
            {
                Passed = passed,
                OcclusionRatio = ratio,
                BlockedRayCount = blocked,
                TotalRayCount = targets.Length,
                BlockingColliderName = firstColliderName,
                SuggestedCamPos = suggestedPos,
                SuggestedCamOffset = suggestedPos - camPos
            };
        }

        private static Vector3[] GetFiveTargetPoints(Aabb targetBounds)
        {
            Vector3 center = targetBounds.GetCenter();
            Vector3 half = targetBounds.Size * 0.5f;
            return new Vector3[]
            {
                center,
                center + new Vector3(-half.X * 0.6f, half.Y * 0.6f, -half.Z * 0.6f),
                center + new Vector3(half.X * 0.6f, half.Y * 0.6f, -half.Z * 0.6f),
                center + new Vector3(-half.X * 0.6f, -half.Y * 0.6f, half.Z * 0.6f),
                center + new Vector3(half.X * 0.6f, -half.Y * 0.6f, half.Z * 0.6f),
            };
        }

        private static Vector3 ComputeSuggestedCamPos(
            Vector3 camPos,
            Aabb targetBounds,
            Vector3[] targets,
            Func<Vector3, int> testHits,
            float maxOcclusionRatio)
        {
            Vector3 center = targetBounds.GetCenter();
            Vector3 dir = center - camPos;
            float dist = dir.Length();
            Vector3 lookDir = dist > 0.001f ? dir / dist : Vector3.Forward;

            float[] elevationSteps = { 2.0f, 4.0f, 6.0f, 8.0f, 12.0f, 16.0f, 20.0f, 25.0f };
            float[] pullBackSteps = { 0.0f, 1.0f, 2.0f, 4.0f, 8.0f };

            Vector3 bestCandidate = camPos;
            int minHits = int.MaxValue;

            foreach (float elevation in elevationSteps)
            {
                foreach (float pullBack in pullBackSteps)
                {
                    Vector3 candidate = camPos + (Vector3.Up * elevation) - (lookDir * pullBack);
                    int hits = testHits(candidate);
                    if (hits < minHits)
                    {
                        minHits = hits;
                        bestCandidate = candidate;
                    }
                    if ((float)hits / targets.Length <= maxOcclusionRatio)
                    {
                        return candidate;
                    }
                }
            }

            return bestCandidate;
        }

        /// <summary>
        /// Ray-AABB intersection test for segment from origin to target.
        /// </summary>
        public static bool RayIntersectsAabb(Vector3 origin, Vector3 target, Aabb box)
        {
            Vector3 dir = target - origin;
            float len = dir.Length();
            if (len < 1e-5f)
                return box.HasPoint(origin);

            Vector3 u = dir / len;
            float tmin = 0.0f;
            float tmax = len;

            for (int i = 0; i < 3; i++)
            {
                float o = origin[i];
                float d = u[i];
                float minVal = box.Position[i];
                float maxVal = box.End[i];

                if (Mathf.Abs(d) < 1e-6f)
                {
                    if (o < minVal || o > maxVal)
                        return false;
                }
                else
                {
                    float invD = 1.0f / d;
                    float t1 = (minVal - o) * invD;
                    float t2 = (maxVal - o) * invD;
                    if (t1 > t2)
                    {
                        float tmp = t1;
                        t1 = t2;
                        t2 = tmp;
                    }
                    tmin = Mathf.Max(tmin, t1);
                    tmax = Mathf.Min(tmax, t2);
                    if (tmin > tmax)
                        return false;
                }
            }

            return tmin <= tmax && tmin <= len && tmax >= 0.0f;
        }

        /// <summary>
        /// Finds active MeshInstance3D / Node3D matching M1_* .. M{activeMilestone-1}_* for superseded subsystems,
        /// optionally hiding them, and detects coplanar overlapping visible Aabbs that cause z-fighting.
        /// </summary>
        public static DeprecatedSweepResult SweepDeprecatedMilestoneNodes(
            Node root,
            int activeMilestone,
            string[]? subsystemKeywords = null,
            bool autoHide = true)
        {
            var result = new DeprecatedSweepResult();
            var allNodes = new List<Node3D>();
            Collect3DNodes(root, allNodes);

            var keywords = subsystemKeywords != null && subsystemKeywords.Length > 0
                ? subsystemKeywords.Select(k => k.ToLowerInvariant()).ToArray()
                : null;

            foreach (var node in allNodes)
            {
                string name = node.Name.ToString();
                if (name.StartsWith("M") && name.Length > 2)
                {
                    int underscoreIdx = name.IndexOf('_');
                    if (underscoreIdx > 1 && int.TryParse(name.Substring(1, underscoreIdx - 1), out int milestoneNum))
                    {
                        if (milestoneNum >= 1 && milestoneNum < activeMilestone)
                        {
                            bool keywordMatch = keywords == null;
                            if (keywords != null)
                            {
                                string lower = name.ToLowerInvariant();
                                keywordMatch = keywords.Any(k => lower.Contains(k));
                            }

                            if (keywordMatch && node.Visible)
                            {
                                result.DeprecatedNodesFound.Add(node);
                                if (autoHide)
                                {
                                    node.Visible = false;
                                    result.HiddenNodes.Add(node);
                                }
                            }
                        }
                    }
                }
            }

            // Detect coplanar overlapping visible Aabbs (|dy| < 0.01f and XZ overlap > 50%) that would z-fight
            var visibleMeshes = new List<(VisualInstance3D vi, Aabb aabb)>();
            foreach (var n in allNodes)
            {
                if (n is VisualInstance3D vi && vi.Visible)
                {
                    Aabb local = vi.GetAabb();
                    if (local.Size.X > 0.001f && local.Size.Z > 0.001f)
                    {
                        Aabb global = vi.GlobalTransform * local;
                        visibleMeshes.Add((vi, global));
                    }
                }
            }

            for (int i = 0; i < visibleMeshes.Count; i++)
            {
                for (int j = i + 1; j < visibleMeshes.Count; j++)
                {
                    var (viA, aabbA) = visibleMeshes[i];
                    var (viB, aabbB) = visibleMeshes[j];

                    float dyPos = Mathf.Abs(aabbA.Position.Y - aabbB.Position.Y);
                    float dyEnd = Mathf.Abs(aabbA.End.Y - aabbB.End.Y);
                    float dyCenter = Mathf.Abs(aabbA.GetCenter().Y - aabbB.GetCenter().Y);
                    float minDy = Mathf.Min(Mathf.Min(dyPos, dyEnd), dyCenter);

                    if (minDy < 0.01f)
                    {
                        float oxMin = Mathf.Max(aabbA.Position.X, aabbB.Position.X);
                        float oxMax = Mathf.Min(aabbA.End.X, aabbB.End.X);
                        float ozMin = Mathf.Max(aabbA.Position.Z, aabbB.Position.Z);
                        float ozMax = Mathf.Min(aabbA.End.Z, aabbB.End.Z);

                        if (oxMax > oxMin && ozMax > ozMin)
                        {
                            float overlapArea = (oxMax - oxMin) * (ozMax - ozMin);
                            float areaA = aabbA.Size.X * aabbA.Size.Z;
                            float areaB = aabbB.Size.X * aabbB.Size.Z;
                            float minArea = Mathf.Min(areaA, areaB);
                            if (minArea > 0.0001f)
                            {
                                float ratio = overlapArea / minArea;
                                if (ratio > 0.5f)
                                {
                                    result.ZFightConflicts.Add(new ZFightConflict
                                    {
                                        NodeA = viA,
                                        NodeB = viB,
                                        DeltaY = minDy,
                                        XZOverlapRatio = ratio,
                                        Description = $"Coplanar z-fight between '{viA.Name}' and '{viB.Name}' (minDy={minDy:F4}, overlap={ratio * 100:F1}%)"
                                    });
                                }
                            }
                        }
                    }
                }
            }

            return result;
        }

        private static void Collect3DNodes(Node current, List<Node3D> acc)
        {
            if (current is Node3D n)
                acc.Add(n);
            foreach (Node child in current.GetChildren())
            {
                Collect3DNodes(child, acc);
            }
        }

        /// <summary>
        /// Asserts that a uniform parameter varies across strip materials AND consecutive captured frame byte hashes differ.
        /// </summary>
        public static TimeDeltaStripResult ValidateTimeDeltaStrip(
            ShaderMaterial[]? materials,
            string paramName,
            Image[]? capturedFrames)
        {
            var result = new TimeDeltaStripResult();

            bool paramVaried = false;
            if (materials != null && materials.Length > 1)
            {
                Variant firstVal = materials[0].GetShaderParameter(paramName);
                for (int i = 1; i < materials.Length; i++)
                {
                    Variant val = materials[i].GetShaderParameter(paramName);
                    if (!val.Equals(firstVal))
                    {
                        paramVaried = true;
                        break;
                    }
                }
                if (!paramVaried)
                {
                    result.Errors.Add($"Uniform parameter '{paramName}' is static (constant value: {firstVal}) across {materials.Length} strip materials");
                }
            }
            else
            {
                paramVaried = true;
            }
            result.ParameterVaried = paramVaried;

            bool pixelsVaried = true;
            if (capturedFrames != null && capturedFrames.Length > 1)
            {
                for (int i = 1; i < capturedFrames.Length; i++)
                {
                    byte[] prevBytes = capturedFrames[i - 1].GetData();
                    byte[] currBytes = capturedFrames[i].GetData();
                    if (prevBytes.AsSpan().SequenceEqual(currBytes))
                    {
                        pixelsVaried = false;
                        result.Errors.Add($"Frames {i - 1} and {i} are byte-for-byte identical (static frozen animation)");
                        break;
                    }
                }
            }
            result.PixelsVaried = pixelsVaried;
            result.Passed = result.ParameterVaried && result.PixelsVaried;
            return result;
        }
    }

    /// <summary>
    /// Probe entrypoint for ATLAS_VERIFY_ENV_PREGATE=1.
    /// Runs positive and negative synthetic fixtures and reports "[EnvRenderPreGateVerify] VERDICT PASS".
    /// </summary>
    public sealed partial class EnvRenderPreGateVerify : Node
    {
        private const string Tag = "[EnvRenderPreGateVerify]";
        private int _failures;

        [DllImport("libc", EntryPoint = "_exit")]
        private static extern void PosixExit(int status);

        public override void _Ready()
        {
            GD.Print($"{Tag} BEGIN");
            try
            {
                RunSelfTest();
            }
            catch (Exception ex)
            {
                Report($"no exception escaped the probe ({ex.GetType().Name}: {ex.Message})", false);
            }

            bool pass = _failures == 0;
            int exitCode = pass ? 0 : 1;
            GD.Print(pass ? $"{Tag} VERDICT PASS" : $"{Tag} VERDICT FAIL ({_failures} case(s))");
            Console.Out.Flush();
            Console.Error.Flush();
            if (!OS.HasFeature("windows"))
            {
                PosixExit(exitCode);
                return;
            }
            GetTree().Quit(exitCode);
        }

        private void RunSelfTest()
        {
            TestSightlineCliffWall();
            TestMilestoneSweepAndZFight();
            TestTimeDeltaStrip();
        }

        private void TestSightlineCliffWall()
        {
            var targetBounds = new Aabb(new Vector3(-1, 0, -1), new Vector3(2, 2, 2));
            var camPos = new Vector3(0, 1, -10);
            var cliffWall = new Aabb(new Vector3(-5, 0, -6), new Vector3(10, 5, 2));

            // Negative check: sightline blocked by cliff wall -> caught RED
            var redResult = EnvRenderPreGate.CheckRayBoxSightline(camPos, targetBounds, new[] { cliffWall }, maxOcclusionRatio: 0.4f);
            bool redOk = !redResult.Passed && redResult.BlockedRayCount == 5;

            // Positive check: suggested elevated/pulled-back offset clears sightline -> GREEN
            var greenResult = EnvRenderPreGate.CheckRayBoxSightline(redResult.SuggestedCamPos, targetBounds, new[] { cliffWall }, maxOcclusionRatio: 0.4f);
            bool greenOk = greenResult.Passed && greenResult.BlockedRayCount == 0 && redResult.SuggestedCamOffset.Y > 0;

            Report("Sightline: cliff-wall occlusion caught RED and auto-offset clears sightline GREEN", redOk && greenOk);
        }

        private void TestMilestoneSweepAndZFight()
        {
            var testRoot = new Node3D { Name = "MilestoneTestRoot" };
            AddChild(testRoot);

            var m1Mesh = new BoxMesh { Size = new Vector3(10, 0.001f, 10) };
            var m1 = new MeshInstance3D
            {
                Name = "M1_River_WaterSurface",
                Mesh = m1Mesh,
                Position = new Vector3(0, 0, 0),
                Visible = true
            };
            testRoot.AddChild(m1);

            var m4Mesh = new BoxMesh { Size = new Vector3(10, 0.001f, 10) };
            var m4 = new MeshInstance3D
            {
                Name = "M4_RiverSurface_Main",
                Mesh = m4Mesh,
                Position = new Vector3(0, 0, 0.002f),
                Visible = true
            };
            testRoot.AddChild(m4);

            // Negative check: autoHide=false detects deprecation and coplanar z-fight -> caught RED
            var redResult = EnvRenderPreGate.SweepDeprecatedMilestoneNodes(testRoot, activeMilestone: 4, subsystemKeywords: new[] { "Water" }, autoHide: false);
            bool redOk = redResult.DeprecatedNodesFound.Count == 1 &&
                         redResult.ZFightConflicts.Count >= 1 &&
                         m1.Visible;

            // Positive check: autoHide=true hides M1 node and clears coplanar conflict -> GREEN
            var greenResult = EnvRenderPreGate.SweepDeprecatedMilestoneNodes(testRoot, activeMilestone: 4, subsystemKeywords: new[] { "Water" }, autoHide: true);
            bool greenOk = !m1.Visible &&
                           greenResult.HiddenNodes.Count == 1 &&
                           greenResult.ZFightConflicts.Count == 0;

            testRoot.QueueFree();

            Report("MilestoneSweep: M1_River_WaterSurface deprecation & z-fight caught RED and auto-hidden GREEN", redOk && greenOk);
        }

        private void TestTimeDeltaStrip()
        {
            var shader = new Shader
            {
                Code = "shader_type spatial;\nuniform float time_offset = 0.0;\nvoid fragment() {}\n"
            };
            var mat1 = new ShaderMaterial { Shader = shader };
            mat1.SetShaderParameter("time_offset", 0.0f);
            var mat2 = new ShaderMaterial { Shader = shader };
            mat2.SetShaderParameter("time_offset", 0.0f);

            var img1 = Image.CreateEmpty(8, 8, false, Image.Format.Rgba8);
            var img2 = Image.CreateEmpty(8, 8, false, Image.Format.Rgba8);

            // Negative check: identical time_offset and identical pixel frames -> caught RED
            var redResult = EnvRenderPreGate.ValidateTimeDeltaStrip(new[] { mat1, mat2 }, "time_offset", new[] { img1, img2 });
            bool redOk = !redResult.Passed && !redResult.ParameterVaried && !redResult.PixelsVaried;

            // Positive check: varying time_offset and different pixel frames -> GREEN
            mat2.SetShaderParameter("time_offset", 0.5f);
            img2.SetPixel(0, 0, Colors.Red);
            var greenResult = EnvRenderPreGate.ValidateTimeDeltaStrip(new[] { mat1, mat2 }, "time_offset", new[] { img1, img2 });
            bool greenOk = greenResult.Passed && greenResult.ParameterVaried && greenResult.PixelsVaried;

            Report("TimeDeltaStrip: static time_offset caught RED and distinct animated frames pass GREEN", redOk && greenOk);
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

using System;
using System.Collections.Generic;
using Godot;

namespace AtlasWorld.Client.World
{
    /// <summary>
    /// A+ Tier Real-Time Damped Spring-Bone &amp; Capsule/Sphere Collision Solver for secondary hair, cape, and outfit chains
    /// (<c>sec_hair_*</c>, <c>sec_cape_*</c>, <c>sec_hem_*</c>, <c>sec_cloth_*</c>).
    ///
    /// Implements the fixed-timestep (120 Hz) Velocity-Verlet + critically/under-damped spring formulation
    /// with progressive per-link frequency/damping gradients and moving torso/shoulder/cape colliders:
    ///   1. Captures primary animated skeleton pose.
    ///   2. Updates Neck, LeftShoulder, RightShoulder, UpperTorso, and Back/Cloak colliders in world space.
    ///   3. Solves outfit/cape/hem chains first (<c>sec_cape_*</c>, <c>sec_hem_*</c>).
    ///   4. Updates dynamic cape surface colliders from the solved cape segments.
    ///   5. Solves hair chains (<c>sec_hair_c1_1..3</c>, <c>sec_hair_l1_*</c>, <c>sec_hair_r1_*</c>, <c>sec_hair_lf1_*</c>)
    ///      against the body + live cape surface so long hair glides smoothly over the shoulder cloak without static mesh warping.
    /// </summary>
    public sealed class SecondarySpringPhysics
    {
        public const double FixedDt = 1.0 / 120.0;
        public const int ConstraintIterations = 4;
        public const float TeleportResetDistanceM = 0.45f;

        private enum ChainCategory
        {
            BackHair,
            SideHair,
            FrontBangs,
            ShoulderCape,
            SkirtHem,
            Bust
        }

        private sealed class SpringLink
        {
            public int BoneIdx;
            public int ParentBoneIdx;
            public int PrimaryAncestorBoneIdx;
            public string Name = "";
            public ChainCategory Category;
            public int ChainDepth;

            public Vector3 RestLocalTailDir;
            public Vector3 PrimaryLocalRestDir;
            public float SegmentLengthM;
            public Quaternion RestRotation;

            public float Omega;        // 2 * pi * f (rad/s)
            public float Zeta;         // damping ratio
            public float GravityMps2;  // art-directed effective gravity (m/s^2)
            public float MaxSwingRad;  // cone limit from rest direction (radians)
            public float TipRadiusM;   // collision sphere radius at tip

            public Vector3 SimTipWorld;
            public Vector3 PrevTipWorld;
            public Transform3D PrevPrimaryGlobal;
            public bool Initialized;
        }

        private struct SphereCollider
        {
            public Vector3 CenterWorld;
            public float RadiusM;
        }

        private struct CapsuleCollider
        {
            public Vector3 PointAWorld;
            public Vector3 PointBWorld;
            public float RadiusM;
        }

        private readonly Skeleton3D _skeleton;
        private readonly List<SpringLink> _capeAndHemLinks = new();
        private readonly List<SpringLink> _hairLinks = new();

        private int _neckBoneIdx = -1;
        private int _headBoneIdx = -1;
        private int _hipsBoneIdx = -1;
        private int _spineBoneIdx = -1;
        private int _spine01BoneIdx = -1;
        private int _leftShoulderIdx = -1;
        private int _rightShoulderIdx = -1;
        private int _leftFootIdx = -1;
        private int _rightFootIdx = -1;

        private double _accumulator;
        private Vector3 _lastSkeletonOriginWorld;
        private Vector3 _lastLeftFootLocal;
        private Vector3 _lastRightFootLocal;
        private Vector3 _smoothedRootVelWorld;
        private Vector3 _smoothedRootAccelWorld;
        private float _smoothedLocomotionFactor;
        private float _targetLocomotionFactor;
        private float _stridePhase;
        private float _idleBreathPhase;
        private bool _hasLastOrigin;

        public int ActiveLinkCount => _capeAndHemLinks.Count + _hairLinks.Count;

        public SecondarySpringPhysics(Skeleton3D skeleton)
        {
            _skeleton = skeleton;
            DiscoverBones();
        }

        private void DiscoverBones()
        {
            _neckBoneIdx = _skeleton.FindBone("neck");
            _headBoneIdx = _skeleton.FindBone("Head");
            _hipsBoneIdx = _skeleton.FindBone("Hips");
            _spineBoneIdx = _skeleton.FindBone("Spine");
            _spine01BoneIdx = _skeleton.FindBone("Spine01");
            _leftShoulderIdx = _skeleton.FindBone("LeftShoulder");
            _rightShoulderIdx = _skeleton.FindBone("RightShoulder");
            _leftFootIdx = _skeleton.FindBone("LeftFoot");
            _rightFootIdx = _skeleton.FindBone("RightFoot");

            int boneCount = _skeleton.GetBoneCount();
            var secIndices = new List<int>();
            for (int i = 0; i < boneCount; i++)
            {
                string name = _skeleton.GetBoneName(i);
                if (name.StartsWith("sec_", StringComparison.OrdinalIgnoreCase))
                {
                    secIndices.Add(i);
                }
            }

            // Sort by chain depth (_1 before _2 before _3) so parent links always solve before children
            secIndices.Sort((a, b) =>
            {
                int da = ParseChainDepth(_skeleton.GetBoneName(a));
                int db = ParseChainDepth(_skeleton.GetBoneName(b));
                int cmp = da.CompareTo(db);
                return cmp != 0 ? cmp : a.CompareTo(b);
            });

            foreach (int boneIdx in secIndices)
            {
                int parentIdx = _skeleton.GetBoneParent(boneIdx);
                if (parentIdx < 0)
                    continue;

                string name = _skeleton.GetBoneName(boneIdx);
                int depth = ParseChainDepth(name);
                ChainCategory cat = ClassifyChain(name);

                // Climb up to the non-secondary primary bone ancestor (e.g. Head or Hips)
                int primaryAncestorIdx = parentIdx;
                while (primaryAncestorIdx >= 0 &&
                       _skeleton.GetBoneName(primaryAncestorIdx).StartsWith("sec_", StringComparison.OrdinalIgnoreCase))
                {
                    int nextP = _skeleton.GetBoneParent(primaryAncestorIdx);
                    if (nextP < 0)
                        break;
                    primaryAncestorIdx = nextP;
                }

                // Determine rest-pose tail vector from child sec_ bone if present, else extrapolate along bone rest +Y / down
                Transform3D restGlobal = _skeleton.GetBoneGlobalRest(boneIdx);
                Vector3 tailRestGlobalPos = FindChildRestOriginOrExtrapolate(boneIdx, restGlobal);
                Vector3 localTailVec = restGlobal.AffineInverse() * tailRestGlobalPos;
                float segLen = localTailVec.Length();
                if (segLen < 0.015f)
                {
                    segLen = 0.045f;
                    localTailVec = new Vector3(0f, segLen, 0f);
                }

                Vector3 worldRestDir = (tailRestGlobalPos - restGlobal.Origin).Normalized();
                if (worldRestDir.LengthSquared() < 0.1f)
                    worldRestDir = (restGlobal.Basis * localTailVec).Normalized();
                Transform3D primaryRestGlobal = primaryAncestorIdx >= 0 ? _skeleton.GetBoneGlobalRest(primaryAncestorIdx) : Transform3D.Identity;
                Vector3 primaryLocalRestDir = (primaryRestGlobal.Basis.Inverse() * worldRestDir).Normalized();

                ConfigureTuning(cat, depth, out float freqHz, out float zeta, out float gravity, out float maxSwingDeg, out float tipRadius);

                var link = new SpringLink
                {
                    BoneIdx = boneIdx,
                    ParentBoneIdx = parentIdx,
                    PrimaryAncestorBoneIdx = primaryAncestorIdx,
                    Name = name,
                    Category = cat,
                    ChainDepth = depth,
                    RestLocalTailDir = localTailVec.Normalized(),
                    PrimaryLocalRestDir = primaryLocalRestDir,
                    SegmentLengthM = segLen,
                    RestRotation = _skeleton.GetBoneRest(boneIdx).Basis.GetRotationQuaternion().Normalized(),
                    Omega = Mathf.Tau * freqHz,
                    Zeta = zeta,
                    GravityMps2 = gravity,
                    MaxSwingRad = Mathf.DegToRad(maxSwingDeg),
                    TipRadiusM = tipRadius,
                };

                if (cat is ChainCategory.ShoulderCape or ChainCategory.SkirtHem)
                    _capeAndHemLinks.Add(link);
                else
                    _hairLinks.Add(link);
            }
        }

        private Vector3 FindChildRestOriginOrExtrapolate(int boneIdx, Transform3D boneRestGlobal)
        {
            int count = _skeleton.GetBoneCount();
            for (int i = 0; i < count; i++)
            {
                if (_skeleton.GetBoneParent(i) == boneIdx)
                {
                    Vector3 childOrigin = _skeleton.GetBoneGlobalRest(i).Origin;
                    if (childOrigin.DistanceTo(boneRestGlobal.Origin) >= 0.012f)
                        return childOrigin;
                }
            }
            // Leaf secondary bone (_2, _3, or _4): extrapolate along the parent->this rest vector or bone +Y axis
            int parentIdx = _skeleton.GetBoneParent(boneIdx);
            if (parentIdx >= 0)
            {
                Vector3 parentOrigin = _skeleton.GetBoneGlobalRest(parentIdx).Origin;
                Vector3 dir = boneRestGlobal.Origin - parentOrigin;
                float len = dir.Length();
                if (len >= 0.012f && len <= 0.28f)
                    return boneRestGlobal.Origin + dir;
            }
            return boneRestGlobal * new Vector3(0f, 0.085f, 0f);
        }

        private static int ParseChainDepth(string boneName)
        {
            int underscore = boneName.LastIndexOf('_');
            if (underscore >= 0 && underscore + 1 < boneName.Length &&
                int.TryParse(boneName.AsSpan(underscore + 1), out int depth))
            {
                return Math.Clamp(depth, 1, 4);
            }
            return 1;
        }

        private static ChainCategory ClassifyChain(string name)
        {
            string lower = name.ToLowerInvariant();
            if (lower.StartsWith("sec_bust_"))
                return ChainCategory.Bust;
            if (lower.StartsWith("sec_cape_") || lower.StartsWith("sec_cloth_"))
                return ChainCategory.ShoulderCape;
            if (lower.StartsWith("sec_hem_"))
                return ChainCategory.SkirtHem;
            if (lower.Contains("_lf") || lower.Contains("_rf") || lower.Contains("_cf"))
                return ChainCategory.FrontBangs;
            if (lower.Contains("_l") || lower.Contains("_r"))
                return ChainCategory.SideHair;
            return ChainCategory.BackHair;
        }

        private static void ConfigureTuning(
            ChainCategory category,
            int depth,
            out float freqHz,
            out float zeta,
            out float gravityMps2,
            out float maxSwingDeg,
            out float tipRadiusM)
        {
            switch (category)
            {
                case ChainCategory.Bust:
                    // Natural soft chest jiggle + subtle breathing sway (~3.4 Hz, zeta=0.42, max 14 deg)
                    freqHz = 3.40f;
                    zeta = 0.42f;
                    gravityMps2 = 0.85f;
                    maxSwingDeg = 14f;
                    tipRadiusM = 0.008f;
                    break;
                case ChainCategory.BackHair:
                    // Responsive, natural hair fall (~0.22s settle) with smooth per-joint bend limits (no sharp kinks)
                    freqHz = depth == 1 ? 2.85f : (depth == 2 ? 2.50f : (depth == 3 ? 2.20f : 1.95f));
                    zeta = depth == 1 ? 0.54f : (depth == 2 ? 0.48f : (depth == 3 ? 0.44f : 0.40f));
                    gravityMps2 = 1.45f;
                    maxSwingDeg = depth == 1 ? 38f : (depth == 2 ? 34f : (depth == 3 ? 34f : 36f));
                    tipRadiusM = 0.012f;
                    break;
                case ChainCategory.SideHair:
                    // Twin-tails (sec_hair_l*, sec_hair_r*) and side locks: crisp natural drop + smooth S-wave curvature
                    freqHz = depth == 1 ? 2.85f : (depth == 2 ? 2.50f : (depth == 3 ? 2.20f : 1.95f));
                    zeta = depth == 1 ? 0.52f : (depth == 2 ? 0.46f : (depth == 3 ? 0.42f : 0.38f));
                    gravityMps2 = 1.45f;
                    maxSwingDeg = depth == 1 ? 40f : (depth == 2 ? 34f : (depth == 3 ? 34f : 36f));
                    tipRadiusM = 0.011f;
                    break;
                case ChainCategory.FrontBangs:
                    freqHz = 3.6f;
                    zeta = 0.78f;
                    gravityMps2 = 0.65f;
                    maxSwingDeg = 18f;
                    tipRadiusM = 0.008f;
                    break;
                case ChainCategory.ShoulderCape:
                    freqHz = depth == 1 ? 2.25f : 1.90f;
                    zeta = 0.62f;
                    gravityMps2 = 1.05f;
                    maxSwingDeg = 40f;
                    tipRadiusM = 0.014f;
                    break;
                default: // SkirtHem
                    freqHz = depth == 1 ? 2.35f : (depth == 2 ? 2.00f : 1.75f);
                    zeta = depth == 1 ? 0.60f : (depth == 2 ? 0.54f : 0.48f);
                    gravityMps2 = 1.10f;
                    maxSwingDeg = 38f;
                    tipRadiusM = 0.012f;
                    break;
            }
        }

        public void ResetState()
        {
            _hasLastOrigin = false;
            _accumulator = 0.0;
            _smoothedRootVelWorld = Vector3.Zero;
            _smoothedRootAccelWorld = Vector3.Zero;
            _smoothedLocomotionFactor = 0f;
            _targetLocomotionFactor = 0f;
            _stridePhase = 0f;
            foreach (SpringLink l in _capeAndHemLinks)
                l.Initialized = false;
            foreach (SpringLink l in _hairLinks)
                l.Initialized = false;
        }

        public void Step(double deltaSec)
        {
            if (ActiveLinkCount == 0 || !GodotObject.IsInstanceValid(_skeleton) || !_skeleton.IsInsideTree())
                return;

            Transform3D skelWorld = _skeleton.GlobalTransform;
            Vector3 originWorld = skelWorld.Origin;

            if (!_hasLastOrigin || originWorld.DistanceTo(_lastSkeletonOriginWorld) > TeleportResetDistanceM)
            {
                _lastSkeletonOriginWorld = originWorld;
                _lastLeftFootLocal = _leftFootIdx >= 0 ? _skeleton.GetBoneGlobalPose(_leftFootIdx).Origin : Vector3.Zero;
                _lastRightFootLocal = _rightFootIdx >= 0 ? _skeleton.GetBoneGlobalPose(_rightFootIdx).Origin : Vector3.Zero;
                _smoothedRootVelWorld = Vector3.Zero;
                _smoothedRootAccelWorld = Vector3.Zero;
                _smoothedLocomotionFactor = 0f;
                _targetLocomotionFactor = 0f;
                _hasLastOrigin = true;
                InitializeLinksToCurrentPose(skelWorld);
                return;
            }

            float dt = (float)Math.Clamp(deltaSec, 1e-4, 0.05);
            Vector3 frameOriginDelta = originWorld - _lastSkeletonOriginWorld;
            Vector3 rawRootVelWorld = frameOriginDelta / dt;
            if (rawRootVelWorld.Length() > 7.5f)
                rawRootVelWorld = rawRootVelWorld.Normalized() * 7.5f;
            Vector3 prevSmoothedVel = _smoothedRootVelWorld;
            _smoothedRootVelWorld = _smoothedRootVelWorld.Lerp(rawRootVelWorld, Mathf.Clamp(dt * 12f, 0.05f, 1.0f));
            Vector3 rawRootAccel = (_smoothedRootVelWorld - prevSmoothedVel) / dt;
            if (rawRootAccel.Length() > 18.0f)
                rawRootAccel = rawRootAccel.Normalized() * 18.0f;
            _smoothedRootAccelWorld = _smoothedRootAccelWorld.Lerp(rawRootAccel, Mathf.Clamp(dt * 10f, 0.05f, 1.0f));
            _lastSkeletonOriginWorld = originWorld;

            // Measure live footstep / leg-stride velocity in skeleton space
            float footSpeedLocal = 0f;
            if (_leftFootIdx >= 0 && _rightFootIdx >= 0)
            {
                Vector3 hipsLocal = _hipsBoneIdx >= 0 ? _skeleton.GetBoneGlobalPose(_hipsBoneIdx).Origin : Vector3.Zero;
                Vector3 leftLocal = _skeleton.GetBoneGlobalPose(_leftFootIdx).Origin - hipsLocal;
                Vector3 rightLocal = _skeleton.GetBoneGlobalPose(_rightFootIdx).Origin - hipsLocal;
                float vLeft = (leftLocal - _lastLeftFootLocal).Length() / dt;
                float vRight = (rightLocal - _lastRightFootLocal).Length() / dt;
                footSpeedLocal = Mathf.Clamp((vLeft + vRight) * 0.5f, 0f, 3.0f);
                _lastLeftFootLocal = leftLocal;
                _lastRightFootLocal = rightLocal;
            }

            float rawHorizSpeed = new Vector2(rawRootVelWorld.X, rawRootVelWorld.Z).Length();
            float worldHorizSpeed = rawHorizSpeed < 0.12f
                ? 0f
                : new Vector2(_smoothedRootVelWorld.X, _smoothedRootVelWorld.Z).Length();
            // Distinct Walk (~0.9..2.15 m/s -> loco ~0.14..0.32) vs Run (~3.0..4.65 m/s -> loco ~0.72..1.00):
            // When translating in world space, use worldHorizSpeed directly so walking foot-swing velocity
            // never falsely triggers running inertia!
            float fromWorld = worldHorizSpeed <= 2.35f
                ? (worldHorizSpeed / 2.35f) * 0.32f
                : 0.32f + ((worldHorizSpeed - 2.35f) / 2.15f) * 0.68f;
            float fromFeet = rawHorizSpeed > 0.12f
                ? 0f
                : Mathf.Clamp((footSpeedLocal - 0.35f) / 1.80f, 0f, 0.22f);
            _targetLocomotionFactor = rawHorizSpeed < 0.12f && footSpeedLocal < 0.45f
                ? 0f
                : Mathf.Clamp(Mathf.Max(fromWorld, fromFeet), 0f, 1.05f);

            // Responsive ramp-up (10.0) and immediate natural hair drop on stop (16.0 -> releases wind support in ~0.08s)
            float blendRate = _targetLocomotionFactor >= _smoothedLocomotionFactor ? 10.0f : 16.0f;
            _smoothedLocomotionFactor = Mathf.Lerp(_smoothedLocomotionFactor, _targetLocomotionFactor, Mathf.Clamp(dt * blendRate, 0.02f, 1.0f));

            if (_smoothedLocomotionFactor > 0.03f)
            {
                // Human gait cycle frequency:
                //   Walk (loco ~0.32): ~0.84 Hz full cycle = ~1.68 steps/sec
                //   Run  (loco ~0.95): ~1.45 Hz full cycle = ~2.90 steps/sec
                float cadenceHz = Mathf.Lerp(0.78f, 1.48f, Mathf.Clamp(_smoothedLocomotionFactor, 0f, 1.0f));
                _stridePhase = Mathf.PosMod(_stridePhase + dt * cadenceHz * Mathf.Tau, Mathf.Tau);
            }
            // Continuous breathing phase (~0.42 Hz = 2.4s breath cycle) for subtle chest/bust rise & fall in idle
            _idleBreathPhase = Mathf.PosMod(_idleBreathPhase + dt * 0.42f * Mathf.Tau, Mathf.Tau);

            // Reset secondary bone rotations to rest before reading animated primary pose so baked tracks never fight the spring solver
            foreach (SpringLink link in _capeAndHemLinks)
                _skeleton.SetBonePoseRotation(link.BoneIdx, link.RestRotation);
            foreach (SpringLink link in _hairLinks)
                _skeleton.SetBonePoseRotation(link.BoneIdx, link.RestRotation);

            double clampedDelta = Math.Clamp(deltaSec, 0.0, FixedDt * 4.0);
            _accumulator += clampedDelta;
            if (_accumulator < FixedDt)
            {
                // Even if less than 1 substep elapsed (e.g. high frame rate or manual 0.016s tick), run at least 1 step when delta > 0
                if (deltaSec > 1e-5)
                    _accumulator = FixedDt;
                else
                {
                    ApplySolvedRotations(skelWorld);
                    return;
                }
            }

            Span<SphereCollider> bodySpheres = stackalloc SphereCollider[4];
            Span<CapsuleCollider> bodyCapsules = stackalloc CapsuleCollider[4];
            BuildBodyColliders(skelWorld, bodySpheres, out int sphereCount, bodyCapsules, out int capsuleCount);

            int substeps = 0;
            while (_accumulator >= FixedDt && substeps < 4)
            {
                _accumulator -= FixedDt;
                substeps++;
                float h = (float)FixedDt;

                // 1. Solve Cape & Hem chains against torso/shoulder colliders
                SolveChainGroup(_capeAndHemLinks, skelWorld, h, bodySpheres[..sphereCount], bodyCapsules[..capsuleCount]);

                // 2. Append live Cape surface capsule collider from solved back-cape links (only when back-cloak sec_cape_l1/r1 exist)
                int totalCapsules = capsuleCount;
                if (_capeAndHemLinks.Count >= 2 &&
                    _capeAndHemLinks[0].Name.StartsWith("sec_cape_l1_", StringComparison.OrdinalIgnoreCase) &&
                    totalCapsules < bodyCapsules.Length)
                {
                    Vector3 capeMidA = (_capeAndHemLinks[0].SimTipWorld + _capeAndHemLinks[1].SimTipWorld) * 0.5f;
                    Vector3 spineBack = GetCloakUpperBackCenterWorld(skelWorld);
                    bodyCapsules[totalCapsules++] = new CapsuleCollider
                    {
                        PointAWorld = spineBack,
                        PointBWorld = capeMidA,
                        RadiusM = 0.012f
                    };
                }

                // 3. Solve Hair chains against body + live cape surface
                SolveChainGroup(_hairLinks, skelWorld, h, bodySpheres[..sphereCount], bodyCapsules[..totalCapsules]);
            }
        }

        private void InitializeLinksToCurrentPose(Transform3D skelWorld)
        {
            Span<SphereCollider> bodySpheres = stackalloc SphereCollider[4];
            Span<CapsuleCollider> bodyCapsules = stackalloc CapsuleCollider[4];
            BuildBodyColliders(skelWorld, bodySpheres, out int sphereCount, bodyCapsules, out int capsuleCount);

            InitGroup(_capeAndHemLinks, skelWorld, bodySpheres[..sphereCount], bodyCapsules[..capsuleCount]);
            InitGroup(_hairLinks, skelWorld, bodySpheres[..sphereCount], bodyCapsules[..capsuleCount]);
        }

        private void InitGroup(
            List<SpringLink> links,
            Transform3D skelWorld,
            ReadOnlySpan<SphereCollider> spheres,
            ReadOnlySpan<CapsuleCollider> capsules)
        {
            foreach (SpringLink link in links)
            {
                _skeleton.SetBonePoseRotation(link.BoneIdx, link.RestRotation);
                Transform3D boneGlobal = skelWorld * _skeleton.GetBoneGlobalPose(link.BoneIdx);
                Vector3 rootWorld = boneGlobal.Origin;
                Vector3 desiredDirWorld = (boneGlobal.Basis * link.RestLocalTailDir).Normalized();
                Vector3 tip = rootWorld + desiredDirWorld * link.SegmentLengthM;
                Transform3D primaryGlobal = link.PrimaryAncestorBoneIdx >= 0
                    ? skelWorld * _skeleton.GetBoneGlobalPose(link.PrimaryAncestorBoneIdx)
                    : boneGlobal;

                link.SimTipWorld = tip;
                link.PrevTipWorld = tip;
                link.PrevPrimaryGlobal = primaryGlobal;
                link.Initialized = true;
                UpdateBoneRotationFromTip(link, skelWorld, boneGlobal, rootWorld, desiredDirWorld, tip);
            }
        }

        private void SolveChainGroup(
            List<SpringLink> links,
            Transform3D skelWorld,
            float h,
            ReadOnlySpan<SphereCollider> spheres,
            ReadOnlySpan<CapsuleCollider> capsules)
        {
            Vector3 backDir = GetCharacterBackDirectionWorld(skelWorld);
            Vector3 upDir = Vector3.Up;
            Vector3 rightDir = backDir.Cross(upDir).Normalized();
            if (rightDir.LengthSquared() < 0.1f)
                rightDir = skelWorld.Basis.X.Normalized();

            Vector3 horizVel = new Vector3(_smoothedRootVelWorld.X, 0f, _smoothedRootVelWorld.Z);
            float horizSpeed = horizVel.Length();
            // Trail direction is strictly opposite to the character's movement direction (e.g. moving <- trails ->)
            Vector3 trailDir = horizSpeed > 0.12f ? (-horizVel / horizSpeed) : backDir;
            Vector3 horizAccel = new Vector3(_smoothedRootAccelWorld.X, 0f, _smoothedRootAccelWorld.Z);

            bool isStoppingOrSettling = _targetLocomotionFactor < 0.06f;

            foreach (SpringLink link in links)
            {
                // Reset to rest rotation first so we read the un-rotated desired frame from the parent's newly solved pose
                _skeleton.SetBonePoseRotation(link.BoneIdx, link.RestRotation);
                Transform3D restPoseGlobal = skelWorld * _skeleton.GetBoneGlobalPose(link.BoneIdx);
                Vector3 rootWorld = restPoseGlobal.Origin;
                Vector3 parentCarriedDir = (restPoseGlobal.Basis * link.RestLocalTailDir).Normalized();

                // Primary ancestor (Head or Hips) world transform:
                // Using PrimaryAncestorBoneIdx for frame advection removes 100% of world translation
                // and softens rapid 90/180-deg character turns without feeding parent secondary bone swing into child links!
                Transform3D primaryGlobal = restPoseGlobal;
                Vector3 primaryDrapeDir = parentCarriedDir;
                if (link.PrimaryAncestorBoneIdx >= 0)
                {
                    primaryGlobal = skelWorld * _skeleton.GetBoneGlobalPose(link.PrimaryAncestorBoneIdx);
                    if (link.ChainDepth >= 2)
                        primaryDrapeDir = (primaryGlobal.Basis * link.PrimaryLocalRestDir).Normalized();
                }

                float decoupleWeight = (link.ChainDepth >= 2 && !isStoppingOrSettling)
                    ? Mathf.Clamp(_smoothedLocomotionFactor * 0.58f, 0f, 0.58f)
                    : 0f;
                Vector3 baseRestDir = decoupleWeight > 1e-4f
                    ? (parentCarriedDir * (1.0f - decoupleWeight) + primaryDrapeDir * decoupleWeight).Normalized()
                    : parentCarriedDir;

                if (!link.Initialized)
                {
                    link.SimTipWorld = rootWorld + parentCarriedDir * link.SegmentLengthM;
                    link.PrevTipWorld = link.SimTipWorld;
                    link.PrevPrimaryGlobal = primaryGlobal;
                    link.Initialized = true;
                }

                Vector3 primaryDelta = primaryGlobal.Origin - link.PrevPrimaryGlobal.Origin;
                Transform3D primaryStepXf = primaryGlobal * link.PrevPrimaryGlobal.AffineInverse();
                Vector3 translatedTip = link.SimTipWorld + primaryDelta;
                Vector3 translatedPrevTip = link.PrevTipWorld + primaryDelta;
                Vector3 rotatedTip = primaryStepXf * link.SimTipWorld;
                Vector3 rotatedPrevTip = primaryStepXf * link.PrevTipWorld;
                // Carry 100% of translation and 72% of character/head rotation (leaving 28% natural rotational inertia)
                Vector3 advectedTip = translatedTip.Lerp(rotatedTip, 0.72f);
                Vector3 advectedPrevTip = translatedPrevTip.Lerp(rotatedPrevTip, 0.72f);
                Vector3 vRel = (advectedTip - advectedPrevTip) / h;

                bool isHair = link.Category is ChainCategory.BackHair or ChainCategory.SideHair or ChainCategory.FrontBangs;

                if (isHair)
                {
                    // Natural hair relative swing speed limits: falls promptly (~0.20s) on stop without slow-motion floating
                    float maxRelSpeed = isStoppingOrSettling ? 1.85f : 2.80f;
                    float vLen = vRel.Length();
                    if (vLen > maxRelSpeed)
                        vRel = (vRel / vLen) * maxRelSpeed;

                    if (vRel.Y < 0f)
                    {
                        float maxDownRelSpeed = isStoppingOrSettling ? -1.35f : -1.80f;
                        if (vRel.Y < maxDownRelSpeed)
                            vRel.Y = maxDownRelSpeed;
                    }
                }
                else
                {
                    float maxClothRelSpeed = isStoppingOrSettling ? 1.15f : 2.40f;
                    float vLen = vRel.Length();
                    if (vLen > maxClothRelSpeed)
                        vRel = (vRel / vLen) * maxClothRelSpeed;
                }

                Vector3 dynamicTargetDirWorld = baseRestDir;
                Vector3 strideImpulseAccel = Vector3.Zero;

                if (link.Category == ChainCategory.Bust)
                {
                    // Natural soft chest jiggle + idle breathing rise/fall:
                    //   - Idle: gentle breathing heave (~0.42 Hz)
                    //   - Walk: soft vertical bounce + subtle L/R counter-sway on footsteps
                    //   - Run:  pronounced vertical bounce + forward/lateral spring jiggle
                    float loco = _smoothedLocomotionFactor;
                    float walkPart = Mathf.Clamp(loco / 0.34f, 0f, 1.0f);
                    float runPart = Mathf.Clamp((loco - 0.34f) / 0.56f, 0f, 1.15f);
                    float sidePhase = link.Name.Contains("_l", StringComparison.OrdinalIgnoreCase) ? -0.18f : 0.18f;
                    float breath = Mathf.Sin(_idleBreathPhase);
                    float stepBounce = Mathf.Sin(_stridePhase * 2.0f + sidePhase);
                    float stepSway = Mathf.Cos(_stridePhase + sidePhase);

                    float vertBias = 0.035f * (1.0f - walkPart * 0.5f) * breath
                                     + (0.11f * walkPart + 0.28f * runPart) * stepBounce;
                    float latBias = (0.04f * walkPart + 0.11f * runPart) * stepSway;

                    dynamicTargetDirWorld = (baseRestDir + upDir * vertBias + rightDir * latBias).Normalized();
                    strideImpulseAccel = upDir * ((1.40f * walkPart + 4.80f * runPart) * stepBounce + 0.35f * breath)
                                         + rightDir * ((0.45f * walkPart + 1.35f * runPart) * stepSway)
                                         - horizAccel * 0.16f;
                }
                else if (!isStoppingOrSettling && _smoothedLocomotionFactor > 0.02f && link.Category != ChainCategory.FrontBangs)
                {
                    float loco = _smoothedLocomotionFactor;
                    // Separate Walk (loco <= 0.34 -> walkPart 0..1, runPart 0) from Run (loco 0.34..1.0 -> runPart 0..1)
                    // so Walk and Run have unmistakably different inertia and wave amplitude!
                    float walkPart = Mathf.Clamp(loco / 0.34f, 0f, 1.0f);
                    float runPart = Mathf.Clamp((loco - 0.34f) / 0.56f, 0f, 1.15f);

                    float depthGain = link.ChainDepth == 1 ? 0.75f : (link.ChainDepth == 2 ? 1.00f : (link.ChainDepth == 3 ? 1.25f : 1.48f));
                    // 1.50 rad (~86 deg) phase lag per link so link 1 (0 deg) and link 3 (172 deg) move in opposite directions,
                    // forming a true travelling S-wave (∿) from root -> mid -> tip on every footstep!
                    float phaseLag = (link.ChainDepth - 1) * 1.50f;

                    // theta2 (2x stride cycle): fires on EVERY left and right footstep
                    //   sin(theta2) > 0: step push-off (ขึ้นตอนก้าว -> hair lifts UP)
                    //   sin(theta2) < 0: foot landing  (ลงตอนก้าวถึง -> hair dips DOWN)
                    float theta2 = _stridePhase * 2.0f - phaseLag;
                    // theta1 (1x stride cycle): alternates left (-) vs right (+) leg step
                    float theta1 = _stridePhase - phaseLag * 0.55f;

                    float stepWave = Mathf.Sin(theta2);
                    float lateralWave = Mathf.Sin(theta1);

                    if (isHair)
                    {
                        // 1. Directional Inertia Trail (opposite to movement direction <-):
                        //    - Walk: gentle light inertia (~7-10 deg trail)
                        //    - Run:  strong inertia (~26-38 deg trail, >3x walking!)
                        float trailTargetBias = (0.11f * walkPart + 0.62f * runPart) * depthGain;

                        // 2. Travelling Footstep S-Wave (∿):
                        //    - Rises UP on step push-off (stepWave > 0) and dips DOWN on foot strike (stepWave < 0)
                        //    - Progressive 86-deg phase lag per link bends the strand into a clear ∿ wave
                        float waveAmp = (0.09f * walkPart + 0.48f * runPart) * depthGain;
                        Vector3 waveOffset = stepWave >= 0f
                            ? (upDir * 0.84f + trailDir * 0.54f) * (waveAmp * stepWave)
                            : (-upDir * 0.88f - trailDir * 0.42f) * (waveAmp * (-stepWave));

                        Vector3 lateralOffset = rightDir * ((0.06f * walkPart + 0.16f * runPart) * lateralWave * depthGain);
                        if (link.Category == ChainCategory.SideHair)
                        {
                            float sideSign = link.Name.Contains("_l", StringComparison.OrdinalIgnoreCase) ? -1.0f : 1.0f;
                            lateralOffset += rightDir * (sideSign * (0.05f * walkPart + 0.16f * runPart) * (0.75f + 0.25f * stepWave) * depthGain);
                        }

                        dynamicTargetDirWorld = (baseRestDir + trailDir * trailTargetBias + waveOffset + lateralOffset).Normalized();

                        // Dynamic acceleration impulses (including start/turn root acceleration inertia -horizAccel)
                        Vector3 accelInertia = -horizAccel * (0.22f * depthGain);
                        Vector3 trailAccel = trailDir * ((0.80f * walkPart + 5.60f * runPart) * depthGain);
                        Vector3 waveAccel = (upDir * (0.85f * stepWave) + trailDir * (0.45f * stepWave))
                                            * ((1.20f * walkPart + 6.80f * runPart) * depthGain);
                        Vector3 sideAccel = rightDir * ((0.45f * walkPart + 1.35f * runPart) * lateralWave * depthGain);

                        strideImpulseAccel = accelInertia + trailAccel + waveAccel + sideAccel;
                    }
                    else
                    {
                        // Skirt & Cape (3D volumetric cloth ripple):
                        //   - Lower air drag than hair (~28% of hair trail)
                        //   - Radial 3D outward ripple around the waist synchronized with leg strides
                        Vector3 radialHoriz = new Vector3(rootWorld.X - skelWorld.Origin.X, 0f, rootWorld.Z - skelWorld.Origin.Z);
                        Vector3 radialDir = radialHoriz.LengthSquared() > 1e-5f ? radialHoriz.Normalized() : backDir;
                        float pleatAngle = Mathf.Atan2(radialDir.Dot(rightDir), radialDir.Dot(backDir));

                        float pleatWave = Mathf.Sin(theta2 - pleatAngle * 0.90f);
                        float legPushOut = Mathf.Max(0f, Mathf.Sin(theta1) * radialDir.Dot(rightDir) + 0.40f * Mathf.Cos(theta2));

                        float clothTrailBias = (0.06f * walkPart + 0.20f * runPart) * depthGain;
                        float clothRadialBias = (0.10f * walkPart + 0.26f * runPart) * (0.60f * legPushOut + 0.40f * pleatWave) * depthGain;
                        float clothVertBias = (0.06f * walkPart + 0.16f * runPart) * stepWave * depthGain;

                        dynamicTargetDirWorld = (baseRestDir + trailDir * clothTrailBias + radialDir * clothRadialBias + upDir * clothVertBias).Normalized();

                        Vector3 clothAirDrag = trailDir * ((0.45f * walkPart + 1.65f * runPart) * depthGain) - horizAccel * (0.14f * depthGain);
                        Vector3 radial3DWave = radialDir * ((1.10f * walkPart + 2.80f * runPart) * (0.55f * legPushOut + 0.45f * pleatWave) * depthGain);
                        Vector3 clothUpDown = upDir * ((0.85f * walkPart + 2.20f * runPart) * stepWave * depthGain);
                        Vector3 clothSway = rightDir * ((0.45f * walkPart + 0.95f * runPart) * lateralWave * depthGain);

                        strideImpulseAccel = clothAirDrag + radial3DWave + clothUpDown + clothSway;
                    }
                }

                Vector3 xTarget = rootWorld + dynamicTargetDirWorld * link.SegmentLengthM;
                Vector3 xRestDrape = rootWorld + parentCarriedDir * link.SegmentLengthM;

                // When stopping/settling, use zeta=0.78 so hair drops briskly at natural speed (~0.22s) and settles without rubbery bounce
                float effectiveZeta = isStoppingOrSettling ? Mathf.Max(link.Zeta, 0.78f) : link.Zeta;

                // Second-order damped spring acceleration in the moving character frame:
                //   The sculpted rest pose (xRestDrape) already encodes static gravity equilibrium;
                //   extra downward gravity acts whenever the tip is lifted above its rest drape!
                float liftedAboveRest = Mathf.Clamp((advectedTip.Y - xRestDrape.Y) / (link.SegmentLengthM * 0.45f), 0f, 1.5f);
                Vector3 gravityVec = new Vector3(0f, -link.GravityMps2 * liftedAboveRest, 0f);
                Vector3 accel = (link.Omega * link.Omega) * (xTarget - advectedTip)
                                - (2.0f * effectiveZeta * link.Omega) * vRel
                                + gravityVec
                                + strideImpulseAccel;

                Vector3 xNext = advectedTip + vRel * h + accel * (h * h);

                // Iterative collision projection + fixed-length constraint + max swing cone clamp
                for (int iter = 0; iter < ConstraintIterations; iter++)
                {
                    // Only project body colliders when the tip moves forward of its sculpted rest drape (toward the body)
                    if (!isHair || (xNext - xRestDrape).Dot(backDir) < -0.005f)
                    {
                        ProjectColliders(ref xNext, link.TipRadiusM, spheres, capsules);
                    }

                    Vector3 seg = xNext - rootWorld;
                    float segLen = seg.Length();
                    Vector3 curDir = segLen > 1e-5f ? seg / segLen : dynamicTargetDirWorld;

                    // Cone clamp around parentCarriedDir so no single joint ever folds into a sharp kink (> maxSwingRad)
                    float dot = Mathf.Clamp(curDir.Dot(parentCarriedDir), -1.0f, 1.0f);
                    float angle = Mathf.Acos(dot);
                    if (angle > link.MaxSwingRad && angle > 1e-4f)
                    {
                        Vector3 axis = parentCarriedDir.Cross(curDir);
                        float axisLen = axis.Length();
                        if (axisLen > 1e-5f)
                        {
                            curDir = new Basis(axis / axisLen, link.MaxSwingRad) * parentCarriedDir;
                        }
                    }

                    xNext = rootWorld + curDir.Normalized() * link.SegmentLengthM;
                }

                link.PrevTipWorld = advectedTip;
                link.SimTipWorld = xNext;
                link.PrevPrimaryGlobal = primaryGlobal;

                UpdateBoneRotationFromTip(link, skelWorld, restPoseGlobal, rootWorld, parentCarriedDir, xNext);
            }
        }

        private void ApplySolvedRotations(Transform3D skelWorld)
        {
            foreach (SpringLink link in _capeAndHemLinks)
            {
                if (!link.Initialized) continue;
                _skeleton.SetBonePoseRotation(link.BoneIdx, link.RestRotation);
                Transform3D restPoseGlobal = skelWorld * _skeleton.GetBoneGlobalPose(link.BoneIdx);
                Vector3 rootWorld = restPoseGlobal.Origin;
                Vector3 desiredDirWorld = (restPoseGlobal.Basis * link.RestLocalTailDir).Normalized();
                UpdateBoneRotationFromTip(link, skelWorld, restPoseGlobal, rootWorld, desiredDirWorld, link.SimTipWorld);
            }
            foreach (SpringLink link in _hairLinks)
            {
                if (!link.Initialized) continue;
                _skeleton.SetBonePoseRotation(link.BoneIdx, link.RestRotation);
                Transform3D restPoseGlobal = skelWorld * _skeleton.GetBoneGlobalPose(link.BoneIdx);
                Vector3 rootWorld = restPoseGlobal.Origin;
                Vector3 desiredDirWorld = (restPoseGlobal.Basis * link.RestLocalTailDir).Normalized();
                UpdateBoneRotationFromTip(link, skelWorld, restPoseGlobal, rootWorld, desiredDirWorld, link.SimTipWorld);
            }
        }

        private void UpdateBoneRotationFromTip(
            SpringLink link,
            Transform3D skelWorld,
            Transform3D restPoseGlobal,
            Vector3 rootWorld,
            Vector3 desiredDirWorld,
            Vector3 solvedTipWorld)
        {
            Vector3 solvedDirWorld = (solvedTipWorld - rootWorld).Normalized();
            if (!solvedDirWorld.IsFinite() || solvedDirWorld.LengthSquared() < 0.5f)
                return;

            Basis boneWorldBasisInv = restPoseGlobal.Basis.Inverse();
            Vector3 fromLocal = (boneWorldBasisInv * desiredDirWorld).Normalized();
            Vector3 toLocal = (boneWorldBasisInv * solvedDirWorld).Normalized();

            Quaternion deltaLocalRot = ShortestArcQuaternion(fromLocal, toLocal);
            Quaternion finalRot = (link.RestRotation * deltaLocalRot).Normalized();
            if (finalRot.IsFinite())
            {
                _skeleton.SetBonePoseRotation(link.BoneIdx, finalRot);
            }
        }

        private static Quaternion ShortestArcQuaternion(Vector3 from, Vector3 to)
        {
            float dot = Mathf.Clamp(from.Dot(to), -1.0f, 1.0f);
            if (dot > 0.99995f)
                return Quaternion.Identity;
            if (dot < -0.99995f)
            {
                Vector3 ortho = Math.Abs(from.X) < 0.9f ? new Vector3(1f, 0f, 0f) : new Vector3(0f, 1f, 0f);
                Vector3 axis = from.Cross(ortho).Normalized();
                return new Quaternion(axis, Mathf.Pi).Normalized();
            }
            Vector3 cross = from.Cross(to);
            var q = new Quaternion(cross.X, cross.Y, cross.Z, 1.0f + dot);
            return q.Normalized();
        }

        private static void ProjectColliders(
            ref Vector3 pointWorld,
            float pointRadiusM,
            ReadOnlySpan<SphereCollider> spheres,
            ReadOnlySpan<CapsuleCollider> capsules)
        {
            for (int i = 0; i < spheres.Length; i++)
            {
                Vector3 diff = pointWorld - spheres[i].CenterWorld;
                float rEff = spheres[i].RadiusM + pointRadiusM;
                float distSq = diff.LengthSquared();
                if (distSq < rEff * rEff && distSq > 1e-10f)
                {
                    float dist = Mathf.Sqrt(distSq);
                    pointWorld = spheres[i].CenterWorld + (diff / dist) * rEff;
                }
            }

            for (int i = 0; i < capsules.Length; i++)
            {
                Vector3 ab = capsules[i].PointBWorld - capsules[i].PointAWorld;
                float abLenSq = ab.LengthSquared();
                float t = abLenSq > 1e-8f
                    ? Mathf.Clamp((pointWorld - capsules[i].PointAWorld).Dot(ab) / abLenSq, 0.0f, 1.0f)
                    : 0.0f;
                Vector3 closest = capsules[i].PointAWorld + ab * t;
                Vector3 diff = pointWorld - closest;
                float rEff = capsules[i].RadiusM + pointRadiusM;
                float distSq = diff.LengthSquared();
                if (distSq < rEff * rEff && distSq > 1e-10f)
                {
                    float dist = Mathf.Sqrt(distSq);
                    pointWorld = closest + (diff / dist) * rEff;
                }
            }
        }

        private Vector3 GetCloakUpperBackCenterWorld(Transform3D skelWorld)
        {
            if (_spineBoneIdx >= 0)
            {
                Transform3D sp = skelWorld * _skeleton.GetBoneGlobalPose(_spineBoneIdx);
                // In Godot Y-up glTF space, character faces +Z or -Z; back cloak surface is ~3.5cm behind Spine
                Vector3 backDir = GetCharacterBackDirectionWorld(skelWorld);
                return sp.Origin + backDir * 0.042f + new Vector3(0f, 0.025f, 0f);
            }
            return skelWorld.Origin + new Vector3(0f, 0.74f, 0f);
        }

        private Vector3 GetCharacterBackDirectionWorld(Transform3D skelWorld)
        {
            // All Atlas glTF character rigs face +Z in skelWorld (verified by targetAngle = Atan2(norm.X, norm.Z)),
            // so character backward is always -skelWorld.Basis.Z.
            Vector3 back = -skelWorld.Basis.Z;
            back.Y = 0f;
            if (back.LengthSquared() > 1e-6f)
                return back.Normalized();
            return (-skelWorld.Basis.Z).Normalized();
        }

        private void BuildBodyColliders(
            Transform3D skelWorld,
            Span<SphereCollider> spheres,
            out int sphereCount,
            Span<CapsuleCollider> capsules,
            out int capsuleCount)
        {
            sphereCount = 0;
            capsuleCount = 0;
            Vector3 backDir = GetCharacterBackDirectionWorld(skelWorld);

            if (_neckBoneIdx >= 0)
            {
                Vector3 neckPos = (skelWorld * _skeleton.GetBoneGlobalPose(_neckBoneIdx)).Origin;
                spheres[sphereCount++] = new SphereCollider
                {
                    CenterWorld = neckPos + backDir * 0.012f,
                    RadiusM = 0.028f
                };
            }

            if (_leftShoulderIdx >= 0)
            {
                Vector3 lsPos = (skelWorld * _skeleton.GetBoneGlobalPose(_leftShoulderIdx)).Origin;
                spheres[sphereCount++] = new SphereCollider
                {
                    CenterWorld = lsPos + backDir * 0.010f,
                    RadiusM = 0.028f
                };
            }

            if (_rightShoulderIdx >= 0)
            {
                Vector3 rsPos = (skelWorld * _skeleton.GetBoneGlobalPose(_rightShoulderIdx)).Origin;
                spheres[sphereCount++] = new SphereCollider
                {
                    CenterWorld = rsPos + backDir * 0.010f,
                    RadiusM = 0.028f
                };
            }

            if (_spineBoneIdx >= 0 && _spine01BoneIdx >= 0)
            {
                Vector3 spTop = (skelWorld * _skeleton.GetBoneGlobalPose(_spineBoneIdx)).Origin;
                Vector3 spBot = (skelWorld * _skeleton.GetBoneGlobalPose(_spine01BoneIdx)).Origin;
                capsules[capsuleCount++] = new CapsuleCollider
                {
                    PointAWorld = spTop + backDir * 0.018f + new Vector3(0f, 0.015f, 0f),
                    PointBWorld = spBot + backDir * 0.022f,
                    RadiusM = 0.032f
                };
            }
        }
    }
}

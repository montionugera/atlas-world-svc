using System;
using System.IO;
using System.Threading.Tasks;
using Godot;
using AtlasWorld.Client.Audio;

namespace AtlasWorld.Client.World
{
    /// <summary>
    /// F-188 env-gated probe (ATLAS_VERIFY_PLAYTEST_SANDBOX=1).
    /// Instantiates PlaytestSandbox.tscn (or runs inside PlaytestSandboxRoot if already the main scene),
    /// exercises the shared World engine loop:
    /// 1. Spawns Maro Folk Girl in Maro Bell plaza grounded on terrain (foot delta >= -25 mm).
    /// 2. Steps Walk (0.9 m/s) and Run (3.0 m/s) locomotion and verifies AnimationController state + position delta.
    /// 3. Triggers Attack() while running at 3.0 m/s near the plaza dummy, verifying upper-body attack blend
    ///    is active while legs run AND the dummy takes damage (CurrentHp < MaxHp).
    /// 4. Cycles Hair Color presets (SetHairPresetIndex) and verifies the Hair surface color changes while Body stays unchanged.
    /// 5. Cycles 1H Sword variants (SetWeaponIndex: sword, kk_sword_a, kk_sword_b, claymore, axe, unarmed).
    /// 6. Cycles Character Rigs (CycleAvatarRig: npc:maro_folk_girl -> vroid_sample -> silme_seeress -> watch_sergeant -> player -> back).
    /// 7. Teleports across Maro Bell landmarks, verifies 18-step watchtower stairs on freja-south-gate, and verifies Camera-Relative Omnidirectional WASD + ElevenLabs footstep phase sync.
    /// 8. With ATLAS_RENDER_PLAYTEST_SANDBOX=&lt;dir&gt; in a windowed run, captures high-res interactive HUD screenshots.
    /// </summary>
    public sealed partial class PlaytestSandboxVerify : Node
    {
        private const string Tag = "[PlaytestSandboxVerify]";
        private int _failures;

        [System.Runtime.InteropServices.DllImport("libc")]
        private static extern void _exit(int status);

        public override async void _Ready()
        {
            GD.Print($"{Tag} BEGIN");
            try
            {
                await Run();
            }
            catch (Exception ex)
            {
                Report($"no exception escaped the probe ({ex.GetType().Name}: {ex.Message})", false);
            }
            bool pass = _failures == 0;
            GD.Print(pass ? $"{Tag} VERDICT PASS" : $"{Tag} VERDICT FAIL ({_failures} case(s))");
            if (DisplayServer.GetName() == "headless" && !OperatingSystem.IsWindows())
            {
                Console.Out.Flush();
                Console.Error.Flush();
                _exit(pass ? 0 : 1);
            }
            GetTree().Quit(pass ? 0 : 1);
        }

        private async Task Run()
        {
            PlaytestSandboxRoot? sandbox = GetParent() as PlaytestSandboxRoot;
            bool ownedSandbox = false;
            if (sandbox == null)
            {
                PackedScene? scene = ResourceLoader.Load<PackedScene>("res://scenes/PlaytestSandbox.tscn");
                if (!Report("PlaytestSandbox.tscn loads", scene != null))
                    return;
                sandbox = scene!.Instantiate() as PlaytestSandboxRoot;
                if (!Report("PlaytestSandbox.tscn instances PlaytestSandboxRoot", sandbox != null))
                    return;
                AddChild(sandbox!);
                ownedSandbox = true;
            }
            await NextFrames(2);

            Report("initial map is maro-bell", sandbox!.ActiveMapId == "maro-bell");
            Report("initial avatar is npc:maro_folk_girl", sandbox.ActiveAvatarKey == PipelineCharVerify.MaroGirlKey);
            Report("3 interactive target dummies spawned in plaza", sandbox.Dummies.Count == 3);
            Report("initial weapon is sword and equipped on handslot_r",
                sandbox.ActiveWeaponKey == "sword" && sandbox.AvatarWeaponSocket?.Equipped != null);
            Report("initial stance is Relaxed (weapon hidden, feminine relaxed posture enabled)",
                sandbox.IsRelaxedStance && !sandbox.IsWeaponCurrentlyVisible &&
                sandbox.AvatarAnimation != null && sandbox.AvatarAnimation.UseFeminineRelaxedPosture);
            Report($"initial avatar Y is grounded on maro-bell floor (Y={sandbox.AvatarNode!.Position.Y:F3} m == 0.00 m)",
                Mathf.Abs(sandbox.AvatarNode.Position.Y) < 0.02f);
            Report($"initial foot grounding delta ({sandbox.LastFootMinDeltaMeters * 1000f:+0.0;-0.0;0.0} mm >= -25 mm)",
                sandbox.LastFootMinDeltaMeters >= -0.025f);

            // 1. Walk gait (0.9 m/s)
            sandbox.SetGaitRun(false);
            Vector3 startPos = sandbox.AvatarNode!.Position;
            sandbox.StepMovement(new Vector3(0f, 0f, -1f), 0.25f);
            Vector3 walkPos = sandbox.AvatarNode.Position;
            Report("walk step (0.9 m/s) moves avatar forward and sets state=walk",
                walkPos.DistanceTo(startPos) > 0.15f && sandbox.AvatarAnimation?.CurrentState == "walk");
            Report($"avatar Y stays flat on ground after walking (Y={walkPos.Y:F3} m == 0.00 m, no mid-air floating)",
                Mathf.Abs(walkPos.Y) < 0.02f);

            // 2. Run gait (3.0 m/s) + Upper-Body Attack against Target Dummy
            sandbox.SetGaitRun(true);
            sandbox.StepMovement(new Vector3(0f, 0f, -1f), 0.50f);
            Report("run step (3.0 m/s) sets state=run", sandbox.AvatarAnimation?.CurrentState == "run");
            Report($"avatar Y stays flat on ground after running (Y={sandbox.AvatarNode.Position.Y:F3} m == 0.00 m)",
                Mathf.Abs(sandbox.AvatarNode.Position.Y) < 0.02f);

            long dummyHpBefore = sandbox.Dummies[0].CurrentHp;
            sandbox.TriggerSandboxAttack();
            Report("Attack() reveals weapon and activates upper-body attack blend while legs stay in run",
                sandbox.IsWeaponCurrentlyVisible &&
                sandbox.AvatarAnimation?.CurrentState == "run" && sandbox.AvatarAnimation.IsUpperBodyAttackActive);
            Report($"plaza dummy took melee damage ({sandbox.Dummies[0].CurrentHp} < {dummyHpBefore})",
                sandbox.Dummies[0].CurrentHp < dummyHpBefore);
            Report($"foot grounding during moving attack ({sandbox.LastFootMinDeltaMeters * 1000f:+0.0;-0.0;0.0} mm >= -25 mm)",
                sandbox.LastFootMinDeltaMeters >= -0.025f);

            // Stop moving and verify Relaxed <-> Armed stance + Face Zoom toggle
            sandbox.StepMovement(Vector3.Zero, 0.1f);
            sandbox.SetRelaxedStance(false);
            Report("SetRelaxedStance(false) switches to Armed stance with weapon visible",
                !sandbox.IsRelaxedStance && sandbox.IsWeaponCurrentlyVisible);
            sandbox.SetRelaxedStance(true);
            Report("SetRelaxedStance(true) returns to Relaxed stance with weapon hidden",
                sandbox.IsRelaxedStance && !sandbox.IsWeaponCurrentlyVisible);

            // Verify Relaxed Idle is actively animating (not frozen) when standing still after walking,
            // AND feet stay planted horizontally (X/Z drift <= 1.50 cm, no pendulum leg swing).
            Skeleton3D? skel = sandbox.AvatarSkeleton;
            int headIdx = skel?.FindBone("Head") ?? -1;
            int rHandIdx = skel?.FindBone("RightHand") ?? -1;
            int lFootIdx = skel?.FindBone("LeftFoot") ?? -1;
            int rFootIdx = skel?.FindBone("RightFoot") ?? -1;
            int hairTipIdx = skel?.FindBone("sec_hair_c1_3") ?? -1;
            int capeTipIdx = skel?.FindBone("sec_cape_l1_2") ?? -1;
            sandbox.StepMovement(Vector3.Zero, 0.20f);
            Vector3 handIdleA = skel != null && rHandIdx >= 0 ? skel.GetBoneGlobalPose(rHandIdx).Origin : Vector3.Zero;
            Quaternion headIdleA = skel != null && headIdx >= 0 ? skel.GetBoneGlobalPose(headIdx).Basis.GetRotationQuaternion() : Quaternion.Identity;
            Vector2 lFootMinXZ = new(float.MaxValue, float.MaxValue);
            Vector2 lFootMaxXZ = new(float.MinValue, float.MinValue);
            Vector2 rFootMinXZ = new(float.MaxValue, float.MaxValue);
            Vector2 rFootMaxXZ = new(float.MinValue, float.MinValue);
            for (int idleStep = 0; idleStep < 5; idleStep++)
            {
                if (skel != null && lFootIdx >= 0 && rFootIdx >= 0)
                {
                    Vector3 lf = skel.GetBoneGlobalPose(lFootIdx).Origin;
                    Vector3 rf = skel.GetBoneGlobalPose(rFootIdx).Origin;
                    Vector2 lxz = new(lf.X, lf.Z);
                    Vector2 rxz = new(rf.X, rf.Z);
                    lFootMinXZ = lFootMinXZ.Min(lxz);
                    lFootMaxXZ = lFootMaxXZ.Max(lxz);
                    rFootMinXZ = rFootMinXZ.Min(rxz);
                    rFootMaxXZ = rFootMaxXZ.Max(rxz);
                }
                if (idleStep < 4)
                    sandbox.StepMovement(Vector3.Zero, 0.2125f);
            }
            Vector3 handIdleB = skel != null && rHandIdx >= 0 ? skel.GetBoneGlobalPose(rHandIdx).Origin : Vector3.Zero;
            Quaternion headIdleB = skel != null && headIdx >= 0 ? skel.GetBoneGlobalPose(headIdx).Basis.GetRotationQuaternion() : Quaternion.Identity;
            float handIdleDriftCm = handIdleA.DistanceTo(handIdleB) * 100f;
            float headIdleAngleDeg = Mathf.RadToDeg(headIdleA.AngleTo(headIdleB));
            float footIdleHorizDriftCm = Mathf.Max(lFootMinXZ.DistanceTo(lFootMaxXZ), rFootMinXZ.DistanceTo(rFootMaxXZ)) * 100f;
            Report($"Relaxed Idle actively animates Mixamo Weight Shift Idle when stopped (hand moved {handIdleDriftCm:F2} cm > 0.20 cm, head turned {headIdleAngleDeg:F2} deg > 0.20 deg)",
                handIdleDriftCm > 0.20f && headIdleAngleDeg > 0.20f && sandbox.LastFootMinDeltaMeters >= -0.025f);
            Report($"Relaxed Idle feet stay horizontally planted with zero pendulum sway (max ankle X/Z drift {footIdleHorizDriftCm:F2} cm <= 1.50 cm)",
                footIdleHorizDriftCm <= 1.50f);

            // Verify A+ Tier SecondarySpringPhysics (120Hz Velocity-Verlet + Capsule/Sphere Collider solver) on hair & cape chains
            Quaternion hairIdleRot = skel != null && hairTipIdx >= 0 ? skel.GetBonePoseRotation(hairTipIdx) : Quaternion.Identity;
            Quaternion capeIdleRot = skel != null && capeTipIdx >= 0 ? skel.GetBonePoseRotation(capeTipIdx) : Quaternion.Identity;
            sandbox.SetGaitRun(true);
            for (int step = 0; step < 6; step++)
                sandbox.StepMovement(new Vector3(0.4f, 0f, -0.9f).Normalized(), 0.05f);
            Quaternion hairRunRot = skel != null && hairTipIdx >= 0 ? skel.GetBonePoseRotation(hairTipIdx) : Quaternion.Identity;
            Quaternion capeRunRot = skel != null && capeTipIdx >= 0 ? skel.GetBonePoseRotation(capeTipIdx) : Quaternion.Identity;
            float hairSpringDeg = Mathf.RadToDeg(hairIdleRot.AngleTo(hairRunRot));
            float capeSpringDeg = Mathf.RadToDeg(capeIdleRot.AngleTo(capeRunRot));
            Report($"SecondarySpringPhysics drives damped hair & cape follow-through on acceleration (links={sandbox.AvatarAnimation?.SecondarySpringLinkCount}, hair={hairSpringDeg:F2} deg, cape={capeSpringDeg:F2} deg)",
                (sandbox.AvatarAnimation?.SecondarySpringLinkCount ?? 0) >= 11 && hairSpringDeg > 0.5f && capeSpringDeg > 0.5f);

            // Verify continuous footstep-cadence hair bounce & sway during steady constant-velocity running
            float maxSteadyOscDeg = 0f;
            for (int step = 0; step < 12; step++)
            {
                sandbox.StepMovement(new Vector3(0.4f, 0f, -0.9f).Normalized(), 0.03f);
                Quaternion curRot = skel != null && hairTipIdx >= 0 ? skel.GetBonePoseRotation(hairTipIdx) : Quaternion.Identity;
                maxSteadyOscDeg = Mathf.Max(maxSteadyOscDeg, Mathf.RadToDeg(hairRunRot.AngleTo(curRot)));
            }
            Report($"Footstep cadence impulse keeps hair bouncing/swaying during steady running (osc={maxSteadyOscDeg:F2} deg > 1.50 deg)",
                maxSteadyOscDeg > 1.50f);
            sandbox.StepMovement(Vector3.Zero, 0.25f);

            // Verify live Mixamo preset cycling (Weight Shift Idle -> Dwarf Idle Var. 2 -> Dwarf Standing Idle) & Move preset cycling
            Report($"initial Mixamo idle preset is f_idle_weight_shift (got {sandbox.ActiveIdlePresetSlug})",
                sandbox.ActiveIdlePresetSlug == "f_idle_weight_shift");
            sandbox.CycleIdlePreset();
            Report($"CycleIdlePreset switches to f_idle_dwarf_var2 (got {sandbox.ActiveIdlePresetSlug}, clip={sandbox.AvatarAnimation?.CurrentClip})",
                sandbox.ActiveIdlePresetSlug == "f_idle_dwarf_var2" &&
                sandbox.AvatarAnimation?.CurrentClip == "mx_f_idle_dwarf_var2" &&
                sandbox.LastFootMinDeltaMeters >= -0.025f);
            sandbox.CycleMovePreset();
            sandbox.SetGaitRun(false);
            sandbox.StepMovement(new Vector3(0f, 0f, -1f), 0.25f);
            Report($"CycleMovePreset switches walk to f_start_jog (mx_f_walk_start, got {sandbox.AvatarAnimation?.CurrentClip})",
                sandbox.ActiveMovePresetSlug == "f_start_jog" &&
                sandbox.AvatarAnimation?.CurrentClip == "mx_f_walk_start");
            sandbox.SetIdlePresetIndex(0);
            sandbox.SetMovePresetIndex(0);
            sandbox.StepMovement(Vector3.Zero, 0.20f);

            sandbox.ToggleFaceZoom();
            Report($"ToggleFaceZoom zooms close to character face (dist={sandbox.CameraDistance:F2} m <= 0.65 m)",
                sandbox.CameraDistance <= 0.65f && sandbox.MainCamera != null && sandbox.MainCamera.Near <= 0.03f);
            sandbox.ToggleFaceZoom();
            Report($"ToggleFaceZoom restores gameplay distance (dist={sandbox.CameraDistance:F2} m >= 2.0 m)",
                sandbox.CameraDistance >= 2.0f);

            // F-193: the sandbox zoom range is the shared CameraZoom range (0.35..30 m).
            for (int i = 0; i < 120; i++) sandbox.SetCameraDistance(CameraZoom.Zoomed(sandbox.CameraDistance, +1));
            float zoomOut = sandbox.CameraDistance;
            for (int i = 0; i < 200; i++) sandbox.SetCameraDistance(CameraZoom.Zoomed(sandbox.CameraDistance, -1));
            float zoomIn = sandbox.CameraDistance;
            Report($"sandbox zoom spans the shared range (out={zoomOut:F2} in={zoomIn:F2})",
                Mathf.IsEqualApprox(zoomOut, CameraZoom.MaxDistance) && Mathf.IsEqualApprox(zoomIn, CameraZoom.MinDistance));
            sandbox.SetCameraDistance(4.2f);

            // 3. Live Hair Color Customizer
            Color? bodyBefore = CharacterCustomization.GetBodyColor(sandbox.AvatarModelNode!);
            for (int i = 1; i <= 4; i++)
            {
                sandbox.SetHairPresetIndex(i);
                Color want = CharacterCustomization.HairColorPresets[i].Color;
                Color? actualHair = CharacterCustomization.GetHairColor(sandbox.AvatarModelNode!);
                Color? actualBody = CharacterCustomization.GetBodyColor(sandbox.AvatarModelNode!);
                Report($"sandbox hair preset [{i}] '{sandbox.ActiveHairPresetName}' tints Hair and preserves Body",
                    actualHair.HasValue && actualHair.Value.IsEqualApprox(want) &&
                    bodyBefore.HasValue && actualBody.HasValue && actualBody.Value.IsEqualApprox(bodyBefore.Value));
            }

            // 4. Live 1H Sword Look Swapper
            foreach (int wIdx in new[] { 1, 2, 3, 4, 0 })
            {
                sandbox.SetWeaponIndex(wIdx);
                Report($"sandbox weapon swap [{wIdx}] '{sandbox.ActiveWeaponKey}' equips cleanly",
                    sandbox.AvatarWeaponSocket?.Equipped != null);
            }

            // 5. Live Character Rig Switcher (Maro Girl -> VRoid Sample -> Silme Seeress -> Sergeant -> Player -> back to Maro Girl)
            string startRig = sandbox.ActiveAvatarKey;
            sandbox.CycleAvatarRig();
            string secondRig = sandbox.ActiveAvatarKey;
            Report($"CycleAvatarRig switches from {startRig} to {secondRig}", secondRig != startRig && sandbox.AvatarModelNode != null);

            if (secondRig == PlaytestSandboxRoot.VroidSampleKey && sandbox.AvatarSkeleton != null)
            {
                Skeleton3D vSkel = sandbox.AvatarSkeleton;
                int l1 = vSkel.FindBone("sec_hair_l3_1");
                int l2 = vSkel.FindBone("sec_hair_l3_2");
                int l3 = vSkel.FindBone("sec_hair_l3_3");
                int l4 = vSkel.FindBone("sec_hair_l3_4");

                sandbox.StepMovement(Vector3.Zero, 0.25f);
                Quaternion restL1 = l1 >= 0 ? vSkel.GetBonePoseRotation(l1) : Quaternion.Identity;
                Quaternion restL2 = l2 >= 0 ? vSkel.GetBonePoseRotation(l2) : Quaternion.Identity;
                Quaternion restL3 = l3 >= 0 ? vSkel.GetBonePoseRotation(l3) : Quaternion.Identity;

                sandbox.SetGaitRun(false);
                float walkDeflectSum = 0f;
                for (int s = 0; s < 10; s++)
                {
                    sandbox.StepMovement(new Vector3(-1f, 0f, 0f), 0.04f, speedOverride: 1.5f);
                    if (l2 >= 0)
                        walkDeflectSum += Mathf.RadToDeg(restL2.AngleTo(vSkel.GetBonePoseRotation(l2)));
                }
                float walkAvgDeflectDeg = walkDeflectSum / 10f;

                sandbox.SetGaitRun(true);
                float runDeflectSum = 0f;
                float maxSWaveInflectDeg = 0f;
                Quaternion runStartL4 = Quaternion.Identity;
                float maxRunWaveOscDeg = 0f;
                float peakRunDeflectDeg = 0f;
                for (int s = 0; s < 16; s++)
                {
                    sandbox.StepMovement(new Vector3(-1f, 0f, 0f), 0.04f, speedOverride: 4.5f);
                    if (l2 >= 0)
                    {
                        float d2 = Mathf.RadToDeg(restL2.AngleTo(vSkel.GetBonePoseRotation(l2)));
                        runDeflectSum += d2;
                        peakRunDeflectDeg = Mathf.Max(peakRunDeflectDeg, d2);
                    }
                    if (l1 >= 0 && l3 >= 0)
                    {
                        Quaternion delta1 = restL1.Inverse() * vSkel.GetBonePoseRotation(l1);
                        Quaternion delta3 = restL3.Inverse() * vSkel.GetBonePoseRotation(l3);
                        float inflect = Mathf.RadToDeg(delta1.AngleTo(delta3));
                        maxSWaveInflectDeg = Mathf.Max(maxSWaveInflectDeg, inflect);
                    }
                    if (l4 >= 0)
                    {
                        Quaternion curL4 = vSkel.GetBonePoseRotation(l4);
                        if (s == 3)
                            runStartL4 = curL4;
                        else if (s > 3)
                            maxRunWaveOscDeg = Mathf.Max(maxRunWaveOscDeg, Mathf.RadToDeg(runStartL4.AngleTo(curL4)));
                    }
                }
                float runAvgDeflectDeg = runDeflectSum / 16f;

                for (int s = 0; s < 7; s++)
                    sandbox.StepMovement(Vector3.Zero, 0.04f);
                float afterStopDeg = l2 >= 0 ? Mathf.RadToDeg(restL2.AngleTo(vSkel.GetBonePoseRotation(l2))) : 0f;

                Report($"VRoid 4-link twin-tails Walk vs Run inertia & travelling S-wave (∿) (links={sandbox.AvatarAnimation?.SecondarySpringLinkCount}, walk={walkAvgDeflectDeg:F1} deg < run={runAvgDeflectDeg:F1} deg, sWave={maxSWaveInflectDeg:F1} deg, osc={maxRunWaveOscDeg:F1} deg, stopDrop={peakRunDeflectDeg:F1}->{afterStopDeg:F1} deg)",
                    (sandbox.AvatarAnimation?.SecondarySpringLinkCount ?? 0) >= 40 &&
                    runAvgDeflectDeg > walkAvgDeflectDeg * 1.80f &&
                    maxSWaveInflectDeg > 8.0f &&
                    maxRunWaveOscDeg > 8.0f &&
                    afterStopDeg < peakRunDeflectDeg * 0.55f);

                sandbox.SetEyeExpressionIndex(1); // Happy ^_^
                float vHappyW = CharacterCustomization.GetEyeExpressionWeight(sandbox.AvatarModelNode!, "eye_happy");
                sandbox.SetEyeExpressionIndex(0); // Neutral
                Report($"VRoid mouthless FaceMesh live eye expressions (eye_happy={vHappyW:F2})", vHappyW > 0.90f);
            }

            if (Godot.FileAccess.FileExists("res://studio-cache/silme_seeress.glb"))
            {
                sandbox.CycleAvatarRig();
                await NextFrames(2);
                Report($"CycleAvatarRig switches to npc:silme_seeress (got {sandbox.ActiveAvatarKey})",
                    sandbox.ActiveAvatarKey == "npc:silme_seeress");
                if (sandbox.AvatarSkeleton is Skeleton3D sSkel && sandbox.AvatarModelNode != null)
                {
                    int sc1 = sSkel.FindBone("sec_hair_c1_1");
                    sandbox.SetEyeExpressionIndex(1); // Happy ^_^
                    float sHappyW = CharacterCustomization.GetEyeExpressionWeight(sandbox.AvatarModelNode, "eye_happy");
                    sandbox.SetEyeExpressionIndex(0);
                    Report($"Silme Seeress hair spring chain (sec_hair_c1_1={sc1}) & mouthless FaceMesh live eye expressions (eye_happy={sHappyW:F2})",
                        sc1 >= 0 && sHappyW > 0.90f);

                    MeshInstance3D? sBody = sandbox.AvatarModelNode.FindChild("CharacterMesh", recursive: true, owned: false) as MeshInstance3D;
                    MeshInstance3D? sFace = sandbox.AvatarModelNode.FindChild("FaceMesh", recursive: true, owned: false) as MeshInstance3D;
                    MeshInstance3D? sHair = sandbox.AvatarModelNode.FindChild("HairMesh", recursive: true, owned: false) as MeshInstance3D;
                    MeshInstance3D? sCrown = sandbox.AvatarModelNode.FindChild("CrownOrnamentMesh", recursive: true, owned: false) as MeshInstance3D;
                    float collarOverlapMm = 0f;
                    if (sBody != null && sFace != null)
                    {
                        Aabb bodyBox = sBody.GetAabb();
                        Aabb faceBox = sFace.GetAabb();
                        collarOverlapMm = (bodyBox.End.Y - faceBox.Position.Y) * 1000f;
                    }
                    Report($"Silme Seeress 4-slot modular meshes present (Body={sBody != null}, Face={sFace != null}, Hair={sHair != null}, Crown={sCrown != null}) with watertight neck collar overlap ({collarOverlapMm:F1} mm in 2..35 mm)",
                        sBody != null && sFace != null && sHair != null && sCrown != null && collarOverlapMm >= 2.0f && collarOverlapMm <= 35.0f);
                }
            }

            while (sandbox.ActiveAvatarKey != startRig)
                sandbox.CycleAvatarRig();
            Report($"CycleAvatarRig returns to {startRig}", sandbox.ActiveAvatarKey == startRig);

            if (sandbox.AvatarSkeleton is Skeleton3D mSkel && sandbox.AvatarModelNode != null)
            {
                int mc1 = mSkel.FindBone("sec_hair_c1_1");
                int mc4 = mSkel.FindBone("sec_hair_c1_4");
                sandbox.SetEyeExpressionIndex(1); // Happy ^_^
                float mHappyW = CharacterCustomization.GetEyeExpressionWeight(sandbox.AvatarModelNode, "eye_happy");
                sandbox.SetEyeExpressionIndex(0); // Neutral
                Report($"Maro Folk Girl 4-link ponytail centerline (sec_hair_c1_1={mc1}, sec_hair_c1_4={mc4}) & mouthless VRoid FaceMesh live eye expressions (eye_happy={mHappyW:F2})",
                    mc1 >= 0 && mc4 >= 0 && mHappyW > 0.90f);

                sandbox.SetRelaxedStance(false);
                sandbox.StepMovement(Vector3.Zero, 0.25f);
                int lArmIdx = mSkel.FindBone("LeftArm");
                int rArmIdx = mSkel.FindBone("RightArm");
                float lArmDeg = lArmIdx >= 0 ? Mathf.RadToDeg(mSkel.GetBonePoseRotation(lArmIdx).GetAngle()) : 0f;
                float rArmDeg = rArmIdx >= 0 ? Mathf.RadToDeg(mSkel.GetBonePoseRotation(rArmIdx).GetAngle()) : 0f;
                sandbox.SetRelaxedStance(true);
                Report($"Armed Stance (combat_idle) is animated and never frozen in A-pose (LeftArm={lArmDeg:F1} deg, RightArm={rArmDeg:F1} deg > 10 deg)",
                    lArmDeg > 10.0f && rArmDeg > 10.0f);

                MeshInstance3D? faceMesh = sandbox.AvatarModelNode.GetNodeOrNull<MeshInstance3D>("Armature/Skeleton3D/FaceMesh")
                    ?? sandbox.AvatarModelNode.FindChild("FaceMesh", recursive: true, owned: false) as MeshInstance3D;
                bool faceToonOk = false;
                bool eyeShadedOk = false;
                bool eyeIrisCrispOk = false;
                int faceSurfCount = faceMesh?.Mesh?.GetSurfaceCount() ?? 0;
                if (faceMesh?.Mesh != null)
                {
                    for (int si = 0; si < faceSurfCount; si++)
                    {
                        Material? mat = faceMesh.GetSurfaceOverrideMaterial(si) ?? faceMesh.Mesh.SurfaceGetMaterial(si);
                        if (mat is StandardMaterial3D sm)
                        {
                            string rname = (sm.ResourceName ?? "").ToLowerInvariant();
                            if (rname.Contains("skin") || rname.Contains("face_00"))
                            {
                                faceToonOk = sm.DiffuseMode == BaseMaterial3D.DiffuseModeEnum.Toon
                                    && sm.DisableReceiveShadows
                                    && sm.EmissionEnabled;
                            }
                            else if (rname.Contains("eyewhite"))
                            {
                                eyeShadedOk = sm.ShadingMode == BaseMaterial3D.ShadingModeEnum.PerPixel
                                    && sm.DisableReceiveShadows;
                            }
                            else if (rname.Contains("eyeiris"))
                            {
                                Vector2I texSz = sm.AlbedoTexture != null ? new Vector2I(sm.AlbedoTexture.GetWidth(), sm.AlbedoTexture.GetHeight()) : Vector2I.Zero;
                                eyeIrisCrispOk = texSz.X >= 512 && texSz.Y >= 512;
                            }
                        }
                    }
                }
                Report($"Nighttime Face & Eye lighting parity + Crisp >=512px VRoid EyeIris (surfaces={faceSurfCount}>=8, FaceToon={faceToonOk}, EyeWhitePerPixel={eyeShadedOk}, EyeIris512={eyeIrisCrispOk})",
                    faceSurfCount >= 8 && faceToonOk && eyeShadedOk && eyeIrisCrispOk);
            }

            // 6. Landmark Teleporter & Map Switcher
            sandbox.TeleportToLandmark(1); // Arrival Gate
            Report("TeleportToLandmark(1) moves avatar to Arrival Gate (Z > 50)", sandbox.AvatarNode.Position.Z > 50f);
            sandbox.TeleportToLandmark(0); // Bell Terrace
            Report("TeleportToLandmark(0) returns avatar to Bell Terrace (Z < -10)", sandbox.AvatarNode.Position.Z < -10f);

            sandbox.ToggleMap();
            Report("ToggleMap switches to freja-south-gate", sandbox.ActiveMapId == "freja-south-gate");

            // Automated Stair Sinking & Smooth Walking Verification on freja_west_watchtower_01 East Stair Ramp
            UnifiedMapDocument? frejaDoc = sandbox.MapDocument;
            UnifiedMapStructureVolume? tower = frejaDoc?.Structures.Find(s => s.Id == "freja_west_watchtower_01");
            Report("freja_west_watchtower_01 exists in freja-south-gate", tower != null);
            if (tower != null && frejaDoc != null)
            {
                float r = Mathf.Max(2.5f, tower.Radius);
                float deckH = Mathf.Max(2.2f, tower.UpperFloorHeight);
                float structBaseY = TerrainElevation.SampleBaseTerrainHeight(tower.X, tower.Z, frejaDoc);
                float upperDeckY = structBaseY + deckH;

                float rampStartX = tower.X + r + 3.25f;
                float rampEndX = tower.X + r - 0.25f;
                const int stepCount = 18;

                float VisualStepRunnerTopY(float testX)
                {
                    if (testX >= rampStartX)
                        return structBaseY;
                    if (testX <= rampEndX)
                        return upperDeckY;
                    float t = (rampStartX - testX) / (rampStartX - rampEndX);
                    int sIdx = Mathf.Clamp((int)Mathf.Floor(t * stepCount), 0, stepCount - 1);
                    float sH = deckH * ((sIdx + 0.5f) / stepCount);
                    return structBaseY + sH + 0.012f;
                }

                float sampleStart = tower.X + r + 3.20f;
                float sampleEnd = tower.X + r - 0.20f;
                const int sampleCount = 20;

                bool allPointsNoSink = true;
                bool monotonic = true;
                float worstSinkMeters = 0f;
                float prevY = structBaseY;

                for (int p = 0; p < sampleCount; p++)
                {
                    float alpha = (float)p / (sampleCount - 1);
                    float px = Mathf.Lerp(sampleStart, sampleEnd, alpha);
                    float pz = tower.Z;

                    float sampledY = TerrainElevation.SampleHeight(px, pz, frejaDoc, prevY);
                    float visualTop = VisualStepRunnerTopY(px);

                    float sinkDelta = visualTop - sampledY;
                    if (sinkDelta > 0.002f)
                    {
                        allPointsNoSink = false;
                        worstSinkMeters = Mathf.Max(worstSinkMeters, sinkDelta);
                    }

                    if (p > 0 && sampledY < prevY - 0.0001f)
                    {
                        monotonic = false;
                    }

                    prevY = sampledY;
                }

                float deckSampleY = TerrainElevation.SampleHeight(tower.X + r - 0.35f, tower.Z, frejaDoc, prevY);
                bool deckSmooth = Mathf.Abs(deckSampleY - upperDeckY) < 0.01f;

                Report($"watchtower East stair ramp: 20 points sampled without sinking (worstSink={worstSinkMeters * 1000f:F1} mm <= 0 mm)",
                    allPointsNoSink);
                Report($"watchtower East stair ramp: monotonically increases smoothly to upperDeck (finalY={prevY:F2} m, deckY={deckSampleY:F2} m == {upperDeckY:F2} m)",
                    monotonic && deckSmooth);
            }

            sandbox.ToggleMap();
            Report("ToggleMap switches back to maro-bell", sandbox.ActiveMapId == "maro-bell");

            // 7. Camera-Relative Omnidirectional WASD Movement (Genshin / FFXIV Standard / ROX style)
            sandbox.TeleportToLandmark(0);
            sandbox.SetGaitRun(true);

            // 7a. W moves forward relative to CameraYaw (-Z when CameraYaw = 0), turning character toward -Z even if previously facing +X
            sandbox.CameraYaw = 0f;
            sandbox.AvatarNode!.Rotation = new Vector3(0f, Mathf.Pi * 0.5f, 0f);
            Vector3 wStart = sandbox.AvatarNode.Position;
            sandbox.StepWasdInput(w: true, s: false, a: false, d: false, dt: 0.25f);
            Vector3 wDelta = sandbox.AvatarNode.Position - wStart;
            float wYawDiff = Mathf.Abs(Mathf.Wrap(sandbox.AvatarNode.Rotation.Y - Mathf.Pi, -Mathf.Pi, Mathf.Pi));
            Report($"W moves into camera view (-Z when CameraYaw=0) and turns avatar to face -Z (dx={wDelta.X:F3}, dz={wDelta.Z:F3}, yawDiff={wYawDiff:F4})",
                wDelta.Z < -0.30f && Mathf.Abs(wDelta.X) < 0.03f && wYawDiff < 0.02f);

            // 7b. CameraYaw rotates movement direction: when CameraYaw = +Pi/2 (camera at +X looking toward -X), W moves -X
            sandbox.TeleportToLandmark(0);
            sandbox.CameraYaw = Mathf.Pi * 0.5f;
            Vector3 camOrbitStart = sandbox.AvatarNode.Position;
            sandbox.StepWasdInput(w: true, s: false, a: false, d: false, dt: 0.25f);
            Vector3 camOrbitDelta = sandbox.AvatarNode.Position - camOrbitStart;
            float camOrbitYawDiff = Mathf.Abs(Mathf.Wrap(sandbox.AvatarNode.Rotation.Y - (-Mathf.Pi * 0.5f), -Mathf.Pi, Mathf.Pi));
            Report($"W with orbited CameraYaw=+Pi/2 moves along camera forward (-X) and faces -Pi/2 (dx={camOrbitDelta.X:F3}, dz={camOrbitDelta.Z:F3}, yawDiff={camOrbitYawDiff:F4})",
                camOrbitDelta.X < -0.30f && Mathf.Abs(camOrbitDelta.Z) < 0.03f && camOrbitYawDiff < 0.02f);
            sandbox.CameraYaw = 0f;

            // 7c. D alone immediately turns right (+X when CameraYaw=0) and runs right (never spins in place)
            sandbox.TeleportToLandmark(0);
            sandbox.CameraYaw = 0f;
            Vector3 moveRightStart = sandbox.AvatarNode.Position;
            sandbox.StepWasdInput(w: false, s: false, a: false, d: true, dt: 0.25f);
            Vector3 moveRightDelta = sandbox.AvatarNode.Position - moveRightStart;
            float rightYawDiff = Mathf.Abs(Mathf.Wrap(sandbox.AvatarNode.Rotation.Y - (Mathf.Pi * 0.5f), -Mathf.Pi, Mathf.Pi));
            Report($"D alone turns right (+Pi/2) and translates +X immediately (dx={moveRightDelta.X:F3} > 0.30, yawDiff={rightYawDiff:F4})",
                moveRightDelta.X > 0.30f && Mathf.Abs(moveRightDelta.Z) < 0.03f && rightYawDiff < 0.02f);

            // 7d. A alone immediately turns left (-X when CameraYaw=0) and runs left; W+D moves diagonally (+X, -Z)
            sandbox.TeleportToLandmark(0);
            sandbox.CameraYaw = 0f;
            Vector3 moveLeftStart = sandbox.AvatarNode.Position;
            sandbox.StepWasdInput(w: false, s: false, a: true, d: false, dt: 0.25f);
            Vector3 moveLeftDelta = sandbox.AvatarNode.Position - moveLeftStart;
            float leftYawDiff = Mathf.Abs(Mathf.Wrap(sandbox.AvatarNode.Rotation.Y - (-Mathf.Pi * 0.5f), -Mathf.Pi, Mathf.Pi));
            Report($"A alone turns left (-Pi/2) and translates -X immediately (dx={moveLeftDelta.X:F3} < -0.30, yawDiff={leftYawDiff:F4})",
                moveLeftDelta.X < -0.30f && Mathf.Abs(moveLeftDelta.Z) < 0.03f && leftYawDiff < 0.02f);

            sandbox.TeleportToLandmark(0);
            Vector3 diagStart = sandbox.AvatarNode.Position;
            sandbox.StepWasdInput(w: true, s: false, a: false, d: true, dt: 0.25f);
            Vector3 diagDelta = sandbox.AvatarNode.Position - diagStart;
            float diagHeadingDiff = Mathf.Abs(Mathf.Wrap(Mathf.Atan2(diagDelta.X, diagDelta.Z) - sandbox.AvatarNode.Rotation.Y, -Mathf.Pi, Mathf.Pi));
            Report($"W + D moves 45-deg diagonally (+X, -Z) and faces diagonal vector (dx={diagDelta.X:F3} > 0.20, dz={diagDelta.Z:F3} < -0.20, headingDiff={diagHeadingDiff:F4})",
                diagDelta.X > 0.20f && diagDelta.Z < -0.20f && diagHeadingDiff < 0.02f);

            // 7e. S turns toward camera (+Z when CameraYaw=0) and runs forward toward camera (no backward moonwalk)
            sandbox.TeleportToLandmark(0);
            Vector3 backStart = sandbox.AvatarNode.Position;
            sandbox.StepWasdInput(w: false, s: true, a: false, d: false, dt: 0.25f);
            Vector3 backDelta = sandbox.AvatarNode.Position - backStart;
            float backYawDiff = Mathf.Abs(Mathf.Wrap(sandbox.AvatarNode.Rotation.Y - 0f, -Mathf.Pi, Mathf.Pi));
            Report($"S turns toward camera (yaw=0) and runs +Z at full speed (dz={backDelta.Z:F3} > 0.30, yawDiff={backYawDiff:F4} < 0.02)",
                backDelta.Z > 0.30f && Mathf.Abs(backDelta.X) < 0.03f && backYawDiff < 0.02f);

            // 7f. Footstep phase synchronization & multi-sample ElevenLabs SFX verification
            sandbox.TeleportToLandmark(0);
            sandbox.SetGaitRun(false); // Walk cycle
            sandbox.AvatarAnimation?.ResetFootstepPhase();
            int leftStrikes = 0;
            int rightStrikes = 0;
            for (int step = 0; step < 36; step++)
            {
                sandbox.StepMovement(new Vector3(0f, 0f, -1f), 0.035f);
                if (sandbox.AvatarAnimation != null && sandbox.AvatarAnimation.PollFootstepStrike(out bool rightFoot, out bool _))
                {
                    if (rightFoot) rightStrikes++;
                    else leftStrikes++;
                }
            }
            Report($"Walk cycle PollFootstepStrike fires both left and right foot strikes in sync with AnimationPlayer phase (left={leftStrikes}, right={rightStrikes})",
                leftStrikes >= 1 && rightStrikes >= 1);

            sandbox.TeleportToLandmark(0);
            sandbox.SetGaitRun(true); // 2.600s 3-stride run cycle (mx_f_run_jogging / run)
            sandbox.StepMovement(new Vector3(0f, 0f, -1f), 0.01f);
            sandbox.AvatarAnimation?.ResetFootstepPhase();
            int runLeftStrikes = 0;
            int runRightStrikes = 0;
            for (int step = 0; step < 104; step++)
            {
                Vector3 dir = step < 52 ? new Vector3(0f, 0f, -1f) : new Vector3(0f, 0f, 1f);
                sandbox.StepMovement(dir, 0.025f);
                if (sandbox.AvatarAnimation != null && sandbox.AvatarAnimation.PollFootstepStrike(out bool rightFoot, out bool _))
                {
                    if (rightFoot) runRightStrikes++;
                    else runLeftStrikes++;
                }
            }
            int runStrideCount = sandbox.AvatarAnimation?.CurrentStrideCount ?? 0;
            Report($"2.600s multi-stride Run cycle (strides={runStrideCount}==3) fires all 6 footsteps (left={runLeftStrikes}==3, right={runRightStrikes}==3, 1 SFX per step)",
                runStrideCount == 3 && runLeftStrikes == 3 && runRightStrikes == 3);

            var audioReg = Audio.AudioRegistry.Instance;
            if (audioReg != null)
            {
                var p1 = audioReg.PlayFootstep(sandbox.AvatarNode.Position, isRightFoot: false, isRunning: false);
                var p2 = audioReg.PlayFootstep(sandbox.AvatarNode.Position, isRightFoot: true, isRunning: true);
                Report("AudioRegistry.PlayFootstep resolves multi-sample ElevenLabs footstep streams with left/right pitch differentiation",
                    p1 != null && p2 != null && p1.Stream != null && p2.Stream != null &&
                    !Mathf.IsEqualApprox(p1.PitchScale, p2.PitchScale));
            }

            Report("PlaytestSandbox spawns 4 walkable material test pads (Stone, Dirt, Water, Glass)",
                sandbox.SurfacePads.Count == 4);

            bool allPadsResolveAndPlay = sandbox.SurfacePads.Count == 4;
            foreach (var pad in sandbox.SurfacePads)
            {
                Vector2 center = pad.WorldBounds.GetCenter();
                Vector3 probePos = new(center.X, 0f, center.Y);
                var resolved = sandbox.ResolveSurfaceAt(probePos);
                var played = audioReg?.PlayFootstep(probePos, isRightFoot: false, isRunning: false, surface: resolved);
                if (resolved != pad.Surface || played == null || played.Stream == null || !played.Playing)
                    allPadsResolveAndPlay = false;
            }
            // Also verify open meadow grass resolution outside roads/pads (in-bounds on maro-bell width=80)
            var grassProbe = new Vector3(12f, 0f, -15f);
            var grassSurface = sandbox.ResolveSurfaceAt(grassProbe);
            var grassPlayed = audioReg?.PlayFootstep(grassProbe, isRightFoot: true, isRunning: true, surface: grassSurface);
            Report($"All 4 sandbox surface pads (Stone, Dirt, Water, Glass) + open terrain ({grassSurface}==Grass) resolve and play material footsteps",
                allPadsResolveAndPlay && grassSurface == FootstepSurface.Grass &&
                grassPlayed != null && grassPlayed.Stream != null && grassPlayed.Playing);

            // Optional windowed screenshot capture of the Playtest Sandbox UI
            string renderDir = OS.GetEnvironment("ATLAS_RENDER_PLAYTEST_SANDBOX");
            if (!string.IsNullOrEmpty(renderDir) && DisplayServer.GetName() != "headless")
            {
                await RenderPlaytestScreenshots(sandbox, renderDir);
            }

            if (ownedSandbox && GodotObject.IsInstanceValid(sandbox))
            {
                sandbox.QueueFree();
                await NextFrames(1);
            }
        }

        private async Task RenderPlaytestScreenshots(PlaytestSandboxRoot sandbox, string outDir)
        {
            Directory.CreateDirectory(outDir);

            sandbox.TeleportToLandmark(0);
            sandbox.SetHairPresetIndex(1); // Linde Silver
            sandbox.SetWeaponIndex(2); // kk_sword_b
            sandbox.SetGaitRun(true);
            sandbox.StepMovement(new Vector3(0f, 0f, -1f), 0.35f);
            sandbox.TriggerSandboxAttack();
            sandbox.AvatarAnimation?.SeekUpperBody(sandbox.AvatarAnimation.UpperBodyAttackLength * 0.45);
            if (sandbox.MainCamera != null && sandbox.AvatarNode != null)
            {
                Vector3 focus = sandbox.AvatarNode.Position + new Vector3(0f, 0.65f, -0.5f);
                sandbox.MainCamera.Position = sandbox.AvatarNode.Position + new Vector3(1.15f, 1.05f, 1.85f);
                sandbox.MainCamera.LookAt(focus, Vector3.Up);
            }
            await SaveViewportPng(Path.Combine(outDir, "playtest-sandbox-combat.png"));

            sandbox.TeleportToLandmark(1);
            sandbox.SetHairPresetIndex(0); // Maro Chestnut
            sandbox.SetRelaxedStance(true);
            sandbox.SetIdlePresetIndex(0); // f_idle_weight_shift
            sandbox.StepMovement(Vector3.Zero, 0.60f);
            if (sandbox.MainCamera != null && sandbox.AvatarNode != null)
            {
                Vector3 focus = sandbox.AvatarNode.Position + new Vector3(0f, 0.52f, 0f);
                sandbox.MainCamera.Position = sandbox.AvatarNode.Position + new Vector3(0.14f, 0.64f, -1.45f);
                sandbox.MainCamera.LookAt(focus, Vector3.Up);
            }
            await SaveViewportPng(Path.Combine(outDir, "playtest-sandbox-customizer.png"));

            sandbox.SetIdlePresetIndex(1); // f_idle_dwarf_var2
            sandbox.StepMovement(Vector3.Zero, 0.75f);
            await SaveViewportPng(Path.Combine(outDir, "playtest-sandbox-dwarf-idle-var2.png"));
            sandbox.SetIdlePresetIndex(0);

            sandbox.ToggleFaceZoom();
            if (sandbox.MainCamera != null && sandbox.AvatarNode != null)
            {
                float headY = sandbox.GetLiveHeadFocusY();
                Vector3 focus = sandbox.AvatarNode.Position + new Vector3(0f, headY, 0f);
                sandbox.MainCamera.Position = sandbox.AvatarNode.Position + new Vector3(0.03f, headY + 0.01f, -0.46f);
                sandbox.MainCamera.LookAt(focus, Vector3.Up);
            }
            await SaveViewportPng(Path.Combine(outDir, "playtest-sandbox-face-zoom.png"));
        }

        private async Task SaveViewportPng(string path)
        {
            for (int i = 0; i < 4; i++)
                await ToSignal(RenderingServer.Singleton, RenderingServer.SignalName.FramePostDraw);
            Image? img = GetViewport()?.GetTexture()?.GetImage();
            bool ok = img != null && img.GetWidth() > 0 && img.SavePng(path) == Error.Ok;
            Report($"saved playtest screenshot {path}", ok);
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
    }
}

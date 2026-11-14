using System;
using System.IO;
using System.Threading.Tasks;
using Godot;

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
    /// 6. Cycles Character Rigs (CycleAvatarRig: npc:maro_folk_girl -> watch_sergeant -> player -> back).
    /// 7. Teleports across Maro Bell landmarks and toggles map (maro-bell <-> freja-south-gate).
    /// 8. With ATLAS_RENDER_PLAYTEST_SANDBOX=&lt;dir&gt; in a windowed run, captures high-res interactive HUD screenshots.
    /// </summary>
    public sealed partial class PlaytestSandboxVerify : Node
    {
        private const string Tag = "[PlaytestSandboxVerify]";
        private int _failures;

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

            // Verify Relaxed Idle is actively animating (not frozen) when standing still after walking
            Skeleton3D? skel = sandbox.AvatarSkeleton;
            int headIdx = skel?.FindBone("Head") ?? -1;
            int rHandIdx = skel?.FindBone("RightHand") ?? -1;
            sandbox.StepMovement(Vector3.Zero, 0.20f);
            Vector3 handIdleA = skel != null && rHandIdx >= 0 ? skel.GetBoneGlobalPose(rHandIdx).Origin : Vector3.Zero;
            Quaternion headIdleA = skel != null && headIdx >= 0 ? skel.GetBoneGlobalPose(headIdx).Basis.GetRotationQuaternion() : Quaternion.Identity;
            sandbox.StepMovement(Vector3.Zero, 0.85f);
            Vector3 handIdleB = skel != null && rHandIdx >= 0 ? skel.GetBoneGlobalPose(rHandIdx).Origin : Vector3.Zero;
            Quaternion headIdleB = skel != null && headIdx >= 0 ? skel.GetBoneGlobalPose(headIdx).Basis.GetRotationQuaternion() : Quaternion.Identity;
            float handIdleDriftCm = handIdleA.DistanceTo(handIdleB) * 100f;
            float headIdleAngleDeg = Mathf.RadToDeg(headIdleA.AngleTo(headIdleB));
            Report($"Relaxed Idle actively animates preset Idle_4 when stopped (hand moved {handIdleDriftCm:F2} cm > 0.20 cm, head turned {headIdleAngleDeg:F2} deg > 0.20 deg)",
                handIdleDriftCm > 0.20f && headIdleAngleDeg > 0.20f && sandbox.LastFootMinDeltaMeters >= -0.025f);

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

            // 5. Live Character Rig Switcher (Maro Girl -> Sergeant -> Player -> back to Maro Girl)
            string startRig = sandbox.ActiveAvatarKey;
            sandbox.CycleAvatarRig();
            string secondRig = sandbox.ActiveAvatarKey;
            Report($"CycleAvatarRig switches from {startRig} to {secondRig}", secondRig != startRig && sandbox.AvatarModelNode != null);
            while (sandbox.ActiveAvatarKey != startRig)
                sandbox.CycleAvatarRig();
            Report($"CycleAvatarRig returns to {startRig}", sandbox.ActiveAvatarKey == startRig);

            // 6. Landmark Teleporter & Map Switcher
            sandbox.TeleportToLandmark(1); // Arrival Gate
            Report("TeleportToLandmark(1) moves avatar to Arrival Gate (Z > 50)", sandbox.AvatarNode.Position.Z > 50f);
            sandbox.TeleportToLandmark(0); // Bell Terrace
            Report("TeleportToLandmark(0) returns avatar to Bell Terrace (Z < -10)", sandbox.AvatarNode.Position.Z < -10f);

            sandbox.ToggleMap();
            Report("ToggleMap switches to freja-south-gate", sandbox.ActiveMapId == "freja-south-gate");
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
            sandbox.SetGaitRun(false); // Walk cycle (0.967s)
            sandbox.AvatarAnimation?.ResetFootstepPhase();
            int leftStrikes = 0;
            int rightStrikes = 0;
            for (int step = 0; step < 32; step++)
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

            var audioReg = Audio.AudioRegistry.Instance;
            if (audioReg != null)
            {
                var p1 = audioReg.PlayFootstep(sandbox.AvatarNode.Position, isRightFoot: false, isRunning: false);
                var p2 = audioReg.PlayFootstep(sandbox.AvatarNode.Position, isRightFoot: true, isRunning: true);
                Report("AudioRegistry.PlayFootstep resolves multi-sample ElevenLabs footstep streams with left/right pitch differentiation",
                    p1 != null && p2 != null && p1.Stream != null && p2.Stream != null &&
                    !Mathf.IsEqualApprox(p1.PitchScale, p2.PitchScale));
            }

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

            // Shot 1: Running + Upper-body attack against Bell Plaza Dummy with Linde Silver hair + KayKit Sword B
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

            // Shot 2: Feminine Relaxed Standing + Upper-Body View (Unarmed, no weapon in hand)
            sandbox.TeleportToLandmark(1);
            sandbox.SetHairPresetIndex(0); // Maro Chestnut
            sandbox.SetRelaxedStance(true);
            sandbox.StepMovement(Vector3.Zero, 0.60f);
            if (sandbox.MainCamera != null && sandbox.AvatarNode != null)
            {
                // Avatar at Arrival Gate faces -Z (Yaw = Pi), so camera at -Z is directly in front of her!
                Vector3 focus = sandbox.AvatarNode.Position + new Vector3(0f, 0.56f, 0f);
                sandbox.MainCamera.Position = sandbox.AvatarNode.Position + new Vector3(0.14f, 0.68f, -1.25f);
                sandbox.MainCamera.LookAt(focus, Vector3.Up);
            }
            await SaveViewportPng(Path.Combine(outDir, "playtest-sandbox-customizer.png"));

            // Shot 3: Ultra-close Portrait Face Zoom (0.54m from her face)
            sandbox.ToggleFaceZoom();
            if (sandbox.MainCamera != null && sandbox.AvatarNode != null)
            {
                Vector3 focus = sandbox.AvatarNode.Position + new Vector3(0f, 0.64f, 0f);
                sandbox.MainCamera.Position = sandbox.AvatarNode.Position + new Vector3(0.05f, 0.66f, -0.54f);
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

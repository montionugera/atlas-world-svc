using System;
using Godot;
using Google.FlatBuffers;
using Atlas.Protocol;
using AtlasWorld.Client.Meta;
using AtlasWorld.Client.Net;
using AtlasWorld.Client.UI.Widgets;

namespace AtlasWorld.Client.World
{
    /// <summary>
    /// Headless verification probe for the Godot 4 + server-rs (Rust) Vertical Slice.
    /// Follows the repository probe contract:
    /// Runs when ATLAS_VERIFY_VERTICAL_SLICE=1 is set, returning 0 on PASS and 1 on FAIL.
    /// </summary>
    public static class VerifyVerticalSliceProbe
    {
        public static int Run(Node context)
        {
            GD.Print("[VerticalSliceProbe] BEGIN");
            int failures = 0;

            failures += VerifyFlatBuffersClientInput();
            failures += VerifyFlatBuffersSnapshot();
            failures += VerifyServerRsEntityManagerIngestion(context);
            failures += VerifyCelShadingAndOutlineMaterials();
            failures += VerifyChatBoxFocusAndSubmission(context);
            failures += VerifyMultiFloorWatchtowerAndCrystalCave(context);
            failures += VerifyMmorpgGrowthAndQuestBoardCatalogs();

            if (failures == 0)
            {
                GD.Print("[VerticalSliceProbe] RESULT: PASS (all 7 vertical slice cases)");
                return 0;
            }

            GD.PrintErr($"[VerticalSliceProbe] RESULT: FAIL ({failures} case(s) failed)");
            return 1;
        }

        private static int VerifyMmorpgGrowthAndQuestBoardCatalogs()
        {
            try
            {
                var growth = new MmorpgGrowthManager();
                growth.LoadCatalogs();

                if (growth.BaseLevel != 12 || growth.JobLevel != 15 || growth.CurrentJobDisplayName != "Swordman")
                {
                    GD.PrintErr($"[VerticalSliceProbe]   FAIL  Initial growth state mismatch: Base={growth.BaseLevel}, Job={growth.JobLevel}, Class={growth.CurrentJobDisplayName}");
                    return 1;
                }

                string nextJob = growth.CycleNextJobClass();
                if (string.IsNullOrEmpty(nextJob) || nextJob == "Swordman")
                {
                    GD.PrintErr($"[VerticalSliceProbe]   FAIL  CycleNextJobClass did not advance from Swordman: got '{nextJob}'");
                    return 1;
                }

                bool leveled = growth.GrantExp(15000, 12000, out string? levelMsg);
                if (!leveled || growth.BaseLevel <= 12 || growth.JobLevel <= 15 || string.IsNullOrEmpty(levelMsg))
                {
                    GD.PrintErr($"[VerticalSliceProbe]   FAIL  GrantExp did not level up Base/Job: Base={growth.BaseLevel}, Job={growth.JobLevel}");
                    return 1;
                }

                var initialQuest = growth.ActiveQuest;
                int goal = Math.Max(1, initialQuest.KillGoal);
                bool completed = false;
                for (int i = 0; i < goal; i++)
                {
                    if (growth.RecordMonsterKill(out _, out _))
                    {
                        completed = true;
                    }
                }

                if (!completed)
                {
                    GD.PrintErr("[VerticalSliceProbe]   FAIL  RecordMonsterKill did not complete active Quest Board entry");
                    return 1;
                }

                // Phase 3: Equipment Refine (+0 -> +4 safe zone), Monster Card Socketing, and Handbook Scenic Vista
                for (int r = 0; r < 4; r++)
                {
                    if (!growth.AttemptRefineWeapon(out _))
                    {
                        GD.PrintErr($"[VerticalSliceProbe]   FAIL  Safe-zone refine (+0..+4) failed at step {r}");
                        return 1;
                    }
                }

                if (growth.WeaponRefineLevel != 4)
                {
                    GD.PrintErr($"[VerticalSliceProbe]   FAIL  Expected WeaponRefineLevel=4 after 4 safe refines, got {growth.WeaponRefineLevel}");
                    return 1;
                }

                var socketedCard = growth.CycleNextSocketedCard(out string cardMsg);
                if (socketedCard == null || string.IsNullOrEmpty(cardMsg))
                {
                    GD.PrintErr("[VerticalSliceProbe]   FAIL  CycleNextSocketedCard did not socket a Monster Card");
                    return 1;
                }

                if (!growth.UnlockWatchtowerScenicVista(out string? vistaMsg) || string.IsNullOrEmpty(vistaMsg))
                {
                    GD.PrintErr("[VerticalSliceProbe]   FAIL  UnlockWatchtowerScenicVista did not unlock Watchtower 2F Scenic Vista");
                    return 1;
                }

                if (growth.TotalBonusPAtk < 28 || growth.TotalBonusMaxHp < 60)
                {
                    GD.PrintErr($"[VerticalSliceProbe]   FAIL  Combined Refine+Card+Handbook passives too low: P.ATK=+{growth.TotalBonusPAtk}, MaxHP=+{growth.TotalBonusMaxHp}");
                    return 1;
                }

                // Phase 4A: 10-Element Counter Matrix, Weapon-vs-Size Penalty & Job Class Skill Loadouts
                if (growth.GetElementCounterPct("Fire", "Earth") != 150 ||
                    growth.GetElementCounterPct("Holy", "Undead") != 150 ||
                    growth.GetWeaponSizePenaltyPct("dagger", "Large") != 50 ||
                    growth.GetWeaponSizePenaltyPct("scythe", "Large") != 100)
                {
                    GD.PrintErr("[VerticalSliceProbe]   FAIL  10-Element or Weapon-vs-Size matrix mismatch from elements.json");
                    return 1;
                }

                var mageSkills = MmorpgGrowthManager.GetJobSkillsForClass("mage");
                var (skillDmg, elemPct, sizePct, atkElem) = growth.CalculateSkillDamage(1, "Earth / Large", "Large", out _);
                if (mageSkills.Length != 3 || mageSkills[0].Id != "fire_bolt" || skillDmg <= 0)
                {
                    GD.PrintErr($"[VerticalSliceProbe]   FAIL  Job skill loadout or CalculateSkillDamage failed: dmg={skillDmg}, elemPct={elemPct}");
                    return 1;
                }

                GD.Print($"[VerticalSliceProbe]   PASS  MMORPG Growth, Refine +{growth.WeaponRefineLevel}, Card ('{socketedCard.Name}'), 10-Element/Size ({atkElem} {elemPct}% / Size {sizePct}%, Dmg={skillDmg})");
                return 0;
            }
            catch (Exception ex)
            {
                GD.PrintErr($"[VerticalSliceProbe]   FAIL  Exception in MMORPG Growth check: {ex.Message}");
                return 1;
            }
        }

        private static int VerifyFlatBuffersClientInput()
        {
            try
            {
                if (PacketCodec.Fnv1a32("dev-player") != 4026785618u)
                {
                    GD.PrintErr($"[VerticalSliceProbe]   FAIL  Fnv1a32('dev-player') mismatch: {PacketCodec.Fnv1a32("dev-player")}");
                    return 1;
                }

                string session = PacketCodec.ExtractSessionName("ws://192.168.1.170:2567/ws?token=dev-token:mont-ipad");
                if (session != "mont-ipad")
                {
                    GD.PrintErr($"[VerticalSliceProbe]   FAIL  ExtractSessionName mismatch: {session}");
                    return 1;
                }

                byte[] encoded = PacketCodec.EncodeClientInput(
                    moveX: 0.7071f,
                    moveY: -0.7071f,
                    attack: true,
                    skillSlot: 2,
                    targetId: 1042,
                    targetX: 520f,
                    targetY: 480f
                );

                if (encoded == null || encoded.Length == 0)
                {
                    GD.PrintErr("[VerticalSliceProbe]   FAIL  Encoded byte array is empty");
                    return 1;
                }

                var bb = new ByteBuffer(encoded);
                var input = ClientInput.GetRootAsClientInput(bb);

                if (Mathf.Abs(input.MoveX - 0.7071f) > 0.001f ||
                    Mathf.Abs(input.MoveY - (-0.7071f)) > 0.001f ||
                    !input.Attack ||
                    input.SkillSlot != 2 ||
                    input.TargetId != 1042 ||
                    Mathf.Abs(input.TargetX - 520f) > 0.01f ||
                    Mathf.Abs(input.TargetY - 480f) > 0.01f)
                {
                    GD.PrintErr($"[VerticalSliceProbe]   FAIL  Decoded values mismatch: MoveX={input.MoveX}, MoveY={input.MoveY}, Attack={input.Attack}, Skill={input.SkillSlot}");
                    return 1;
                }

                GD.Print($"[VerticalSliceProbe]   PASS  FlatBuffers ClientInput encoding + Fnv1a32 ({encoded.Length} bytes, AOT-safe)");
                return 0;
            }
            catch (Exception ex)
            {
                GD.PrintErr($"[VerticalSliceProbe]   FAIL  Exception in ClientInput: {ex.Message}");
                return 1;
            }
        }

        private static int VerifyFlatBuffersSnapshot()
        {
            try
            {
                var builder = new FlatBufferBuilder(256);

                var mobTypeOffset = builder.CreateString("mob-millpond-gnawer");
                EntityDelta.StartEntityDelta(builder);
                EntityDelta.AddId(builder, 501);
                EntityDelta.AddEntityType(builder, EntityType.Mob);
                EntityDelta.AddPos(builder, Vec2.CreateVec2(builder, 15.5f, 24.2f));
                EntityDelta.AddVel(builder, Vec2.CreateVec2(builder, 0.5f, 0.0f));
                EntityDelta.AddHealth(builder, 80f);
                EntityDelta.AddMaxHealth(builder, 100f);
                EntityDelta.AddStateFlags(builder, 1);
                EntityDelta.AddMobType(builder, mobTypeOffset);
                var entityOffset = EntityDelta.EndEntityDelta(builder);

                var entitiesVector = WorldSnapshot.CreateEntitiesVector(builder, new[] { entityOffset });
                var removedVector = WorldSnapshot.CreateRemovedIdsVector(builder, new uint[] { 99 });

                WorldSnapshot.StartWorldSnapshot(builder);
                WorldSnapshot.AddTick(builder, 1284);
                WorldSnapshot.AddServerTimeMs(builder, 1729000000);
                WorldSnapshot.AddEntities(builder, entitiesVector);
                WorldSnapshot.AddRemovedIds(builder, removedVector);
                var snapshotOffset = WorldSnapshot.EndWorldSnapshot(builder);
                builder.Finish(snapshotOffset.Value);

                byte[] rawPacket = builder.SizedByteArray();
                WorldSnapshot decoded = PacketCodec.DecodeSnapshot(rawPacket);

                if (decoded.Tick != 1284 || decoded.EntitiesLength != 1 || decoded.RemovedIds(0) != 99)
                {
                    GD.PrintErr("[VerticalSliceProbe]   FAIL  WorldSnapshot decode values mismatch");
                    return 1;
                }

                var entity = decoded.Entities(0)!.Value;
                if (entity.Id != 501 || entity.MobType != "mob-millpond-gnawer")
                {
                    GD.PrintErr($"[VerticalSliceProbe]   FAIL  EntityDelta decode mismatch: Id={entity.Id}, Mob={entity.MobType}");
                    return 1;
                }

                GD.Print($"[VerticalSliceProbe]   PASS  FlatBuffers WorldSnapshot decoding (Tick {decoded.Tick}, Mob: {entity.MobType})");
                return 0;
            }
            catch (Exception ex)
            {
                GD.PrintErr($"[VerticalSliceProbe]   FAIL  Exception in WorldSnapshot: {ex.Message}");
                return 1;
            }
        }

        private static int VerifyServerRsEntityManagerIngestion(Node context)
        {
            try
            {
                var mgr = new EntityManager
                {
                    Name = "ProbeEntityManager",
                    SuppressOwnPlayerView = true
                };
                context.AddChild(mgr);

                uint ownWireId = PacketCodec.Fnv1a32("mont-ipad");
                mgr.SetOwnPlayer(ownWireId.ToString());

                // Snapshot 1: OwnPlayer + Bot + Mob + Projectile
                var builder = new FlatBufferBuilder(512);
                var mobType = builder.CreateString("mob-veil-spearling");
                var projType = builder.CreateString("spear");

                EntityDelta.StartEntityDelta(builder);
                EntityDelta.AddId(builder, ownWireId);
                EntityDelta.AddEntityType(builder, EntityType.Player);
                EntityDelta.AddPos(builder, Vec2.CreateVec2(builder, 500f, 500f));
                EntityDelta.AddVel(builder, Vec2.CreateVec2(builder, 20f, 0f));
                EntityDelta.AddHealth(builder, 92f);
                EntityDelta.AddMaxHealth(builder, 100f);
                EntityDelta.AddStateFlags(builder, 1);
                var eOwn = EntityDelta.EndEntityDelta(builder);

                EntityDelta.StartEntityDelta(builder);
                EntityDelta.AddId(builder, 701);
                EntityDelta.AddEntityType(builder, EntityType.Player);
                EntityDelta.AddPos(builder, Vec2.CreateVec2(builder, 540f, 470f));
                EntityDelta.AddVel(builder, Vec2.CreateVec2(builder, 0f, -15f));
                EntityDelta.AddHealth(builder, 100f);
                EntityDelta.AddMaxHealth(builder, 100f);
                EntityDelta.AddStateFlags(builder, 3); // ALIVE | BOT
                var eBot = EntityDelta.EndEntityDelta(builder);

                EntityDelta.StartEntityDelta(builder);
                EntityDelta.AddId(builder, 801);
                EntityDelta.AddEntityType(builder, EntityType.Mob);
                EntityDelta.AddPos(builder, Vec2.CreateVec2(builder, 560f, 460f));
                EntityDelta.AddVel(builder, Vec2.CreateVec2(builder, -10f, 10f));
                EntityDelta.AddHealth(builder, 150f);
                EntityDelta.AddMaxHealth(builder, 200f);
                EntityDelta.AddStateFlags(builder, 1);
                EntityDelta.AddMobType(builder, mobType);
                var eMob = EntityDelta.EndEntityDelta(builder);

                EntityDelta.StartEntityDelta(builder);
                EntityDelta.AddId(builder, 901);
                EntityDelta.AddEntityType(builder, EntityType.Projectile);
                EntityDelta.AddPos(builder, Vec2.CreateVec2(builder, 550f, 465f));
                EntityDelta.AddVel(builder, Vec2.CreateVec2(builder, -80f, 20f));
                EntityDelta.AddStateFlags(builder, 1);
                EntityDelta.AddMobType(builder, projType);
                var eProj = EntityDelta.EndEntityDelta(builder);

                var entitiesVec = WorldSnapshot.CreateEntitiesVector(builder, new[] { eOwn, eBot, eMob, eProj });
                WorldSnapshot.StartWorldSnapshot(builder);
                WorldSnapshot.AddTick(builder, 10);
                WorldSnapshot.AddServerTimeMs(builder, 1000);
                WorldSnapshot.AddEntities(builder, entitiesVec);
                var snap1Off = WorldSnapshot.EndWorldSnapshot(builder);
                builder.Finish(snap1Off.Value);

                WorldSnapshot snap1 = PacketCodec.DecodeSnapshot(builder.SizedByteArray());
                mgr.IngestServerRsSnapshot(snap1, 0.1f, new Vector2(500f, 500f));
                mgr._Process(0.016);

                // OwnPlayer view is suppressed, so 3 views (Bot 701, Mob 801, Projectile 901) should exist,
                // while 4 interpolation buffers exist (including OwnPlayer).
                if (mgr.Count != 3 || mgr.InterpolatedBufferCount != 4 || Mathf.Abs(mgr.OwnPlayerHealth - 92f) > 0.01f)
                {
                    GD.PrintErr($"[VerticalSliceProbe]   FAIL  EntityManager count mismatch after snap1: views={mgr.Count}, buffers={mgr.InterpolatedBufferCount}, ownHp={mgr.OwnPlayerHealth}");
                    mgr.QueueFree();
                    return 1;
                }

                if (!mgr.TryGetEntityView("801", out EntityView? mobView) || mobView == null ||
                    Mathf.Abs(mobView.Root.Position.X - 6.0f) > 0.05f ||
                    Mathf.Abs(mobView.Root.Position.Z - (-4.0f)) > 0.05f)
                {
                    GD.PrintErr($"[VerticalSliceProbe]   FAIL  Mob 801 interpolated position mismatch: {mobView?.Root.Position}");
                    mgr.QueueFree();
                    return 1;
                }

                // Snapshot 2: Projectile 901 omitted (ephemeral expiry) and Mob 801 in RemovedIds
                var builder2 = new FlatBufferBuilder(256);
                EntityDelta.StartEntityDelta(builder2);
                EntityDelta.AddId(builder2, 701);
                EntityDelta.AddEntityType(builder2, EntityType.Player);
                EntityDelta.AddPos(builder2, Vec2.CreateVec2(builder2, 540f, 465f));
                EntityDelta.AddHealth(builder2, 100f);
                EntityDelta.AddMaxHealth(builder2, 100f);
                EntityDelta.AddStateFlags(builder2, 3);
                var eBot2 = EntityDelta.EndEntityDelta(builder2);

                var entitiesVec2 = WorldSnapshot.CreateEntitiesVector(builder2, new[] { eBot2 });
                var removedVec2 = WorldSnapshot.CreateRemovedIdsVector(builder2, new uint[] { 801 });
                WorldSnapshot.StartWorldSnapshot(builder2);
                WorldSnapshot.AddTick(builder2, 11);
                WorldSnapshot.AddServerTimeMs(builder2, 1050);
                WorldSnapshot.AddEntities(builder2, entitiesVec2);
                WorldSnapshot.AddRemovedIds(builder2, removedVec2);
                var snap2Off = WorldSnapshot.EndWorldSnapshot(builder2);
                builder2.Finish(snap2Off.Value);

                WorldSnapshot snap2 = PacketCodec.DecodeSnapshot(builder2.SizedByteArray());
                mgr.IngestServerRsSnapshot(snap2, 0.1f, new Vector2(500f, 500f));

                if (mgr.Count != 1 || mgr.TryGetEntityView("801", out _) || mgr.TryGetEntityView("901", out _))
                {
                    GD.PrintErr($"[VerticalSliceProbe]   FAIL  Despawn/projectile reconciliation failed: views={mgr.Count}");
                    mgr.QueueFree();
                    return 1;
                }

                mgr.QueueFree();
                GD.Print("[VerticalSliceProbe]   PASS  EntityManager + SnapshotInterpolator server-rs delta ingestion & despawn");
                return 0;
            }
            catch (Exception ex)
            {
                GD.PrintErr($"[VerticalSliceProbe]   FAIL  Exception in EntityManager ingestion check: {ex.Message}");
                return 1;
            }
        }

        private static int VerifyCelShadingAndOutlineMaterials()
        {
            try
            {
                var material = GD.Load<ShaderMaterial>("res://assets/shaders/cel_material.tres");
                if (material == null)
                {
                    GD.PrintErr("[VerticalSliceProbe]   FAIL  cel_material.tres missing");
                    return 1;
                }

                var nextPass = material.NextPass as ShaderMaterial;
                if (nextPass == null)
                {
                    GD.PrintErr("[VerticalSliceProbe]   FAIL  NextPass outline missing from cel_material.tres");
                    return 1;
                }

                Variant celThreshold = material.GetShaderParameter("cel_threshold");
                Variant outlineThickness = nextPass.GetShaderParameter("outline_thickness");

                if (celThreshold.VariantType == Variant.Type.Nil || outlineThickness.VariantType == Variant.Type.Nil)
                {
                    GD.PrintErr("[VerticalSliceProbe]   FAIL  Shader parameters missing");
                    return 1;
                }

                GD.Print($"[VerticalSliceProbe]   PASS  Anime Cel-Shading & Inverted-Hull Outlines (Threshold={celThreshold}, Outline={outlineThickness})");
                return 0;
            }
            catch (Exception ex)
            {
                GD.PrintErr($"[VerticalSliceProbe]   FAIL  Exception in Cel-Shading check: {ex.Message}");
                return 1;
            }
        }

        private static int VerifyChatBoxFocusAndSubmission(Node context)
        {
            try
            {
                var chatScene = GD.Load<PackedScene>("res://src/UI/Widgets/ChatBox.tscn");
                if (chatScene == null)
                {
                    GD.PrintErr("[VerticalSliceProbe]   FAIL  ChatBox.tscn missing");
                    return 1;
                }

                var chatInstance = chatScene.Instantiate<ChatBox>();
                context.AddChild(chatInstance);

                bool signalFired = false;
                string receivedText = "";
                chatInstance.MessageSent += (msg) =>
                {
                    signalFired = true;
                    receivedText = msg;
                };

                chatInstance.InputField.Text = "Atlas World Live Test";
                chatInstance.Submit();

                if (!signalFired || receivedText != "Atlas World Live Test" || chatInstance.InputField.Text != "")
                {
                    GD.PrintErr("[VerticalSliceProbe]   FAIL  ChatBox submission verification failed");
                    chatInstance.QueueFree();
                    return 1;
                }

                chatInstance.QueueFree();
                GD.Print("[VerticalSliceProbe]   PASS  ChatBox input submission and signal dispatch");
                return 0;
            }
            catch (Exception ex)
            {
                GD.PrintErr($"[VerticalSliceProbe]   FAIL  Exception in ChatBox check: {ex.Message}");
                return 1;
            }
        }

        private static int VerifyMultiFloorWatchtowerAndCrystalCave(Node context)
        {
            try
            {
                var doc = UnifiedMapDocument.LoadOrDefault("freja-south-gate");
                if (doc.Structures.Count < 2)
                {
                    GD.PrintErr($"[VerticalSliceProbe]   FAIL  Expected >=2 default 3D structures, got {doc.Structures.Count}");
                    return 1;
                }

                // 1. Locate default Watchtower (-9.5, -2.0) and Crystal Cave (10.5, -3.0)
                var tower = doc.Structures.Find(s => s.Kind == "watchtower");
                var cave = doc.Structures.Find(s => s.Kind == "crystal_cave");
                if (tower == null || cave == null)
                {
                    GD.PrintErr("[VerticalSliceProbe]   FAIL  Missing default watchtower or crystal_cave structure");
                    return 1;
                }

                float baseTowerY = TerrainElevation.SampleBaseTerrainHeight(tower.X, tower.Z, doc);
                float expectedDeckY = baseTowerY + tower.UpperFloorHeight;

                // 2. Ground-Floor Safety Check: An entity at ground level (Y=baseTowerY) walking into the center of the Watchtower
                // MUST stay on 1F (baseTowerY + 0.14m plinth) and NEVER teleport up to the 2nd floor (+3.2m)!
                float sampled1F = TerrainElevation.SampleHeight(tower.X, tower.Z, doc, currentEntityY: baseTowerY);
                if (Mathf.Abs(sampled1F - (baseTowerY + 0.14f)) > 0.15f)
                {
                    GD.PrintErr($"[VerticalSliceProbe]   FAIL  Watchtower 1F floor lock failed: expected {baseTowerY + 0.14f:0.00}, got {sampled1F:0.00}");
                    return 1;
                }

                // 3. Step-by-Step Continuous Stair Climb Check:
                // Walk an entity from East of the Watchtower (X = -2.2, Z = -2.0) Westward (-X) up the East Staircase
                // all the way onto the center of the 2nd-Floor Battlement Deck (X = -9.5, Z = -2.0).
                float walkX = -2.2f;
                float walkZ = tower.Z;
                float walkY = baseTowerY;
                for (int step = 0; step < 65; step++)
                {
                    float nextX = Mathf.MoveToward(walkX, tower.X, 0.12f);
                    Vector2 res = TerrainElevation.ResolveSteepSlopeMove(walkX, walkZ, nextX, walkZ, doc, out _, out _, walkY);
                    walkX = res.X;
                    walkZ = res.Y;
                    float targetY = TerrainElevation.SampleHeight(walkX, walkZ, doc, walkY);
                    walkY = Mathf.Lerp(walkY, targetY, 0.38f);
                }

                if (Mathf.Abs(walkX - tower.X) > 0.25f || Mathf.Abs(walkY - expectedDeckY) > 0.15f)
                {
                    GD.PrintErr($"[VerticalSliceProbe]   FAIL  Watchtower East Staircase climb to 2F failed: ended at X={walkX:0.2f} (expected {tower.X:0.2f}), Y={walkY:0.2f} (expected {expectedDeckY:0.2f})");
                    return 1;
                }

                // 4. Crystal Cave Walk-In & Wall Collider Check:
                float baseCaveY = TerrainElevation.SampleBaseTerrainHeight(cave.X, cave.Z, doc);
                float sampledCaveFloor = TerrainElevation.SampleHeight(cave.X, cave.Z, doc, currentEntityY: baseCaveY);
                if (Mathf.Abs(sampledCaveFloor - (baseCaveY - 0.15f)) > 0.15f)
                {
                    GD.PrintErr($"[VerticalSliceProbe]   FAIL  Crystal Cave recessed floor mismatch: expected {baseCaveY - 0.15f:0.00}, got {sampledCaveFloor:0.00}");
                    return 1;
                }

                // 5. SmartCameraOccluder Automatic Roof/Wall Cutaway & Near-Camera Tree Hide Check:
                var occluder = new SmartCameraOccluder();
                var testRoot = new Node3D();
                context.AddChild(testRoot);
                var streamer = new MapChunkStreamer(testRoot, doc, occluder);
                streamer.UpdateStreaming(new Vector3(tower.X, baseTowerY, tower.Z), forceReload: true);

                // 5a. Place player inside Watchtower 1F -> roof & upper pillars MUST auto-cutaway
                occluder.Update(
                    0.5f,
                    new Vector3(tower.X, baseTowerY + 8.0f, tower.Z + 8.0f),
                    new Vector3(tower.X, baseTowerY + 1.25f, tower.Z));

                if (occluder.CurrentlyFadedPropCount < 1)
                {
                    GD.PrintErr("[VerticalSliceProbe]   FAIL  SmartCameraOccluder did not auto-cutaway Watchtower roof when player is on 1F");
                    testRoot.QueueFree();
                    return 1;
                }

                // 5b. Place player on Watchtower 2F -> 2nd-floor deck MUST remain 100% solid opaque!
                occluder.Update(
                    0.5f,
                    new Vector3(tower.X, expectedDeckY + 8.0f, tower.Z + 8.0f),
                    new Vector3(tower.X, expectedDeckY + 1.25f, tower.Z));

                if (occluder.CurrentlyFadedPropCount != 0)
                {
                    GD.PrintErr($"[VerticalSliceProbe]   FAIL  Watchtower 2F deck faded while standing on 2F (faded={occluder.CurrentlyFadedPropCount})");
                    testRoot.QueueFree();
                    return 1;
                }

                // 5c. Place player inside Crystal Cave -> cave roof AND upper walls MUST auto-cutaway!
                occluder.Update(
                    0.5f,
                    new Vector3(cave.X - 3.5f, baseCaveY + 4.5f, cave.Z - 4.5f),
                    new Vector3(cave.X, sampledCaveFloor + 1.25f, cave.Z));

                if (occluder.CurrentlyFadedPropCount < 1)
                {
                    GD.PrintErr("[VerticalSliceProbe]   FAIL  SmartCameraOccluder did not cutaway Crystal Cave walls/roof when player is inside cave");
                    testRoot.QueueFree();
                    return 1;
                }

                // 5d. Place Camera3D directly inside a tree canopy (-16, y+2.5, -14) -> tree MUST fade & hide completely (zero black screen)
                float treeY = TerrainElevation.SampleBaseTerrainHeight(-16f, -14f, doc);
                occluder.Update(
                    1.0f,
                    new Vector3(-16.0f, treeY + 2.4f, -14.0f),
                    new Vector3(-12.0f, treeY + 1.25f, -10.0f));

                if (occluder.CurrentlyFadedPropCount < 1)
                {
                    GD.PrintErr("[VerticalSliceProbe]   FAIL  SmartCameraOccluder did not fade tree when camera is inside tree canopy");
                    testRoot.QueueFree();
                    return 1;
                }

                // 6. Steep Sheer Cliff Mesa Blocking Check (Player & Mob cannot walk up northwest_sheer_cliff_mesa):
                var cliffMesa = doc.HeightTerraces.Find(t => TerrainElevation.IsSheerCliffTerrace(t));
                if (cliffMesa != null)
                {
                    float cx = cliffMesa.X + cliffMesa.Radius + 1.2f;
                    float cz = cliffMesa.Z;
                    for (int step = 0; step < 30; step++)
                    {
                        Vector2 stepRes = TerrainElevation.ResolveSteepSlopeMove(cx, cz, cliffMesa.X, cliffMesa.Z, doc, out _, out _);
                        cx = stepRes.X;
                        cz = stepRes.Y;
                    }
                    float distFromMesaCenter = Mathf.Sqrt((cx - cliffMesa.X) * (cx - cliffMesa.X) + (cz - cliffMesa.Z) * (cz - cliffMesa.Z));
                    if (distFromMesaCenter < cliffMesa.Radius + 0.30f)
                    {
                        GD.PrintErr($"[VerticalSliceProbe]   FAIL  Player walked through sheer cliff mesa: dist={distFromMesaCenter:0.2f} < {cliffMesa.Radius + 0.30f:0.2f}");
                        testRoot.QueueFree();
                        return 1;
                    }

                    Vector2 mobClamped = TerrainElevation.ClampToWalkableTerrain(cliffMesa.X, cliffMesa.Z, doc);
                    float mobDist = mobClamped.DistanceTo(new Vector2(cliffMesa.X, cliffMesa.Z));
                    if (mobDist < cliffMesa.Radius + 0.40f)
                    {
                        GD.PrintErr($"[VerticalSliceProbe]   FAIL  Mob was not clamped out of sheer cliff mesa: dist={mobDist:0.2f}");
                        testRoot.QueueFree();
                        return 1;
                    }
                }

                testRoot.QueueFree();
                GD.Print($"[VerticalSliceProbe]   PASS  Multi-Floor 3D Watchtower Climb (1F={sampled1F:0.00}m -> East Stairs -> 2F={walkY:0.00}m), Crystal Cave Cutaway & Sheer Cliff Blocking");
                return 0;
            }
            catch (Exception ex)
            {
                GD.PrintErr($"[VerticalSliceProbe]   FAIL  Exception in Multi-Floor Tower/Cave check: {ex.Message}");
                return 1;
            }
        }
    }
}

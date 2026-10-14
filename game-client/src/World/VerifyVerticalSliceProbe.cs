using System;
using Godot;
using Google.FlatBuffers;
using Atlas.Protocol;
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

            if (failures == 0)
            {
                GD.Print("[VerticalSliceProbe] RESULT: PASS (all 5 vertical slice cases)");
                return 0;
            }

            GD.PrintErr($"[VerticalSliceProbe] RESULT: FAIL ({failures} case(s) failed)");
            return 1;
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
                    GD.PrintErr($"[VerticalSliceProbe]   FAIL  ChatBox submission verification failed");
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
    }
}

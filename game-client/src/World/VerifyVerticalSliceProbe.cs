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
            failures += VerifyCelShadingAndOutlineMaterials();
            failures += VerifyChatBoxFocusAndSubmission(context);

            if (failures == 0)
            {
                GD.Print("[VerticalSliceProbe] RESULT: PASS (all 4 vertical slice cases)");
                return 0;
            }

            GD.PrintErr($"[VerticalSliceProbe] RESULT: FAIL ({failures} case(s) failed)");
            return 1;
        }

        private static int VerifyFlatBuffersClientInput()
        {
            try
            {
                byte[] encoded = PacketCodec.EncodeClientInput(
                    moveX: 0.7071f,
                    moveY: -0.7071f,
                    attack: true,
                    skillSlot: 2,
                    targetId: 1042
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
                    input.TargetId != 1042)
                {
                    GD.PrintErr($"[VerticalSliceProbe]   FAIL  Decoded values mismatch: MoveX={input.MoveX}, MoveY={input.MoveY}, Attack={input.Attack}, Skill={input.SkillSlot}");
                    return 1;
                }

                GD.Print($"[VerticalSliceProbe]   PASS  FlatBuffers ClientInput encoding ({encoded.Length} bytes, AOT-safe)");
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

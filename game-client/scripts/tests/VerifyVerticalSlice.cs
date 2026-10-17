using System;
using Godot;
using Google.FlatBuffers;
using Atlas.Protocol;
using AtlasWorld.Client.Net;
using AtlasWorld.Client.UI.Widgets;

namespace AtlasWorld.Client.Tests
{
    /// <summary>
    /// Programmatic verification harness for the Godot 4 + server-rs Vertical Slice.
    /// Runs headlessly: godot --headless --script res://scripts/tests/VerifyVerticalSlice.cs
    /// </summary>
    public partial class VerifyVerticalSlice : SceneTree
    {
        public override void _Initialize()
        {
            GD.Print("==================================================");
            GD.Print("RUNNING VERTICAL SLICE POC VERIFICATION");
            GD.Print("==================================================");

            bool allPassed = true;

            allPassed &= TestFlatBuffersInputEncoding();
            allPassed &= TestFlatBuffersSnapshotDecoding();
            allPassed &= TestCelShadingAndOutlineMaterials();
            allPassed &= TestChatBoxFocusAndSubmission();

            GD.Print("==================================================");
            if (allPassed)
            {
                GD.Print(">>> ALL VERTICAL SLICE POC VERIFICATIONS PASSED <<<");
                Quit(0);
            }
            else
            {
                GD.PrintErr(">>> VERIFICATION FAILED <<<");
                Quit(1);
            }
        }

        private bool TestFlatBuffersInputEncoding()
        {
            GD.Print("[Test 1] Testing FlatBuffers ClientInput encoding...");
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
                    GD.PrintErr("FAILED: Encoded byte array is empty");
                    return false;
                }

                // Decode and verify field integrity
                var bb = new ByteBuffer(encoded);
                var input = ClientInput.GetRootAsClientInput(bb);

                if (Mathf.Abs(input.MoveX - 0.7071f) > 0.001f ||
                    Mathf.Abs(input.MoveY - (-0.7071f)) > 0.001f ||
                    !input.Attack ||
                    input.SkillSlot != 2 ||
                    input.TargetId != 1042)
                {
                    GD.PrintErr($"FAILED: Decoded values mismatch. MoveX: {input.MoveX}, MoveY: {input.MoveY}, Attack: {input.Attack}, Skill: {input.SkillSlot}, Target: {input.TargetId}");
                    return false;
                }

                GD.Print($"PASS: Encoded & decoded ClientInput ({encoded.Length} bytes, Zero-Copy AOT-safe)");
                return true;
            }
            catch (Exception ex)
            {
                GD.PrintErr($"FAILED: Exception during ClientInput test: {ex}");
                return false;
            }
        }

        private bool TestFlatBuffersSnapshotDecoding()
        {
            GD.Print("[Test 2] Testing FlatBuffers WorldSnapshot parsing...");
            try
            {
                // Construct a mock snapshot buffer using Google.FlatBuffers builder
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

                // Decode via PacketCodec
                WorldSnapshot decoded = PacketCodec.DecodeSnapshot(rawPacket);

                if (decoded.Tick != 1284 ||
                    decoded.ServerTimeMs != 1729000000 ||
                    decoded.EntitiesLength != 1 ||
                    decoded.RemovedIdsLength != 1 ||
                    decoded.RemovedIds(0) != 99)
                {
                    GD.PrintErr("FAILED: WorldSnapshot fields mismatched");
                    return false;
                }

                var entity = decoded.Entities(0)!.Value;
                if (entity.Id != 501 || entity.EntityType != EntityType.Mob || entity.MobType != "mob-millpond-gnawer")
                {
                    GD.PrintErr($"FAILED: EntityDelta fields mismatched. Id: {entity.Id}, Type: {entity.EntityType}, MobType: {entity.MobType}");
                    return false;
                }

                GD.Print($"PASS: Successfully decoded WorldSnapshot with 1 entity (Tick: {decoded.Tick}, Mob: {entity.MobType})");
                return true;
            }
            catch (Exception ex)
            {
                GD.PrintErr($"FAILED: Exception during WorldSnapshot test: {ex}");
                return false;
            }
        }

        private bool TestCelShadingAndOutlineMaterials()
        {
            GD.Print("[Test 3] Testing Genshin-style Cel-Shader & Outline Material...");
            try
            {
                var material = GD.Load<ShaderMaterial>("res://assets/shaders/cel_material.tres");
                if (material == null)
                {
                    GD.PrintErr("FAILED: cel_material.tres could not be loaded");
                    return false;
                }

                var nextPass = material.NextPass as ShaderMaterial;
                if (nextPass == null)
                {
                    GD.PrintErr("FAILED: NextPass outline material is missing from cel_material.tres");
                    return false;
                }

                Variant celThreshold = material.GetShaderParameter("cel_threshold");
                if (celThreshold.VariantType == Variant.Type.Nil)
                {
                    GD.PrintErr("FAILED: cel_threshold shader parameter is missing");
                    return false;
                }

                Variant outlineThickness = nextPass.GetShaderParameter("outline_thickness");
                if (outlineThickness.VariantType == Variant.Type.Nil)
                {
                    GD.PrintErr("FAILED: outline_thickness parameter missing on next_pass");
                    return false;
                }

                GD.Print($"PASS: CelMaterial verified (Threshold: {celThreshold}, Outline Thickness: {outlineThickness})");
                return true;
            }
            catch (Exception ex)
            {
                GD.PrintErr($"FAILED: Exception checking materials: {ex}");
                return false;
            }
        }

        private bool TestChatBoxFocusAndSubmission()
        {
            GD.Print("[Test 4] Testing ChatBox UI focus and submission...");
            try
            {
                var chatScene = GD.Load<PackedScene>("res://src/UI/Widgets/ChatBox.tscn");
                if (chatScene == null)
                {
                    GD.PrintErr("FAILED: ChatBox.tscn could not be loaded");
                    return false;
                }

                var chatInstance = chatScene.Instantiate<ChatBox>();
                if (chatInstance == null)
                {
                    GD.PrintErr("FAILED: ChatBox instance could not be created");
                    return false;
                }

                Root.AddChild(chatInstance);

                bool signalFired = false;
                string receivedText = "";
                chatInstance.MessageSent += (msg) =>
                {
                    signalFired = true;
                    receivedText = msg;
                };

                chatInstance.InputField.Text = "Hello from Godot POC!";
                chatInstance.Submit();

                if (!signalFired || receivedText != "Hello from Godot POC!")
                {
                    GD.PrintErr($"FAILED: MessageSent signal did not deliver expected payload: '{receivedText}'");
                    chatInstance.QueueFree();
                    return false;
                }

                if (chatInstance.InputField.Text != "")
                {
                    GD.PrintErr("FAILED: InputField was not cleared after Submit()");
                    chatInstance.QueueFree();
                    return false;
                }

                chatInstance.QueueFree();
                GD.Print("PASS: ChatBox signal emission, text clearing, and submission verified");
                return true;
            }
            catch (Exception ex)
            {
                GD.PrintErr($"FAILED: Exception testing ChatBox: {ex}");
                return false;
            }
        }
    }
}

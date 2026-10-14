using System;
using Google.FlatBuffers;
using Atlas.Protocol;

namespace AtlasWorld.Client.Net
{
    /// <summary>
    /// Encodes and decodes binary FlatBuffers packets for the server-rs protocol.
    /// Zero reflection, zero dynamic emit — 100% NativeAOT safe.
    /// </summary>
    public static class PacketCodec
    {
        private static uint _clientTick = 0;

        /// <summary>
        /// Encodes player input into a binary ClientInput FlatBuffers payload.
        /// </summary>
        public static byte[] EncodeClientInput(
            float moveX,
            float moveY,
            bool attack = false,
            byte skillSlot = 0,
            uint targetId = 0,
            float targetX = 0f,
            float targetY = 0f,
            bool respawn = false)
        {
            var builder = new FlatBufferBuilder(128);

            ClientInput.StartClientInput(builder);
            ClientInput.AddClientTick(builder, ++_clientTick);
            ClientInput.AddMoveX(builder, moveX);
            ClientInput.AddMoveY(builder, moveY);
            ClientInput.AddAttack(builder, attack);
            ClientInput.AddSkillSlot(builder, skillSlot);
            ClientInput.AddTargetId(builder, targetId);
            ClientInput.AddTargetX(builder, targetX);
            ClientInput.AddTargetY(builder, targetY);
            ClientInput.AddRespawn(builder, respawn);

            var offset = ClientInput.EndClientInput(builder);
            builder.Finish(offset.Value);

            return builder.SizedByteArray();
        }

        /// <summary>
        /// Decodes binary bytes received from server-rs into a WorldSnapshot view.
        /// Zero copy: reads directly from the byte buffer.
        /// </summary>
        public static WorldSnapshot DecodeSnapshot(byte[] rawBytes)
        {
            var byteBuffer = new ByteBuffer(rawBytes);
            return WorldSnapshot.GetRootAsWorldSnapshot(byteBuffer);
        }
    }
}

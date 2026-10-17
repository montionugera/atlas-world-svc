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
        /// Computes the 32-bit FNV-1a hash of a string, matching server-rs's <c>fnv1a_32</c>
        /// and the React client's <c>fnv1a32</c>.
        /// </summary>
        public static uint Fnv1a32(string s)
        {
            if (string.IsNullOrEmpty(s))
                return 0u;

            uint hash = 2166136261u;
            for (int i = 0; i < s.Length; i++)
            {
                hash ^= (byte)s[i];
                hash *= 16777619u;
            }
            return hash;
        }

        /// <summary>
        /// Extracts the effective session/user id from a server-rs WebSocket URL
        /// (e.g. <c>?token=dev-token:mont-ipad</c> → <c>mont-ipad</c>), matching
        /// <c>AuthGuard::validate_token</c> in <c>server-rs/src/auth/jwt.rs</c>.
        /// </summary>
        public static string ExtractSessionName(string url)
        {
            if (string.IsNullOrEmpty(url))
                return "dev-player";

            int qIdx = url.IndexOf('?');
            if (qIdx >= 0 && qIdx + 1 < url.Length)
            {
                string query = url.Substring(qIdx + 1);
                foreach (string pair in query.Split('&'))
                {
                    int eqIdx = pair.IndexOf('=');
                    if (eqIdx > 0 && pair.Substring(0, eqIdx) == "token")
                    {
                        string token = Uri.UnescapeDataString(pair.Substring(eqIdx + 1)).Trim();
                        if (token.StartsWith("dev-token:", StringComparison.Ordinal))
                        {
                            string suffix = token.Substring("dev-token:".Length).Trim();
                            return string.IsNullOrEmpty(suffix) ? "dev-player" : suffix;
                        }
                        if (token == "dev-token" || string.IsNullOrEmpty(token))
                            return "dev-player";
                        return token;
                    }
                }
            }
            return "dev-player";
        }

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

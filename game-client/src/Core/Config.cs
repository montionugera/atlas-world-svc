using Godot;

namespace AtlasWorld.Client.Core
{
    /// <summary>
    /// Runtime endpoints for the client. Read from environment first (so the same
    /// build points at local / staging / prod without a rebuild), falling back to
    /// local-dev defaults. No hardcoded <c>ws://</c> lives anywhere else in the client.
    /// </summary>
    public sealed class Config
    {
        /// <summary>Colyseus WebSocket endpoint. Default targets the local 0.17 server.</summary>
        public string ColyseusEndpoint { get; private init; } = "ws://127.0.0.1:2568";

        /// <summary>Colyseus room name to join.</summary>
        public string RoomName { get; private init; } = "game_room";

        /// <summary>Initial mapId sent in the join options (the map picker can switch later).</summary>
        public string MapId { get; private init; } = "map-for-play";

        /// <summary>Nakama scheme/host/port/serverKey for the meta seam.</summary>
        public string NakamaScheme { get; private init; } = "http";
        public string NakamaHost { get; private init; } = "127.0.0.1";
        public int NakamaPort { get; private init; } = 7350;
        public string NakamaServerKey { get; private init; } = "defaultkey";

        /// <summary>
        /// Optional Nakama session token threaded into the Colyseus join options
        /// (server-side <c>onAuth</c> reads it). Empty = bare join (the no-auth dev path).
        /// </summary>
        public string AuthToken { get; private init; } = "";

        public static Config Load()
        {
            string Env(string key, string fallback)
            {
                string v = OS.GetEnvironment(key);
                return string.IsNullOrEmpty(v) ? fallback : v;
            }

            int EnvInt(string key, int fallback) =>
                int.TryParse(OS.GetEnvironment(key), out int v) ? v : fallback;

            return new Config
            {
                ColyseusEndpoint = Env("ATLAS_COLYSEUS_ENDPOINT", "ws://127.0.0.1:2568"),
                RoomName = Env("ATLAS_ROOM_NAME", "game_room"),
                MapId = Env("ATLAS_MAP_ID", "map-for-play"),
                NakamaScheme = Env("ATLAS_NAKAMA_SCHEME", "http"),
                NakamaHost = Env("ATLAS_NAKAMA_HOST", "127.0.0.1"),
                NakamaPort = EnvInt("ATLAS_NAKAMA_PORT", 7350),
                NakamaServerKey = Env("ATLAS_NAKAMA_KEY", "defaultkey"),
                AuthToken = Env("ATLAS_AUTH_TOKEN", ""),
            };
        }
    }
}

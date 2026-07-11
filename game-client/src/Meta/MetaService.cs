using System;
using System.Linq;
using System.Threading.Tasks;
using Godot;
using Nakama;
using AtlasWorld.Client.Core;

namespace AtlasWorld.Client.Meta
{
    /// <summary>
    /// Nakama meta seam: device-auth, storage read (ReadDoc), storage write, and a
    /// generic CallRpc entry point. This is the Phase-B SEED — the full 4-panel meta UI
    /// is Phase B2; here we render a minimal HUD label.
    ///
    /// SPLIT THREADING RULE: Nakama continuations resume OFF the main thread (ThreadPool;
    /// Godot's SynchronizationContext isn't installed for Nakama's awaiter), so EVERY UI
    /// mutation goes through <c>CallDeferred</c>. This is the exact opposite of the
    /// Colyseus side (main-thread pump, no CallDeferred) — the two must never be mixed.
    /// </summary>
    public sealed partial class MetaService : Node
    {
        private const string InventoryCollection = "inventory";
        private const string ProfileCollection = "profile";
        private const string ClientMetaCollection = "client_meta"; // client-owned (write path)
        private const string DeviceIdPath = "user://device_id";

        private readonly Config _config;
        private Label _label = null!;
        private Nakama.Client? _client;
        private ISession? _session;

        public MetaService(Config config)
        {
            _config = config;
        }

        public override void _Ready()
        {
            var canvas = new CanvasLayer();
            AddChild(canvas);
            _label = new Label
            {
                Position = new Vector2(12, 12),
                Text = "meta: connecting to Nakama…",
            };
            canvas.AddChild(_label);

            _ = RunAsync(); // never async void
        }

        private async Task RunAsync()
        {
            try
            {
                _client = new Nakama.Client(_config.NakamaScheme, _config.NakamaHost,
                    _config.NakamaPort, _config.NakamaServerKey) { Timeout = 10 };

                string deviceId = LoadOrCreateDeviceId();
                _session = await _client.AuthenticateDeviceAsync(deviceId, username: null, create: true);
                GD.Print($"[Nakama] auth ok userId={_session.UserId}");

                string invText = await ReadDoc(InventoryCollection, "main");
                string profText = await ReadDoc(ProfileCollection, "main");
                GD.Print($"[Nakama] inventory={invText}");
                GD.Print($"[Nakama] profile={profText}");

                // One client-owned write to exercise the write path (no server RPC needed;
                // a user may write its own storage). Proves read AND write for Gate B.
                bool wrote = await WriteClientDoc("last_login",
                    $"{{\"ts\":{DateTimeOffset.UtcNow.ToUnixTimeSeconds()}}}");
                GD.Print($"[Nakama] write client_meta/last_login ok={wrote}");

                string display =
                    $"Nakama ✔ user {_session.UserId[..8]}…\n" +
                    $"inventory: {invText}\nprofile: {profText}\n" +
                    $"write: {(wrote ? "ok" : "failed")}";
                CallDeferred(nameof(SetLabel), display);
            }
            catch (Exception e)
            {
                GD.PushError($"[Nakama] failed: {e.Message}");
                CallDeferred(nameof(SetLabel), $"Nakama ✘ {e.Message}");
            }
        }

        /// <summary>Read one of the caller's own storage docs; absence → a default marker.</summary>
        public async Task<string> ReadDoc(string collection, string key)
        {
            if (_client == null || _session == null)
                return "(no session)";
            var ids = new[]
            {
                new StorageObjectId { Collection = collection, Key = key, UserId = _session.UserId },
            };
            IApiStorageObjects result = await _client.ReadStorageObjectsAsync(_session, ids);
            IApiStorageObject? obj = result.Objects.FirstOrDefault();
            return obj?.Value ?? "(not created yet)";
        }

        private async Task<bool> WriteClientDoc(string key, string json)
        {
            if (_client == null || _session == null)
                return false;
            var write = new WriteStorageObject
            {
                Collection = ClientMetaCollection,
                Key = key,
                Value = json,
                PermissionRead = 1,  // owner read
                PermissionWrite = 1, // owner write
            };
            IApiStorageObjectAcks acks = await _client.WriteStorageObjectsAsync(_session, new[] { write });
            return acks.Acks.Any();
        }

        /// <summary>Generic Nakama RPC entry point (used by Phase B2 meta flows).</summary>
        public async Task<string?> CallRpc(string rpcId, string payloadJson)
        {
            if (_client == null || _session == null)
                return null;
            IApiRpc rpc = await _client.RpcAsync(_session, rpcId, payloadJson);
            return rpc.Payload;
        }

        private static string LoadOrCreateDeviceId()
        {
            if (FileAccess.FileExists(DeviceIdPath))
            {
                using FileAccess f = FileAccess.Open(DeviceIdPath, FileAccess.ModeFlags.Read);
                return f.GetAsText().Trim();
            }
            string deviceId = Guid.NewGuid().ToString();
            using FileAccess w = FileAccess.Open(DeviceIdPath, FileAccess.ModeFlags.Write);
            w.StoreString(deviceId);
            return deviceId;
        }

        private void SetLabel(string text) => _label.Text = text;
    }
}

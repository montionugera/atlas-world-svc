using System;
using System.Linq;
using System.Threading.Tasks;
using Godot;
using Nakama;
using AtlasWorld.Client.Core;

namespace AtlasWorld.Client.Meta
{
    /// <summary>
    /// AUTOLOAD singleton. Owns EVERY Nakama await — device-auth, ReadStorageObjects,
    /// RpcAsync, and the realtime socket — and re-emits results as Godot signals via
    /// <c>CallDeferred</c>. Panels never await Nakama; they call the plain
    /// <see cref="RequestDoc"/> / <see cref="Rpc"/> kickers and listen for
    /// <see cref="DocLoadedEventHandler"/> / <see cref="RpcResultEventHandler"/>.
    ///
    /// THREADING: Nakama continuations resume OFF the main thread, so any node mutation
    /// must cross back via CallDeferred → a private Emit* wrapper. This is the SAME rule
    /// as the Phase-B MetaService seam and the deliberate opposite of the Colyseus
    /// main-thread pump; the two are never mixed.
    /// </summary>
    public sealed partial class MetaGateway : Node
    {
        // ---- Signals (panels are pure listeners) ---------------------------------------
        [Signal] public delegate void AuthReadyEventHandler(string userId);
        [Signal] public delegate void AuthFailedEventHandler(string message);
        /// <summary>ok=false means read failed OR the doc doesn't exist yet (json = "").</summary>
        [Signal] public delegate void DocLoadedEventHandler(string collection, string json, bool ok);
        [Signal] public delegate void RpcResultEventHandler(string rpcId, string payload, bool ok, string error);
        [Signal] public delegate void NotificationReceivedEventHandler(int code, string content);

        public static MetaGateway? Instance { get; private set; }

        /// <summary>
        /// True while the meta UI should swallow gameplay input (shell open OR a LineEdit
        /// focused). The input layer (PlayerController) can read this WITHOUT any coupling
        /// to the UI assembly — it is a plain static flag, set by the shell / focused fields.
        /// </summary>
        public static bool CapturesInput { get; set; }

        private const string DeviceIdPath = "user://device_id";

        private Config _config = null!;
        private Nakama.Client? _client;
        private ISession? _session;
        private ISocket? _socket;

        public string? UserId => _session?.UserId;
        public bool Ready => _client != null && _session != null;

        public override void _EnterTree()
        {
            Instance = this;
        }

        public override void _Ready()
        {
            _config = Config.Load();
            _ = AuthenticateAsync(); // never async void
        }

        public override void _ExitTree()
        {
            if (Instance == this) Instance = null;
            try { _socket?.CloseAsync(); } catch { /* shutting down */ }
        }

        // ---- Auth ----------------------------------------------------------------------
        private async Task AuthenticateAsync()
        {
            try
            {
                _client = new Nakama.Client(_config.NakamaScheme, _config.NakamaHost,
                    _config.NakamaPort, _config.NakamaServerKey) { Timeout = 10 };

                string deviceId = LoadOrCreateDeviceId();
                _session = await _client.AuthenticateDeviceAsync(deviceId, username: null, create: true);
                GD.Print($"[MetaGateway] auth ok userId={_session.UserId}");

                await TryOpenSocket();

                CallDeferred(nameof(EmitAuthReady), _session.UserId);
            }
            catch (Exception e)
            {
                GD.PushError($"[MetaGateway] auth failed: {e.Message}");
                CallDeferred(nameof(EmitAuthFailed), e.Message);
            }
        }

        /// <summary>Best-effort realtime socket for quest notifications. Never fatal.</summary>
        private async Task TryOpenSocket()
        {
            if (_client == null || _session == null) return;
            try
            {
                _socket = Socket.From(_client);
                _socket.ReceivedNotification += n =>
                    CallDeferred(nameof(EmitNotification), n.Code, n.Content ?? "");
                await _socket.ConnectAsync(_session, appearOnline: true);
                GD.Print("[MetaGateway] realtime socket connected");
            }
            catch (Exception e)
            {
                GD.Print($"[MetaGateway] socket unavailable (non-fatal): {e.Message}");
            }
        }

        // ---- Storage read --------------------------------------------------------------
        /// <summary>Kick a doc read; result arrives on the <see cref="DocLoaded"/> signal.</summary>
        public void RequestDoc(string collection) => _ = RequestDocAsync(collection);

        private async Task RequestDocAsync(string collection)
        {
            if (_client == null || _session == null)
            {
                CallDeferred(nameof(EmitDocLoaded), collection, "", false);
                return;
            }
            try
            {
                var ids = new[]
                {
                    new StorageObjectId
                    {
                        Collection = collection,
                        Key = MetaWireKeys.StorageKey,
                        UserId = _session.UserId,
                    },
                };
                IApiStorageObjects result = await _client.ReadStorageObjectsAsync(_session, ids);
                IApiStorageObject? obj = result.Objects.FirstOrDefault();
                if (obj == null)
                {
                    // Doc not created yet — a valid state; panels fall back to defaults.
                    CallDeferred(nameof(EmitDocLoaded), collection, "", false);
                    return;
                }
                CallDeferred(nameof(EmitDocLoaded), collection, obj.Value, true);
            }
            catch (Exception e)
            {
                GD.PushError($"[MetaGateway] read {collection} failed: {e.Message}");
                CallDeferred(nameof(EmitDocLoaded), collection, "", false);
            }
        }

        // ---- RPC -----------------------------------------------------------------------
        /// <summary>Kick an RPC; result arrives on the <see cref="RpcResult"/> signal.</summary>
        public void Rpc(string rpcId, string payloadJson) => _ = RpcAsync(rpcId, payloadJson);

        private async Task RpcAsync(string rpcId, string payloadJson)
        {
            if (_client == null || _session == null)
            {
                CallDeferred(nameof(EmitRpcResult), rpcId, "", false, "no session");
                return;
            }
            try
            {
                IApiRpc rpc = await _client.RpcAsync(_session, rpcId, payloadJson);
                CallDeferred(nameof(EmitRpcResult), rpcId, rpc.Payload ?? "", true, "");
            }
            catch (Exception e)
            {
                GD.PushError($"[MetaGateway] rpc {rpcId} failed: {e.Message}");
                CallDeferred(nameof(EmitRpcResult), rpcId, "", false, e.Message);
            }
        }

        // ---- Deferred emit wrappers (always run on the main thread) ---------------------
        private void EmitAuthReady(string userId) => EmitSignal(SignalName.AuthReady, userId);
        private void EmitAuthFailed(string message) => EmitSignal(SignalName.AuthFailed, message);
        private void EmitDocLoaded(string collection, string json, bool ok) =>
            EmitSignal(SignalName.DocLoaded, collection, json, ok);
        private void EmitRpcResult(string rpcId, string payload, bool ok, string error) =>
            EmitSignal(SignalName.RpcResult, rpcId, payload, ok, error);
        private void EmitNotification(int code, string content) =>
            EmitSignal(SignalName.NotificationReceived, code, content);

        // ---- Device id -----------------------------------------------------------------
        private static string LoadOrCreateDeviceId()
        {
            // Env override lets a demo/test pin a known device id (whose docs were seeded S2S).
            string envId = OS.GetEnvironment("ATLAS_DEVICE_ID");
            if (!string.IsNullOrEmpty(envId)) return envId;

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
    }

    /// <summary>Wire-level storage key, kept next to the gateway that uses it.</summary>
    internal static class MetaWireKeys
    {
        public const string StorageKey = "main";
    }
}

using System;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using Godot;
using AtlasWorld.Client.Core;
using HttpClient = System.Net.Http.HttpClient;

namespace AtlasWorld.Client.Meta
{
    /// <summary>
    /// AUTOLOAD singleton. Owns HTTP communication with the Rust meta server
    /// (/v2/* endpoints in server-rs) — device-auth, storage reads, and RPCs —
    /// and re-emits results as Godot signals via <c>CallDeferred</c>. Panels never
    /// make network calls directly; they call the plain <see cref="RequestDoc"/> /
    /// <see cref="Rpc"/> kickers and listen for <see cref="DocLoadedEventHandler"/> /
    /// <see cref="RpcResultEventHandler"/>.
    ///
    /// THREADING: HTTP continuations resume OFF the main thread, so any node mutation
    /// must cross back via CallDeferred → a private Emit* wrapper.
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
        private readonly HttpClient _httpClient = new() { Timeout = TimeSpan.FromSeconds(10) };
        private string _baseUrl = "";
        private string? _authToken;
        private string? _userId;

        public string? UserId => _userId;
        public new bool Ready => !string.IsNullOrEmpty(_authToken) && !string.IsNullOrEmpty(_userId);

        public override void _EnterTree()
        {
            Instance = this;
        }

        public override void _Ready()
        {
            _config = Config.Load();
            _baseUrl = $"{_config.NakamaScheme}://{_config.NakamaHost}:{_config.NakamaPort}".TrimEnd('/');
            _ = AuthenticateAsync(); // never async void
        }

        public override void _ExitTree()
        {
            if (Instance == this) Instance = null;
            try { _httpClient.Dispose(); } catch { /* shutting down */ }
        }

        // ---- Auth ----------------------------------------------------------------------
        private async Task AuthenticateAsync()
        {
            try
            {
                string deviceId = LoadOrCreateDeviceId();

                // 1. Authenticate device via POST /v2/account/authenticate/device?create=true
                using var authReq = new HttpRequestMessage(
                    HttpMethod.Post,
                    $"{_baseUrl}/v2/account/authenticate/device?create=true");
                string basicAuth = Convert.ToBase64String(Encoding.UTF8.GetBytes(_config.NakamaServerKey + ":"));
                authReq.Headers.Authorization = new AuthenticationHeaderValue("Basic", basicAuth);
                authReq.Content = new StringContent(
                    JsonSerializer.Serialize(new { id = deviceId }),
                    Encoding.UTF8,
                    "application/json");

                using HttpResponseMessage authResp = await _httpClient.SendAsync(authReq);
                if (!authResp.IsSuccessStatusCode)
                {
                    string errBody = await authResp.Content.ReadAsStringAsync();
                    throw new HttpRequestException($"Auth failed with status {(int)authResp.StatusCode}: {errBody}");
                }

                string authJson = await authResp.Content.ReadAsStringAsync();
                using JsonDocument authDoc = JsonDocument.Parse(authJson);
                string token = authDoc.RootElement.GetProperty("token").GetString()
                    ?? throw new InvalidOperationException("No token in auth response");

                // 2. Resolve user ID via GET /v2/account (with JWT decode fallback)
                string? userId = null;
                try
                {
                    using var accountReq = new HttpRequestMessage(HttpMethod.Get, $"{_baseUrl}/v2/account");
                    accountReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
                    using HttpResponseMessage accountResp = await _httpClient.SendAsync(accountReq);
                    if (accountResp.IsSuccessStatusCode)
                    {
                        string accountJson = await accountResp.Content.ReadAsStringAsync();
                        using JsonDocument accountDoc = JsonDocument.Parse(accountJson);
                        if (accountDoc.RootElement.TryGetProperty("user", out JsonElement userEl) &&
                            userEl.TryGetProperty("id", out JsonElement idEl) &&
                            idEl.ValueKind == JsonValueKind.String)
                        {
                            userId = idEl.GetString();
                        }
                    }
                }
                catch (Exception ex)
                {
                    GD.Print($"[MetaGateway] GET /v2/account failed, trying JWT decode: {ex.Message}");
                }

                if (string.IsNullOrEmpty(userId))
                {
                    userId = ExtractUserIdFromJwt(token);
                }

                if (string.IsNullOrEmpty(userId))
                {
                    throw new InvalidOperationException("Failed to resolve user ID from /v2/account or JWT claims");
                }

                _authToken = token;
                _userId = userId;
                GD.Print($"[MetaGateway] auth ok userId={_userId}");

                CallDeferred(nameof(EmitAuthReady), _userId);
            }
            catch (Exception e)
            {
                GD.Print($"[MetaGateway] Meta HTTP API offline (using local defaults): {e.Message}");
                CallDeferred(nameof(EmitAuthFailed), e.Message);
            }
        }

        private static string? ExtractUserIdFromJwt(string jwt)
        {
            try
            {
                string[] parts = jwt.Split('.');
                if (parts.Length < 2) return null;
                string payload = parts[1];
                payload = payload.Replace('-', '+').Replace('_', '/');
                switch (payload.Length % 4)
                {
                    case 2: payload += "=="; break;
                    case 3: payload += "="; break;
                }
                byte[] bytes = Convert.FromBase64String(payload);
                using JsonDocument doc = JsonDocument.Parse(bytes);
                if (doc.RootElement.TryGetProperty("sub", out JsonElement sub) && sub.ValueKind == JsonValueKind.String)
                    return sub.GetString();
                if (doc.RootElement.TryGetProperty("uid", out JsonElement uid) && uid.ValueKind == JsonValueKind.String)
                    return uid.GetString();
            }
            catch { }
            return null;
        }

        // ---- Storage read --------------------------------------------------------------
        /// <summary>Kick a doc read; result arrives on the <see cref="DocLoaded"/> signal.</summary>
        public void RequestDoc(string collection) => _ = RequestDocAsync(collection);

        private async Task RequestDocAsync(string collection)
        {
            if (string.IsNullOrEmpty(_authToken) || string.IsNullOrEmpty(_userId))
            {
                CallDeferred(nameof(EmitDocLoaded), collection, "", false);
                return;
            }
            try
            {
                var bodyObj = new
                {
                    object_ids = new[]
                    {
                        new
                        {
                            collection = collection,
                            key = MetaWireKeys.StorageKey,
                            user_id = _userId,
                        }
                    }
                };
                string reqBody = JsonSerializer.Serialize(bodyObj);
                using var req = new HttpRequestMessage(HttpMethod.Post, $"{_baseUrl}/v2/storage");
                req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _authToken);
                req.Content = new StringContent(reqBody, Encoding.UTF8, "application/json");

                using HttpResponseMessage resp = await _httpClient.SendAsync(req);
                if (!resp.IsSuccessStatusCode)
                {
                    CallDeferred(nameof(EmitDocLoaded), collection, "", false);
                    return;
                }

                string respJson = await resp.Content.ReadAsStringAsync();
                using JsonDocument doc = JsonDocument.Parse(respJson);
                if (doc.RootElement.TryGetProperty("objects", out JsonElement objects) &&
                    objects.ValueKind == JsonValueKind.Array &&
                    objects.GetArrayLength() > 0)
                {
                    JsonElement first = objects[0];
                    string val = first.TryGetProperty("value", out JsonElement valEl) && valEl.ValueKind == JsonValueKind.String
                        ? valEl.GetString() ?? ""
                        : "";
                    CallDeferred(nameof(EmitDocLoaded), collection, val, true);
                }
                else
                {
                    // Doc not created yet — a valid state; panels fall back to defaults.
                    CallDeferred(nameof(EmitDocLoaded), collection, "", false);
                }
            }
            catch (Exception e)
            {
                GD.Print($"[MetaGateway] read {collection} offline (non-fatal): {e.Message}");
                CallDeferred(nameof(EmitDocLoaded), collection, "", false);
            }
        }

        // ---- RPC -----------------------------------------------------------------------
        /// <summary>Kick an RPC; result arrives on the <see cref="RpcResult"/> signal.</summary>
        public void Rpc(string rpcId, string payloadJson) => _ = RpcAsync(rpcId, payloadJson);

        private async Task RpcAsync(string rpcId, string payloadJson)
        {
            if (string.IsNullOrEmpty(_authToken))
            {
                CallDeferred(nameof(EmitRpcResult), rpcId, "", false, "no session");
                return;
            }
            try
            {
                using var req = new HttpRequestMessage(HttpMethod.Post, $"{_baseUrl}/v2/rpc/{Uri.EscapeDataString(rpcId)}");
                req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _authToken);
                req.Content = new StringContent(payloadJson ?? "", Encoding.UTF8, "application/json");

                using HttpResponseMessage resp = await _httpClient.SendAsync(req);
                if (!resp.IsSuccessStatusCode)
                {
                    CallDeferred(nameof(EmitRpcResult), rpcId, "", false, $"HTTP {(int)resp.StatusCode}");
                    return;
                }

                string respJson = await resp.Content.ReadAsStringAsync();
                using JsonDocument doc = JsonDocument.Parse(respJson);
                string payload = "";
                if (doc.RootElement.TryGetProperty("payload", out JsonElement payloadEl))
                {
                    payload = payloadEl.ValueKind == JsonValueKind.String
                        ? payloadEl.GetString() ?? ""
                        : payloadEl.GetRawText();
                }
                CallDeferred(nameof(EmitRpcResult), rpcId, payload, true, "");
            }
            catch (Exception e)
            {
                GD.Print($"[MetaGateway] rpc {rpcId} offline (non-fatal): {e.Message}");
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
        public const string StorageKey = "state";
    }
}

using System;
using Godot;
using Atlas.Protocol;

namespace AtlasWorld.Client.Net
{
    /// <summary>
    /// Native Godot WebSocket client for server-rs.
    /// Uses Godot's built-in WebSocketPeer to communicate with the Rust backend via FlatBuffers.
    /// Runs seamlessly across PC, macOS, Android, and iOS.
    /// </summary>
    public partial class ServerRsConnection : Node
    {
        [Signal]
        public delegate void ConnectedEventHandler();

        [Signal]
        public delegate void DisconnectedEventHandler(int code, string reason);

        [Signal]
        public delegate void SnapshotReceivedEventHandler(int tick, ulong serverTimeMs, int entityCount);

        /// <summary>
        /// Zero-copy callback carrying the full FlatBuffers <see cref="WorldSnapshot"/> struct
        /// so <see cref="World.EntityManager"/> or <see cref="VerticalSliceRoot"/> can read
        /// all EntityDelta and GameEvent entries directly.
        /// </summary>
        public event Action<WorldSnapshot>? RawSnapshotReceived;

        private readonly WebSocketPeer _peer = new();
        private string _targetUrl = "ws://127.0.0.1:2567/ws";
        private WebSocketPeer.State _lastState = WebSocketPeer.State.Closed;

        public bool IsConnectedToHost => _peer.GetReadyState() == WebSocketPeer.State.Open;

        /// <summary>Session name parsed from the endpoint token (e.g. "mont-ipad").</summary>
        public string SessionName { get; private set; } = "mont-ipad";

        /// <summary>FNV-1a 32-bit wire entity ID for this client's own player avatar on server-rs.</summary>
        public uint LocalWireId { get; private set; } = PacketCodec.Fnv1a32("mont-ipad");

        public override void _Ready()
        {
            // Configure binary buffer limit (up to 256 KB)
            _peer.InboundBufferSize = 262144;
            _peer.OutboundBufferSize = 262144;
        }

        public Error ConnectToHost(string url)
        {
            _targetUrl = url;
            SessionName = PacketCodec.ExtractSessionName(url);
            LocalWireId = PacketCodec.Fnv1a32(SessionName);

            GD.Print($"[ServerRsConnection] Connecting to: {_targetUrl} (session={SessionName}, wireId={LocalWireId})");
            Error err = _peer.ConnectToUrl(_targetUrl);
            if (err != Error.Ok)
            {
                GD.PrintErr($"[ServerRsConnection] Failed to initiate connection: {err}");
            }
            return err;
        }

        public void DisconnectFromHost(int code = 1000, string reason = "Normal Closure")
        {
            if (_peer.GetReadyState() != WebSocketPeer.State.Closed)
            {
                _peer.Close(code, reason);
            }
        }

        public override void _Process(double delta)
        {
            _peer.Poll();
            var state = _peer.GetReadyState();

            if (state != _lastState)
            {
                GD.Print($"[ServerRsConnection] State changed: {_lastState} -> {state}");
                if (state == WebSocketPeer.State.Open)
                {
                    // Send initial bootstrap input frame so server-rs spawns our player avatar on the next tick
                    SendInput(0f, 0f);
                    EmitSignal(SignalName.Connected);
                }
                else if (state == WebSocketPeer.State.Closed)
                {
                    int code = _peer.GetCloseCode();
                    string reason = _peer.GetCloseReason();
                    EmitSignal(SignalName.Disconnected, code, reason);
                }
                _lastState = state;
            }

            if (state == WebSocketPeer.State.Open)
            {
                while (_peer.GetAvailablePacketCount() > 0)
                {
                    byte[] packet = _peer.GetPacket();
                    ProcessInboundPacket(packet);
                }
            }
        }

        private void ProcessInboundPacket(byte[] packet)
        {
            try
            {
                WorldSnapshot snapshot = PacketCodec.DecodeSnapshot(packet);
                int entityCount = snapshot.EntitiesLength;
                RawSnapshotReceived?.Invoke(snapshot);
                EmitSignal(SignalName.SnapshotReceived, (int)snapshot.Tick, snapshot.ServerTimeMs, entityCount);
            }
            catch (Exception ex)
            {
                GD.PrintErr($"[ServerRsConnection] Packet decode error: {ex.Message}");
            }
        }

        /// <summary>
        /// Sends movement and action intent to server-rs encoded as a FlatBuffers ClientInput.
        /// </summary>
        public bool SendInput(
            float moveX,
            float moveY,
            bool attack = false,
            byte skillSlot = 0,
            uint targetId = 0,
            float targetX = 0f,
            float targetY = 0f,
            bool respawn = false)
        {
            if (!IsConnectedToHost) return false;

            byte[] bytes = PacketCodec.EncodeClientInput(
                moveX,
                moveY,
                attack,
                skillSlot,
                targetId,
                targetX,
                targetY,
                respawn);
            Error err = _peer.PutPacket(bytes);
            return err == Error.Ok;
        }
    }
}

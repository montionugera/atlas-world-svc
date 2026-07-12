using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Godot;
using Colyseus;
using AtlasWorld.Contracts;
using AtlasWorld.Client.Core;

namespace AtlasWorld.Client.Net
{
    /// <summary>
    /// Owns the Colyseus <see cref="Client"/> / <see cref="Room{T}"/> lifecycle.
    ///
    /// DISPATCH MODEL (the core architectural decision — Gate B):
    /// we KEEP Godot's SynchronizationContext and pump the WS receive queue on the
    /// MAIN thread every frame via <c>Room.Connection.DispatchMessageQueue()</c>.
    /// All schema callbacks (OnAdd/OnChange/OnRemove, OnMessage) therefore fire on
    /// the main thread — safe to touch the scene tree with NO CallDeferred, and the
    /// off-thread freed-node crash class is eliminated.
    ///
    /// Do NOT call <c>SetSynchronizationContext(null)</c>: that re-enables the SDK's
    /// shared background dispatch loop, and pumping as well double-drains the queue
    /// (WS closes with 1004). Exactly one drainer — this pump.
    /// </summary>
    public sealed partial class ColyseusConnection : Node
    {
        private readonly Config _config;

        private Colyseus.Client? _client;

        /// <summary>The live room, or null while (re)connecting / after a clean leave.</summary>
        public Room<GameState>? Room { get; private set; }

        /// <summary>The mapId sent in join options (rooms are 1-client, so ours = the room's).</summary>
        public string MapId { get; private set; }

        /// <summary>Fires on the main thread once a room is joined (initial or reconnect).</summary>
        public event Action<Room<GameState>>? Connected;

        /// <summary>Fires on the main thread when the room drops (clean or pending reconnect).</summary>
        public event Action? Disconnected;

        // Reconnect state. Backoff is simple by design (full robustness is a later concern).
        private bool _reconnecting;
        private int _reconnectAttempt;
        // Captured while the room is live so a drop can reuse it (Room is nulled on leave).
        private ReconnectionToken? _reconnectionToken;
        private const int MaxReconnectAttempts = 6;
        private const double BaseBackoffSeconds = 0.5;
        private const double MaxBackoffSeconds = 8.0;

        // Set while an on-purpose leave (map switch / exit) is in flight so OnRoomLeave
        // doesn't treat it as a drop and start reconnecting.
        private bool _intentionalLeave;

        public ColyseusConnection(Config config)
        {
            _config = config;
            MapId = config.MapId;
        }

        /// <summary>Start the initial connection. Called by GameRoot after wiring listeners.</summary>
        public void BeginConnect()
        {
            _ = ConnectAsync();
        }

        private async Task ConnectAsync()
        {
            try
            {
                _client ??= new Colyseus.Client(_config.ColyseusEndpoint);

                var options = new Dictionary<string, object> { { "mapId", MapId } };
                if (!string.IsNullOrEmpty(_config.AuthToken))
                {
                    // Threaded into server-side onAuth. Empty token = bare join (dev path).
                    options["token"] = _config.AuthToken;
                }

                Room<GameState> room = await _client.JoinOrCreate<GameState>(
                    _config.RoomName, options, null);

                AttachRoom(room);
                _reconnectAttempt = 0;
                GD.Print($"[Colyseus] joined room={room.RoomId} session={room.SessionId}");
            }
            catch (Exception e)
            {
                GD.PushError($"[Colyseus] connect failed: {e.Message}");
                ScheduleReconnect(fromToken: false);
            }
        }

        private void AttachRoom(Room<GameState> room)
        {
            Room = room;
            _reconnectionToken = room.ReconnectionToken;
            room.OnError += (code, message) =>
                GD.PushError($"[Colyseus] room error code={code} msg={message}");
            room.OnLeave += OnRoomLeave;
            Connected?.Invoke(room);
        }

        private void OnRoomLeave(int code)
        {
            GD.Print($"[Colyseus] room left code={code}");
            Room = null;
            Disconnected?.Invoke();

            // 1000 = normal closure, 4000 = 0.17 consented leave (we asked to leave),
            // and _intentionalLeave covers a switch already in flight. Anything else =
            // unexpected drop → reconnect.
            if (code == 1000 || code == 4000 || _intentionalLeave)
                return;

            ScheduleReconnect(fromToken: true);
        }

        /// <summary>
        /// Leave the current room (if any) and join a fresh one on <paramref name="mapId"/>.
        /// No-op when already on that map.
        /// </summary>
        public void SwitchMap(string mapId)
        {
            if (mapId == MapId && Room != null)
                return;
            MapId = mapId;
            _ = SwitchAsync();
        }

        private async Task SwitchAsync()
        {
            _intentionalLeave = true;
            try
            {
                Room<GameState>? room = Room;
                if (room != null)
                {
                    // Keep the pump running while the leave round-trips: the SDK routes
                    // its close callback through the same dispatch queue, so stopping the
                    // pump here would deadlock the await. OnRoomLeave nulls Room.
                    await room.Leave();
                }
            }
            catch (Exception e)
            {
                GD.Print($"[Colyseus] leave before switch failed (continuing): {e.Message}");
            }
            finally
            {
                _intentionalLeave = false;
            }

            Room = null; // belt-and-braces if the close callback never dispatched
            _reconnectAttempt = 0;
            await ConnectAsync();
        }

        public override void _Process(double delta)
        {
            Room<GameState>? room = Room;
            if (room == null)
                return;

            // Drain the WS receive queue on the MAIN thread. Callbacks fire HERE,
            // so scene mutation from them is main-thread-safe.
            try
            {
                room.Connection.DispatchMessageQueue();
            }
            catch (Exception e)
            {
                GD.PushError($"[Colyseus] dispatch pump threw: {e.Message}");
                Room = null;
                Disconnected?.Invoke();
                if (!_intentionalLeave)
                    ScheduleReconnect(fromToken: true);
            }
        }

        private void ScheduleReconnect(bool fromToken)
        {
            if (_reconnecting)
                return;

            if (_reconnectAttempt >= MaxReconnectAttempts)
            {
                GD.PushError($"[Colyseus] gave up reconnecting after {_reconnectAttempt} attempts");
                return;
            }

            _reconnecting = true;
            _reconnectAttempt++;
            _ = ReconnectAsync(fromToken, _reconnectAttempt);
        }

        private async Task ReconnectAsync(bool fromToken, int attempt)
        {
            double backoff = Math.Min(MaxBackoffSeconds, BaseBackoffSeconds * Math.Pow(2, attempt - 1));
            GD.Print($"[Colyseus] reconnect attempt {attempt} in {backoff:0.0}s");
            await Task.Delay(TimeSpan.FromSeconds(backoff));

            try
            {
                ReconnectionToken? token = fromToken ? _reconnectionToken : null;
                if (token != null && _client != null)
                {
                    Room<GameState> room = await _client.Reconnect<GameState>(token, null);
                    AttachRoom(room);
                    GD.Print($"[Colyseus] reconnected via token room={room.RoomId}");
                }
                else
                {
                    _reconnecting = false;
                    await ConnectAsync();
                    return;
                }

                _reconnecting = false;
                _reconnectAttempt = 0;
            }
            catch (Exception e)
            {
                GD.PushError($"[Colyseus] reconnect attempt {attempt} failed: {e.Message}");
                _reconnecting = false;
                ScheduleReconnect(fromToken);
            }
        }

        public override void _ExitTree()
        {
            _ = Room?.Leave();
        }
    }
}

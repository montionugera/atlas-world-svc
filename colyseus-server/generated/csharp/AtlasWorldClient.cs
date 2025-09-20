using System;
using System.Collections.Generic;
using System.Net.WebSockets;
using System.Text;
// Using Unity's built-in JsonUtility instead of external libraries
using System.Threading;
using System.Threading.Tasks;

namespace AtlasWorld.Client
{
    // JSON serializable classes for Unity JsonUtility
    [System.Serializable]
    public class JoinMessage
    {
        public string type = "join";
        public string room = "game_room";
        public JoinOptions options = new JoinOptions();
    }

    [System.Serializable]
    public class JoinOptions
    {
        public string mapId = "map-01-sector-a";
    }

    [System.Serializable]
    public class PlayerInputMessage
    {
        public string type = "player_input";
        public PlayerInput data = new PlayerInput();
    }

    [System.Serializable]
    public class PlayerPositionMessage
    {
        public string type = "player_position";
        public PlayerPosition data = new PlayerPosition();
    }

    [System.Serializable]
    public class MessageWrapper
    {
        public string type;
    }

    /// <summary>
    /// C# client for Atlas World multiplayer game server
    /// Generated from AsyncAPI specification
    /// </summary>
    public class AtlasWorldClient : IDisposable
    {
        private readonly string _serverUrl;
        private ClientWebSocket? _webSocket;
        private CancellationTokenSource? _cancellationTokenSource;
        private bool _disposed = false;

        // Events
        public event Action<StateChangeMessage>? OnStateChange;
        public event Action<WelcomeMessage>? OnWelcome;
        public event Action<string>? OnError;
        public event Action? OnConnected;
        public event Action? OnDisconnected;

        public AtlasWorldClient(string serverUrl = "ws://localhost:2567")
        {
            _serverUrl = serverUrl;
        }

        /// <summary>
        /// Connect to the game server
        /// </summary>
        public async Task ConnectAsync()
        {
            try
            {
                _webSocket = new ClientWebSocket();
                _cancellationTokenSource = new CancellationTokenSource();

                var uri = new Uri(_serverUrl);
                await _webSocket.ConnectAsync(uri, _cancellationTokenSource.Token);

                OnConnected?.Invoke();

                // Start listening for messages
                _ = Task.Run(ListenForMessages);
            }
            catch (Exception ex)
            {
                OnError?.Invoke($"Connection failed: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// Join the game room
        /// </summary>
        public async Task JoinGameRoomAsync(string mapId = "map-01-sector-a")
        {
            if (_webSocket?.State != WebSocketState.Open)
            {
                throw new InvalidOperationException("WebSocket is not connected");
            }

            var joinMessage = new JoinMessage
            {
                options = new JoinOptions { mapId = mapId }
            };

            await SendMessageAsync(JsonUtility.ToJson(joinMessage));
        }

        /// <summary>
        /// Send player input (velocity)
        /// </summary>
        public async Task SendPlayerInputAsync(PlayerInput input)
        {
            if (_webSocket?.State != WebSocketState.Open)
            {
                throw new InvalidOperationException("WebSocket is not connected");
            }

            var message = new PlayerInputMessage
            {
                data = input
            };

            await SendMessageAsync(JsonUtility.ToJson(message));
        }

        /// <summary>
        /// Send player position update
        /// </summary>
        public async Task SendPlayerPositionAsync(PlayerPosition position)
        {
            if (_webSocket?.State != WebSocketState.Open)
            {
                throw new InvalidOperationException("WebSocket is not connected");
            }

            var message = new PlayerPositionMessage
            {
                data = position
            };

            await SendMessageAsync(JsonUtility.ToJson(message));
        }

        private async Task SendMessageAsync(string message)
        {
            if (_webSocket?.State != WebSocketState.Open)
                return;

            var bytes = Encoding.UTF8.GetBytes(message);
            await _webSocket.SendAsync(
                new ArraySegment<byte>(bytes),
                WebSocketMessageType.Text,
                true,
                _cancellationTokenSource?.Token ?? CancellationToken.None
            );
        }

        private async Task ListenForMessages()
        {
            var buffer = new byte[4096];
            var messageBuffer = new List<byte>();

            try
            {
                while (_webSocket?.State == WebSocketState.Open && !_cancellationTokenSource?.Token.IsCancellationRequested == true)
                {
                    var result = await _webSocket.ReceiveAsync(
                        new ArraySegment<byte>(buffer),
                        _cancellationTokenSource?.Token ?? CancellationToken.None
                    );

                    if (result.MessageType == WebSocketMessageType.Text)
                    {
                        messageBuffer.AddRange(buffer[..result.Count]);

                        if (result.EndOfMessage)
                        {
                            var message = Encoding.UTF8.GetString(messageBuffer.ToArray());
                            await ProcessMessageAsync(message);
                            messageBuffer.Clear();
                        }
                    }
                    else if (result.MessageType == WebSocketMessageType.Close)
                    {
                        OnDisconnected?.Invoke();
                        break;
                    }
                }
            }
            catch (Exception ex)
            {
                OnError?.Invoke($"Error listening for messages: {ex.Message}");
            }
        }

        private async Task ProcessMessageAsync(string message)
        {
            try
            {
                // First, get the message type using a simple wrapper
                var messageWrapper = JsonUtility.FromJson<MessageWrapper>(message);
                string messageType = messageWrapper.type;

                switch (messageType)
                {
                    case "welcome":
                        var welcome = JsonUtility.FromJson<WelcomeMessage>(message);
                        OnWelcome?.Invoke(welcome);
                        break;

                    case "state_change":
                        var stateChange = JsonUtility.FromJson<StateChangeMessage>(message);
                        OnStateChange?.Invoke(stateChange);
                        break;

                    default:
                        Console.WriteLine($"Unknown message type: {messageType}");
                        break;
                }
            }
            catch (Exception ex)
            {
                OnError?.Invoke($"Error processing message: {ex.Message}");
            }
        }

        /// <summary>
        /// Disconnect from the server
        /// </summary>
        public async Task DisconnectAsync()
        {
            if (_webSocket?.State == WebSocketState.Open)
            {
                await _webSocket.CloseAsync(
                    WebSocketCloseStatus.NormalClosure,
                    "Client disconnecting",
                    CancellationToken.None
                );
            }

            _cancellationTokenSource?.Cancel();
            OnDisconnected?.Invoke();
        }

        public void Dispose()
        {
            if (!_disposed)
            {
                _cancellationTokenSource?.Cancel();
                _webSocket?.Dispose();
                _cancellationTokenSource?.Dispose();
                _disposed = true;
            }
        }
    }

    // Message Models - Unity JsonUtility compatible
    [System.Serializable]
    public class PlayerInput
    {
        public float vx;
        public float vy;
    }

    [System.Serializable]
    public class PlayerPosition
    {
        public float x;
        public float y;
    }

    [System.Serializable]
    public class WelcomeMessage
    {
        public string message;
        public string playerId;
        public string mapId;
    }

    [System.Serializable]
    public class StateChangeMessage
    {
        public PlayerData[] players;
        public MobData[] mobs;
        public int tick;
        public string mapId;
    }

    [System.Serializable]
    public class PlayerData
    {
        public string id;
        public string sessionId;
        public float x;
        public float y;
        public float vx;
        public float vy;
        public string name;
    }

    [System.Serializable]
    public class MobData
    {
        public string id;
        public float x;
        public float y;
        public float vx;
        public float vy;
    }
}

using System;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using UnityEngine;

namespace AtlasWorld.Client
{
    /// <summary>
    /// Simple WebSocket client for testing Colyseus connection
    /// </summary>
    public class SimpleWebSocketClient : MonoBehaviour
    {
    public string serverUrl = "ws://localhost:2567";
        
        private ClientWebSocket? _webSocket;
        private CancellationTokenSource? _cancellationTokenSource;
        private bool _isConnected = false;
        
        void Start()
        {
            ConnectAsync();
        }
        
        async void ConnectAsync()
        {
            try
            {
                _webSocket = new ClientWebSocket();
                _cancellationTokenSource = new CancellationTokenSource();
                
                var uri = new Uri(serverUrl);
                Debug.Log($"🔗 Connecting to: {uri}");
                
                await _webSocket.ConnectAsync(uri, _cancellationTokenSource.Token);
                Debug.Log($"✅ Connected to: {uri}");
                
                _isConnected = true;
                
                // Start listening
                _ = Task.Run(ListenForMessages);
                
                // Send a simple test message
                await SendTestMessage();
            }
            catch (Exception ex)
            {
                Debug.LogError($"❌ Connection failed: {ex.Message}");
            }
        }
        
        async Task SendTestMessage()
        {
            if (_webSocket?.State != WebSocketState.Open) return;
            
            var message = "Hello from Unity!";
            var bytes = Encoding.UTF8.GetBytes(message);
            
            await _webSocket.SendAsync(
                new ArraySegment<byte>(bytes),
                WebSocketMessageType.Text,
                true,
                _cancellationTokenSource?.Token ?? CancellationToken.None
            );
            
            Debug.Log($"📤 Sent: {message}");
        }
        
        async Task ListenForMessages()
        {
            var buffer = new byte[4096];
            
            try
            {
                while (_webSocket?.State == WebSocketState.Open && !_cancellationTokenSource?.Token.IsCancellationRequested)
                {
                    var result = await _webSocket.ReceiveAsync(
                        new ArraySegment<byte>(buffer),
                        _cancellationTokenSource?.Token ?? CancellationToken.None
                    );
                    
                    if (result.MessageType == WebSocketMessageType.Text)
                    {
                        var message = Encoding.UTF8.GetString(buffer, 0, result.Count);
                        Debug.Log($"📥 Received text: {message}");
                    }
                    else if (result.MessageType == WebSocketMessageType.Binary)
                    {
                        Debug.Log($"📥 Received binary message (length: {result.Count})");
                        // Log first few bytes
                        var preview = new byte[Math.Min(10, result.Count)];
                        Array.Copy(buffer, preview, preview.Length);
                        Debug.Log($"📥 Binary preview: {BitConverter.ToString(preview)}");
                    }
                    else if (result.MessageType == WebSocketMessageType.Close)
                    {
                        Debug.Log("❌ WebSocket closed by server");
                        break;
                    }
                }
            }
            catch (Exception ex)
            {
                Debug.LogError($"❌ Error listening: {ex.Message}");
            }
        }
        
        void OnDestroy()
        {
            _cancellationTokenSource?.Cancel();
            _webSocket?.CloseAsync(WebSocketCloseStatus.NormalClosure, "Closing", CancellationToken.None);
        }
    }
}

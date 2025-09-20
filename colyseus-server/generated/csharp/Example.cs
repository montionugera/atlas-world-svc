using System;
using System.Threading.Tasks;

namespace AtlasWorld.Client.Example
{
    /// <summary>
    /// Example usage of AtlasWorldClient
    /// </summary>
    class Program
    {
        static async Task Main(string[] args)
        {
            Console.WriteLine("🎮 Atlas World C# Client Example");
            Console.WriteLine("=================================");

            var client = new AtlasWorldClient("ws://localhost:2567");

            // Set up event handlers
            client.OnConnected += () => Console.WriteLine("✅ Connected to server");
            client.OnDisconnected += () => Console.WriteLine("❌ Disconnected from server");
            client.OnError += (error) => Console.WriteLine($"❌ Error: {error}");

            client.OnWelcome += (welcome) =>
            {
                Console.WriteLine($"🎉 Welcome: {welcome.Message}");
                Console.WriteLine($"🆔 Player ID: {welcome.PlayerId}");
                Console.WriteLine($"🗺️ Map: {welcome.MapId}");
            };

            client.OnStateChange += (state) =>
            {
                Console.WriteLine($"🔄 Game State Update - Tick: {state.Tick}");
                Console.WriteLine($"👥 Players: {state.Players.Count}");
                Console.WriteLine($"👾 Mobs: {state.Mobs.Count}");
            };

            try
            {
                // Connect to server
                await client.ConnectAsync();
                Console.WriteLine("🔌 Connecting to server...");

                // Wait a moment for connection
                await Task.Delay(1000);

                // Join game room
                await client.JoinGameRoomAsync("map-01-sector-a");
                Console.WriteLine("🚪 Joining game room...");

                // Wait a moment for room join
                await Task.Delay(1000);

                // Send some player input
                Console.WriteLine("🎮 Sending player input...");
                await client.SendPlayerInputAsync(new PlayerInput { Vx = 0.5, Vy = -0.3 });

                // Send position update
                Console.WriteLine("📍 Sending position update...");
                await client.SendPlayerPositionAsync(new PlayerPosition { X = 150.5, Y = 200.3 });

                // Keep the client running
                Console.WriteLine("⏳ Press any key to disconnect...");
                Console.ReadKey();

                // Disconnect
                await client.DisconnectAsync();
                Console.WriteLine("👋 Disconnected from server");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"❌ Error: {ex.Message}");
            }
            finally
            {
                client.Dispose();
            }
        }
    }
}

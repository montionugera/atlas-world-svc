using System;
using System.Threading.Tasks;
using AtlasWorld.Client;

/// <summary>
/// Console example for AtlasWorldClient - NO EXTERNAL DEPENDENCIES
/// Uses only Unity's built-in JsonUtility
/// </summary>
class Program
{
    static async Task Main(string[] args)
    {
        Console.WriteLine("🎮 Atlas World Console Client Example");
        Console.WriteLine("=====================================");

        var client = new AtlasWorldClient("ws://localhost:2567");

        // Set up event handlers
        client.OnConnected += () => Console.WriteLine("✅ Connected to server");
        client.OnDisconnected += () => Console.WriteLine("❌ Disconnected from server");
        client.OnError += (error) => Console.WriteLine($"❌ Error: {error}");

        client.OnWelcome += (welcome) =>
        {
            Console.WriteLine($"🎉 Welcome: {welcome.message}");
            Console.WriteLine($"🆔 Player ID: {welcome.playerId}");
            Console.WriteLine($"🗺️ Map: {welcome.mapId}");
        };

        client.OnStateChange += (state) =>
        {
            Console.WriteLine($"🔄 Game State Update - Tick: {state.tick}");
            Console.WriteLine($"👥 Players: {state.players.Length}");
            Console.WriteLine($"👾 Mobs: {state.mobs.Length}");
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
            await client.SendPlayerInputAsync(new PlayerInput { vx = 0.5f, vy = -0.3f });

            // Send position update
            Console.WriteLine("📍 Sending position update...");
            await client.SendPlayerPositionAsync(new PlayerPosition { x = 150.5f, y = 200.3f });

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

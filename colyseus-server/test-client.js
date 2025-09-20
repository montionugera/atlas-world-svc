const { Client } = require("colyseus.js");

async function testColyseusServer() {
  console.log("🧪 Testing Colyseus Server...");
  
  try {
    // Create client
    const client = new Client("ws://localhost:2567");
    
    // Join a game room
    console.log("🎮 Joining game room...");
    const room = await client.joinOrCreate("game_room", {
      mapId: "map-01-sector-a",
      name: "TestPlayer"
    });
    
    console.log("✅ Successfully joined room:", room.id);
    console.log("📊 Room state:", {
      mapId: room.state.mapId,
      playerCount: room.state.players.size,
      mobCount: room.state.mobs.length,
      tick: room.state.tick
    });
    
    // Listen for state changes
    room.state.players.onAdd((player, sessionId) => {
      console.log(`👤 Player joined: ${player.name} (${sessionId})`);
    });
    
    room.state.mobs.onAdd((mob) => {
      console.log(`👹 Mob spawned: ${mob.id} at (${mob.x}, ${mob.y})`);
    });
    
    // Listen for mob position updates
    room.state.mobs.onChange((mob) => {
      console.log(`🔄 Mob ${mob.id} moved to (${mob.x}, ${mob.y})`);
    });
    
    // Send some player input
    setTimeout(() => {
      console.log("🎮 Sending player input...");
      room.send("player_input", { vx: 2, vy: 1 });
    }, 1000);
    
    // Wait a bit to see updates
    setTimeout(() => {
      console.log("📊 Final state:", {
        playerCount: room.state.players.size,
        mobCount: room.state.mobs.length,
        tick: room.state.tick
      });
      
      console.log("✅ Test completed successfully!");
      room.leave();
      process.exit(0);
    }, 5000);
    
  } catch (error) {
    console.error("❌ Test failed:", error);
    process.exit(1);
  }
}

// Run the test
testColyseusServer();

import { Server } from "colyseus";
import { createServer } from "http";
import express from "express";
import cors from "cors";
import { GameRoom } from "./rooms/GameRoom";
import { createApiRouter } from "./api";

const app = express();
const server = createServer(app);

// Configure CORS
app.use(cors());
app.use(express.json());

// Create Colyseus server
const gameServer = new Server({
  server,
});

// REST API routes for static game data (requires gameServer for room access)
app.use("/api", createApiRouter(gameServer));

// Register room handlers
gameServer.define("game_room", GameRoom);

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ 
    status: "healthy", 
    timestamp: new Date().toISOString(),
    server: "colyseus"
  });
});

// Room info endpoint
app.get("/rooms", (req, res) => {
  res.json({ 
    message: "Room info endpoint - use Colyseus client to get room information",
    server: "colyseus"
  });
});

// Start server
const PORT = process.env.PORT || 2567;

gameServer.listen(Number(PORT)).then(() => {
  console.log(`🚀 Atlas World Colyseus Server running on port ${PORT}`);
  console.log(`🎮 Game rooms available at ws://localhost:${PORT}`);
  console.log(`📊 Health check at http://localhost:${PORT}/health`);
  console.log(`📋 Room info at http://localhost:${PORT}/rooms`);
  console.log(`🌐 REST API available at http://localhost:${PORT}/api`);
  console.log(`   - GET /api/rooms/:roomId/mobs - List mobs in room`);
  console.log(`   - GET /api/rooms/:roomId/mobs/:mobId - Get mob instance data`);
}).catch((error) => {
  console.error("❌ Failed to start server:", error);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down server...');
  gameServer.gracefullyShutdown().then(() => {
    console.log('✅ Server shut down gracefully');
    process.exit(0);
  });
});
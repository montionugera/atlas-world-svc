// Atlas World Client - Main entry point for mob simulation

import { AtlasClient } from './atlas-client';
import { ClientConfig } from './types/game';

// Configuration for connecting to the Atlas World Server
const config: ClientConfig = {
  serverHost: 'localhost',
  serverPort: 7350,
  serverKey: 'defaultkey',
  useSSL: false
};

// Generate unique player ID
const playerId = `simulator-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

async function main() {
  console.log('🚀 Atlas World Client - Mob Simulation');
  console.log(`👤 Player ID: ${playerId}`);
  console.log(`🌐 Server: ${config.serverHost}:${config.serverPort}`);
  
  const client = new AtlasClient(config, playerId);
  
  try {
    // Connect to server
    await client.connect();
    
    // Create a match
    const matchId = await client.createMatch();
    
    // Join the match
    await client.joinMatch(matchId);
    
    // Get initial match state
    const initialState = await client.getMatchState();
    console.log(`📊 Initial match state - Players: ${initialState.playerCount}, Mobs: ${initialState.mobs?.length || 0}`);
    
    // Run full simulation (mobs + player movement)
    await client.runFullSimulation(30000); // 30 seconds
    
    // Keep the process alive to see the simulation
    console.log('⏳ Simulation running... Press Ctrl+C to stop');
    
  } catch (error) {
    console.error('❌ Simulation failed:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down Atlas World Client...');
  process.exit(0);
});

// Start the simulation
main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});

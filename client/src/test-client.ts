// Atlas World Client - Test suite for mob simulation

import { AtlasClient } from './atlas-client';
import { ClientConfig } from './types/game';

const config: ClientConfig = {
  serverHost: 'localhost',
  serverPort: 7350,
  serverKey: 'defaultkey',
  useSSL: false
};

async function testBasicConnection() {
  console.log('🧪 Test 1: Basic Connection');
  const client = new AtlasClient(config, 'test-player-1');
  
  try {
    await client.connect();
    console.log('✅ Connection test passed');
    return client;
  } catch (error) {
    console.error('❌ Connection test failed:', error);
    throw error;
  }
}

async function testMatchCreation(client: AtlasClient) {
  console.log('🧪 Test 2: Match Creation');
  
  try {
    const matchId = await client.createMatch();
    console.log(`✅ Match creation test passed - Match ID: ${matchId}`);
    return matchId;
  } catch (error) {
    console.error('❌ Match creation test failed:', error);
    throw error;
  }
}

async function testMatchJoin(client: AtlasClient, matchId: string) {
  console.log('🧪 Test 3: Match Join');
  
  try {
    const response = await client.joinMatch(matchId);
    console.log(`✅ Match join test passed - Players: ${response.playerCount}`);
    return response;
  } catch (error) {
    console.error('❌ Match join test failed:', error);
    throw error;
  }
}

async function testPlayerMovement(client: AtlasClient) {
  console.log('🧪 Test 4: Player Movement');
  
  try {
    const response = await client.updatePlayerPosition({ x: 150, y: 150 });
    console.log(`✅ Player movement test passed - Tick: ${response.tick}`);
    return response;
  } catch (error) {
    console.error('❌ Player movement test failed:', error);
    throw error;
  }
}

async function testMobUpdates(client: AtlasClient) {
  console.log('🧪 Test 5: Mob Updates');
  
  try {
    const response = await client.updateMobs();
    console.log(`✅ Mob update test passed - Tick: ${response.tick}, Mobs: ${response.mobs?.length || 0}`);
    
    if (response.mobs && response.mobs.length > 0) {
      response.mobs.forEach(mob => {
        console.log(`   🤖 ${mob.id}: pos(${mob.x}, ${mob.y}) vel(${mob.vx}, ${mob.vy})`);
      });
    }
    
    return response;
  } catch (error) {
    console.error('❌ Mob update test failed:', error);
    throw error;
  }
}

async function testMatchState(client: AtlasClient) {
  console.log('🧪 Test 6: Match State');
  
  try {
    const response = await client.getMatchState();
    console.log(`✅ Match state test passed - Players: ${response.playerCount}, Mobs: ${response.mobs?.length || 0}`);
    return response;
  } catch (error) {
    console.error('❌ Match state test failed:', error);
    throw error;
  }
}

async function testMobSimulation(client: AtlasClient) {
  console.log('🧪 Test 7: Mob Simulation (5 seconds)');
  
  try {
    // Run a short mob simulation
    await new Promise<void>((resolve) => {
      const startTime = Date.now();
      const duration = 5000; // 5 seconds
      
      const simulationLoop = async () => {
        if (Date.now() - startTime >= duration) {
          console.log('✅ Mob simulation test completed');
          resolve();
          return;
        }
        
        try {
          const response = await client.updateMobs();
          console.log(`   🔄 Mob update - Tick: ${response.tick}`);
        } catch (error) {
          console.error('   ❌ Mob update error:', error);
        }
        
        setTimeout(simulationLoop, 1000);
      };
      
      simulationLoop();
    });
  } catch (error) {
    console.error('❌ Mob simulation test failed:', error);
    throw error;
  }
}

async function runAllTests() {
  console.log('🧪 Atlas World Client Test Suite');
  console.log('================================');
  
  let client: AtlasClient | null = null;
  
  try {
    // Test 1: Connection
    client = await testBasicConnection();
    
    // Test 2: Match Creation
    const matchId = await testMatchCreation(client);
    
    // Test 3: Match Join
    await testMatchJoin(client, matchId);
    
    // Test 4: Player Movement
    await testPlayerMovement(client);
    
    // Test 5: Mob Updates
    await testMobUpdates(client);
    
    // Test 6: Match State
    await testMatchState(client);
    
    // Test 7: Mob Simulation
    await testMobSimulation(client);
    
    console.log('\n🎉 All tests passed!');
    
  } catch (error) {
    console.error('\n❌ Test suite failed:', error);
    process.exit(1);
  } finally {
    if (client) {
      client.disconnect();
    }
  }
}

// Run tests
runAllTests().catch(error => {
  console.error('❌ Test suite fatal error:', error);
  process.exit(1);
});

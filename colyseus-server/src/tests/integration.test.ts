import { Client } from 'colyseus.js';
import { GameState } from '../schemas/GameState';

/**
 * Integration tests that test the full server-client communication
 * These tests can detect issues that unit tests miss
 */
describe('Server-Client Integration Tests', () => {
  let client: Client;
  let room: any;
  
  beforeAll(async () => {
    // Create client connection
    client = new Client('ws://localhost:2567');
  });
  
  afterAll(async () => {
    if (room) {
      await room.leave();
    }
  });
  
  test('should connect to server and join room', async () => {
    room = await client.joinOrCreate<GameState>('game_room', {
      mapId: 'test-map',
      name: 'TestPlayer'
    });
    
    expect(room).toBeDefined();
    expect(room.roomId).toBeDefined();
    console.log(`🔗 Connected to room: ${room.roomId}`);
  });
  
  test('should receive game state updates', (done) => {
    let updateCount = 0;
    const startTime = Date.now();
    
    room.onStateChange((state: GameState) => {
      updateCount++;
      const now = Date.now();
      const timeSinceStart = now - startTime;
      
      console.log(`📡 Update ${updateCount}: tick=${state.tick}, mobs=${state.mobs.size}, time=${timeSinceStart}ms`);
      
      // Should receive updates within reasonable time
      if (updateCount >= 5) {
        expect(timeSinceStart).toBeLessThan(10000); // Within 10 seconds
        done();
      }
    });
    
    // Timeout after 15 seconds
    setTimeout(() => {
      if (updateCount < 5) {
        done(new Error(`Only received ${updateCount} updates in 15 seconds`));
      }
    }, 15000);
  });
  
  test('should detect server update rate', (done) => {
    const updateTimes: number[] = [];
    let updateCount = 0;
    
    room.onStateChange((state: GameState) => {
      updateTimes.push(Date.now());
      updateCount++;
      
      if (updateCount >= 10) {
        // Calculate update rate
        const now = Date.now();
        const tenSecondsAgo = now - 10000;
        const recentUpdates = updateTimes.filter(time => time > tenSecondsAgo);
        
        const updateRate = recentUpdates.length > 1 
          ? Math.round((recentUpdates.length - 1) * 1000 / (recentUpdates[recentUpdates.length - 1] - recentUpdates[0]))
          : 0;
        
        console.log(`📊 UPDATE RATE: ${updateRate}/s with ${recentUpdates.length} updates`);
        
        // Server should be sending updates at reasonable rate
        expect(updateRate).toBeGreaterThan(0);
        expect(updateRate).toBeLessThan(100); // Not too fast
        
        done();
      }
    });
    
    // Timeout after 20 seconds
    setTimeout(() => {
      done(new Error(`Only received ${updateCount} updates in 20 seconds`));
    }, 20000);
  });
  
  test('should detect when mobs stop moving', (done) => {
    let lastMobPositions: Map<string, {x: number, y: number}> = new Map();
    let stuckMobs = 0;
    let updateCount = 0;
    
    room.onStateChange((state: GameState) => {
      updateCount++;
      
      // Check mob positions every 10 updates
      if (updateCount % 10 === 0) {
        let currentStuckMobs = 0;
        
        state.mobs.forEach((mob, id) => {
          const lastPos = lastMobPositions.get(id);
          const currentPos = { x: mob.x, y: mob.y };
          
          if (lastPos) {
            const distanceMoved = Math.sqrt(
              (currentPos.x - lastPos.x) ** 2 + (currentPos.y - lastPos.y) ** 2
            );
            
            // Mob is stuck if it moved less than 0.1 units
            if (distanceMoved < 0.1) {
              currentStuckMobs++;
            }
          }
          
          lastMobPositions.set(id, currentPos);
        });
        
        console.log(`🔍 Update ${updateCount}: ${currentStuckMobs}/${state.mobs.size} mobs stuck`);
        
        if (currentStuckMobs > state.mobs.size * 0.5) {
          stuckMobs++;
        } else {
          stuckMobs = 0; // Reset if mobs are moving
        }
        
        // If more than half the mobs are stuck for 3 consecutive checks
        if (stuckMobs >= 3) {
          done(new Error(`Mobs are stuck: ${currentStuckMobs}/${state.mobs.size} not moving`));
        }
      }
      
      // Test passes if we get 50 updates without major sticking
      if (updateCount >= 50) {
        console.log(`✅ Test passed: ${updateCount} updates, no major mob sticking detected`);
        done();
      }
    });
    
    // Timeout after 30 seconds
    setTimeout(() => {
      done(new Error(`Test timed out after 30 seconds with ${updateCount} updates`));
    }, 30000);
  });
});

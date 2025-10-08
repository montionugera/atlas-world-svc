/**
 * AI Performance Tests
 * Test AI system performance and scalability
 */

import { MobAIModule } from '../ai/MobAIModule';
import { AIWorldInterface } from '../ai/AIWorldInterface';
import { GameState } from '../schemas/GameState';
import { Mob } from '../schemas/Mob';

describe('AI Performance Tests', () => {
  let gameState: GameState;
  let aiModule: MobAIModule;
  let worldInterface: AIWorldInterface;

  beforeEach(() => {
    gameState = new GameState('test-map');
    worldInterface = gameState.worldInterface;
    aiModule = new MobAIModule(worldInterface);
  });

  afterEach(() => {
    if (aiModule) {
      aiModule.stop();
    }
  });

  describe('AI Update Performance', () => {
    test('should update 100 mobs in under 100ms', () => {
      const mobCount = 100;
      const mobs: Mob[] = [];
      
      // Create 100 mobs
      for (let i = 0; i < mobCount; i++) {
        const mob = new Mob({ id: `mob-${i}`, x: Math.random() * 80 + 10, y: Math.random() * 80 + 10, vx: 0, vy: 0 });
        mobs.push(mob);
        
        aiModule.registerMob(mob, {
          behaviors: ['wander'],
          perception: { range: 50, fov: 120 },
          memory: { duration: 5000 }
        });
      }
      
      // Measure update time
      const startTime = performance.now();
      aiModule.updateAll();
      const endTime = performance.now();
      
      const updateTime = endTime - startTime;
      expect(updateTime).toBeLessThan(100); // Should be under 100ms
      
      console.log(`⚡ AI Performance: ${mobCount} mobs updated in ${updateTime.toFixed(2)}ms`);
    });

    test('should maintain consistent performance over multiple updates', () => {
      const mobCount = 50;
      const updateCount = 20;
      const mobs: Mob[] = [];
      
      // Create mobs
      for (let i = 0; i < mobCount; i++) {
        const mob = new Mob({ id: `mob-${i}`, x: Math.random() * 80 + 10, y: Math.random() * 80 + 10, vx: 0, vy: 0 });
        mobs.push(mob);
        
        aiModule.registerMob(mob, {
          behaviors: ['wander'],
          perception: { range: 50, fov: 120 },
          memory: { duration: 5000 }
        });
      }
      
      const updateTimes: number[] = [];
      
      // Measure multiple updates
      for (let i = 0; i < updateCount; i++) {
        const startTime = performance.now();
        aiModule.updateAll();
        const endTime = performance.now();
        
        updateTimes.push(endTime - startTime);
      }
      
      // Calculate statistics
      const avgUpdateTime = updateTimes.reduce((sum, time) => sum + time, 0) / updateTimes.length;
      const maxUpdateTime = Math.max(...updateTimes);
      const minUpdateTime = Math.min(...updateTimes);
      
      expect(avgUpdateTime).toBeLessThan(50); // Average should be under 50ms
      expect(maxUpdateTime).toBeLessThan(100); // Max should be under 100ms
      
      console.log(`📊 AI Performance Stats: Avg=${avgUpdateTime.toFixed(2)}ms, Max=${maxUpdateTime.toFixed(2)}ms, Min=${minUpdateTime.toFixed(2)}ms`);
    });
  });

  describe('AI Memory Performance', () => {
    test('should handle memory efficiently', () => {
      const mobCount = 200;
      const mobs: Mob[] = [];
      
      // Create many mobs
      for (let i = 0; i < mobCount; i++) {
        const mob = new Mob({ id: `mob-${i}`, x: Math.random() * 80 + 10, y: Math.random() * 80 + 10, vx: 0, vy: 0 });
        mobs.push(mob);
        
        aiModule.registerMob(mob, {
          behaviors: ['wander'],
          perception: { range: 50, fov: 120 },
          memory: { duration: 5000 }
        });
      }
      
      // Update multiple times to build up memory
      for (let i = 0; i < 10; i++) {
        aiModule.updateAll();
      }
      
      const stats = aiModule.getStats();
      expect(stats.memoryUsage).toBeGreaterThan(0);
      expect(stats.memoryUsage).toBeLessThan(1000); // Should be reasonable
      
      console.log(`🧠 AI Memory Usage: ${stats.memoryUsage.toFixed(2)} units for ${mobCount} mobs`);
    });
  });

  describe('AI Scalability', () => {
    test('should scale linearly with mob count', () => {
      const mobCounts = [10, 25, 50, 100];
      const results: { mobCount: number; updateTime: number }[] = [];
      
      for (const mobCount of mobCounts) {
        const mobs: Mob[] = [];
        
        // Create mobs
        for (let i = 0; i < mobCount; i++) {
          const mob = new Mob({ id: `mob-${i}`, x: Math.random() * 80 + 10, y: Math.random() * 80 + 10, vx: 0, vy: 0 });
          mobs.push(mob);
          
          aiModule.registerMob(mob, {
            behaviors: ['wander'],
            perception: { range: 50, fov: 120 },
            memory: { duration: 5000 }
          });
        }
        
        // Measure update time
        const startTime = performance.now();
        aiModule.updateAll();
        const endTime = performance.now();
        
        const updateTime = endTime - startTime;
        results.push({ mobCount, updateTime });
        
        // Clear for next test
        for (let i = 0; i < mobCount; i++) {
          aiModule.unregisterMob(`mob-${i}`);
        }
      }
      
      // Check that performance scales reasonably
      for (let i = 1; i < results.length; i++) {
        const prevResult = results[i - 1];
        const currResult = results[i];
        
        const timeRatio = currResult.updateTime / prevResult.updateTime;
        const mobRatio = currResult.mobCount / prevResult.mobCount;
        
        // Time should not increase more than 2x the mob increase
        expect(timeRatio).toBeLessThan(mobRatio * 2);
      }
      
      console.log(`📈 AI Scalability Results:`);
      results.forEach(result => {
        console.log(`  ${result.mobCount} mobs: ${result.updateTime.toFixed(2)}ms`);
      });
    });
  });

  describe('AI Behavior Performance', () => {
    test('should handle behavior switching efficiently', () => {
      const mob = new Mob({ id: 'test-mob', x: 50, y: 50, vx: 0, vy: 0 });
      
      aiModule.registerMob(mob, {
        behaviors: ['wander', 'idle', 'boundaryAware'],
        perception: { range: 50, fov: 120 },
        memory: { duration: 5000 }
      });
      
      const updateTimes: number[] = [];
      
      // Update many times to test behavior switching
      for (let i = 0; i < 100; i++) {
        const startTime = performance.now();
        aiModule.updateAll();
        const endTime = performance.now();
        
        updateTimes.push(endTime - startTime);
      }
      
      const avgUpdateTime = updateTimes.reduce((sum, time) => sum + time, 0) / updateTimes.length;
      expect(avgUpdateTime).toBeLessThan(10); // Should be very fast
      
      console.log(`🎯 AI Behavior Performance: ${avgUpdateTime.toFixed(3)}ms average`);
    });
  });

  describe('AI Stress Testing', () => {
    test('should handle stress test with many updates', () => {
      const mobCount = 50;
      const updateCount = 100;
      const mobs: Mob[] = [];
      
      // Create mobs
      for (let i = 0; i < mobCount; i++) {
        const mob = new Mob({ id: `mob-${i}`, x: Math.random() * 80 + 10, y: Math.random() * 80 + 10, vx: 0, vy: 0 });
        mobs.push(mob);
        
        aiModule.registerMob(mob, {
          behaviors: ['wander'],
          perception: { range: 50, fov: 120 },
          memory: { duration: 5000 }
        });
      }
      
      const startTime = performance.now();
      
      // Stress test with many updates
      for (let i = 0; i < updateCount; i++) {
        aiModule.updateAll();
      }
      
      const endTime = performance.now();
      const totalTime = endTime - startTime;
      const avgTimePerUpdate = totalTime / updateCount;
      
      expect(totalTime).toBeLessThan(1000); // Should complete in under 1 second
      expect(avgTimePerUpdate).toBeLessThan(10); // Average should be under 10ms
      
      console.log(`💪 AI Stress Test: ${updateCount} updates in ${totalTime.toFixed(2)}ms (avg: ${avgTimePerUpdate.toFixed(2)}ms)`);
    });
  });
});

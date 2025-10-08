/**
 * AI Integration Tests
 * Test the full AI system integration with game state
 */

import { MobAIModule } from '../ai/MobAIModule';
import { AIWorldInterface } from '../ai/AIWorldInterface';
import { GameState } from '../schemas/GameState';
import { Mob } from '../schemas/Mob';
import { Player } from '../schemas/Player';

describe('AI Integration Tests', () => {
  let gameState: GameState;
  let aiModule: MobAIModule;
  let worldInterface: AIWorldInterface;

  beforeEach(() => {
    // Create a fresh game state
    gameState = new GameState('test-map');
    worldInterface = gameState.worldInterface;
    aiModule = new MobAIModule(worldInterface);
  });

  afterEach(() => {
    if (aiModule) {
      aiModule.stop();
    }
  });

  describe('AI Module Lifecycle', () => {
    test('should start and stop AI module', () => {
      expect(aiModule.isAIModuleRunning()).toBe(false);
      
      aiModule.start();
      expect(aiModule.isAIModuleRunning()).toBe(true);
      
      aiModule.stop();
      expect(aiModule.isAIModuleRunning()).toBe(false);
    });

    test('should register and unregister mobs', () => {
      const mob = new Mob({ id: 'test-mob', x: 50, y: 50, vx: 0, vy: 0 });
      
      aiModule.registerMob(mob, {
        behaviors: ['wander'],
        perception: { range: 50, fov: 120 },
        memory: { duration: 5000 }
      });
      
      expect(aiModule.getStats().mobCount).toBe(1);
      
      aiModule.unregisterMob('test-mob');
      expect(aiModule.getStats().mobCount).toBe(0);
    });
  });

  describe('AI Decision Making', () => {
    test('should make AI decisions for registered mobs', () => {
      const mob = new Mob({ id: 'test-mob', x: 50, y: 50, vx: 0, vy: 0 });
      
      aiModule.registerMob(mob, {
        behaviors: ['wander'],
        perception: { range: 50, fov: 120 },
        memory: { duration: 5000 }
      });
      
      // Update AI module
      aiModule.updateAll();
      
      // Check if AI decision was made
      const aiDecision = worldInterface.getAIDecision('test-mob');
      expect(aiDecision).toBeDefined();
      expect(aiDecision?.behavior).toBeDefined();
      expect(aiDecision?.velocity).toBeDefined();
    });

    test('should apply AI decisions to mobs', () => {
      const mob = new Mob({ id: 'test-mob', x: 50, y: 50, vx: 0, vy: 0 });
      const initialVx = mob.vx;
      const initialVy = mob.vy;
      
      aiModule.registerMob(mob, {
        behaviors: ['wander'],
        perception: { range: 50, fov: 120 },
        memory: { duration: 5000 }
      });
      
      // Update AI module
      aiModule.updateAll();
      
      // Check if mob velocity changed
      expect(mob.vx).not.toBe(initialVx);
      expect(mob.vy).not.toBe(initialVy);
    });
  });

  describe('AI Performance', () => {
    test('should handle multiple mobs efficiently', () => {
      const mobCount = 10;
      const mobs: Mob[] = [];
      
      // Create multiple mobs
      for (let i = 0; i < mobCount; i++) {
        const mob = new Mob({ id: `mob-${i}`, x: Math.random() * 80 + 10, y: Math.random() * 80 + 10, vx: 0, vy: 0 });
        mobs.push(mob);
        
        aiModule.registerMob(mob, {
          behaviors: ['wander'],
          perception: { range: 50, fov: 120 },
          memory: { duration: 5000 }
        });
      }
      
      expect(aiModule.getStats().mobCount).toBe(mobCount);
      
      // Update AI module multiple times
      const startTime = performance.now();
      for (let i = 0; i < 10; i++) {
        aiModule.updateAll();
      }
      const endTime = performance.now();
      
      const updateTime = endTime - startTime;
      expect(updateTime).toBeLessThan(100); // Should be fast
      
      // Check performance metrics
      const metrics = aiModule.getPerformanceMetrics();
      expect(metrics.isRunning).toBe(false); // Not started in this test
      expect(metrics.totalUpdates).toBe(0);
    });

    test('should maintain performance with many mobs', () => {
      const mobCount = 50;
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
      
      // Update AI module
      const startTime = performance.now();
      aiModule.updateAll();
      const endTime = performance.now();
      
      const updateTime = endTime - startTime;
      expect(updateTime).toBeLessThan(50); // Should handle 50 mobs quickly
    });
  });

  describe('AI State Management', () => {
    test('should track AI statistics', () => {
      const mob = new Mob({ id: 'test-mob', x: 50, y: 50, vx: 0, vy: 0 });
      
      aiModule.registerMob(mob, {
        behaviors: ['wander'],
        perception: { range: 50, fov: 120 },
        memory: { duration: 5000 }
      });
      
      const stats = aiModule.getStats();
      expect(stats.mobCount).toBe(1);
      expect(stats.averageUpdateTime).toBeGreaterThanOrEqual(0);
      expect(stats.behaviorDistribution).toBeDefined();
      expect(stats.memoryUsage).toBeGreaterThanOrEqual(0);
    });

    test('should update behavior distribution', () => {
      const mob = new Mob({ id: 'test-mob', x: 50, y: 50, vx: 0, vy: 0 });
      
      aiModule.registerMob(mob, {
        behaviors: ['wander'],
        perception: { range: 50, fov: 120 },
        memory: { duration: 5000 }
      });
      
      // Update AI module
      aiModule.updateAll();
      
      const stats = aiModule.getStats();
      expect(stats.behaviorDistribution).toBeDefined();
      expect(Object.keys(stats.behaviorDistribution).length).toBeGreaterThan(0);
    });
  });

  describe('AI Memory System', () => {
    test('should maintain AI memory', () => {
      const mob = new Mob({ id: 'test-mob', x: 50, y: 50, vx: 0, vy: 0 });
      
      aiModule.registerMob(mob, {
        behaviors: ['wander'],
        perception: { range: 50, fov: 120 },
        memory: { duration: 5000 }
      });
      
      // Update AI module multiple times
      for (let i = 0; i < 5; i++) {
        aiModule.updateAll();
      }
      
      const stats = aiModule.getStats();
      expect(stats.memoryUsage).toBeGreaterThan(0);
    });
  });

  describe('AI Error Handling', () => {
    test('should handle errors gracefully', () => {
      const mob = new Mob({ id: 'test-mob', x: 50, y: 50, vx: 0, vy: 0 });
      
      aiModule.registerMob(mob, {
        behaviors: ['wander'],
        perception: { range: 50, fov: 120 },
        memory: { duration: 5000 }
      });
      
      // This should not throw an error
      expect(() => {
        aiModule.updateAll();
      }).not.toThrow();
    });

    test('should handle invalid mob registration', () => {
      // This should not throw an error
      expect(() => {
        aiModule.registerMob(null as any, {
          behaviors: ['wander'],
          perception: { range: 50, fov: 120 },
          memory: { duration: 5000 }
        });
      }).not.toThrow();
    });
  });
});

/**
 * AI Behavior Switching Tests
 * Test behavior priority and switching logic
 */

import { WanderBehavior } from '../ai/behaviors/WanderBehavior';
import { IdleBehavior } from '../ai/behaviors/IdleBehavior';
import { BoundaryAwareBehavior } from '../ai/behaviors/BoundaryAwareBehavior';
import { Mob } from '../schemas/Mob';
import { Player } from '../schemas/Player';
import { AIContext } from '../ai/core/AIContext';
import { AIState } from '../ai/core/AIState';

describe('AI Behavior Switching Tests', () => {
  let testMob: Mob;
  let testContext: AIContext;
  let wanderBehavior: WanderBehavior;
  let idleBehavior: IdleBehavior;
  let boundaryBehavior: BoundaryAwareBehavior;

  beforeEach(() => {
    testMob = new Mob({ id: 'test-mob', x: 50, y: 50, vx: 0, vy: 0 });
    testContext = {
      gameState: {} as any,
      physicsManager: null,
      selfMob: testMob,
      nearbyPlayers: [],
      nearbyMobs: [],
      threats: [],
      worldBounds: { width: 100, height: 100 },
      currentState: AIState.IDLE,
      memory: {
        lastSeenPlayer: undefined,
        knownThreats: new Map(),
        behaviorHistory: []
      }
    };
    
    wanderBehavior = new WanderBehavior();
    idleBehavior = new IdleBehavior();
    boundaryBehavior = new BoundaryAwareBehavior();
  });

  describe('Behavior Priority System', () => {
    test('should respect behavior priorities', () => {
      expect(boundaryBehavior.priority).toBeGreaterThan(wanderBehavior.priority);
      expect(wanderBehavior.priority).toBeGreaterThan(idleBehavior.priority);
      expect(boundaryBehavior.priority).toBeGreaterThan(idleBehavior.priority);
    });

    test('should select highest priority behavior when multiple are available', () => {
      // Test with no players nearby (idle can execute)
      expect(idleBehavior.canExecute(testContext)).toBe(true);
      expect(wanderBehavior.canExecute(testContext)).toBe(true);
      
      // Boundary behavior should have highest priority
      expect(boundaryBehavior.priority).toBe(3);
      expect(wanderBehavior.priority).toBe(1);
      expect(idleBehavior.priority).toBe(0);
    });
  });

  describe('Behavior Execution Logic', () => {
    test('should execute wander when no other behaviors are active', () => {
      const decision = wanderBehavior.execute(testMob, testContext);
      
      expect(decision).toBeDefined();
      expect(decision.behavior).toBe('wander');
      expect(decision.velocity).toBeDefined();
      expect(typeof decision.velocity.x).toBe('number');
      expect(typeof decision.velocity.y).toBe('number');
    });

    test('should execute idle when no players nearby', () => {
      const decision = idleBehavior.execute(testMob, testContext);
      
      expect(decision).toBeDefined();
      expect(decision.behavior).toBe('idle');
      expect(decision.velocity).toBeDefined();
    });

    test('should execute boundary avoidance when near boundaries', () => {
      // Position mob near left boundary
      testMob.x = 5;
      testMob.y = 50;
      
      const decision = boundaryBehavior.execute(testMob, testContext);
      
      expect(decision).toBeDefined();
      expect(decision.behavior).toBe('boundaryAware');
      expect(decision.velocity.x).toBeGreaterThan(0); // Should move away from left boundary
    });
  });

  describe('Behavior State Transitions', () => {
    test('should transition from idle to wander when players appear', () => {
      // Start with idle behavior
      expect(idleBehavior.canExecute(testContext)).toBe(true);
      
      // Add nearby player
      const testPlayer = new Player('s1', 'Test Player');
      testPlayer.x = 55;
      testPlayer.y = 55;
      testContext.nearbyPlayers = [testPlayer];
      
      // Idle should no longer be available
      expect(idleBehavior.canExecute(testContext)).toBe(false);
      
      // Wander should still be available
      expect(wanderBehavior.canExecute(testContext)).toBe(true);
    });

    test('should transition to boundary avoidance when near boundaries', () => {
      // Position mob near boundary
      testMob.x = 5;
      testMob.y = 50;
      
      // Boundary behavior should be available
      expect(boundaryBehavior.canExecute(testContext)).toBe(true);
      
      // Should have higher priority than wander
      expect(boundaryBehavior.priority).toBeGreaterThan(wanderBehavior.priority);
    });
  });

  describe('Behavior Decision Consistency', () => {
    test('should make consistent decisions for same context', () => {
      const decisions: any[] = [];
      
      // Execute same behavior multiple times with same context
      for (let i = 0; i < 5; i++) {
        const decision = wanderBehavior.execute(testMob, testContext);
        decisions.push(decision);
      }
      
      // All decisions should have same behavior name
      decisions.forEach(decision => {
        expect(decision.behavior).toBe('wander');
        expect(decision.velocity).toBeDefined();
      });
    });

    test('should make different decisions for different contexts', () => {
      // Test with mob at center
      testMob.x = 50;
      testMob.y = 50;
      const centerDecision = boundaryBehavior.execute(testMob, testContext);
      
      // Test with mob near boundary
      testMob.x = 5;
      testMob.y = 50;
      const boundaryDecision = boundaryBehavior.execute(testMob, testContext);
      
      // Decisions should be different (at least one component should differ)
      const xDifferent = centerDecision.velocity.x !== boundaryDecision.velocity.x;
      const yDifferent = centerDecision.velocity.y !== boundaryDecision.velocity.y;
      expect(xDifferent || yDifferent).toBe(true);
    });
  });

  describe('Behavior Performance', () => {
    test('should execute behaviors quickly', () => {
      const behaviors = [wanderBehavior, idleBehavior, boundaryBehavior];
      const executionTimes: number[] = [];
      
      behaviors.forEach(behavior => {
        const startTime = performance.now();
        behavior.execute(testMob, testContext);
        const endTime = performance.now();
        
        executionTimes.push(endTime - startTime);
      });
      
      // All behaviors should execute quickly
      executionTimes.forEach(time => {
        expect(time).toBeLessThan(10); // Should be under 10ms
      });
      
      const avgTime = executionTimes.reduce((sum, time) => sum + time, 0) / executionTimes.length;
      console.log(`⚡ Behavior Execution Time: ${avgTime.toFixed(3)}ms average`);
    });

    test('should handle rapid behavior switching', () => {
      const behaviors = [wanderBehavior, idleBehavior, boundaryBehavior];
      const switchCount = 100;
      const switchTimes: number[] = [];
      
      for (let i = 0; i < switchCount; i++) {
        const behavior = behaviors[i % behaviors.length];
        
        const startTime = performance.now();
        behavior.execute(testMob, testContext);
        const endTime = performance.now();
        
        switchTimes.push(endTime - startTime);
      }
      
      const avgSwitchTime = switchTimes.reduce((sum, time) => sum + time, 0) / switchTimes.length;
      expect(avgSwitchTime).toBeLessThan(5); // Should be very fast
      
      console.log(`🔄 Behavior Switching: ${avgSwitchTime.toFixed(3)}ms average for ${switchCount} switches`);
    });
  });

  describe('Behavior Error Handling', () => {
    test('should handle invalid mob data gracefully', () => {
      const invalidMob = null as any;
      
      expect(() => {
        wanderBehavior.execute(invalidMob, testContext);
      }).not.toThrow();
    });

    test('should handle invalid context gracefully', () => {
      const invalidContext = null as any;
      
      expect(() => {
        wanderBehavior.execute(testMob, invalidContext);
      }).not.toThrow();
    });

    test('should handle edge case positions', () => {
      const edgePositions = [
        { x: 0, y: 0 },
        { x: 100, y: 100 },
        { x: -10, y: -10 },
        { x: 200, y: 200 }
      ];
      
      edgePositions.forEach(pos => {
        testMob.x = pos.x;
        testMob.y = pos.y;
        
        expect(() => {
          wanderBehavior.execute(testMob, testContext);
          idleBehavior.execute(testMob, testContext);
          boundaryBehavior.execute(testMob, testContext);
        }).not.toThrow();
      });
    });
  });
});

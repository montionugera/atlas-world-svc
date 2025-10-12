/**
 * Boundary Avoidance Tests
 * Test that mobs intelligently avoid boundaries instead of bouncing off them
 */

import { Mob } from '../schemas/Mob';
import { GameState } from '../schemas/GameState';

describe('Boundary Avoidance Tests', () => {
  let gameState: GameState;
  let testMob: Mob;

  beforeEach(() => {
    gameState = new GameState();
    testMob = new Mob({ 
      id: 'test-mob', 
      x: 10,  // Near left boundary
      y: 150, 
      vx: 0, 
      vy: 0 
    });
    
    gameState.mobs.set(testMob.id, testMob);
  });

  describe('Boundary Detection', () => {
    test('should detect when mob is near left boundary', () => {
      testMob.x = 15; // Within 30px threshold
      
      const env = {
        nearestPlayer: null,
        distanceToNearestPlayer: Infinity,
        nearBoundary: true,
        worldBounds: { width: 400, height: 300 }
      };
      
      testMob.decideBehavior(env);
      
      expect(testMob.currentBehavior).toBe('avoidBoundary');
    });

    test('should detect when mob is near right boundary', () => {
      testMob.x = 385; // Within 30px of right boundary (400-30=370)
      
      const env = {
        nearestPlayer: null,
        distanceToNearestPlayer: Infinity,
        nearBoundary: true,
        worldBounds: { width: 400, height: 300 }
      };
      
      testMob.decideBehavior(env);
      
      expect(testMob.currentBehavior).toBe('avoidBoundary');
    });

    test('should detect when mob is near top boundary', () => {
      testMob.y = 15; // Within 30px of top boundary
      
      const env = {
        nearestPlayer: null,
        distanceToNearestPlayer: Infinity,
        nearBoundary: true,
        worldBounds: { width: 400, height: 300 }
      };
      
      testMob.decideBehavior(env);
      
      expect(testMob.currentBehavior).toBe('avoidBoundary');
    });

    test('should detect when mob is near bottom boundary', () => {
      testMob.y = 285; // Within 30px of bottom boundary (300-30=270)
      
      const env = {
        nearestPlayer: null,
        distanceToNearestPlayer: Infinity,
        nearBoundary: true,
        worldBounds: { width: 400, height: 300 }
      };
      
      testMob.decideBehavior(env);
      
      expect(testMob.currentBehavior).toBe('avoidBoundary');
    });

    test('should not trigger boundary avoidance when far from boundaries', () => {
      testMob.x = 200; // Center of world
      testMob.y = 150;
      
      const env = {
        nearestPlayer: null,
        distanceToNearestPlayer: Infinity,
        nearBoundary: false,
        worldBounds: { width: 400, height: 300 }
      };
      
      testMob.decideBehavior(env);
      
      expect(testMob.currentBehavior).toBe('wander');
    });
  });

  describe('Boundary Avoidance Movement', () => {
    test('should move away from left boundary', () => {
      testMob.x = 10; // Very close to left boundary
      testMob.currentBehavior = 'avoidBoundary';
      
      const velocity = testMob.computeDesiredVelocity({
        nearestPlayer: null,
        distanceToNearestPlayer: Infinity,
        maxSpeed: 24,
        worldBounds: { width: 400, height: 300 }
      });
      
      // Should move right (positive X)
      expect(velocity.x).toBeGreaterThan(0);
      expect(velocity.y).toBeCloseTo(0, 1); // Should be mostly horizontal
    });

    test('should move away from right boundary', () => {
      testMob.x = 390; // Very close to right boundary
      testMob.currentBehavior = 'avoidBoundary';
      
      const velocity = testMob.computeDesiredVelocity({
        nearestPlayer: null,
        distanceToNearestPlayer: Infinity,
        maxSpeed: 24,
        worldBounds: { width: 400, height: 300 }
      });
      
      // Should move left (negative X)
      expect(velocity.x).toBeLessThan(0);
      expect(velocity.y).toBeCloseTo(0, 1); // Should be mostly horizontal
    });

    test('should move away from top boundary', () => {
      testMob.x = 200; // Center horizontally to avoid left/right boundary effects
      testMob.y = 10; // Very close to top boundary
      testMob.currentBehavior = 'avoidBoundary';
      
      const velocity = testMob.computeDesiredVelocity({
        nearestPlayer: null,
        distanceToNearestPlayer: Infinity,
        maxSpeed: 24,
        worldBounds: { width: 400, height: 300 }
      });
      
      // Should move down (positive Y)
      expect(velocity.y).toBeGreaterThan(0);
      expect(velocity.x).toBeCloseTo(0, 1); // Should be mostly vertical
    });

    test('should move away from bottom boundary', () => {
      testMob.x = 200; // Center horizontally to avoid left/right boundary effects
      testMob.y = 290; // Very close to bottom boundary
      testMob.currentBehavior = 'avoidBoundary';
      
      const velocity = testMob.computeDesiredVelocity({
        nearestPlayer: null,
        distanceToNearestPlayer: Infinity,
        maxSpeed: 24,
        worldBounds: { width: 400, height: 300 }
      });
      
      // Should move up (negative Y)
      expect(velocity.y).toBeLessThan(0);
      expect(velocity.x).toBeCloseTo(0, 1); // Should be mostly vertical
    });

    test('should move toward center when in corner', () => {
      testMob.x = 5;  // Very close to left boundary
      testMob.y = 5;  // Very close to top boundary
      testMob.currentBehavior = 'avoidBoundary';
      
      const velocity = testMob.computeDesiredVelocity({
        nearestPlayer: null,
        distanceToNearestPlayer: Infinity,
        maxSpeed: 24,
        worldBounds: { width: 400, height: 300 }
      });
      
      // Should move toward center (positive X and Y)
      expect(velocity.x).toBeGreaterThan(0);
      expect(velocity.y).toBeGreaterThan(0);
    });
  });

  describe('Behavior Priority', () => {
    test('boundary avoidance should have higher priority than attack', () => {
      testMob.x = 10; // Near boundary
      
      const env = {
        nearestPlayer: { x: 15, y: 150, id: 'player1' },
        distanceToNearestPlayer: 5, // Very close (would normally trigger attack)
        nearBoundary: true,
        worldBounds: { width: 400, height: 300 }
      };
      
      testMob.decideBehavior(env);
      
      // Should choose boundary avoidance over attack
      expect(testMob.currentBehavior).toBe('avoidBoundary');
    });

    test('boundary avoidance should have higher priority than chase', () => {
      testMob.x = 10; // Near boundary
      
      const env = {
        nearestPlayer: { x: 20, y: 150, id: 'player1' },
        distanceToNearestPlayer: 15, // Medium distance (would normally trigger chase)
        nearBoundary: true,
        worldBounds: { width: 400, height: 300 }
      };
      
      testMob.decideBehavior(env);
      
      // Should choose boundary avoidance over chase
      expect(testMob.currentBehavior).toBe('avoidBoundary');
    });

    test('should return to normal behavior when away from boundary', () => {
      testMob.x = 200; // Center of world
      testMob.y = 150;
      
      const env = {
        nearestPlayer: { x: 20, y: 150, id: 'player1' },
        distanceToNearestPlayer: 15, // Medium distance
        nearBoundary: false,
        worldBounds: { width: 400, height: 300 }
      };
      
      testMob.decideBehavior(env);
      
      // Should choose chase (normal behavior)
      expect(testMob.currentBehavior).toBe('chase');
    });
  });

  describe('Edge Cases', () => {
    test('should handle mob at exact boundary', () => {
      testMob.x = 0; // Exactly at left boundary
      testMob.currentBehavior = 'avoidBoundary';
      
      const velocity = testMob.computeDesiredVelocity({
        nearestPlayer: null,
        distanceToNearestPlayer: Infinity,
        maxSpeed: 24,
        worldBounds: { width: 400, height: 300 }
      });
      
      // Should have strong rightward movement
      expect(velocity.x).toBeGreaterThan(10);
    });

    test('should handle mob at world center', () => {
      testMob.x = 200; // Center
      testMob.y = 150;
      testMob.currentBehavior = 'avoidBoundary';
      
      const velocity = testMob.computeDesiredVelocity({
        nearestPlayer: null,
        distanceToNearestPlayer: Infinity,
        maxSpeed: 24,
        worldBounds: { width: 400, height: 300 }
      });
      
      // Should move toward center (no movement needed)
      expect(velocity.x).toBeCloseTo(0, 1);
      expect(velocity.y).toBeCloseTo(0, 1);
    });

    test('should handle very small world bounds', () => {
      testMob.x = 5;
      testMob.y = 5;
      testMob.currentBehavior = 'avoidBoundary';
      
      const velocity = testMob.computeDesiredVelocity({
        nearestPlayer: null,
        distanceToNearestPlayer: Infinity,
        maxSpeed: 24,
        worldBounds: { width: 20, height: 20 }
      });
      
      // Should still work with small bounds
      expect(velocity.x).toBeGreaterThan(0);
      expect(velocity.y).toBeGreaterThan(0);
    });
  });
});

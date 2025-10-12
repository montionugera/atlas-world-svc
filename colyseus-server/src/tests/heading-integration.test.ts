/**
 * Heading System Integration Tests
 * Test the heading system in realistic game scenarios with physics collisions
 */

import { Mob } from '../schemas/Mob';
import { Player } from '../schemas/Player';
import { GameState } from '../schemas/GameState';

describe('Heading System Integration Tests', () => {
  let gameState: GameState;
  let testMob: Mob;
  let testPlayer: Player;

  beforeEach(() => {
    gameState = new GameState();
    testMob = new Mob({ 
      id: 'test-mob', 
      x: 100, 
      y: 100, 
      vx: 0, 
      vy: 0 
    });
    testPlayer = new Player('test-session', 'TestPlayer', 50, 50);
    
    // Add entities to game state
    gameState.mobs.set(testMob.id, testMob);
    gameState.players.set(testPlayer.id, testPlayer);
  });

  describe('Mob-Player Interaction Scenarios', () => {
    test('mob should maintain heading to player during chase despite physics', () => {
      // Set up chase scenario
      testMob.currentBehavior = 'chase';
      testMob.currentChaseTarget = testPlayer.id;
      
      // Simulate physics collision that changes mob velocity
      testMob.vx = -15; // Physics pushes mob left
      testMob.vy = 10;  // Physics pushes mob down
      
      // Update mob heading through game state
      gameState.updateMobs();
      
      // Mob should have a valid heading (not NaN or undefined)
      expect(testMob.heading).toBeDefined();
      expect(typeof testMob.heading).toBe('number');
      expect(!isNaN(testMob.heading)).toBe(true);
    });

    test('mob should maintain heading to player during attack despite physics', () => {
      // Set up attack scenario
      testMob.currentBehavior = 'attack';
      testMob.currentAttackTarget = testPlayer.id;
      
      // Simulate physics collision
      testMob.vx = 20;  // Physics pushes mob right
      testMob.vy = -5;  // Physics pushes mob up
      
      // Update mob heading
      gameState.updateMobs();
      
      // Mob should have a valid heading
      expect(testMob.heading).toBeDefined();
      expect(typeof testMob.heading).toBe('number');
      expect(!isNaN(testMob.heading)).toBe(true);
    });

    test('mob should maintain wander heading despite physics', () => {
      // Set up wander scenario
      testMob.currentBehavior = 'wander';
      testMob.wanderTargetX = 150;
      testMob.wanderTargetY = 150;
      
      // Simulate physics collision
      testMob.vx = -10; // Physics pushes mob left
      testMob.vy = -8;  // Physics pushes mob up
      
      // Update mob heading
      gameState.updateMobs();
      
      // Mob should have a valid heading
      expect(testMob.heading).toBeDefined();
      expect(typeof testMob.heading).toBe('number');
      expect(!isNaN(testMob.heading)).toBe(true);
    });
  });

  describe('Player Input Resilience', () => {
    test('player should maintain input heading despite physics collision', () => {
      // Set up player input
      testPlayer.input.setMovement(1, 0); // Wants to go right
      
      // Simulate physics collision
      testPlayer.vx = -8;  // Physics pushes player left
      testPlayer.vy = 12;   // Physics pushes player down
      
      // Update player
      testPlayer.update(16);
      
      // Player should still point at input direction (right)
      expect(testPlayer.heading).toBeCloseTo(0, 5);
    });

    test('player should maintain diagonal input heading despite physics', () => {
      // Set up diagonal input
      testPlayer.input.setMovement(1, 1); // Wants to go right-down
      
      // Simulate physics collision
      testPlayer.vx = -5;  // Physics pushes left
      testPlayer.vy = -3;  // Physics pushes up
      
      // Update player
      testPlayer.update(16);
      
      // Player should still point at input direction (right-down)
      const expectedHeading = Math.atan2(1, 1); // 45 degrees
      expect(testPlayer.heading).toBeCloseTo(expectedHeading, 5);
    });

    test('player should handle input changes during physics collision', () => {
      // Initial input
      testPlayer.input.setMovement(1, 0); // Right
      testPlayer.update(16);
      expect(testPlayer.heading).toBeCloseTo(0, 5);
      
      // Physics collision
      testPlayer.vx = -10;
      testPlayer.vy = 5;
      
      // Change input direction
      testPlayer.input.setMovement(0, 1); // Down
      testPlayer.update(16);
      
      // Should point at new input direction (down)
      expect(testPlayer.heading).toBeCloseTo(Math.PI / 2, 5);
    });
  });

  describe('Rapid Physics Changes', () => {
    test('should maintain stable heading during rapid physics changes', () => {
      // Set up mob with stable target
      testMob.currentBehavior = 'chase';
      testMob.currentChaseTarget = testPlayer.id;
      
      const headings: number[] = [];
      
      // Simulate rapid physics changes
      for (let i = 0; i < 20; i++) {
        // Random physics velocity changes
        testMob.vx = (Math.random() - 0.5) * 30;
        testMob.vy = (Math.random() - 0.5) * 30;
        
        // Update through game state
        gameState.updateMobs();
        headings.push(testMob.heading);
      }
      
      // All headings should be valid numbers
      headings.forEach(heading => {
        expect(heading).toBeDefined();
        expect(typeof heading).toBe('number');
        expect(!isNaN(heading)).toBe(true);
      });
    });

    test('should handle rapid input changes during physics', () => {
      // Test specific input directions
      const testCases = [
        { input: [1, 0], expected: 0 },           // Right
        { input: [0, 1], expected: Math.PI / 2 }, // Down
        { input: [-1, 0], expected: Math.PI },    // Left
        { input: [0, -1], expected: -Math.PI / 2 } // Up
      ];
      
      testCases.forEach(({ input, expected }) => {
        // Set input direction
        testPlayer.input.setMovement(input[0], input[1]);
        
        // Simulate physics collision
        testPlayer.vx = (Math.random() - 0.5) * 20;
        testPlayer.vy = (Math.random() - 0.5) * 20;
        
        // Update player
        testPlayer.update(16);
        
        // Should point at input direction despite physics
        expect(testPlayer.heading).toBeCloseTo(expected, 2);
      });
    });
  });

  describe('Edge Case Scenarios', () => {
    test('should handle mob with no target', () => {
      // Mob with no current target
      testMob.currentBehavior = 'idle';
      testMob.currentChaseTarget = '';
      testMob.currentAttackTarget = '';
      
      // Physics collision
      testMob.vx = -10;
      testMob.vy = 5;
      
      // Should not crash
      expect(() => gameState.updateMobs()).not.toThrow();
    });

    test('should handle player with no input', () => {
      // No input
      testPlayer.input.setMovement(0, 0);
      
      // Physics collision
      testPlayer.vx = -5;
      testPlayer.vy = 3;
      
      // Should not crash
      expect(() => testPlayer.update(16)).not.toThrow();
    });

    test('should handle very close targets', () => {
      // Move player very close to mob
      testPlayer.x = 101;
      testPlayer.y = 101;
      
      testMob.currentBehavior = 'chase';
      testMob.currentChaseTarget = testPlayer.id;
      
      // Physics collision
      testMob.vx = 15;
      testMob.vy = -8;
      
      // Should not crash and should still calculate heading
      expect(() => gameState.updateMobs()).not.toThrow();
      expect(testMob.heading).toBeDefined();
    });

    test('should handle very far targets', () => {
      // Move player very far from mob
      testPlayer.x = 1000;
      testPlayer.y = 1000;
      
      testMob.currentBehavior = 'chase';
      testMob.currentChaseTarget = testPlayer.id;
      
      // Physics collision
      testMob.vx = -20;
      testMob.vy = 10;
      
      // Should not crash and should still calculate heading
      expect(() => gameState.updateMobs()).not.toThrow();
      expect(testMob.heading).toBeDefined();
    });
  });

  describe('Performance Under Load', () => {
    test('should handle multiple mobs with physics collisions', () => {
      // Create multiple mobs
      const mobs: Mob[] = [];
      for (let i = 0; i < 10; i++) {
        const mob = new Mob({ 
          id: `mob-${i}`, 
          x: Math.random() * 400, 
          y: Math.random() * 300 
        });
        mob.currentBehavior = 'wander';
        mob.wanderTargetX = Math.random() * 400;
        mob.wanderTargetY = Math.random() * 300;
        mobs.push(mob);
        gameState.mobs.set(mob.id, mob);
      }
      
      // Apply physics collisions to all mobs
      mobs.forEach(mob => {
        mob.vx = (Math.random() - 0.5) * 20;
        mob.vy = (Math.random() - 0.5) * 20;
      });
      
      // Update all mobs
      const startTime = performance.now();
      gameState.updateMobs();
      const endTime = performance.now();
      
      // Should complete quickly (less than 10ms)
      expect(endTime - startTime).toBeLessThan(10);
      
      // All mobs should have valid headings
      mobs.forEach(mob => {
        expect(mob.heading).toBeDefined();
        expect(typeof mob.heading).toBe('number');
      });
    });

    test('should handle rapid updates without memory leaks', () => {
      // Simulate many update cycles
      for (let i = 0; i < 100; i++) {
        // Random physics changes
        testMob.vx = (Math.random() - 0.5) * 20;
        testMob.vy = (Math.random() - 0.5) * 20;
        testPlayer.vx = (Math.random() - 0.5) * 20;
        testPlayer.vy = (Math.random() - 0.5) * 20;
        
        // Update entities
        gameState.updateMobs();
        testPlayer.update(16);
      }
      
      // Should not have crashed or leaked memory
      expect(testMob.heading).toBeDefined();
      expect(testPlayer.heading).toBeDefined();
    });
  });
});

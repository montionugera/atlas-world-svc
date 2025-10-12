/**
 * Heading System Tests
 * Test the unified heading system for both mobs and players
 */

import { Mob } from '../schemas/Mob';
import { Player } from '../schemas/Player';
import { WorldLife } from '../schemas/WorldLife';

describe('Heading System Tests', () => {
  describe('Mob Target-Based Heading', () => {
    let testMob: Mob;

    beforeEach(() => {
      testMob = new Mob({ 
        id: 'test-mob', 
        x: 50, 
        y: 50, 
        vx: 0, 
        vy: 0 
      });
    });

    test('should update heading to target position', () => {
      // Set target position
      testMob.targetX = 100;
      testMob.targetY = 100;
      
      // Update heading
      testMob.updateHeadingToTarget();
      
      // Calculate expected heading (45 degrees = π/4 radians)
      const expectedHeading = Math.atan2(50, 50); // dy=50, dx=50
      
      expect(testMob.heading).toBeCloseTo(expectedHeading, 5);
    });

    test('should handle zero distance to target', () => {
      // Set target to current position
      testMob.targetX = 50;
      testMob.targetY = 50;
      
      const originalHeading = testMob.heading;
      testMob.updateHeadingToTarget();
      
      // Heading should remain unchanged when target is at current position
      expect(testMob.heading).toBe(originalHeading);
    });

    test('should point directly at target in different directions', () => {
      // Test right direction (0 degrees)
      testMob.targetX = 100;
      testMob.targetY = 50;
      testMob.updateHeadingToTarget();
      expect(testMob.heading).toBeCloseTo(0, 5);

      // Test down direction (90 degrees)
      testMob.targetX = 50;
      testMob.targetY = 100;
      testMob.updateHeadingToTarget();
      expect(testMob.heading).toBeCloseTo(Math.PI / 2, 5);

      // Test left direction (180 degrees)
      testMob.targetX = 0;
      testMob.targetY = 50;
      testMob.updateHeadingToTarget();
      expect(testMob.heading).toBeCloseTo(Math.PI, 5);

      // Test up direction (270 degrees)
      testMob.targetX = 50;
      testMob.targetY = 0;
      testMob.updateHeadingToTarget();
      expect(testMob.heading).toBeCloseTo(-Math.PI / 2, 5);
    });

    test('should work with wander targets', () => {
      // Set wander target
      testMob.wanderTargetX = 75;
      testMob.wanderTargetY = 25;
      
      // Update target position and heading
      testMob.targetX = testMob.wanderTargetX;
      testMob.targetY = testMob.wanderTargetY;
      testMob.updateHeadingToTarget();
      
      const expectedHeading = Math.atan2(-25, 25); // dy=-25, dx=25
      expect(testMob.heading).toBeCloseTo(expectedHeading, 5);
    });
  });

  describe('Player Input-Based Heading', () => {
    let testPlayer: Player;

    beforeEach(() => {
      testPlayer = new Player('test-session', 'TestPlayer', 50, 50);
    });

    test('should update heading from input direction', () => {
      // Set input direction (right)
      testPlayer.input.setMovement(1, 0);
      
      testPlayer.updateHeadingFromInput();
      
      expect(testPlayer.heading).toBeCloseTo(0, 5); // 0 degrees (right)
    });

    test('should handle normalized input directions', () => {
      // Test diagonal input (normalized)
      testPlayer.input.setMovement(1, 1);
      
      testPlayer.updateHeadingFromInput();
      
      const expectedHeading = Math.atan2(1, 1); // 45 degrees
      expect(testPlayer.heading).toBeCloseTo(expectedHeading, 5);
    });

    test('should not update heading when no input', () => {
      // No input
      testPlayer.input.setMovement(0, 0);
      
      const originalHeading = testPlayer.heading;
      testPlayer.updateHeadingFromInput();
      
      // Heading should remain unchanged
      expect(testPlayer.heading).toBe(originalHeading);
    });

    test('should handle all cardinal directions', () => {
      // Right
      testPlayer.input.setMovement(1, 0);
      testPlayer.updateHeadingFromInput();
      expect(testPlayer.heading).toBeCloseTo(0, 5);

      // Down
      testPlayer.input.setMovement(0, 1);
      testPlayer.updateHeadingFromInput();
      expect(testPlayer.heading).toBeCloseTo(Math.PI / 2, 5);

      // Left
      testPlayer.input.setMovement(-1, 0);
      testPlayer.updateHeadingFromInput();
      expect(testPlayer.heading).toBeCloseTo(Math.PI, 5);

      // Up
      testPlayer.input.setMovement(0, -1);
      testPlayer.updateHeadingFromInput();
      expect(testPlayer.heading).toBeCloseTo(-Math.PI / 2, 5);
    });

    test('should handle small input values', () => {
      // Small input that should still register
      testPlayer.input.setMovement(0.1, 0);
      testPlayer.updateHeadingFromInput();
      
      expect(testPlayer.heading).toBeCloseTo(0, 5);
    });

    test('should ignore very small input values', () => {
      // Very small input that should be ignored
      testPlayer.input.setMovement(0.001, 0);
      
      const originalHeading = testPlayer.heading;
      testPlayer.updateHeadingFromInput();
      
      // Should not update heading for very small inputs
      expect(testPlayer.heading).toBe(originalHeading);
    });
  });

  describe('WorldLife Update Method Selection', () => {
    let testMob: Mob;
    let testPlayer: Player;

    beforeEach(() => {
      testMob = new Mob({ id: 'test-mob', x: 50, y: 50 });
      testPlayer = new Player('test-session', 'TestPlayer', 50, 50);
    });

    test('should use updateHeadingToTarget for mobs', () => {
      // Set up mob with target
      testMob.targetX = 100;
      testMob.targetY = 50;
      
      // Mock the updateHeadingToTarget method to track calls
      const mockUpdateHeadingToTarget = jest.fn();
      testMob.updateHeadingToTarget = mockUpdateHeadingToTarget;
      
      // Call update method
      testMob.update(16); // 16ms delta time
      
      // Should have called updateHeadingToTarget
      expect(mockUpdateHeadingToTarget).toHaveBeenCalled();
    });

    test('should use updateHeadingFromInput for players', () => {
      // Set up player with input
      testPlayer.input.setMovement(1, 0);
      
      // Mock the updateHeadingFromInput method to track calls
      const mockUpdateHeadingFromInput = jest.fn();
      testPlayer.updateHeadingFromInput = mockUpdateHeadingFromInput;
      
      // Call update method
      testPlayer.update(16); // 16ms delta time
      
      // Should have called updateHeadingFromInput
      expect(mockUpdateHeadingFromInput).toHaveBeenCalled();
    });

    test('should fallback to updateHeading for unknown entities', () => {
      // Create a custom entity that extends WorldLife but has neither method
      class CustomEntity extends WorldLife {
        constructor() {
          super('custom', 50, 50);
        }
      }
      
      const customEntity = new CustomEntity();
      
      // Mock the updateHeading method to track calls
      const mockUpdateHeading = jest.fn();
      customEntity.updateHeading = mockUpdateHeading;
      
      // Call update method
      customEntity.update(16);
      
      // Should have called the fallback updateHeading
      expect(mockUpdateHeading).toHaveBeenCalled();
    });
  });

  describe('Physics Collision Resilience', () => {
    let testMob: Mob;
    let testPlayer: Player;

    beforeEach(() => {
      testMob = new Mob({ id: 'test-mob', x: 50, y: 50 });
      testPlayer = new Player('test-session', 'TestPlayer', 50, 50);
    });

    test('mob should maintain target heading despite physics velocity', () => {
      // Set up mob with target
      testMob.targetX = 100;
      testMob.targetY = 50;
      
      // Simulate physics collision that changes velocity
      testMob.vx = -10; // Physics collision pushes left
      testMob.vy = 5;   // Physics collision pushes down
      
      // Update heading (should use target, not velocity)
      testMob.updateHeadingToTarget();
      
      // Should point at target (right), not physics velocity (left-down)
      expect(testMob.heading).toBeCloseTo(0, 5); // Should point right (0 degrees)
    });

    test('player should maintain input heading despite physics velocity', () => {
      // Set up player with input
      testPlayer.input.setMovement(1, 0); // Wants to go right
      
      // Simulate physics collision that changes velocity
      testPlayer.vx = -5; // Physics collision pushes left
      testPlayer.vy = -3; // Physics collision pushes up
      
      // Update heading (should use input, not velocity)
      testPlayer.updateHeadingFromInput();
      
      // Should point at input direction (right), not physics velocity (left-up)
      expect(testPlayer.heading).toBeCloseTo(0, 5); // Should point right (0 degrees)
    });

    test('should handle rapid physics changes without heading flicker', () => {
      // Set up mob with stable target
      testMob.targetX = 100;
      testMob.targetY = 50;
      
      const headings: number[] = [];
      
      // Simulate rapid physics changes
      for (let i = 0; i < 10; i++) {
        // Random physics velocity changes
        testMob.vx = (Math.random() - 0.5) * 20;
        testMob.vy = (Math.random() - 0.5) * 20;
        
        // Update heading
        testMob.updateHeadingToTarget();
        headings.push(testMob.heading);
      }
      
      // All headings should be consistent (pointing at target)
      const firstHeading = headings[0];
      headings.forEach(heading => {
        expect(heading).toBeCloseTo(firstHeading, 5);
      });
    });
  });

  describe('Edge Cases', () => {
    let testMob: Mob;
    let testPlayer: Player;

    beforeEach(() => {
      testMob = new Mob({ id: 'test-mob', x: 50, y: 50 });
      testPlayer = new Player('test-session', 'TestPlayer', 50, 50);
    });

    test('should handle NaN target positions', () => {
      testMob.targetX = NaN;
      testMob.targetY = 50;
      
      // Should not crash
      expect(() => testMob.updateHeadingToTarget()).not.toThrow();
    });

    test('should handle infinite target positions', () => {
      testMob.targetX = Infinity;
      testMob.targetY = 50;
      
      // Should not crash
      expect(() => testMob.updateHeadingToTarget()).not.toThrow();
    });

    test('should handle very large distances', () => {
      testMob.targetX = 1e6;
      testMob.targetY = 1e6;
      
      testMob.updateHeadingToTarget();
      
      // Should still calculate heading correctly
      const expectedHeading = Math.atan2(1e6 - 50, 1e6 - 50);
      expect(testMob.heading).toBeCloseTo(expectedHeading, 5);
    });

    test('should handle zero input magnitude', () => {
      testPlayer.input.setMovement(0, 0);
      
      const originalHeading = testPlayer.heading;
      testPlayer.updateHeadingFromInput();
      
      // Should not change heading
      expect(testPlayer.heading).toBe(originalHeading);
    });
  });
});

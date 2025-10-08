import { PlanckPhysicsManager } from '../physics/PlanckPhysicsManager';
import { Player } from '../schemas/Player';

describe('Player Physics - Forces', () => {
  let physics: PlanckPhysicsManager;

  beforeEach(() => {
    physics = new PlanckPhysicsManager();
  });

  test('applying an upward force moves the player up over time', () => {
    const player = new Player('p1', 'Test', 50, 50);
    physics.createPlayerBody(player);

    // Apply a sustained upward force over several steps
    for (let i = 0; i < 10; i++) {
      physics.applyForceToBody(player.id, { x: 0, y: -80 });
      physics.update(16.67);
    }

    // Sync back from physics body to the schema entity
    physics.updateEntityFromBody(player as any, player.id);

    expect(player.y).toBeLessThan(50); // moved up (y decreased)
  });

  test('repeated forces continue to accelerate player', () => {
    const player = new Player('p2', 'Test2', 50, 50);
    physics.createPlayerBody(player);

    // Baseline: apply a single force step
    physics.applyForceToBody(player.id, { x: 80, y: 0 });
    physics.update(16.67);
    physics.updateEntityFromBody(player as any, player.id);
    const xAfterOne = player.x;

    // Apply additional forces over more steps
    for (let i = 0; i < 9; i++) {
      physics.applyForceToBody(player.id, { x: 80, y: 0 });
      physics.update(16.67);
    }
    physics.updateEntityFromBody(player as any, player.id);

    expect(player.x).toBeGreaterThan(xAfterOne); // moved further to the right
  });
});



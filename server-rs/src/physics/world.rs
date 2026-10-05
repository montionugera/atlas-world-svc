use bevy_ecs::prelude::*;
use rapier2d::prelude::*;

#[derive(Component, Debug, Clone, Copy, PartialEq, Eq)]
pub struct RapierBodyHandle(pub RigidBodyHandle);

#[derive(Component, Debug, Clone, Copy, PartialEq, Eq)]
pub struct RapierColliderHandle(pub ColliderHandle);

#[derive(Resource)]
pub struct PhysicsWorld {
    pub gravity: Vector<Real>,
    pub integration_parameters: IntegrationParameters,
    pub physics_pipeline: PhysicsPipeline,
    pub island_manager: IslandManager,
    pub broad_phase: DefaultBroadPhase,
    pub narrow_phase: NarrowPhase,
    pub bodies: RigidBodySet,
    pub colliders: ColliderSet,
    pub impulse_joints: ImpulseJointSet,
    pub multibody_joints: MultibodyJointSet,
    pub ccd_solver: CCDSolver,
    pub arena_width: f32,
    pub arena_height: f32,
}

impl Default for PhysicsWorld {
    fn default() -> Self {
        Self::new(1200.0, 1200.0)
    }
}

impl PhysicsWorld {
    pub fn new(arena_width: f32, arena_height: f32) -> Self {
        let gravity = vector![0.0, 0.0];
        let integration_parameters = IntegrationParameters::default();
        let physics_pipeline = PhysicsPipeline::new();
        let island_manager = IslandManager::new();
        let broad_phase = DefaultBroadPhase::new();
        let narrow_phase = NarrowPhase::new();
        let mut bodies = RigidBodySet::new();
        let mut colliders = ColliderSet::new();
        let impulse_joints = ImpulseJointSet::new();
        let multibody_joints = MultibodyJointSet::new();
        let ccd_solver = CCDSolver::new();

        // Build static boundary colliders around arena
        let wall_thickness = 50.0;
        let half_w = arena_width / 2.0;
        let half_h = arena_height / 2.0;
        let half_t = wall_thickness / 2.0;

        // Top wall
        let top_body = bodies.insert(
            RigidBodyBuilder::fixed()
                .translation(vector![half_w, -half_t])
                .build(),
        );
        colliders.insert_with_parent(
            ColliderBuilder::cuboid(half_w, half_t).build(),
            top_body,
            &mut bodies,
        );

        // Bottom wall
        let bottom_body = bodies.insert(
            RigidBodyBuilder::fixed()
                .translation(vector![half_w, arena_height + half_t])
                .build(),
        );
        colliders.insert_with_parent(
            ColliderBuilder::cuboid(half_w, half_t).build(),
            bottom_body,
            &mut bodies,
        );

        // Left wall
        let left_body = bodies.insert(
            RigidBodyBuilder::fixed()
                .translation(vector![-half_t, half_h])
                .build(),
        );
        colliders.insert_with_parent(
            ColliderBuilder::cuboid(half_t, half_h).build(),
            left_body,
            &mut bodies,
        );

        // Right wall
        let right_body = bodies.insert(
            RigidBodyBuilder::fixed()
                .translation(vector![arena_width + half_t, half_h])
                .build(),
        );
        colliders.insert_with_parent(
            ColliderBuilder::cuboid(half_t, half_h).build(),
            right_body,
            &mut bodies,
        );

        Self {
            gravity,
            integration_parameters,
            physics_pipeline,
            island_manager,
            broad_phase,
            narrow_phase,
            bodies,
            colliders,
            impulse_joints,
            multibody_joints,
            ccd_solver,
            arena_width,
            arena_height,
        }
    }

    pub fn step(&mut self, dt: f32) {
        self.integration_parameters.dt = dt;
        let physics_hooks = ();
        let event_handler = ();
        self.physics_pipeline.step(
            &self.gravity,
            &self.integration_parameters,
            &mut self.island_manager,
            &mut self.broad_phase,
            &mut self.narrow_phase,
            &mut self.bodies,
            &mut self.colliders,
            &mut self.impulse_joints,
            &mut self.multibody_joints,
            &mut self.ccd_solver,
            None,
            &physics_hooks,
            &event_handler,
        );
    }

    pub fn clamp_position(&self, x: f32, y: f32) -> (f32, f32) {
        (
            x.clamp(0.0, self.arena_width),
            y.clamp(0.0, self.arena_height),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_physics_world_init_and_step() {
        let mut pw = PhysicsWorld::new(1200.0, 1200.0);
        assert_eq!(pw.bodies.len(), 4);
        assert_eq!(pw.colliders.len(), 4);

        pw.step(0.05);

        let (cx, cy) = pw.clamp_position(-10.0, 1300.0);
        assert_eq!(cx, 0.0);
        assert_eq!(cy, 1200.0);
    }
}

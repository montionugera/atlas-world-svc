use server_rs::combat::damage::{DamageCalculator, DamageOptions, DamageType};
use server_rs::combat::elements::{get_element_multiplier, Element};
use server_rs::combat::skills::get_skill;
use server_rs::ecs::components::{
    CastingState, CooldownTracker, ElementalAttributes, Health, MobTag, PlayerAvatar,
    PlayerInputState, PlayerTag, Position, Projectile, StatusEffects, Velocity,
};
use server_rs::simulation::AtlasSimulation;

#[test]
fn test_elemental_multipliers_end_to_end() {
    // Natural cycle: Water > Fire > Earth > Wind > Water (2.0x)
    assert_eq!(get_element_multiplier(Element::Water, Element::Fire), 2.0);
    assert_eq!(get_element_multiplier(Element::Fire, Element::Earth), 2.0);
    assert_eq!(get_element_multiplier(Element::Earth, Element::Wind), 2.0);
    assert_eq!(get_element_multiplier(Element::Wind, Element::Water), 2.0);

    // Mutual duel: Holy <-> Void (2.0x)
    assert_eq!(get_element_multiplier(Element::Holy, Element::Void), 2.0);
    assert_eq!(get_element_multiplier(Element::Void, Element::Holy), 2.0);

    // Same element and reverse cycle (0.5x)
    assert_eq!(get_element_multiplier(Element::Fire, Element::Fire), 0.5);
    assert_eq!(get_element_multiplier(Element::Fire, Element::Water), 0.5);

    // Neutral baseline (1.0x)
    assert_eq!(get_element_multiplier(Element::Neutral, Element::Fire), 1.0);
    assert_eq!(get_element_multiplier(Element::Fire, Element::Neutral), 1.0);
}

#[test]
fn test_damage_calculator_defense_cap_and_elemental_scaling() {
    // Base damage 100, 0 defense -> 100
    let opt_base = DamageOptions {
        base_damage: 100.0,
        damage_type: DamageType::Magical,
        attack_element: Element::Fire,
        defense_element: Element::Earth, // 2.0x
        p_def: 0.0,
        m_def: 0.0,
        armor: 0.0,
    };
    assert_eq!(DamageCalculator::calculate(&opt_base), 200.0);

    // Defense cap at 80%
    let opt_high_def = DamageOptions {
        base_damage: 100.0,
        damage_type: DamageType::Magical,
        attack_element: Element::Fire,
        defense_element: Element::Neutral, // 1.0x
        p_def: 0.0,
        m_def: 500.0, // Exceeds 80%
        armor: 100.0,
    };
    // 100 - min(600, 80) = 20 -> 20 * 1.0 = 20
    assert_eq!(DamageCalculator::calculate(&opt_high_def), 20.0);

    // Minimum damage floor is 1.0 even on heavy resist
    let opt_resist = DamageOptions {
        base_damage: 2.0,
        damage_type: DamageType::Physical,
        attack_element: Element::Fire,
        defense_element: Element::Water, // 0.5x
        p_def: 100.0,
        m_def: 0.0,
        armor: 0.0,
    };
    // 2 - min(100, 1.6) = 1.0 (clamped to max(1.0)) -> 1.0 * 0.5 = 0.5 -> floor = 0 -> clamped to 1.0
    assert_eq!(DamageCalculator::calculate(&opt_resist), 1.0);
}

#[test]
fn test_simulation_player_dash_execution() {
    let mut sim = AtlasSimulation::new(42, 1200.0, 1200.0);
    let session_id = "test_player_dash";
    sim.spawn_player_avatar(session_id, 100.0, 100.0);

    // Trigger dash (skill_slot = 5)
    let dash_input = server_rs::protocol::ClientInput {
        client_tick: 1,
        move_x: 1.0,
        move_y: 0.0,
        attack: false,
        skill_slot: 5,
        target_id: 0,
    };
    sim.apply_player_input(session_id, dash_input);

    // Step simulation
    sim.step();

    // Check that player's velocity was boosted by dash impulse (160.0)
    let mut vel_checked = false;
    let mut query = sim
        .world
        .query::<(&PlayerAvatar, &Velocity, &CooldownTracker)>();
    for (avatar, vel, cooldowns) in query.iter(&sim.world) {
        if avatar.session_id == session_id {
            assert!(
                vel.vx >= 150.0,
                "Expected dash velocity >= 150.0, got {}",
                vel.vx
            );
            assert!(
                !cooldowns.can_perform(&["skill_dash"]),
                "Dash cooldown should be active"
            );
            vel_checked = true;
        }
    }
    assert!(vel_checked, "Player avatar should exist");
}

#[test]
fn test_projectile_flight_collision_and_status_effects() {
    let mut sim = AtlasSimulation::new(99, 1200.0, 1200.0);

    // Spawn a target mob at (200.0, 200.0) with Earth element
    let mob = sim
        .world
        .spawn((
            MobTag,
            Position::new(200.0, 200.0),
            Velocity::zero(),
            Health::new(100.0),
            ElementalAttributes {
                element: Element::Earth,
                p_def: 10.0,
                m_def: 10.0,
                armor: 0.0,
            },
            StatusEffects::default(),
        ))
        .id();

    // Spawn a player at (100.0, 200.0)
    let player = sim
        .world
        .spawn((
            PlayerTag,
            PlayerAvatar::new("p1", 100.0),
            Position::new(100.0, 200.0),
            Velocity::zero(),
            Health::new(200.0),
        ))
        .id();

    // Spawn a Fire projectile flying from (100.0, 200.0) towards (200.0, 200.0)
    let blizzard_skill = get_skill("skill_3").unwrap();
    sim.world.spawn((
        Position::new(180.0, 200.0), // very close to mob (radius 20.0 hit)
        Velocity::new(100.0, 0.0),
        Projectile {
            owner: player,
            target: Some(mob),
            damage: 30.0,
            damage_type: DamageType::Magical,
            element: Element::Fire, // Fire vs Earth = 2.0x
            speed: 100.0,
            radius: 15.0,
            max_range: 500.0,
            traveled_distance: 80.0,
            lifetime: 5.0,
            effects: blizzard_skill.effects.clone(),
            is_player_projectile: true,
        },
    ));

    // Step simulation to trigger collision
    sim.step();

    // Verify mob took double damage from Fire vs Earth
    let mob_health = sim.world.get::<Health>(mob).unwrap();
    assert!(
        mob_health.current < 100.0,
        "Mob should have taken damage, current: {}",
        mob_health.current
    );

    // Verify mob received Freeze status effect from blizzard effects
    let mob_status = sim.world.get::<StatusEffects>(mob).unwrap();
    assert!(
        mob_status.freeze_timer > 0.0,
        "Mob should have freeze timer > 0.0"
    );
    assert_eq!(
        mob_status.speed_multiplier(),
        0.2,
        "Freeze speed multiplier should be 0.2"
    );

    // Verify projectile was consumed/despawned
    let mut proj_count = 0;
    let mut proj_query = sim.world.query::<&Projectile>();
    for _ in proj_query.iter(&sim.world) {
        proj_count += 1;
    }
    assert_eq!(proj_count, 0, "Projectile should despawn upon collision");
}

#[test]
fn test_stun_status_locks_movement() {
    let mut sim = AtlasSimulation::new(123, 1200.0, 1200.0);
    let session_id = "test_stunned_player";
    sim.spawn_player_avatar(session_id, 100.0, 100.0);

    // Find the player entity and apply Stun status effect
    let mut player_entity = None;
    let mut query = sim.world.query::<(Entity, &PlayerAvatar)>();
    for (entity, avatar) in query.iter(&sim.world) {
        if avatar.session_id == session_id {
            player_entity = Some(entity);
            break;
        }
    }
    let p_entity = player_entity.expect("Player avatar not found");
    sim.world.entity_mut(p_entity).insert(StatusEffects {
        freeze_timer: 0.0,
        freeze_speed_multiplier: 1.0,
        stun_timer: 3.0,
    });

    // Send movement input
    sim.apply_player_input(
        session_id,
        server_rs::protocol::ClientInput {
            client_tick: 1,
            move_x: 1.0,
            move_y: 1.0,
            attack: false,
            skill_slot: 0,
            target_id: 0,
        },
    );

    // Step simulation
    sim.step();

    // Verify player did NOT move because stun zeroes velocity
    let vel = sim.world.get::<Velocity>(p_entity).unwrap();
    assert_eq!(vel.vx, 0.0, "Stunned player velocity vx must be 0");
    assert_eq!(vel.vy, 0.0, "Stunned player velocity vy must be 0");
}

use server_rs::ai::threat::ThreatTable;
use server_rs::combat::elements::Element;
use server_rs::content::bestiary::{derive_mob_stats, BestiaryCatalog, MobTier};
use server_rs::ecs::components::{
    AiState, CombatStats, ElementalAttributes, Health, MobAi, MobSpawnAnchor, MobTag, Position,
    Velocity,
};
use server_rs::simulation::AtlasSimulation;

#[test]
fn test_bestiary_catalog_ingestion_and_counts() {
    let catalog = BestiaryCatalog::new().expect("load bestiary.json");
    assert!(
        catalog.len() >= 30,
        "Bestiary catalog must have at least 30 entries, got {}",
        catalog.len()
    );

    // Verify sample entries exist and have expected elements
    let stalker = catalog
        .get_mob("mob-bramble-stalker")
        .expect("bramble-stalker exists");
    assert_eq!(stalker.element, Element::Earth);
    assert_eq!(stalker.archetype, "skirmisher");

    let spearling = catalog
        .get_mob("mob-veil-spearling")
        .expect("veil-spearling exists");
    assert_eq!(spearling.element, Element::Wind);
    assert_eq!(spearling.threat, "ranged");

    let gnawer = catalog
        .get_mob("mob-millpond-gnawer")
        .expect("millpond-gnawer exists");
    assert_eq!(gnawer.element, Element::Water);
}

#[test]
fn test_f031_mob_derivation_parity() {
    let catalog = BestiaryCatalog::new().expect("load bestiary.json");

    // Case 1: mob-bramble-stalker at Route tier (factor 1.0, durability: mid)
    let stalker_entry = catalog.get_mob("mob-bramble-stalker").unwrap();
    let stalker_stats = derive_mob_stats(stalker_entry, MobTier::Route);
    // durability "mid" = 100 * 1.0 = 100 HP
    assert_eq!(stalker_stats.hp, 100.0);
    // skirmisher: radius 3.0, p_def 1.0, armor 1.0, chase 200.0
    assert_eq!(stalker_stats.radius, 3.0);
    assert_eq!(stalker_stats.p_def, 1.0);
    assert_eq!(stalker_stats.armor, 1.0);
    assert_eq!(stalker_stats.element, Element::Earth);
    assert!(!stalker_stats.is_ranged);

    // Case 2: mob-veil-spearling at Route tier (factor 1.0, threat: ranged)
    let spearling_entry = catalog.get_mob("mob-veil-spearling").unwrap();
    let spearling_stats = derive_mob_stats(spearling_entry, MobTier::Route);
    assert_eq!(spearling_stats.hp, 70.0);
    assert!(spearling_stats.is_ranged);

    // Case 3: mob-bramble-drake at Interior tier (factor 1.75, durability: high)
    let drake_entry = catalog.get_mob("mob-bramble-drake").unwrap();
    let drake_stats = derive_mob_stats(drake_entry, MobTier::Interior);
    // durability "high" = 150 * 1.75 = 262.5 -> 263.0 HP
    assert_eq!(drake_stats.hp, 263.0);
    // bruiser: radius 5.0, p_def 3.0, armor 2.0, chase 250.0
    assert_eq!(drake_stats.radius, 5.0);
    assert_eq!(drake_stats.p_def, 3.0);
    assert_eq!(drake_stats.armor, 2.0);
}

#[test]
fn test_threat_driven_ai_chase_and_attack() {
    let mut sim = AtlasSimulation::new(12345, 1000.0, 1000.0);

    // Spawn player avatar at (500.0, 500.0)
    let player = sim.spawn_player_avatar("hero-p1", 500.0, 500.0);

    // Spawn mob at (530.0, 500.0)
    let mob = sim
        .world
        .spawn((
            MobTag,
            Position::new(530.0, 500.0),
            Velocity::zero(),
            Health::new(100.0),
            CombatStats {
                attack_power: 10.0,
                defense: 2.0,
                attack_range: 20.0,
                attack_cooldown: 0.5,
                cooldown_timer: 0.0,
                is_player: false,
            },
            ElementalAttributes::default(),
            ThreatTable::new(),
            MobAi::new(Position::new(530.0, 500.0), 150.0, 20.0, false),
            MobSpawnAnchor {
                spawn_pos: Position::new(530.0, 500.0),
                mob_id: "mob-bramble-stalker".to_string(),
                tier: MobTier::Route,
                respawn_delay_sec: 2.0,
            },
        ))
        .id();

    // Verify initially Idle
    let initial_ai = sim.world.get::<MobAi>(mob).unwrap();
    assert_eq!(initial_ai.state, AiState::Idle);

    // Player damages mob: add threat
    if let Some(mut threat) = sim.world.get_mut::<ThreatTable>(mob) {
        threat.add_threat(player, 50.0, 0.0);
    }

    // Step simulation: mob AI processes threat and enters Chase
    sim.step();

    let chased_ai = sim.world.get::<MobAi>(mob).unwrap();
    assert!(
        matches!(chased_ai.state, AiState::Chase | AiState::Attack),
        "Mob should be chasing or attacking player after receiving threat, got {:?}",
        chased_ai.state
    );
}

#[test]
fn test_mob_respawn_lifecycle() {
    let mut sim = AtlasSimulation::new(54321, 1000.0, 1000.0);

    // Spawn a mob with low health and 0.1s respawn delay
    let spawn_pos = Position::new(300.0, 300.0);
    let mob = sim
        .world
        .spawn((
            MobTag,
            spawn_pos,
            Velocity::zero(),
            Health::new(10.0),
            CombatStats::default(),
            ElementalAttributes::default(),
            ThreatTable::new(),
            MobAi::new(spawn_pos, 100.0, 20.0, false),
            MobSpawnAnchor {
                spawn_pos,
                mob_id: "mob-tallgrass-tick".to_string(),
                tier: MobTier::Route,
                respawn_delay_sec: 0.1, // 2 ticks
            },
        ))
        .id();

    // Kill the mob
    if let Some(mut health) = sim.world.get_mut::<Health>(mob) {
        health.take_damage(20.0);
        assert!(!health.is_alive);
    }

    // Step 1: mob_lifecycle_system detects dead mob and starts respawn tracking
    sim.step();

    // Dead mob entity should be cleaned up
    assert!(
        sim.world.get_entity(mob).is_err(),
        "Dead mob entity should be despawned"
    );

    // Step several ticks to pass respawn timer (0.1s)
    sim.step();
    sim.step();
    sim.step();

    // Verify a new mob has respawned at spawn_pos
    let mut respawned_count = 0;
    let mut query = sim
        .world
        .query::<(&MobTag, &Position, &Health, &MobSpawnAnchor)>();
    for (_tag, pos, health, anchor) in query.iter(&sim.world) {
        if anchor.mob_id == "mob-tallgrass-tick" {
            assert!(health.is_alive, "Respawned mob must be alive");
            assert_eq!(
                health.current, health.max,
                "Respawned mob must have full health"
            );
            assert!((pos.x - 300.0).abs() < 1.0);
            assert!((pos.y - 300.0).abs() < 1.0);
            respawned_count += 1;
        }
    }
    assert_eq!(respawned_count, 1, "Exactly one mob should have respawned");
}

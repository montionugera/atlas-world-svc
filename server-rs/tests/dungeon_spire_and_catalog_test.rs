use server_rs::content::{DungeonCatalog, MapConfig};
use server_rs::ecs::components::{
    DungeonPortalTrigger, EntityId, Health, PlayerProgression, PlayerTag, Position,
};
use server_rs::fleet::{
    BossEncounterEvent, BossPhase, DungeonFloorEvent, DungeonRegistry, DungeonState,
};
use server_rs::simulation::AtlasSimulation;

#[test]
fn test_dungeon_catalog_full_integrity() {
    let catalog = DungeonCatalog::new().expect("Failed to initialize DungeonCatalog");
    assert_eq!(
        catalog.len(),
        60,
        "Expected all 60 canonical dungeons loaded"
    );

    // Ensure every dungeon has non-empty metadata, valid coordinates, and positive boss HP
    for d in catalog.all_entries() {
        assert!(!d.id.is_empty(), "Dungeon ID must not be empty");
        assert!(!d.title.is_empty(), "Dungeon title must not be empty");
        assert!(!d.map_id.is_empty(), "Map ID must not be empty");
        assert!(!d.region_id.is_empty(), "Region ID must not be empty");
        assert!(d.floors >= 1, "Floors must be >= 1 for {}", d.id);
        assert!(d.level_min >= 1, "level_min must be >= 1 for {}", d.id);
        assert!(
            d.level_max >= d.level_min,
            "level_max >= level_min for {}",
            d.id
        );
        assert!(
            d.portal_radius > 0.0,
            "Portal radius must be positive for {}",
            d.id
        );
        assert!(
            !d.mvp_boss_id.is_empty(),
            "Boss ID must not be empty for {}",
            d.id
        );
        assert!(d.mvp_boss_hp > 0, "Boss HP must be positive for {}", d.id);
    }

    // Verify key landmark dungeons
    let cindervast = catalog.get("dungeon-cindervast-under-city").unwrap();
    assert_eq!(cindervast.floors, 12);
    assert_eq!(cindervast.map_id, "gildmark-head");

    let millcross = catalog.get("dungeon-millcross-race-tunnels").unwrap();
    assert_eq!(millcross.floors, 2);
    assert_eq!(millcross.map_id, "millcross-ford");

    // Verify map indexing
    let millcross_portals = catalog.for_map("millcross-ford");
    assert!(!millcross_portals.is_empty());
}

#[test]
fn test_in_world_regional_portal_spawning_and_simulation_trigger() {
    // 1. Verify MapConfig loads dungeon portals for millcross-ford
    let map_cfg = MapConfig::load("millcross-ford");
    assert!(
        !map_cfg.dungeon_portals.is_empty(),
        "millcross-ford must load configured dungeon portals"
    );
    let target_portal = &map_cfg.dungeon_portals[0];
    let portal_x = target_portal.x;
    let portal_y = target_portal.y;

    // 2. Initialize live simulation for millcross-ford
    let mut sim = AtlasSimulation::from_generated_region("millcross-ford", 0x1337_feed)
        .expect("Failed to initialize millcross-ford simulation");

    // 3. Verify DungeonPortalTrigger entities are spawned in ECS world
    let mut portal_query = sim.world.query::<(&Position, &DungeonPortalTrigger)>();
    let portals: Vec<(&Position, &DungeonPortalTrigger)> = portal_query.iter(&sim.world).collect();
    assert!(
        !portals.is_empty(),
        "Expected at least one DungeonPortalTrigger entity spawned in world"
    );

    // 4. Spawn a player right on top of the portal trigger
    let player_id = "test_portal_adventurer".to_string();
    sim.world.spawn((
        PlayerTag,
        EntityId(player_id.clone()),
        Position::new(portal_x, portal_y),
        Health::new(500.0),
        PlayerProgression {
            level: 50,
            xp: 100_000,
            xp_to_next_level: 200_000,
            total_xp: 500_000,
        },
    ));

    // 5. Execute simulation tick
    let frame = sim.live_tick(&[], &[]);

    // 6. Verify dungeon portal entry event was detected and drained into LiveFrame
    assert!(
        !frame.dungeon_portal_events.is_empty(),
        "Expected dungeon portal entry event in live frame"
    );
    let entry = &frame.dungeon_portal_events[0];
    assert_eq!(entry.player_id, player_id);
    assert_eq!(entry.portal_id, target_portal.portal_id);
    assert_eq!(
        entry.dungeon_template_id,
        target_portal.target_dungeon_template_id
    );
    assert_eq!(entry.mvp_boss_id, target_portal.target_mvp_boss_id);
}

#[test]
fn test_multi_floor_spire_navigation_and_boss_encounter() {
    let registry = DungeonRegistry::new();
    let instance_id = "inst_spire_e2e_test";
    let now_secs = 1_700_000_000;

    // Allocate a 5-floor spire dungeon (Cindervast Under-City) with 6 mobs per floor
    let total_floors = 5;
    let mobs_per_floor = 6;
    let boss_max_hp = 80_000;
    let boss_enrage_secs = 300;

    let inst = registry.allocate_dungeon_with_floors(
        instance_id,
        "party_spire_runners",
        "dungeon-cindervast-under-city",
        "mvp-cindervast-under-city",
        boss_max_hp,
        boss_enrage_secs,
        total_floors,
        mobs_per_floor,
        3600,
        now_secs,
    );

    assert_eq!(inst.state, DungeonState::Active);
    assert_eq!(inst.floor_state.current_floor, 1);
    assert_eq!(inst.floor_state.total_floors, total_floors);
    assert_eq!(inst.floor_state.mobs_required, mobs_per_floor);
    assert_eq!(inst.floor_state.mobs_killed, 0);
    assert!(!inst.floor_state.is_floor_cleared);
    assert!(!inst.floor_state.is_boss_floor);

    // Step 1: Cannot advance without clearing floor mobs
    assert!(registry.advance_floor(instance_id, now_secs + 5).is_err());

    // Step 2: Clear Floor 1 to Floor 4
    for current_f in 1..total_floors {
        // Kill required mobs
        let (floor, events) = registry
            .record_floor_mob_kills(
                instance_id,
                mobs_per_floor,
                now_secs + current_f as u64 * 10,
            )
            .expect("Kill mobs should succeed");
        assert!(floor.is_floor_cleared);
        assert!(events.iter().any(
            |e| matches!(e, DungeonFloorEvent::FloorCleared { floor: f, .. } if *f == current_f)
        ));

        // Advance to next floor
        let (floor, advance_events) = registry
            .advance_floor(instance_id, now_secs + current_f as u64 * 10 + 2)
            .expect("Advance should succeed");
        assert_eq!(floor.current_floor, current_f + 1);

        if current_f + 1 == total_floors {
            // Reached boss floor!
            assert!(floor.is_boss_floor);
            assert!(advance_events
                .iter()
                .any(|e| matches!(e, DungeonFloorEvent::BossFloorReached { .. })));
        } else {
            assert!(!floor.is_boss_floor);
            assert!(!floor.is_floor_cleared);
        }
    }

    // Verify on final floor
    let active_inst = registry.get_instance(instance_id).unwrap();
    assert_eq!(active_inst.floor_state.current_floor, total_floors);
    assert!(active_inst.floor_state.is_boss_floor);

    // Step 3: Boss Encounter on Final Floor
    // Tank deals 10k damage (first hit) and takes 15k damage
    let (encounter, events) = registry
        .record_boss_damage(instance_id, "party_tank", 10_000, 15_000, now_secs + 100)
        .expect("Damage should succeed");
    assert_eq!(encounter.phase, BossPhase::Phase1Normal);
    assert_eq!(events.len(), 1);

    // DPS deals 35k damage (total 45k / 80k -> remaining 35k <= 40k: Phase 2 Empowered!)
    let (encounter, events) = registry
        .record_boss_damage(instance_id, "party_dps", 35_000, 1_000, now_secs + 120)
        .expect("DPS damage should succeed");
    assert_eq!(encounter.phase, BossPhase::Phase2Empowered);
    assert_eq!(encounter.atk_multiplier, 1.35);
    assert_eq!(encounter.aspd_multiplier, 1.25);
    assert!(events
        .iter()
        .any(|e| matches!(e, BossEncounterEvent::Phase2Transition { .. })));

    // Finisher deals 35k damage (remaining 0 -> Defeated & MVP rewards!)
    let (encounter, events) = registry
        .record_boss_damage(instance_id, "party_finisher", 35_000, 500, now_secs + 140)
        .expect("Finisher damage should succeed");
    assert_eq!(encounter.phase, BossPhase::Defeated);
    assert_eq!(encounter.current_hp, 0);
    assert!(events
        .iter()
        .any(|e| matches!(e, BossEncounterEvent::BossDefeated { .. })));

    // Verify MVP scoring: DPS dealt 35k, Tank took 15k & got first hit, Finisher dealt 35k & got last hit
    let rewards = encounter.mvp_rewards.expect("MVP rewards must be present");
    assert_eq!(rewards.len(), 3);
    assert!(rewards[0].is_mvp_winner);
    assert_eq!(rewards[0].reward_item_id, "mvp_crown_of_victory");
    assert_eq!(rewards[0].bonus_exp, 25_000);

    // Verify dungeon completed
    let cleared_inst = registry.get_instance(instance_id).unwrap();
    assert_eq!(cleared_inst.state, DungeonState::Cleared);
    assert!(!cleared_inst.mvp_boss_alive);
}

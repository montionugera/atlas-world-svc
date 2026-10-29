use server_rs::content::{derived_stats_with_race, AtlasRace};
use server_rs::ecs::components::{CombatStats, Health, PlayerAvatar, RaceComponent};
use server_rs::meta::engine::{RpcContext, RustMetaEngine};
use server_rs::meta::store::InMemoryMetaStore;
use server_rs::simulation::AtlasSimulation;
use server_rs::storage::{EquippedItemIds, LoadoutSnapshot, PrimaryStats, ProfileDoc};
use std::sync::Arc;

#[test]
fn test_all_six_canonical_races_match_world_lore() {
    for race in AtlasRace::ALL {
        let profile = race.profile();
        assert!(!profile.home_town_id.is_empty());
        assert!(!profile.home_town_name.is_empty());
        assert_eq!(profile.continent_id, "continent-01-hearthbloom-basin");
        assert_eq!(profile.starter_level_band, (1, 10));

        // Ensure valid base attribute allocation
        assert!(profile.base_str >= 25 && profile.base_str <= 50);
        assert!(profile.base_agi >= 25 && profile.base_agi <= 50);
        assert!(profile.base_vit >= 25 && profile.base_vit <= 50);
        assert!(profile.base_int >= 15 && profile.base_int <= 45);
        assert!(profile.base_dex >= 25 && profile.base_dex <= 45);
        assert!(profile.base_luk >= 20 && profile.base_luk <= 45);

        // Validate hitboxes
        assert!(profile.hitbox_radius_m > 0.3 && profile.hitbox_radius_m < 0.8);
        assert!(profile.hitbox_height_m >= 1.0 && profile.hitbox_height_m <= 2.5);
    }
}

#[test]
fn test_simulation_spawns_avatar_with_canonical_race_component() {
    let mut sim = AtlasSimulation::new(0x1337, 1000.0, 1000.0);

    for race in AtlasRace::ALL {
        let session_id = format!("hero-{}", race.as_key());
        let loadout = LoadoutSnapshot {
            profile: ProfileDoc {
                level: 5,
                race: Some(race.as_key().to_string()),
                allocated: PrimaryStats::new(
                    race.profile().base_str,
                    race.profile().base_agi,
                    race.profile().base_int,
                    race.profile().base_vit,
                    race.profile().base_dex,
                    race.profile().base_luk,
                ),
                ..Default::default()
            },
            equipped_item_ids: EquippedItemIds {
                weapon: Some("basic_sword".to_string()),
                ..Default::default()
            },
            ..Default::default()
        };

        let entity = sim.spawn_player_avatar_with_loadout(&session_id, 200.0, 200.0, Some(&loadout));

        // 1. Verify RaceComponent attached
        let race_comp = sim
            .world
            .get::<RaceComponent>(entity)
            .expect("Entity must have RaceComponent");
        assert_eq!(race_comp.race, race);

        // 2. Verify Health and CombatStats initialized
        let health = sim.world.get::<Health>(entity).unwrap();
        assert!(health.is_alive);
        assert!(health.max > 100.0);

        let combat = sim.world.get::<CombatStats>(entity).unwrap();
        assert!(combat.attack_power > 20.0);

        let avatar = sim.world.get::<PlayerAvatar>(entity).unwrap();
        assert_eq!(avatar.session_id, session_id);
    }
}

#[test]
fn test_derived_stats_racial_traits_and_luk_influence() {
    let base_stats = PrimaryStats::new(35, 35, 35, 35, 35, 35);

    let dwarf_stats = derived_stats_with_race(10, &base_stats, Some("basic_sword"), Some(AtlasRace::Dwarf));
    let human_stats = derived_stats_with_race(10, &base_stats, Some("basic_sword"), Some(AtlasRace::HumanDemiHuman));
    let furral_stats = derived_stats_with_race(10, &base_stats, Some("basic_sword"), Some(AtlasRace::Furral));
    let dark_lunar_stats = derived_stats_with_race(10, &base_stats, Some("basic_sword"), Some(AtlasRace::DarkLunar));

    // Dwarf gets extra 1000 carry weight
    assert_eq!(dwarf_stats.max_weight, human_stats.max_weight + 1000);

    // Furral gets extra sprint speed
    assert!(furral_stats.max_move_speed > human_stats.max_move_speed);

    // Dark-Lunar gets umbral crit rate boost
    assert!(dark_lunar_stats.crit_rate_pct > human_stats.crit_rate_pct);

    // Test LUK scaling on crit rate, hit rate, and flee rate
    let low_luk = PrimaryStats::new(35, 35, 35, 35, 35, 1);
    let high_luk = PrimaryStats::new(35, 35, 35, 35, 35, 90);

    let low_derived = derived_stats_with_race(10, &low_luk, Some("basic_sword"), None);
    let high_derived = derived_stats_with_race(10, &high_luk, Some("basic_sword"), None);

    assert!(high_derived.crit_rate_pct > low_derived.crit_rate_pct);
    assert!(high_derived.hit_rate > low_derived.hit_rate);
    assert!(high_derived.flee_rate > low_derived.flee_rate);
}

#[test]
fn test_rust_meta_engine_spend_stat_points_including_luk() {
    let store = Arc::new(InMemoryMetaStore::new());
    let engine = RustMetaEngine::new(store).expect("Engine initialization should succeed");

    let user_id = "test_user_race_alloc";
    let ctx = RpcContext::client(user_id, Some("AtlasExplorer".to_string()));

    // 1. Grant XP to achieve level up and gain stat points
    let grant_payload = format!(r#"{{"userId": "{}", "amount": 1000}}"#, user_id);
    let lvl_res = engine
        .invoke_rpc(&RpcContext::s2s(), "grant_xp", &grant_payload)
        .expect("grant_xp should succeed");
    assert!(lvl_res["level"].as_u64().unwrap() > 1);
    let available_points = lvl_res["statPoints"].as_u64().unwrap() as u32;
    assert!(available_points >= 6, "Expected at least 6 stat points");

    // 2. Spend 1 point on each of the 6 primary stats: str, agi, int, vit, dex, luk
    let spend_payload = r#"{
        "str": 1,
        "agi": 1,
        "int": 1,
        "vit": 1,
        "dex": 1,
        "luk": 1
    }"#;
    let spend_res = engine
        .invoke_rpc(&ctx, "allocate_stats", spend_payload)
        .expect("allocate_stats should succeed for all 6 stats");

    let alloc = &spend_res["allocated"];
    assert_eq!(alloc["str"].as_u64().unwrap(), 2);
    assert_eq!(alloc["agi"].as_u64().unwrap(), 2);
    assert_eq!(alloc["int"].as_u64().unwrap(), 2);
    assert_eq!(alloc["vit"].as_u64().unwrap(), 2);
    assert_eq!(alloc["dex"].as_u64().unwrap(), 2);
    assert_eq!(alloc["luk"].as_u64().unwrap(), 2);
    assert_eq!(
        spend_res["statPoints"].as_u64().unwrap(),
        (available_points - 6) as u64
    );
}

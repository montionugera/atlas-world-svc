use server_rs::fleet::dungeons::{
    compute_mvp_rewards_from_contributions, BossPhase, DungeonRegistry, DungeonState,
    PlayerDungeonContribution,
};
use std::collections::HashMap;

#[test]
fn test_mvp_scoring_incorporates_healing_fairly_for_support_classes() {
    let mut contributions = HashMap::new();

    // Player 1: Pure DPS
    contributions.insert(
        "dps_player".to_string(),
        PlayerDungeonContribution {
            damage_dealt: 50_000,
            damage_taken: 5_000,
            healing_done: 0,
            has_first_hit: true,
            has_last_hit: false,
        },
    );

    // Player 2: Pure Healer / Buffer (kept everyone alive)
    contributions.insert(
        "healer_player".to_string(),
        PlayerDungeonContribution {
            damage_dealt: 5_000,
            damage_taken: 2_000,
            healing_done: 45_000,
            has_first_hit: false,
            has_last_hit: false,
        },
    );

    // Player 3: Tank
    contributions.insert(
        "tank_player".to_string(),
        PlayerDungeonContribution {
            damage_dealt: 10_000,
            damage_taken: 40_000,
            healing_done: 0,
            has_first_hit: false,
            has_last_hit: true,
        },
    );

    let rewards = compute_mvp_rewards_from_contributions(&contributions);
    assert_eq!(rewards.len(), 3);

    let healer_reward = rewards
        .iter()
        .find(|r| r.player_id == "healer_player")
        .expect("healer reward exists");

    // Healer must receive non-zero score from healing_done
    assert!(
        healer_reward.score > 1500,
        "Healer score was {} - expected > 1500 from 20% healing weight",
        healer_reward.score
    );

    // Verify all ranks are distinct and sorted
    assert_eq!(rewards[0].rank, 1);
    assert!(rewards[0].is_mvp_winner);
    assert_eq!(rewards[1].rank, 2);
    assert!(!rewards[1].is_mvp_winner);
    assert_eq!(rewards[2].rank, 3);
}

#[test]
fn test_dungeon_party_wipe_resets_boss_and_fails_instance() {
    let registry = DungeonRegistry::new();
    let _inst = registry.allocate_dungeon_with_boss(
        "wipe_test_inst",
        "party_wipe",
        "spire_template",
        "boss_ignis",
        100_000,
        300,
        1800,
        1000,
    );

    // Deal 60,000 damage to trigger Phase 2 Empowered
    let (encounter, _) = registry
        .record_boss_damage("wipe_test_inst", "dps_1", 60_000, 5_000, 1050)
        .expect("damage recorded");
    assert_eq!(encounter.current_hp, 40_000);
    assert_eq!(encounter.phase, BossPhase::Phase2Empowered);

    // Set origin return coordinates
    assert!(registry.set_instance_origin("wipe_test_inst", "millcross-ford", 150.0, 200.0));

    // Alive players = 3 -> not a wipe
    assert!(!registry.check_party_wipe("wipe_test_inst", 3, 1060));

    // All party members die simultaneously (alive_players = 0)
    let wiped = registry.check_party_wipe("wipe_test_inst", 0, 1070);
    assert!(wiped, "Party wipe should trigger on 0 alive players");

    let lock = registry
        .get_instance("wipe_test_inst")
        .expect("instance exists");
    assert_eq!(lock.state, DungeonState::Failed);
    // Boss must be fully restored to max HP and Phase 1
    assert_eq!(lock.boss_encounter.current_hp, 100_000);
    assert_eq!(lock.boss_encounter.phase, BossPhase::Phase1Normal);
    assert_eq!(lock.boss_encounter.atk_multiplier, 1.0);
    assert_eq!(lock.origin_region_id, Some("millcross-ford".to_string()));
}

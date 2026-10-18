//! E-005 Slice 4 (`I-157` -> `F-140`): Idempotent server-only grants.
//!
//! Verifies:
//! 1. Replaying the same kill event (`HitRecord` for the same mob) does not duplicate XP or
//!    spawn a second `LootDrop` when `GrantLedger` is present.
//! 2. Two players walking into the same `LootDrop` on the same tick results in exactly one
//!    winner receiving the item and gold, with zero duplicate grants.

use bevy_ecs::prelude::*;
use server_rs::content::bestiary::MobTier;
use server_rs::ecs::components::{
    CombatStats, EntityId, Health, HitLog, HitRecord, LootDrop, MobSpawnAnchor, MobTag,
    PlayerInventory, PlayerProgression, PlayerTag, PlayerWallet, Position,
};
use server_rs::systems::{
    experience_on_kill_system, loot_drop_on_kill_system, loot_pickup_system, GrantLedger,
};

#[test]
fn replayed_kill_event_grants_xp_and_spawns_loot_at_most_once() {
    let mut world = World::new();
    world.insert_resource(GrantLedger::default());

    let player = world
        .spawn((
            PlayerTag,
            Position::new(50.0, 50.0),
            Health::new(200.0),
            CombatStats {
                attack_power: 25.0,
                defense: 10.0,
                attack_range: 35.0,
                attack_cooldown: 1.0,
                cooldown_timer: 0.0,
                is_player: true,
            },
            PlayerProgression::default(),
        ))
        .id();

    let mob = world
        .spawn((
            MobTag,
            EntityId("mob-boss-idempotent".to_string()),
            Position::new(60.0, 50.0),
            Health::new(500.0),
            MobSpawnAnchor::new(
                Position::new(60.0, 50.0),
                "bramble_drake",
                MobTier::Boss,
                30.0,
            ),
        ))
        .id();

    let kill_hit = HitRecord {
        attacker: player,
        target: mob,
        amount: 500.0,
        killed: true,
    };

    // First execution of the kill event.
    world.insert_resource(HitLog(vec![kill_hit]));
    let mut schedule = Schedule::default();
    schedule.add_systems((experience_on_kill_system, loot_drop_on_kill_system));
    schedule.run(&mut world);

    let prog_after_first = *world.get::<PlayerProgression>(player).unwrap();
    assert!(
        prog_after_first.level > 1 || prog_after_first.xp > 0,
        "First kill must grant XP"
    );

    let drop_count_first = world.query::<&LootDrop>().iter(&world).count();
    assert_eq!(
        drop_count_first, 1,
        "First kill must spawn exactly 1 loot drop"
    );

    // Replay the exact same kill event in a subsequent tick/packet retry.
    world.insert_resource(HitLog(vec![kill_hit]));
    schedule.run(&mut world);

    let prog_after_replay = *world.get::<PlayerProgression>(player).unwrap();
    assert_eq!(
        prog_after_replay, prog_after_first,
        "Replayed kill event must not duplicate XP or levels"
    );

    let drop_count_replay = world.query::<&LootDrop>().iter(&world).count();
    assert_eq!(
        drop_count_replay, 1,
        "Replayed kill event must not spawn a duplicate loot drop"
    );
}

#[test]
fn concurrent_pickup_by_two_players_awards_item_to_single_winner_only() {
    let mut world = World::new();
    world.insert_resource(GrantLedger::default());

    let player_a = world
        .spawn((
            PlayerTag,
            Position::new(100.0, 100.0),
            Health::new(200.0),
            PlayerInventory::default(),
            PlayerWallet::default(),
        ))
        .id();

    let player_b = world
        .spawn((
            PlayerTag,
            Position::new(102.0, 100.0),
            Health::new(200.0),
            PlayerInventory::default(),
            PlayerWallet::default(),
        ))
        .id();

    // Both players are well within LOOT_PICKUP_RADIUS (25.0) of the drop at (100.5, 100.0).
    let drop_entity = world
        .spawn((
            Position::new(100.5, 100.0),
            LootDrop {
                drop_id: "drop-shared-race-1".to_string(),
                item_id: "w_ember_blade".to_string(),
                quantity: 1,
                gold: 200,
                claimed: false,
            },
        ))
        .id();

    let mut pickup_schedule = Schedule::default();
    pickup_schedule.add_systems(loot_pickup_system);
    pickup_schedule.run(&mut world);

    assert!(
        world.get_entity(drop_entity).is_err(),
        "Shared drop must be despawned after single-winner pickup"
    );

    let count_a = world
        .get::<PlayerInventory>(player_a)
        .unwrap()
        .count("w_ember_blade");
    let count_b = world
        .get::<PlayerInventory>(player_b)
        .unwrap()
        .count("w_ember_blade");
    assert_eq!(
        count_a + count_b,
        1,
        "Total items granted across both racing players must be 1, got {} + {}",
        count_a,
        count_b
    );

    let gold_a = world.get::<PlayerWallet>(player_a).unwrap().gold;
    let gold_b = world.get::<PlayerWallet>(player_b).unwrap().gold;
    assert_eq!(
        gold_a + gold_b,
        200,
        "Total gold granted across both racing players must be 200"
    );
}

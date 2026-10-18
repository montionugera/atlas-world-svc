//! E-005 Slice 3 (`I-156` -> `F-139`): Loot drops and pickup.
//!
//! Verifies:
//! 1. Killing a mob spawns a visible loot drop entity (`LootDrop`) at its death location
//!    whose item and gold reward match the mob tier's loot table in `ItemCatalog`.
//! 2. Walking an alive player within `LOOT_PICKUP_RADIUS` (`<= 25.0` units) picks up the drop,
//!    credits the item to `PlayerInventory` and gold to `PlayerWallet`, and despawns the drop entity.
//! 3. Players outside `LOOT_PICKUP_RADIUS` or dead players do not pick up the drop.

use bevy_ecs::prelude::*;
use server_rs::content::bestiary::MobTier;
use server_rs::ecs::components::{
    EntityId, Health, HitLog, HitRecord, LootDrop, MobSpawnAnchor, MobTag, PlayerInventory,
    PlayerTag, PlayerWallet, Position,
};
use server_rs::systems::{loot_drop_on_kill_system, loot_pickup_system, LOOT_PICKUP_RADIUS};

#[test]
fn killing_mob_spawns_loot_drop_at_death_location_and_walking_over_picks_it_up() {
    let mut world = World::new();

    let player = world
        .spawn((
            PlayerTag,
            Position::new(100.0, 100.0),
            Health::new(200.0),
            PlayerInventory::default(),
            PlayerWallet::default(),
        ))
        .id();

    let mob = world
        .spawn((
            MobTag,
            EntityId("mob-interior-1".to_string()),
            Position::new(140.0, 100.0),
            Health::new(150.0),
            MobSpawnAnchor::new(
                Position::new(140.0, 100.0),
                "bramble_stalker",
                MobTier::Interior,
                15.0,
            ),
        ))
        .id();

    // Record fatal hit on the mob.
    world.insert_resource(HitLog(vec![HitRecord {
        attacker: player,
        target: mob,
        amount: 150.0,
        killed: true,
    }]));

    let mut drop_schedule = Schedule::default();
    drop_schedule.add_systems(loot_drop_on_kill_system);
    drop_schedule.run(&mut world);

    // 1. Verify a LootDrop spawned at the mob's death coordinates (140.0, 100.0).
    let mut drop_query = world.query::<(Entity, &Position, &LootDrop)>();
    let drops: Vec<(Entity, Position, LootDrop)> = drop_query
        .iter(&world)
        .map(|(e, p, d)| (e, *p, d.clone()))
        .collect();
    assert_eq!(
        drops.len(),
        1,
        "Expected 1 loot drop spawned on mob kill, got {}",
        drops.len()
    );
    let (drop_entity, drop_pos, drop_data) = &drops[0];
    assert_eq!(drop_pos.x, 140.0);
    assert_eq!(drop_pos.y, 100.0);
    assert_eq!(drop_data.item_id, "a_leather");
    assert_eq!(drop_data.quantity, 1);
    assert!(drop_data.gold > 0);

    // 2. Player is at (100, 100), distance = 40.0 > LOOT_PICKUP_RADIUS (25.0) -> not picked up yet.
    let mut pickup_schedule = Schedule::default();
    pickup_schedule.add_systems(loot_pickup_system);
    pickup_schedule.run(&mut world);

    assert!(
        world.get_entity(*drop_entity).is_ok(),
        "Drop at distance 40.0 (> {}) should remain in world",
        LOOT_PICKUP_RADIUS
    );
    assert_eq!(
        world
            .get::<PlayerInventory>(player)
            .unwrap()
            .count("a_leather"),
        0
    );

    // 3. Walk player within pickup radius (distance = 12.0 <= 25.0).
    world.get_mut::<Position>(player).unwrap().x = 128.0;
    pickup_schedule.run(&mut world);

    assert!(
        world.get_entity(*drop_entity).is_err(),
        "Loot drop entity must despawn once picked up"
    );
    let inv = world.get::<PlayerInventory>(player).unwrap();
    assert_eq!(inv.count("a_leather"), 1);
    let wallet = world.get::<PlayerWallet>(player).unwrap();
    assert_eq!(wallet.gold, drop_data.gold);
}

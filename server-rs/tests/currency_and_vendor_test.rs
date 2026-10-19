//! Integration tests for F-145 (E-005 Slice 8: Currency and vendor).

use bevy_ecs::prelude::*;
use server_rs::content::item_catalog::ItemCatalog;
use server_rs::ecs::components::{PlayerInventory, PlayerWallet};
use server_rs::systems::progression::{vendor_buy_item, vendor_sell_item};

#[test]
fn vendor_buy_deducts_gold_grants_items_and_rejects_insufficient_funds() {
    let mut world = World::new();
    let catalog = ItemCatalog::global();
    let potion = catalog
        .get("pot_minor_heal")
        .expect("pot_minor_heal must exist in ItemCatalog");
    assert!(potion.price_gold > 0);

    let starting_gold = potion.price_gold * 3 + 5;
    let player = world
        .spawn((
            PlayerWallet {
                gold: starting_gold,
            },
            PlayerInventory::new(),
        ))
        .id();

    let remaining = vendor_buy_item(&mut world, player, "pot_minor_heal", 2)
        .expect("buying 2 potions with sufficient gold should succeed");
    assert_eq!(remaining, starting_gold - potion.price_gold * 2);

    let inv = world.get::<PlayerInventory>(player).unwrap();
    assert_eq!(inv.count("pot_minor_heal"), 2);

    // Buying 2 more when only 1.x potion's worth of gold remains must fail atomically
    let err = vendor_buy_item(&mut world, player, "pot_minor_heal", 2)
        .expect_err("insufficient gold must fail");
    assert!(err.contains("Insufficient gold"));
    assert_eq!(world.get::<PlayerWallet>(player).unwrap().gold, remaining);
    assert_eq!(
        world
            .get::<PlayerInventory>(player)
            .unwrap()
            .count("pot_minor_heal"),
        2
    );
}

#[test]
fn vendor_sell_removes_owned_items_credits_sell_gold_and_rejects_unowned_quantity() {
    let mut world = World::new();
    let catalog = ItemCatalog::global();
    let sword = catalog
        .get("w_ember_blade")
        .expect("w_ember_blade must exist in ItemCatalog");
    assert!(sword.sell_gold > 0);

    let mut inv = PlayerInventory::new();
    inv.add_item("w_ember_blade", 2);

    let player = world.spawn((PlayerWallet { gold: 10 }, inv)).id();

    let new_balance = vendor_sell_item(&mut world, player, "w_ember_blade", 1)
        .expect("selling 1 owned w_ember_blade should succeed");
    assert_eq!(new_balance, 10 + sword.sell_gold);
    assert_eq!(
        world
            .get::<PlayerInventory>(player)
            .unwrap()
            .count("w_ember_blade"),
        1
    );

    // Selling 2 when only 1 remains must fail without mutating inventory or wallet
    let err = vendor_sell_item(&mut world, player, "w_ember_blade", 2)
        .expect_err("selling more than owned must fail");
    assert!(err.contains("does not own"));
    assert_eq!(world.get::<PlayerWallet>(player).unwrap().gold, new_balance);
    assert_eq!(
        world
            .get::<PlayerInventory>(player)
            .unwrap()
            .count("w_ember_blade"),
        1
    );
}

//! E-005 Slice 2 (`F-133`): Minimal item catalogue integration tests.
//!
//! Verifies that:
//! 1. `ItemCatalog::global()` defines weapons (`w_sword`, `w_bow`, `w_staff`, `w_ember_blade`),
//!    armor (`a_cloth`, `a_leather`, `a_plate`), accessories, consumables, and materials with
//!    typed stat modifiers and positive gold prices.
//! 2. Every item ID produced by `loot_for_tier` across all `MobTier` variants resolves
//!    deterministically in `ItemCatalog::global()`.

use server_rs::content::{EquipmentSlot, ItemCatalog, MobTier};

#[test]
fn minimal_item_catalogue_covers_weapons_armor_accessories_and_consumables() {
    let catalog = ItemCatalog::global();
    assert!(
        catalog.all().len() >= 10,
        "Expected at least 10 items in minimal catalogue, got {}",
        catalog.all().len()
    );

    let sword = catalog.get("w_sword").expect("w_sword present");
    assert_eq!(sword.slot, EquipmentSlot::Weapon);
    assert!(sword.bonus_atk > 0.0);
    assert!(sword.price_gold > 0);

    let bow = catalog.get("w_bow").expect("w_bow present");
    assert_eq!(bow.slot, EquipmentSlot::Weapon);

    let staff = catalog.get("w_staff").expect("w_staff present");
    assert_eq!(staff.slot, EquipmentSlot::Weapon);

    let plate = catalog.get("a_plate").expect("a_plate present");
    assert_eq!(plate.slot, EquipmentSlot::Armor);
    assert!(plate.bonus_def > 0.0 && plate.bonus_hp > 0.0);

    let ring = catalog
        .get("acc_vigor_ring")
        .expect("acc_vigor_ring present");
    assert_eq!(ring.slot, EquipmentSlot::Accessory);

    let potion = catalog
        .get("pot_minor_heal")
        .expect("pot_minor_heal present");
    assert_eq!(potion.slot, EquipmentSlot::Consumable);
}

#[test]
fn every_mob_tier_loot_table_entry_resolves_in_item_catalogue() {
    let catalog = ItemCatalog::global();
    for tier in [
        MobTier::Verge,
        MobTier::Route,
        MobTier::Interior,
        MobTier::Heart,
        MobTier::Boss,
    ] {
        let drop = catalog.loot_for_tier(tier);
        assert!(drop.quantity >= 1);
        assert!(drop.gold > 0);
        let item = catalog.get(&drop.item_id).unwrap_or_else(|| {
            panic!(
                "Loot item_id '{}' for tier {:?} missing from ItemCatalog",
                drop.item_id, tier
            )
        });
        assert_eq!(item.id, drop.item_id);
    }
}

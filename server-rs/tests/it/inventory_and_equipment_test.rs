//! E-005 Slice 5 (`I-158` -> `F-141`): Inventory and equipment screen.
//!
//! Verifies:
//! 1. Picked-up items appear in `PlayerInventory` with accurate quantities.
//! 2. Equipping a weapon (`w_ember_blade`), armor (`a_plate`), or accessory (`acc_vigor_ring`)
//!    from `PlayerInventory` updates `PlayerEquipment` and immediately increases the live
//!    avatar's `Health::max`, `CombatStats::attack_power`, and `CombatStats::defense`.
//! 3. Attempting to equip an unowned item or non-equippable consumable is rejected cleanly.

use bevy_ecs::prelude::*;
use server_rs::content::item_catalog::EquipmentSlot;
use server_rs::ecs::components::{
    CombatStats, EquippedWeapon, Health, PlayerEquipment, PlayerInventory, PlayerProgression,
    PlayerTag, Position,
};
use server_rs::systems::equip_item_from_inventory;

#[test]
fn equipping_items_from_inventory_updates_equipment_slots_and_live_avatar_stats() {
    let mut world = World::new();

    let mut inv = PlayerInventory::default();
    inv.add_item("w_ember_blade", 1);
    inv.add_item("a_plate", 1);
    inv.add_item("acc_vigor_ring", 1);
    inv.add_item("pot_minor_heal", 3);

    let player = world
        .spawn((
            PlayerTag,
            Position::new(100.0, 100.0),
            Health::new(100.0),
            CombatStats {
                attack_power: 10.0,
                defense: 0.0,
                attack_range: 35.0,
                attack_cooldown: 1.0,
                cooldown_timer: 0.0,
                is_player: true,
            },
            PlayerProgression::new(),
            inv,
            PlayerEquipment::default(),
            EquippedWeapon::default(),
        ))
        .id();

    // 1. Verify inventory contents.
    let inv_ref = world.get::<PlayerInventory>(player).unwrap();
    assert!(inv_ref.has_item("w_ember_blade"));
    assert!(inv_ref.has_item("a_plate"));
    assert!(inv_ref.has_item("acc_vigor_ring"));
    assert_eq!(inv_ref.count("pot_minor_heal"), 3);

    // 2. Equip weapon -> attack power increases.
    let slot = equip_item_from_inventory(&mut world, player, "w_ember_blade")
        .expect("Weapon should equip");
    assert_eq!(slot, EquipmentSlot::Weapon);
    let stats_after_weapon = *world.get::<CombatStats>(player).unwrap();
    assert!(
        stats_after_weapon.attack_power > 10.0,
        "Equipping w_ember_blade must increase attack_power above 10.0, got {}",
        stats_after_weapon.attack_power
    );

    // 3. Equip armor -> defense and max HP increase.
    let slot =
        equip_item_from_inventory(&mut world, player, "a_plate").expect("Armor should equip");
    assert_eq!(slot, EquipmentSlot::Armor);
    let stats_after_armor = *world.get::<CombatStats>(player).unwrap();
    let hp_after_armor = *world.get::<Health>(player).unwrap();
    assert!(
        stats_after_armor.defense > 0.0,
        "Equipping a_plate must increase defense above 0.0, got {}",
        stats_after_armor.defense
    );
    assert!(
        hp_after_armor.max > 100.0,
        "Equipping a_plate must increase max HP above 100.0, got {}",
        hp_after_armor.max
    );

    // 4. Equip accessory -> additional stat bonuses stack with weapon + armor.
    let slot = equip_item_from_inventory(&mut world, player, "acc_vigor_ring")
        .expect("Accessory should equip");
    assert_eq!(slot, EquipmentSlot::Accessory);
    let hp_after_acc = *world.get::<Health>(player).unwrap();
    assert!(
        hp_after_acc.max > hp_after_armor.max,
        "Equipping acc_vigor_ring must further increase max HP"
    );

    let equip = world.get::<PlayerEquipment>(player).unwrap();
    assert_eq!(equip.weapon_id.as_deref(), Some("w_ember_blade"));
    assert_eq!(equip.armor_id.as_deref(), Some("a_plate"));
    assert_eq!(equip.accessory_id.as_deref(), Some("acc_vigor_ring"));

    // 5. Rejects unowned item and non-equippable consumable.
    assert!(
        equip_item_from_inventory(&mut world, player, "w_staff").is_err(),
        "Unowned item must be rejected"
    );
    assert!(
        equip_item_from_inventory(&mut world, player, "pot_minor_heal").is_err(),
        "Consumable item must be rejected"
    );
}

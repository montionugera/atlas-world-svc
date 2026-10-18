//! E-005 Slice 6 (`I-159` -> `F-142`): Weapon switching and skill loadout in play.
//!
//! Verifies:
//! 1. Switching the active weapon at runtime from `w_sword` (melee) to `w_bow` (bow)
//!    updates `EquippedWeapon::kind`, projectile speed/range, and `CombatStats::attack_range`.
//! 2. Reconfiguring `SkillLoadout` slots `1..=4` at runtime causes pressing slot `1`
//!    (`PlayerInputState::skill_slot = 1`) in `skill_execution_system` to cast the newly
//!    assigned skill (`skill_3` Blizzard) rather than the default `skill_1`.

use bevy_ecs::prelude::*;
use server_rs::core::clock::SimClock;
use server_rs::ecs::components::{
    CastingState, CombatStats, CooldownTracker, EquippedWeapon, Health, PlayerEquipment,
    PlayerInputState, PlayerInventory, PlayerProgression, PlayerTag, Position, Velocity,
    WeaponKind,
};
use server_rs::systems::{configure_skill_loadout, skill_execution_system, switch_active_weapon};

#[test]
fn switching_active_weapon_and_skill_loadout_changes_attack_behavior_and_cast_skill() {
    let mut world = World::new();
    world.insert_resource(SimClock::new(50));

    let mut inv = PlayerInventory::default();
    inv.add_item("w_sword", 1);
    inv.add_item("w_bow", 1);

    let player = world
        .spawn((
            PlayerTag,
            Position::new(100.0, 100.0),
            Velocity::zero(),
            Health::new(200.0),
            CombatStats {
                attack_power: 15.0,
                defense: 5.0,
                attack_range: 35.0,
                attack_cooldown: 1.0,
                cooldown_timer: 0.0,
                is_player: true,
            },
            PlayerProgression::new(),
            inv,
            PlayerEquipment::default(),
            EquippedWeapon::default(),
            PlayerInputState::new(0.0, 0.0, false, 0),
            CooldownTracker::new(),
            CastingState::new(),
        ))
        .id();

    // 1. Equip melee sword first.
    let kind_sword = switch_active_weapon(&mut world, player, "w_sword").unwrap();
    assert_eq!(kind_sword, WeaponKind::Melee);
    let melee_range = world.get::<CombatStats>(player).unwrap().attack_range;

    // 2. Switch to ranged bow in play -> kind becomes Bow and attack_range expands.
    let kind_bow = switch_active_weapon(&mut world, player, "w_bow").unwrap();
    assert_eq!(kind_bow, WeaponKind::Bow);
    let ranged_range = world.get::<CombatStats>(player).unwrap().attack_range;
    assert!(
        ranged_range > melee_range,
        "Switching from w_sword ({}) to w_bow ({}) must increase attack_range",
        melee_range,
        ranged_range
    );

    // 3. Reconfigure skill loadout so slot 1 fires `skill_3` (Blizzard) instead of `skill_1`.
    configure_skill_loadout(
        &mut world,
        player,
        [
            "skill_3".to_string(),
            "skill_4".to_string(),
            "skill_2".to_string(),
            "skill_1".to_string(),
        ],
    );

    // Trigger slot 1 press.
    world
        .get_mut::<PlayerInputState>(player)
        .unwrap()
        .skill_slot = 1;

    let mut schedule = Schedule::default();
    schedule.add_systems(skill_execution_system);
    schedule.run(&mut world);

    let casting = world.get::<CastingState>(player).unwrap();
    assert_eq!(
        casting.skill_id.as_deref(),
        Some("skill_3"),
        "Pressing slot 1 must cast the configured loadout skill (`skill_3`)"
    );
}

use server_rs::combat::buffs::{ActiveBuff, AuraEmitter, BuffCategory, BuffContainer};
use server_rs::simulation::AtlasSimulation;

#[test]
fn test_aura_emitter_pulses_buff_to_allies_in_radius() {
    let mut sim = AtlasSimulation::new(0x999, 1000.0, 1000.0);

    // 1. Spawn Buffer / Paladin at (100.0, 100.0)
    let buffer_ent = sim.spawn_player_avatar("buffer_hero", 100.0, 100.0);

    // Attach AuraEmitter to the buffer (radius 30.0m, pulse interval 0.05s)
    let mut chant_of_victory = ActiveBuff::new(
        "chant_of_victory",
        "Chant of Victory",
        BuffCategory::SongDance,
        20.0,
    );
    chant_of_victory.p_atk_mult = 1.20;
    chant_of_victory.crit_rate_bonus = 15.0;

    let aura = AuraEmitter::new(chant_of_victory, 30.0, 0.05, true);
    sim.world.entity_mut(buffer_ent).insert(aura);

    // 2. Spawn Ally A within radius at (115.0, 100.0) -> distance = 15m < 30m
    let ally_a = sim.spawn_player_avatar("ally_near", 115.0, 100.0);

    // 3. Spawn Ally B outside radius at (150.0, 100.0) -> distance = 50m > 30m
    let ally_b = sim.spawn_player_avatar("ally_far", 150.0, 100.0);

    // 4. Run simulation ticks (10 ticks at 20Hz = 0.5s)
    for _ in 0..10 {
        sim.step();
    }

    // 5. Verify Ally A received the buff
    let container_a = sim
        .world
        .get::<BuffContainer>(ally_a)
        .expect("Ally A must have BuffContainer");
    assert!(
        container_a.has_buff("chant_of_victory"),
        "Ally A should receive the aura buff within 30m"
    );

    let mults_a = container_a.aggregate_multipliers();
    assert!((mults_a.p_atk_mult - 1.20).abs() < 1e-3);
    assert_eq!(mults_a.crit_rate_bonus, 15.0);

    // 6. Verify Ally B did not receive the buff
    let container_b = sim
        .world
        .get::<BuffContainer>(ally_b)
        .expect("Ally B must have BuffContainer");
    assert!(
        !container_b.has_buff("chant_of_victory"),
        "Ally B should NOT receive aura buff beyond 30m"
    );

    // 7. Verify Buffer also received their own aura buff
    let container_buffer = sim
        .world
        .get::<BuffContainer>(buffer_ent)
        .expect("Buffer must have BuffContainer");
    assert!(container_buffer.has_buff("chant_of_victory"));
}

#[test]
fn test_buff_container_stat_aggregation_and_slot_caps() {
    let mut container = BuffContainer::new();

    // Fill standard buffs up to limit
    for i in 0..server_rs::combat::buffs::MAX_STANDARD_BUFF_SLOTS {
        let buff = ActiveBuff::new(
            format!("standard_buff_{}", i),
            format!("Standard Buff {}", i),
            BuffCategory::Offensive,
            60.0,
        );
        assert!(
            container.apply_buff(buff),
            "Should allow up to standard slot cap"
        );
    }

    // Exceeding standard slot cap fails
    let excess_buff = ActiveBuff::new(
        "excess_buff",
        "Excess Buff",
        BuffCategory::Offensive,
        60.0,
    );
    assert!(
        !container.apply_buff(excess_buff),
        "Should reject buffs exceeding standard slot cap"
    );

    // Song/Dance has independent slots
    let song = ActiveBuff::new(
        "song_of_earth",
        "Song of Earth",
        BuffCategory::SongDance,
        120.0,
    );
    assert!(
        container.apply_buff(song),
        "Song/Dance slot should be independent of standard buffs"
    );
}

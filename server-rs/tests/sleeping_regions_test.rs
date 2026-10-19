use bevy_ecs::prelude::With;
use server_rs::content::MobTier;
use server_rs::ecs::components::{
    DeadMobTracker, EntityId, Health, MobSpawnAnchor, MobTag, Position,
};
use server_rs::net::ClientPacket;
use server_rs::protocol::serialize_client_input;
use server_rs::simulation::{AtlasSimulation, LiveConfig};

fn make_move_packet(session_id: &str, mx: f32, my: f32, tick: u32) -> ClientPacket {
    ClientPacket::new(
        session_id,
        serialize_client_input(tick, mx, my, false, 0, 0),
    )
}

#[test]
fn empty_region_sleeps_and_skips_ticks_until_player_joins() {
    let mut sim = AtlasSimulation::live(LiveConfig {
        seed: 42,
        arena_width: 4000.0,
        arena_height: 4000.0,
        bot_count: 0,
        mob_count: 8,
        mob_respawn_sec: 5.0,
        player_respawn_sec: 5.0,
        map_id: Some("town-millcross".to_string()),
    });

    assert_eq!(sim.active_player_count(), 0);
    assert!(!sim.is_sleeping());

    // Tick with 0 players: transitions to sleeping and skips stepping
    let frame = sim.step_if_awake(1_000, &[], &[]);
    assert!(frame.is_none());
    assert!(sim.is_sleeping());
    assert_eq!(sim.sleeping_since_ms(), Some(1_000));
    assert_eq!(sim.clock.tick(), 0);

    // Subsequent ticks while empty remain asleep and do not advance tick counter
    for t in [1_050, 1_100, 1_150, 2_000] {
        assert!(sim.step_if_awake(t, &[], &[]).is_none());
        assert_eq!(sim.clock.tick(), 0);
        assert_eq!(sim.sleeping_since_ms(), Some(1_000));
    }

    // Player sends input at t = 3_000ms -> region wakes and steps tick 1
    let pkt = make_move_packet("player-1", 1.0, 0.0, 1);
    let frame = sim
        .step_if_awake(3_000, &[pkt], &[])
        .expect("region should wake and produce a LiveFrame");
    assert!(!sim.is_sleeping());
    assert_eq!(sim.sleeping_since_ms(), None);
    assert_eq!(sim.active_player_count(), 1);
    assert_eq!(frame.tick, 1);
    assert_eq!(sim.clock.tick(), 1);

    // While player-1 remains in region, empty inputs still step the region
    let frame2 = sim
        .step_if_awake(3_050, &[], &[])
        .expect("region with 1 active player stays awake");
    assert_eq!(frame2.tick, 2);
    assert!(!sim.is_sleeping());

    // Player-1 disconnects at t = 3_100ms -> region processes disconnect tick, then enters sleep
    let frame3 = sim
        .step_if_awake(3_100, &[], &["player-1".to_string()])
        .expect("disconnect tick executes to despawn avatar and emit removed_ids");
    assert_eq!(frame3.tick, 3);
    assert_eq!(sim.active_player_count(), 0);
    assert!(sim.is_sleeping());
    assert_eq!(sim.sleeping_since_ms(), Some(3_100));

    // Next tick at t = 3_150ms is skipped because region is now sleeping
    assert!(sim.step_if_awake(3_150, &[], &[]).is_none());
    assert_eq!(sim.clock.tick(), 3);
}

#[test]
fn waking_region_fast_forwards_partial_mob_respawn_timers() {
    let mut sim = AtlasSimulation::live(LiveConfig {
        seed: 7,
        arena_width: 1000.0,
        arena_height: 1000.0,
        bot_count: 0,
        mob_count: 1,
        mob_respawn_sec: 10.0,
        player_respawn_sec: 5.0,
        map_id: None,
    });

    // Spawn a player so the region is awake, and kill the single mob
    let pkt = make_move_packet("p1", 0.0, 0.0, 1);
    sim.step_if_awake(1_000, &[pkt], &[]);

    let mut mob_query = sim.world.query_filtered::<&mut Health, With<MobTag>>();
    for mut h in mob_query.iter_mut(&mut sim.world) {
        h.take_damage(10_000.0);
    }

    // Step enough ticks (0.5s corpse + 1 tick = 12 ticks) for corpse to become DeadMobTracker
    for i in 0..12 {
        sim.step_if_awake(1_050 + i * 50, &[], &[]);
    }

    let current_sim_sec = sim.clock.current_time_seconds();
    let initial_respawn_at = {
        let mut tracker_q = sim.world.query::<&DeadMobTracker>();
        let tracker = tracker_q
            .iter(&sim.world)
            .next()
            .expect("DeadMobTracker should exist after corpse despawns");
        tracker.respawn_at
    };
    let remaining_before_sleep = initial_respawn_at - current_sim_sec;
    assert!(
        remaining_before_sleep > 9.0 && remaining_before_sleep <= 10.0,
        "expected ~10s remaining before sleep, got {}",
        remaining_before_sleep
    );

    // Disconnect p1 at t = 2_000ms -> region goes to sleep
    sim.step_if_awake(2_000, &[], &["p1".to_string()]);
    assert!(sim.is_sleeping());
    assert_eq!(sim.sleeping_since_ms(), Some(2_000));

    // Sleep for 4,000ms (4.0 seconds) and wake at t = 6_000ms
    let elapsed = sim.wake(6_000);
    assert!((elapsed - 4.0).abs() < 1e-4);
    assert!(!sim.is_sleeping());

    let after_wake_respawn_at = {
        let mut tracker_q = sim.world.query::<&DeadMobTracker>();
        let tracker = tracker_q
            .iter(&sim.world)
            .next()
            .expect("DeadMobTracker should still exist after partial 4s sleep");
        tracker.respawn_at
    };
    assert!(
        (initial_respawn_at - after_wake_respawn_at - 4.0).abs() < 1e-3,
        "respawn_at should be reduced by 4.0s (was {}, now {})",
        initial_respawn_at,
        after_wake_respawn_at
    );
}

#[test]
fn waking_region_immediately_respawns_mobs_whose_sleep_duration_exceeds_timer() {
    let mut sim = AtlasSimulation::live(LiveConfig {
        seed: 99,
        arena_width: 1000.0,
        arena_height: 1000.0,
        bot_count: 0,
        mob_count: 0,
        mob_respawn_sec: 5.0,
        player_respawn_sec: 5.0,
        map_id: None,
    });

    // Insert a DeadMobTracker scheduled to respawn at sim_time = 5.0s at anchor (120.0, 140.0)
    let anchor = MobSpawnAnchor::new(
        Position::new(120.0, 140.0),
        "mob-bramble-stalker",
        MobTier::Route,
        5.0,
    );
    sim.world.spawn(DeadMobTracker {
        death_time: 0.0,
        respawn_at: 5.0,
        anchor: anchor.clone(),
    });

    // Put region to sleep at t = 1_000ms
    sim.sleep(1_000);
    assert!(sim.is_sleeping());

    // Wake at t = 7_000ms (6.0s of sleep >= 5.0s respawn timer) BEFORE any tick executes
    let elapsed = sim.wake(7_000);
    assert!((elapsed - 6.0).abs() < 1e-4);

    // DeadMobTracker must be consumed and mob respawned at exact (120.0, 140.0) before tick 1
    let tracker_count = sim
        .world
        .query::<&DeadMobTracker>()
        .iter(&sim.world)
        .count();
    assert_eq!(
        tracker_count, 0,
        "DeadMobTracker should be despawned on wake"
    );

    {
        let mut mob_q = sim
            .world
            .query_filtered::<(&EntityId, &Position, &Health, &MobSpawnAnchor), With<MobTag>>();
        let mobs: Vec<(&EntityId, &Position, &Health, &MobSpawnAnchor)> =
            mob_q.iter(&sim.world).collect();
        assert_eq!(mobs.len(), 1, "Mob should be respawned immediately on wake");
        assert!((mobs[0].1.x - 120.0).abs() < 1e-3);
        assert!((mobs[0].1.y - 140.0).abs() < 1e-3);
        assert_eq!(mobs[0].3.spawn_pos, Position::new(120.0, 140.0));
        assert!(mobs[0].2.is_alive);
    }

    // Now run the first awake tick with the joining player
    let pkt = make_move_packet("p-wake", 0.0, 0.0, 1);
    let frame = sim
        .step_if_awake(7_000, &[pkt], &[])
        .expect("region steps on player join");
    assert!(
        frame.entities.len() >= 2,
        "LiveFrame includes both player and respawned mob"
    );
}

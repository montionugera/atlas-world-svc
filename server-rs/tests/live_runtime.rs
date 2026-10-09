//! Live-path integration tests (plan 2026-10-09 server-rs live parity, Wave A).
//!
//! Every test builds the simulation through `AtlasSimulation::live(..)` and advances it with
//! `live_tick(..)` — exactly what `main.rs` does — so a system that exists but is not wired
//! into the live runtime fails here.

use bevy_ecs::prelude::*;
use futures_util::SinkExt;
use server_rs::ai::ThreatTable;
use server_rs::auth::AuthGuard;
use server_rs::content::{derive_mob_stats, BestiaryCatalog};
use server_rs::ecs::components::{
    CombatStats, EntityId, Health, MobAi, MobSpawnAnchor, MobTag, PlayerAvatar, Position, Velocity,
};
use server_rs::net::{ClientPacket, WsServer};
use server_rs::protocol::{fnv1a_32, serialize_client_input};
use server_rs::simulation::{AtlasSimulation, LiveConfig, LiveFrame};
use std::time::Duration;
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message;

const W: f32 = 1000.0;
const H: f32 = 1000.0;

fn live(bots: usize, mobs: usize) -> AtlasSimulation {
    AtlasSimulation::live(LiveConfig {
        seed: 0x5eed,
        arena_width: W,
        arena_height: H,
        bot_count: bots,
        mob_count: mobs,
        mob_respawn_sec: 1.0,
        player_respawn_sec: 1.0,
    })
}

fn input(session: &str, mx: f32, my: f32, attack: bool) -> ClientPacket {
    ClientPacket {
        session_id: session.to_string(),
        payload: serialize_client_input(1, mx, my, attack, 0, 0),
    }
}

fn tick(sim: &mut AtlasSimulation) -> LiveFrame {
    sim.live_tick(&[], &[])
}

fn ticks(sim: &mut AtlasSimulation, n: usize) {
    for _ in 0..n {
        tick(sim);
    }
}

fn mobs(sim: &mut AtlasSimulation) -> Vec<(Entity, String, Position)> {
    let mut q = sim
        .world
        .query_filtered::<(Entity, &EntityId, &Position), With<MobTag>>();
    let mut v: Vec<_> = q
        .iter(&sim.world)
        .map(|(e, id, p)| (e, id.0.clone(), *p))
        .collect();
    v.sort_by(|a, b| a.1.cmp(&b.1));
    v
}

fn pos(sim: &AtlasSimulation, e: Entity) -> Position {
    *sim.world.get::<Position>(e).unwrap()
}

fn dist(a: Position, b: Position) -> f32 {
    ((a.x - b.x).powi(2) + (a.y - b.y).powi(2)).sqrt()
}

fn avatar(sim: &mut AtlasSimulation, session: &str) -> Option<Entity> {
    let mut q = sim.world.query::<(Entity, &PlayerAvatar)>();
    q.iter(&sim.world)
        .find(|(_, a)| a.session_id == session)
        .map(|(e, _)| e)
}

/// A distance inside the mob's chase range but outside its attack range.
fn chase_offset(sim: &AtlasSimulation, mob: Entity) -> f32 {
    let ai = sim
        .world
        .get::<MobAi>(mob)
        .expect("live mob must carry MobAi");
    (ai.attack_range + ai.chase_range) / 2.0
}

/// Force a mob to melee (the seeded bestiary pick may be ranged).
fn make_melee(sim: &mut AtlasSimulation, mob: Entity) {
    let reach = 20.0 + 12.0 + 14.0;
    let mut ai = sim.world.get_mut::<MobAi>(mob).unwrap();
    ai.is_ranged = false;
    ai.attack_range = reach;
    sim.world.get_mut::<CombatStats>(mob).unwrap().attack_range = reach;
}

/// Spawn a stationary human avatar `offset` px from the mob, towards the arena centre.
fn player_near_mob(sim: &mut AtlasSimulation, mob: Position, offset: f32) -> Entity {
    let dx = if mob.x < W / 2.0 { offset } else { -offset };
    sim.spawn_player_avatar("p1", mob.x + dx, mob.y)
}

// ---- Row 1: wander / chase ------------------------------------------------------------

#[test]
fn row1_live_mobs_wander_with_no_players_near() {
    let mut sim = live(0, 5);
    let before = mobs(&mut sim);
    assert_eq!(before.len(), 5);
    ticks(&mut sim, 60); // 3 s
    for (e, id, p0) in before {
        let moved = dist(p0, pos(&sim, e));
        assert!(moved > 1.0, "mob {id} did not wander (moved {moved})");
    }
}

#[test]
fn row1_live_mob_chases_player_in_chase_range() {
    let mut sim = live(0, 1);
    let (mob, _, mob_pos) = mobs(&mut sim)[0].clone();
    let off = chase_offset(&sim, mob);
    let p = player_near_mob(&mut sim, mob_pos, off);
    let d0 = dist(pos(&sim, mob), pos(&sim, p));
    ticks(&mut sim, 10);
    let d1 = dist(pos(&sim, mob), pos(&sim, p));
    assert!(d1 < d0 - 10.0, "mob did not approach player: {d0} -> {d1}");
}

// ---- Row 1b: aggro ----------------------------------------------------------------------

#[test]
fn row1b_proximity_aggro_targets_player_in_chase_range() {
    let mut sim = live(0, 1);
    let (mob, _, mob_pos) = mobs(&mut sim)[0].clone();
    let p = player_near_mob(&mut sim, mob_pos, 120.0);
    tick(&mut sim);
    let now = sim.clock.current_time_seconds();
    let threat = sim
        .world
        .get::<ThreatTable>(mob)
        .expect("live mob must carry a ThreatTable");
    assert_eq!(threat.top_target(now), Some(p));
}

#[test]
fn row1b_damage_adds_threat_on_victim_mob() {
    let mut sim = live(0, 1);
    let (mob, _, mob_pos) = mobs(&mut sim)[0].clone();
    sim.world
        .get_mut::<MobAi>(mob)
        .expect("live mob must carry MobAi")
        .chase_range = 0.0; // disable proximity aggro: only damage may add threat
    let p = player_near_mob(&mut sim, mob_pos, 30.0);
    sim.live_tick(&[input("p1", 0.0, 0.0, true)], &[]);
    let now = sim.clock.current_time_seconds();
    assert_eq!(
        sim.world.get::<ThreatTable>(mob).unwrap().top_target(now),
        Some(p)
    );
}

// ---- Row 1c: speed ----------------------------------------------------------------------

#[test]
fn row1c_chase_speed_is_bestiary_speed() {
    let mut sim = live(0, 1);
    let (mob, _, mob_pos) = mobs(&mut sim)[0].clone();
    let anchor = sim
        .world
        .get::<MobSpawnAnchor>(mob)
        .expect("live mob must carry MobSpawnAnchor")
        .clone();
    let catalog = BestiaryCatalog::default();
    let expected = derive_mob_stats(catalog.get_mob(&anchor.mob_id).unwrap(), anchor.tier).speed;
    let off = chase_offset(&sim, mob);
    player_near_mob(&mut sim, mob_pos, off);
    ticks(&mut sim, 2);
    let v = sim.world.get::<Velocity>(mob).unwrap();
    let speed = (v.vx * v.vx + v.vy * v.vy).sqrt();
    assert!(
        (speed - expected).abs() <= expected * 0.05,
        "chase speed {speed} != bestiary speed {expected}"
    );
}

// ---- Row 2: mob melee -------------------------------------------------------------------

#[test]
fn row2_melee_mob_closes_distance_and_damages_player() {
    let mut sim = live(0, 1);
    let (mob, _, mob_pos) = mobs(&mut sim)[0].clone();
    make_melee(&mut sim, mob);
    let p = player_near_mob(&mut sim, mob_pos, 120.0);
    let max = sim.world.get::<Health>(p).unwrap().max;
    ticks(&mut sim, 100);
    let d = dist(pos(&sim, mob), pos(&sim, p));
    assert!(d <= 46.0, "melee mob did not close to reach: {d}");
    let hp = sim.world.get::<Health>(p).unwrap().current;
    assert!(hp < max, "mob never damaged the player ({hp}/{max})");
}

#[test]
fn row2_mob_attack_cooldown_decrements_once_per_tick() {
    let mut sim = live(0, 1);
    let (mob, _, _) = mobs(&mut sim)[0].clone();
    sim.world
        .get_mut::<CombatStats>(mob)
        .unwrap()
        .cooldown_timer = 1.0;
    tick(&mut sim);
    let cd = sim.world.get::<CombatStats>(mob).unwrap().cooldown_timer;
    assert!((cd - 0.95).abs() < 1e-4, "cooldown after one tick = {cd}");
}

// ---- Row 4: player respawn --------------------------------------------------------------

#[test]
fn row4_dead_player_respawns_at_spawn_point_with_full_hp() {
    let mut sim = live(0, 0);
    sim.live_tick(&[input("p1", 0.0, 0.0, false)], &[]);
    let p = avatar(&mut sim, "p1").expect("avatar spawned from input");
    let spawn = pos(&sim, p);
    *sim.world.get_mut::<Position>(p).unwrap() = Position::new(100.0, 100.0);
    sim.world.get_mut::<Health>(p).unwrap().take_damage(1.0e6);
    tick(&mut sim);
    assert!(!sim.world.get::<Health>(p).unwrap().is_alive);
    ticks(&mut sim, 25); // > 1.0 s respawn delay
    let h = *sim.world.get::<Health>(p).unwrap();
    assert!(h.is_alive, "player never respawned");
    assert_eq!(h.current, h.max);
    let at = pos(&sim, p);
    assert!(
        dist(at, spawn) < 0.01,
        "respawned at {at:?}, spawn {spawn:?}"
    );
}

// ---- Row 5: mob despawn / respawn -------------------------------------------------------

#[test]
fn row5_dead_mob_despawns_into_removed_ids_and_respawns() {
    let mut sim = live(0, 1);
    let (mob, id, _) = mobs(&mut sim)[0].clone();
    sim.world.get_mut::<Health>(mob).unwrap().take_damage(1.0e6);
    // Corpse lingers (MOB_CORPSE_SEC), then the id must appear in removed_ids.
    let removed = (0..12).any(|_| tick(&mut sim).removed_ids.contains(&fnv1a_32(&id)));
    assert!(removed, "dead mob id never appeared in removed_ids");
    assert!(sim.world.get_entity(mob).is_err(), "dead mob not despawned");
    assert!(mobs(&mut sim).is_empty());

    ticks(&mut sim, 25); // > 1.0 s respawn delay
    let respawned = mobs(&mut sim);
    assert_eq!(respawned.len(), 1, "mob did not respawn");
    let e = respawned[0].0;
    let w = &sim.world;
    assert!(w.get::<MobAi>(e).is_some());
    assert!(w.get::<ThreatTable>(e).is_some());
    assert!(w.get::<MobSpawnAnchor>(e).is_some());
    let h = w.get::<Health>(e).unwrap();
    assert!(h.is_alive && h.current == h.max);
}

// ---- Row 6: body collision --------------------------------------------------------------

#[test]
fn row6_player_and_mob_are_pushed_apart() {
    let mut sim = live(0, 1);
    let (mob, _, mob_pos) = mobs(&mut sim)[0].clone();
    let p = player_near_mob(&mut sim, mob_pos, 5.0);
    ticks(&mut sim, 5);
    let d = dist(pos(&sim, mob), pos(&sim, p));
    assert!(d >= 12.0 + 14.0 - 0.01, "player/mob overlap: dist {d}");
}

#[test]
fn row6_players_are_pushed_apart_and_stay_in_bounds() {
    let mut sim = live(0, 0);
    let a = sim.spawn_player_avatar("a", 500.0, 500.0);
    let b = sim.spawn_player_avatar("b", 503.0, 500.0);
    let c = sim.spawn_player_avatar("c", W - 1.0, 300.0);
    let d = sim.spawn_player_avatar("d", W - 3.0, 300.0);
    ticks(&mut sim, 5);
    let ab = dist(pos(&sim, a), pos(&sim, b));
    let cd = dist(pos(&sim, c), pos(&sim, d));
    assert!(ab >= 24.0 - 0.01, "players overlap: {ab}");
    assert!(cd >= 24.0 - 0.01, "players at wall overlap: {cd}");
    for e in [a, b, c, d] {
        let p = pos(&sim, e);
        assert!((0.0..=W).contains(&p.x) && (0.0..=H).contains(&p.y));
    }
}

// ---- Row 7: real max_health -------------------------------------------------------------

#[test]
fn row7_wire_max_health_is_real_health_max() {
    let mut sim = live(0, 1);
    let (mob, id, _) = mobs(&mut sim)[0].clone();
    *sim.world.get_mut::<Health>(mob).unwrap() = Health::new(250.0);
    let frame = tick(&mut sim);
    let ent = frame
        .entities
        .iter()
        .find(|e| e.id == fnv1a_32(&id))
        .unwrap();
    assert_eq!(ent.max_health, 250.0);
}

// ---- Row 8: attack gated by input -------------------------------------------------------

#[test]
fn row8_human_avatar_only_melees_while_attack_held() {
    let mut sim = live(0, 1);
    let (mob, _, mob_pos) = mobs(&mut sim)[0].clone();
    player_near_mob(&mut sim, mob_pos, 30.0);
    let max = sim.world.get::<Health>(mob).unwrap().max;
    for _ in 0..10 {
        sim.live_tick(&[input("p1", 0.0, 0.0, false)], &[]);
    }
    let hp = sim.world.get::<Health>(mob).unwrap().current;
    assert_eq!(hp, max, "avatar damaged mob without attack input");
    sim.live_tick(&[input("p1", 0.0, 0.0, true)], &[]);
    let hp = sim.world.get::<Health>(mob).unwrap().current;
    assert!(hp < max, "avatar did not damage mob with attack held");
}

#[test]
fn row8_bots_still_auto_attack() {
    let mut sim = live(1, 1);
    let mut q = sim
        .world
        .query_filtered::<(Entity, &Position), Without<MobTag>>();
    let (_, bot_pos) = q
        .iter(&sim.world)
        .find(|(e, _)| sim.world.get::<Health>(*e).is_some())
        .map(|(e, p)| (e, *p))
        .unwrap();
    let (mob, _, _) = mobs(&mut sim)[0].clone();
    *sim.world.get_mut::<Position>(mob).unwrap() = Position::new(bot_pos.x + 30.0, bot_pos.y);
    let max = sim.world.get::<Health>(mob).unwrap().max;
    ticks(&mut sim, 2);
    assert!(sim.world.get::<Health>(mob).unwrap().current < max);
}

// ---- Row 11: disconnect cleanup ---------------------------------------------------------

#[tokio::test]
async fn row11_last_socket_close_removes_avatar_into_removed_ids() {
    let auth = AuthGuard::new(b"live-runtime-secret-key-0123456".to_vec());
    let server = WsServer::bind("127.0.0.1:0", auth.clone()).await.unwrap();
    let token = auth.generate_test_token("alice", "Alice", 3600);
    let url = format!("ws://{}/ws?token={}", server.local_addr(), token);
    let mut sim = live(0, 0);

    let (mut first, _) = connect_async(&url).await.unwrap();
    let (mut second, _) = connect_async(&url).await.unwrap();
    first
        .send(Message::Binary(
            serialize_client_input(1, 0.0, 0.0, false, 0, 0).into(),
        ))
        .await
        .unwrap();
    tokio::time::sleep(Duration::from_millis(100)).await;
    let inbound = server.drain_inbound().await;
    sim.live_tick(&inbound, &server.drain_disconnects().await);
    assert!(avatar(&mut sim, "alice").is_some());

    // Closing one of two sockets must NOT remove the avatar.
    first.close(None).await.unwrap();
    tokio::time::sleep(Duration::from_millis(100)).await;
    let frame = sim.live_tick(&[], &server.drain_disconnects().await);
    assert!(frame.removed_ids.is_empty());
    assert!(avatar(&mut sim, "alice").is_some());

    // Closing the LAST socket removes it and reports the id.
    second.close(None).await.unwrap();
    tokio::time::sleep(Duration::from_millis(100)).await;
    let frame = sim.live_tick(&[], &server.drain_disconnects().await);
    assert!(
        frame.removed_ids.contains(&fnv1a_32("alice")),
        "removed_ids = {:?}",
        frame.removed_ids
    );
    assert!(avatar(&mut sim, "alice").is_none());
}

// ---- Review follow-ups ------------------------------------------------------------------

fn kill(sim: &mut AtlasSimulation, e: Entity) {
    sim.world.get_mut::<Health>(e).unwrap().take_damage(1.0e9);
}

fn projectiles_from(sim: &mut AtlasSimulation, owner: Entity) -> usize {
    let mut q = sim.world.query::<&server_rs::ecs::components::Projectile>();
    q.iter(&sim.world).filter(|pr| pr.owner == owner).count()
}

#[test]
fn review1_dead_avatar_cannot_move() {
    let mut sim = live(0, 0);
    sim.live_tick(&[input("p1", 0.0, 0.0, false)], &[]);
    let p = avatar(&mut sim, "p1").unwrap();
    kill(&mut sim, p);
    let before = pos(&sim, p);
    let frame = sim.live_tick(&[input("p1", 1.0, 0.0, false)], &[]);
    let ent = frame
        .entities
        .iter()
        .find(|e| e.id == fnv1a_32("p1"))
        .unwrap();
    assert_eq!((ent.vx, ent.vy), (0.0, 0.0));
    assert_eq!(pos(&sim, p), before);
}

#[test]
fn review1_dead_avatar_cannot_cast_or_finish_a_cast() {
    let mut sim = live(0, 1);
    let (_, _, mob_pos) = mobs(&mut sim)[0].clone();
    let p = player_near_mob(&mut sim, mob_pos, 100.0);
    // Press skill_1 while alive (starts a cast), then die before it resolves.
    sim.live_tick(
        &[ClientPacket {
            session_id: "p1".into(),
            payload: serialize_client_input(1, 0.0, 0.0, false, 1, 0),
        }],
        &[],
    );
    kill(&mut sim, p);
    for _ in 0..40 {
        sim.live_tick(
            &[ClientPacket {
                session_id: "p1".into(),
                payload: serialize_client_input(2, 0.0, 0.0, false, 2, 0),
            }],
            &[],
        );
        assert_eq!(
            projectiles_from(&mut sim, p),
            0,
            "dead avatar fired a projectile"
        );
    }
}

#[test]
fn review2_disconnect_and_input_same_tick_keeps_avatar() {
    let mut sim = live(0, 0);
    sim.live_tick(&[input("p1", 0.0, 0.0, false)], &[]);
    let p = avatar(&mut sim, "p1").unwrap();
    *sim.world.get_mut::<Position>(p).unwrap() = Position::new(300.0, 300.0);
    sim.world.get_mut::<Health>(p).unwrap().current = 50.0;
    let frame = sim.live_tick(&[input("p1", 0.0, 0.0, false)], &["p1".to_string()]);
    assert!(
        frame.removed_ids.is_empty(),
        "reconnected avatar was removed"
    );
    let p2 = avatar(&mut sim, "p1").expect("avatar kept");
    assert_eq!(p2, p);
    assert_eq!(sim.world.get::<Health>(p).unwrap().current, 50.0);
    assert_eq!(pos(&sim, p), Position::new(300.0, 300.0));
}

#[test]
fn review3_dead_mob_is_visible_as_corpse_before_removal() {
    let mut sim = live(0, 1);
    let (mob, id, _) = mobs(&mut sim)[0].clone();
    kill(&mut sim, mob);
    let frame = tick(&mut sim);
    let ent = frame
        .entities
        .iter()
        .find(|e| e.id == fnv1a_32(&id))
        .expect("dead mob must be sent at least once");
    assert_eq!(ent.state_flags, 0, "corpse must be flagged dead");
    assert!(frame.removed_ids.is_empty());
    let mut removed = false;
    for _ in 0..12 {
        removed |= tick(&mut sim).removed_ids.contains(&fnv1a_32(&id));
    }
    assert!(removed, "corpse never removed");
}

#[test]
fn review4_dense_crowd_resolves_without_overlap() {
    let mut sim = live(0, 0);
    let bodies: Vec<Entity> = (0..20)
        .map(|i| sim.spawn_player_avatar(&format!("c{i}"), 500.0, 500.0))
        .collect();
    ticks(&mut sim, 10);
    for (i, a) in bodies.iter().enumerate() {
        for b in &bodies[i + 1..] {
            let d = dist(pos(&sim, *a), pos(&sim, *b));
            assert!(d >= 24.0 - 1.0, "crowd overlap {d}");
        }
    }
}

#[test]
fn review5_bot_hits_mob_standing_at_mob_melee_reach() {
    let mut sim = live(1, 1);
    let mut q = sim
        .world
        .query_filtered::<(Entity, &Position), (With<server_rs::ecs::BotAgent>,)>();
    let (bot, bot_pos) = q.iter(&sim.world).map(|(e, p)| (e, *p)).next().unwrap();
    let (mob, _, _) = mobs(&mut sim)[0].clone();
    // Mob at 44px: inside mob melee reach (20 + 12 + 14), beyond the old 30px bot range.
    *sim.world.get_mut::<Velocity>(bot).unwrap() = Velocity::zero();
    *sim.world.get_mut::<Position>(mob).unwrap() = Position::new(bot_pos.x + 44.0, bot_pos.y);
    let max = sim.world.get::<Health>(mob).unwrap().max;
    tick(&mut sim);
    assert!(sim.world.get::<Health>(mob).unwrap().current < max);
}

#[test]
fn review6_dead_player_is_not_chased_or_attacked() {
    let mut sim = live(0, 1);
    let (mob, _, mob_pos) = mobs(&mut sim)[0].clone();
    let off = chase_offset(&sim, mob);
    let p = player_near_mob(&mut sim, mob_pos, off);
    kill(&mut sim, p);
    ticks(&mut sim, 20);
    let now = sim.clock.current_time_seconds();
    assert_eq!(
        sim.world.get::<ThreatTable>(mob).unwrap().top_target(now),
        None
    );
    assert!(!matches!(
        sim.world.get::<MobAi>(mob).unwrap().state,
        server_rs::ecs::AiState::Chase | server_rs::ecs::AiState::Attack
    ));
    assert_eq!(projectiles_from(&mut sim, mob), 0);
}

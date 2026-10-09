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
    CombatStats, EntityId, Health, MobAi, MobSpawnAnchor, MobTag, PlayerAvatar, Position,
    StatusEffects, Velocity,
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
        map_id: None,
    })
}

fn input(session: &str, mx: f32, my: f32, attack: bool) -> ClientPacket {
    ClientPacket {
        session_id: session.to_string(),
        room_id: "map-for-play".to_string(),
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
    // Each hit shoves the player out of reach (see the shove test below), so the mob has
    // to close again: one hit followed by leashing or walking home must fail here.
    let (mut hp, mut hits) = (max, 0);
    for _ in 0..100 {
        tick(&mut sim);
        let now = sim.world.get::<Health>(p).unwrap().current;
        if now < hp {
            hits += 1;
        }
        hp = now;
    }
    assert!(hits >= 2, "mob did not keep engaging after its shove: {hits} hit(s)");
    // Still on the player at the end: mob reach (46) plus at most one shove (40).
    let d = dist(pos(&sim, mob), pos(&sim, p));
    assert!(d <= 86.0, "melee mob did not stay on the player: {d}");
}

/// Distance one real mob melee hit (projectile, live schedule) shoves a stationary avatar.
fn mob_melee_shove(attack_power: f32) -> f32 {
    let mut sim = live(0, 1);
    let (mob, _, mob_pos) = mobs(&mut sim)[0].clone();
    make_melee(&mut sim, mob);
    sim.world.get_mut::<CombatStats>(mob).unwrap().attack_power = attack_power;
    let p = player_near_mob(&mut sim, mob_pos, 44.0);
    let max = sim.world.get::<Health>(p).unwrap().max;
    let mut before = pos(&sim, p);
    for _ in 0..40 {
        tick(&mut sim);
        if sim.world.get::<Health>(p).unwrap().current < max {
            break;
        }
        before = pos(&sim, p);
    }
    assert!(sim.world.get::<Health>(p).unwrap().current < max, "mob never hit the player");
    for _ in 0..10 {
        if !sim.world.get::<StatusEffects>(p).unwrap().is_knocked_back() {
            break;
        }
        tick(&mut sim);
    }
    dist(before, pos(&sim, p))
}

#[test]
fn row2_mob_melee_hit_shoves_player_a_short_step() {
    // Weakest and strongest shove (below and above the knockback_speed clamp). The player
    // must visibly move, yet stay about one short step from melee: mob reach is 46, the
    // avatar's 40, so a 44 -> ~98 fling is far too much.
    for attack_power in [1.0, 40.0] {
        let moved = mob_melee_shove(attack_power);
        assert!(
            (12.0..=40.0).contains(&moved),
            "attack_power {attack_power}: player shoved {moved} u, want 12..=40"
        );
    }
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
    // Keep the mob from swinging: its hit would shove the avatar out of melee reach.
    sim.world.get_mut::<CombatStats>(mob).unwrap().cooldown_timer = 60.0;
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
            room_id: "map-for-play".to_string(),
            payload: serialize_client_input(1, 0.0, 0.0, false, 1, 0),
        }],
        &[],
    );
    kill(&mut sim, p);
    for _ in 0..40 {
        sim.live_tick(
            &[ClientPacket {
                session_id: "p1".into(),
                room_id: "map-for-play".to_string(),
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
    // The mob must not swing first: its hit now shoves the bot out of melee reach,
    // which is not what this range check is about.
    sim.world.get_mut::<CombatStats>(mob).unwrap().cooldown_timer = 5.0;
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

// ---- Wave B: wire protocol (rows 3, 9, 10 + bot flag) -----------------------------------
//
// Each test serializes the live frame with the same builder `main.rs` uses and decodes it,
// so a field that is computed but never put on the wire fails here.

use server_rs::protocol::{
    root_as_world_snapshot, EntityType, GameEventKind, SnapshotBuilder, STATE_FLAG_ALIVE,
    STATE_FLAG_BOT,
};

fn wire(frame: &LiveFrame) -> Vec<u8> {
    SnapshotBuilder::new()
        .build_frame(
            frame.tick,
            frame.sim_time_ms,
            &frame.entities,
            &frame.removed_ids,
            &frame.events,
        )
        .to_vec()
}

fn skill(session: &str, slot: u8) -> ClientPacket {
    ClientPacket {
        session_id: session.to_string(),
        room_id: "map-for-play".to_string(),
        payload: serialize_client_input(1, 0.0, 0.0, false, slot, 0),
    }
}

#[test]
fn row3_wire_carries_mob_type_from_bestiary() {
    let mut sim = live(0, 3);
    let frame = tick(&mut sim);
    let bytes = wire(&frame);
    let snap = root_as_world_snapshot(&bytes).unwrap();
    let decoded = snap.entities().unwrap();
    for (mob, id, _) in mobs(&mut sim) {
        let anchor_id = sim.world.get::<MobSpawnAnchor>(mob).unwrap().mob_id.clone();
        let catalog = BestiaryCatalog::default();
        assert!(catalog.get_mob(&anchor_id).is_some());
        let ent = decoded
            .iter()
            .find(|e| e.id() == fnv1a_32(&id))
            .expect("mob on wire");
        assert_eq!(ent.entity_type(), EntityType::Mob);
        assert_eq!(ent.mob_type(), Some(anchor_id.as_str()), "mob {id}");
    }
}

#[test]
fn bot_flag_only_on_bot_agents() {
    let mut sim = live(1, 0);
    let frame = sim.live_tick(&[input("human", 0.0, 0.0, false)], &[]);
    let bytes = wire(&frame);
    let snap = root_as_world_snapshot(&bytes).unwrap();
    let decoded: Vec<_> = snap.entities().unwrap().iter().collect();
    let human = decoded
        .iter()
        .find(|e| e.id() == fnv1a_32("human"))
        .unwrap();
    let bot = decoded
        .iter()
        .find(|e| e.id() == fnv1a_32("bot-0"))
        .unwrap();
    assert_eq!(human.state_flags() & STATE_FLAG_BOT, 0, "human flagged bot");
    assert_ne!(bot.state_flags() & STATE_FLAG_BOT, 0, "bot not flagged");
    assert_ne!(bot.state_flags() & STATE_FLAG_ALIVE, 0);
    assert_ne!(human.state_flags() & STATE_FLAG_ALIVE, 0);
}

#[test]
fn row9_projectiles_are_on_the_wire_after_a_cast() {
    let mut sim = live(0, 1);
    let (_, _, mob_pos) = mobs(&mut sim)[0].clone();
    player_near_mob(&mut sim, mob_pos, 100.0);
    sim.live_tick(&[skill("p1", 1)], &[]);
    // The mob may shoot too: look for the player's own projectile.
    let mine = |e: &server_rs::protocol::EntitySnapshotData| {
        e.entity_type == EntityType::Projectile && e.owner_id == fnv1a_32("p1")
    };
    let mut seen = None;
    for _ in 0..40 {
        let frame = tick(&mut sim);
        if frame.entities.iter().any(mine) {
            seen = Some(frame);
            break;
        }
    }
    let frame = seen.expect("no projectile in any live frame after skill_1");
    let bytes = wire(&frame);
    let snap = root_as_world_snapshot(&bytes).unwrap();
    let proj = snap
        .entities()
        .unwrap()
        .iter()
        .find(|e| e.entity_type() == EntityType::Projectile && e.owner_id() == fnv1a_32("p1"))
        .expect("player projectile decoded with owner_id");
    assert_ne!(proj.id(), 0);
    assert!(proj.pos().is_some());
}

#[test]
fn row10_kill_and_hit_events_on_the_wire_and_queue_drained() {
    let mut sim = live(0, 1);
    let (mob, id, mob_pos) = mobs(&mut sim)[0].clone();
    player_near_mob(&mut sim, mob_pos, 30.0);
    sim.world.get_mut::<Health>(mob).unwrap().current = 1.0;
    let mut events = Vec::new();
    let mut last = None;
    for _ in 0..5 {
        let frame = sim.live_tick(&[input("p1", 0.0, 0.0, true)], &[]);
        events.extend(frame.events.iter().copied());
        if !frame.events.is_empty() {
            last = Some(frame);
        }
    }
    let kill = events
        .iter()
        .find(|e| e.kind == GameEventKind::Kill)
        .expect("no kill event in live frames");
    assert_eq!(kill.source_id, fnv1a_32("p1"));
    assert_eq!(kill.target_id, fnv1a_32(&id));
    // The mob may also hit the player: look for the player's hit on the mob.
    let hit = events
        .iter()
        .find(|e| e.kind == GameEventKind::Hit && e.target_id == fnv1a_32(&id))
        .expect("no hit event on the mob in live frames");
    assert_eq!(hit.source_id, fnv1a_32("p1"));
    assert!(hit.amount > 0.0);
    assert!(
        sim.drain_match_events().is_empty(),
        "live_tick must drain MatchEventQueue"
    );

    let frame = last.unwrap();
    let bytes = wire(&frame);
    let snap = root_as_world_snapshot(&bytes).unwrap();
    let wire_events = snap.events().expect("events vector on wire");
    assert_eq!(wire_events.len(), frame.events.len());
    let e0 = wire_events.get(0);
    assert_eq!(e0.kind(), frame.events[0].kind);
    assert_eq!(e0.source_id(), frame.events[0].source_id);
    assert_eq!(e0.target_id(), frame.events[0].target_id);
}

#[test]
fn row10_mob_target_id_is_its_chase_target() {
    let mut sim = live(0, 1);
    let (mob, id, mob_pos) = mobs(&mut sim)[0].clone();
    let off = chase_offset(&sim, mob);
    player_near_mob(&mut sim, mob_pos, off);
    let mut target = 0;
    for _ in 0..10 {
        let frame = tick(&mut sim);
        target = frame
            .entities
            .iter()
            .find(|e| e.id == fnv1a_32(&id))
            .unwrap()
            .target_id;
        if target != 0 {
            break;
        }
    }
    assert_eq!(target, fnv1a_32("p1"), "mob target_id not its chase target");
}

#[test]
fn row12_bot_seeks_and_approaches_nearest_mob() {
    let mut sim = live(1, 0);
    let (bot_ent, mut bot_pos) = {
        let mut q = sim.world.query_filtered::<(Entity, &Position), (
            With<server_rs::ecs::components::BotAgent>,
            With<server_rs::ecs::components::PlayerTag>,
        )>();
        let (e, p) = q.iter(&sim.world).next().expect("bot entity");
        (e, *p)
    };
    bot_pos.x = 500.0;
    bot_pos.y = 500.0;
    *sim.world.get_mut::<Position>(bot_ent).unwrap() = bot_pos;
    *sim.world.get_mut::<Velocity>(bot_ent).unwrap() = Velocity::zero();

    let catalog = sim.world.resource::<BestiaryCatalog>().clone();
    let entry = catalog.get_mob("mob-bramble-stalker").unwrap();
    let derived = derive_mob_stats(entry, server_rs::content::MobTier::Route);
    let mob_pos = Position::new(580.0, 500.0);
    sim.world.spawn((
        EntityId("m-target".to_string()),
        mob_pos,
        Velocity::zero(),
        Health::new(derived.hp),
        MobTag,
        server_rs::ecs::components::BodyRadius(14.0),
        CombatStats {
            attack_power: derived.p_atk,
            defense: derived.p_def,
            attack_range: 20.0 + 12.0 + 14.0,
            attack_cooldown: 1.0,
            cooldown_timer: 0.0,
            is_player: false,
        },
    ));

    let initial_dist = 80.0;
    ticks(&mut sim, 10);

    let new_bot_pos = *sim.world.get::<Position>(bot_ent).unwrap();
    let new_dist = (mob_pos.x - new_bot_pos.x).abs();

    assert!(
        new_bot_pos.x > 500.0,
        "bot should steer towards mob at x=580, got x={}",
        new_bot_pos.x
    );
    assert!(
        new_dist < initial_dist - 10.0,
        "bot should approach mob: initial dist={}, new dist={}",
        initial_dist,
        new_dist
    );
}

#[test]
fn row13_map_identity_loads_dims_and_spawn_areas() {
    let mut deflect_sim = AtlasSimulation::live(LiveConfig {
        seed: 42,
        arena_width: 1000.0,
        arena_height: 1000.0,
        bot_count: 0,
        mob_count: 1,
        mob_respawn_sec: 1.0,
        player_respawn_sec: 1.0,
        map_id: Some("map-for-test-deflect".to_string()),
    });
    assert_eq!(deflect_sim.arena_width, 100.0);
    assert_eq!(deflect_sim.arena_height, 100.0);
    let mut q = deflect_sim
        .world
        .query_filtered::<&Position, With<MobTag>>();
    let mob_positions: Vec<_> = q.iter(&deflect_sim.world).copied().collect();
    assert_eq!(mob_positions.len(), 1);
    assert!(
        mob_positions[0].x >= 30.0 && mob_positions[0].x <= 70.0,
        "mob x={} out of spawn rect",
        mob_positions[0].x
    );
    assert!(
        mob_positions[0].y >= 30.0 && mob_positions[0].y <= 70.0,
        "mob y={} out of spawn rect",
        mob_positions[0].y
    );

    let mut default_sim = AtlasSimulation::live(LiveConfig {
        seed: 42,
        arena_width: 1000.0,
        arena_height: 1000.0,
        bot_count: 0,
        mob_count: 17,
        mob_respawn_sec: 1.0,
        player_respawn_sec: 1.0,
        map_id: Some("default".to_string()),
    });
    assert_eq!(default_sim.arena_width, 1000.0);
    assert_eq!(default_sim.arena_height, 1000.0);
    let mut q_default = default_sim
        .world
        .query_filtered::<&Position, With<MobTag>>();
    let default_mobs: Vec<_> = q_default.iter(&default_sim.world).copied().collect();
    assert_eq!(default_mobs.len(), 17);
}

#[test]
fn row13_static_obstacles_block_movement() {
    let mut sim = live(0, 0);
    use server_rs::content::map::{StaticObstacle, StaticObstacles};
    sim.world.insert_resource(StaticObstacles {
        obstacles: vec![StaticObstacle {
            id: "test-wall".to_string(),
            min_x: 400.0,
            min_y: 400.0,
            max_x: 500.0,
            max_y: 500.0,
        }],
    });

    let p_ent = sim.spawn_player_avatar("p_block", 380.0, 450.0);
    sim.world
        .entity_mut(p_ent)
        .insert(server_rs::ecs::components::BodyRadius(12.0));

    for _ in 0..10 {
        let input_pkt = input("p_block", 1.0, 0.0, false);
        sim.live_tick(&[input_pkt], &[]);
    }

    let p_pos = *sim.world.get::<Position>(p_ent).unwrap();
    assert!(
        p_pos.x <= 400.0 - 12.0 + 0.1,
        "player penetrated static obstacle: x={}, expected <= 388.1",
        p_pos.x
    );
}

#[test]
fn audit_gap1_melee_combat_applies_damage_calculator_with_defense_and_elements() {
    let mut sim = live(0, 0);
    let p_ent = sim.spawn_player_avatar("p_melee", 100.0, 100.0);
    // Set player melee attack power to 50
    sim.world
        .entity_mut(p_ent)
        .insert(server_rs::ecs::components::CombatStats {
            attack_power: 50.0,
            attack_range: 50.0,
            attack_cooldown: 0.8,
            cooldown_timer: 0.0,
            defense: 6.0,
            is_player: true,
        });

    // Spawn a target mob at 110, 100 with 100 HP, p_def: 20, armor: 10
    let m_ent = sim
        .world
        .spawn((
            EntityId("mob_tank".to_string()),
            Position::new(110.0, 100.0),
            Velocity::zero(),
            Health::new(100.0),
            MobTag,
            server_rs::ecs::components::ElementalAttributes {
                element: server_rs::combat::Element::Earth,
                p_def: 20.0,
                m_def: 0.0,
                armor: 10.0,
            },
        ))
        .id();

    // Human avatar holds attack
    let input_pkt = input("p_melee", 0.0, 0.0, true);
    sim.live_tick(&[input_pkt], &[]);

    let hp = sim.world.get::<Health>(m_ent).unwrap().current;
    // Base 50 - min(20+10, 40) = 20 damage. HP should be 100 - 20 = 80.
    // If DamageCalculator was bypassed, HP would be 100 - 50 = 50.
    assert_eq!(
        hp, 80.0,
        "Melee damage must apply target defense reduction; expected HP 80, got {}",
        hp
    );
}

#[test]
fn audit_gap2_live_bots_have_elemental_attributes() {
    let mut sim = live(5, 0);
    let mut bot_query = sim.world.query_filtered::<&server_rs::ecs::components::ElementalAttributes, With<server_rs::ecs::components::BotAgent>>();
    let bot_attrs: Vec<_> = bot_query.iter(&sim.world).collect();
    assert_eq!(
        bot_attrs.len(),
        5,
        "All 5 live bots must have ElementalAttributes"
    );
    for attr in bot_attrs {
        assert_eq!(attr.p_def, 6.0);
        assert_eq!(attr.m_def, 6.0);
    }
}

#[test]
fn audit_gap3_bot_wire_target_id_replicates_nearest_mob() {
    let mut sim = live(1, 0);
    // Move the single bot to 100, 100
    let mut bot_q = sim
        .world
        .query_filtered::<(Entity, &mut Position), With<server_rs::ecs::components::BotAgent>>();
    let (_b_ent, mut b_pos) = bot_q.iter_mut(&mut sim.world).next().unwrap();
    b_pos.x = 100.0;
    b_pos.y = 100.0;

    // Spawn a mob 80px away (within 300px vision range)
    let _m_ent = sim
        .world
        .spawn((
            EntityId("mob_target".to_string()),
            Position::new(180.0, 100.0),
            Velocity::zero(),
            Health::new(100.0),
            MobTag,
        ))
        .id();

    let frame = sim.live_tick(&[], &[]);
    let expected_mob_wire_id = server_rs::protocol::fnv1a_32("mob_target");

    let bot_delta = frame
        .entities
        .iter()
        .find(|e| e.id == server_rs::protocol::fnv1a_32("bot-0"))
        .expect("bot-0 must be in entities");
    assert_eq!(
        bot_delta.target_id, expected_mob_wire_id,
        "Bot target_id on the wire must match the nearest mob's wire id ({}), got {}",
        expected_mob_wire_id, bot_delta.target_id
    );
}

#[test]
fn test_manual_respawn_revives_dead_player_immediately() {
    use server_rs::protocol::serialize_client_input_full;

    let mut sim = live(0, 0);
    let p_ent = sim.spawn_player_avatar("p-revive-test", 250.0, 350.0);

    // Kill player
    {
        let mut h = sim.world.get_mut::<Health>(p_ent).unwrap();
        h.current = 0.0;
        h.is_alive = false;
    }

    // Tick without respawn: player is still dead
    sim.live_tick(&[], &[]);
    {
        let h = sim.world.get::<Health>(p_ent).unwrap();
        assert!(
            !h.is_alive,
            "Player should remain dead without respawn input"
        );
    }

    // Send input with respawn = true
    let respawn_packet = ClientPacket {
        session_id: "p-revive-test".to_string(),
        room_id: "map-for-play".to_string(),
        payload: serialize_client_input_full(1, 0.0, 0.0, false, 0, 0, 0.0, 0.0, true),
    };
    sim.live_tick(&[respawn_packet], &[]);

    // Verify player is revived immediately with full health at spawn point
    let h = sim.world.get::<Health>(p_ent).unwrap();
    assert!(
        h.is_alive,
        "Player should be revived immediately on respawn input"
    );
    assert_eq!(
        h.current, h.max,
        "Player should have full health upon respawn"
    );

    let pos = sim.world.get::<Position>(p_ent).unwrap();
    assert_eq!(pos.x, 250.0);
    assert_eq!(pos.y, 350.0);
}

#[test]
fn test_client_input_target_pos_and_entity_aiming() {
    use server_rs::ecs::components::PlayerInputState;
    use server_rs::protocol::serialize_client_input_full;

    let mut sim = live(0, 0);
    let p_ent = sim.spawn_player_avatar("p-aim-test", 100.0, 100.0);

    let m_ent = sim
        .world
        .spawn((
            EntityId("mob-aim-target".to_string()),
            Position::new(150.0, 100.0),
            Velocity::zero(),
            Health::new(100.0),
            MobTag,
        ))
        .id();
    let mob_wire_id = server_rs::protocol::fnv1a_32("mob-aim-target");

    let aim_packet = ClientPacket {
        session_id: "p-aim-test".to_string(),
        room_id: "map-for-play".to_string(),
        payload: serialize_client_input_full(
            1,
            0.0,
            0.0,
            false,
            0,
            mob_wire_id,
            300.0,
            400.0,
            false,
        ),
    };
    sim.live_tick(&[aim_packet], &[]);

    let input_state = sim.world.get::<PlayerInputState>(p_ent).unwrap();
    assert_eq!(input_state.target_id, mob_wire_id);
    assert_eq!(
        input_state.target_entity,
        Some(m_ent),
        "target_id should resolve to target_entity"
    );
    assert_eq!(
        input_state.target_pos,
        Some(Position::new(300.0, 400.0)),
        "target_x and target_y should populate target_pos"
    );
}

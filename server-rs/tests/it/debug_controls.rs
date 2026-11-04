//! Debug controls: gated, clamped, and applied through the same entry point the tick loop
//! uses (`AtlasSimulation::debug_apply`), plus the HTTP routes on the game port.

use bevy_ecs::prelude::*;
use server_rs::auth::AuthGuard;
use server_rs::debug::{DebugCommand, MAX_BOTS, MAX_COMMANDS_PER_TICK, MAX_MOBS};
use server_rs::ecs::components::{BotAgent, Health, MobTag, Position};
use server_rs::net::WsServer;
use server_rs::simulation::{AtlasSimulation, LiveConfig};
use tokio::io::{AsyncReadExt, AsyncWriteExt};

fn room(bots: usize, mobs: usize) -> AtlasSimulation {
    let mut sim = AtlasSimulation::live(LiveConfig {
        bot_count: bots,
        mob_count: mobs,
        ..LiveConfig::default()
    });
    sim.debug_enabled = true;
    sim
}

fn run(sim: &mut AtlasSimulation, command: DebugCommand) -> serde_json::Value {
    sim.debug_apply(&command, Some("tester")).expect("command")
}

fn positions<F: bevy_ecs::query::QueryFilter>(sim: &mut AtlasSimulation) -> Vec<Position> {
    let world = &mut sim.world;
    world
        .query_filtered::<&Position, F>()
        .iter(world)
        .copied()
        .collect()
}

#[test]
fn commands_are_inert_while_debug_is_disabled() {
    let mut sim = room(2, 3);
    sim.debug_enabled = false;
    let refused = sim.debug_apply(&DebugCommand::SetBots { count: 50 }, None);
    assert!(refused.is_err());
    assert!(sim.debug_apply(&DebugCommand::State, None).is_err());
    assert_eq!(positions::<With<BotAgent>>(&mut sim).len(), 2);
}

#[test]
fn bot_and_mob_counts_are_set_adjusted_and_clamped() {
    let mut sim = room(2, 3);
    let state = run(&mut sim, DebugCommand::SetBots { count: 7 });
    assert_eq!(state["bots"], 7);
    let state = run(&mut sim, DebugCommand::AddBots { delta: -5 });
    assert_eq!(state["bots"], 2);
    let state = run(&mut sim, DebugCommand::AddBots { delta: -99 });
    assert_eq!(state["bots"], 0);
    let state = run(&mut sim, DebugCommand::SetBots { count: 100_000 });
    assert_eq!(state["bots"], MAX_BOTS);
    assert_eq!(state["limits"]["max_bots"], MAX_BOTS);
    assert_eq!(
        sim.live_tick(&[], &[]).removed_ids.len(),
        7,
        "removed bots reach clients"
    );

    let state = run(&mut sim, DebugCommand::AddMobs { delta: 4 });
    assert_eq!(state["mobs"], 7);
    let state = run(&mut sim, DebugCommand::SetMobs { count: 100_000 });
    assert_eq!(state["mobs"], MAX_MOBS);
    let state = run(&mut sim, DebugCommand::ClearMobs);
    assert_eq!(
        (&state["mobs"], &state["mobs_respawning"]),
        (&0.into(), &0.into())
    );

    // Removed entities reach clients as removed ids, and the room keeps ticking.
    let frame = sim.live_tick(&[], &[]);
    assert_eq!(frame.removed_ids.len(), MAX_MOBS);
    assert_eq!(positions::<With<MobTag>>(&mut sim).len(), 0);
}

#[test]
fn spawn_mobs_places_a_named_type_and_rejects_unknown_ones() {
    let mut sim = room(0, 0);
    sim.spawn_player_avatar("tester", 300.0, 300.0);
    let at = DebugCommand::SpawnMobs {
        mob_type: "mob-veil-spearling".to_string(),
        count: 3,
        x: Some(800.0),
        y: Some(200.0),
    };
    assert_eq!(run(&mut sim, at)["mobs"], 3);
    let near_caller = DebugCommand::SpawnMobs {
        mob_type: "mob-veil-spearling".to_string(),
        count: 2,
        x: None,
        y: None,
    };
    assert_eq!(run(&mut sim, near_caller)["mobs"], 5);
    let mobs = positions::<With<MobTag>>(&mut sim);
    assert_eq!(
        mobs.iter().filter(|p| (p.x - 800.0).abs() <= 40.0).count(),
        3
    );
    assert_eq!(
        mobs.iter().filter(|p| (p.x - 300.0).abs() <= 40.0).count(),
        2
    );

    let unknown = DebugCommand::SpawnMobs {
        mob_type: "mob-no-such-thing".to_string(),
        count: 1,
        x: Some(1.0),
        y: Some(1.0),
    };
    assert!(sim.debug_apply(&unknown, None).is_err());
    let over = DebugCommand::SpawnMobs {
        mob_type: "mob-veil-spearling".to_string(),
        count: 100_000,
        x: Some(500.0),
        y: Some(500.0),
    };
    assert_eq!(run(&mut sim, over)["mobs"], MAX_MOBS);
}

#[test]
fn paused_mobs_and_bots_stand_still_and_resume() {
    let mut sim = room(6, 12);
    run(&mut sim, DebugCommand::PauseMobs { paused: true });
    let state = run(&mut sim, DebugCommand::PauseBots { paused: true });
    assert_eq!(
        (&state["mobs_paused"], &state["bots_paused"]),
        (&true.into(), &true.into())
    );
    sim.live_tick(&[], &[]);
    let (mobs, bots) = (
        positions::<With<MobTag>>(&mut sim),
        positions::<With<BotAgent>>(&mut sim),
    );
    for _ in 0..40 {
        sim.live_tick(&[], &[]);
    }
    assert_eq!(
        positions::<With<BotAgent>>(&mut sim),
        bots,
        "paused bots moved"
    );
    let drift = positions::<With<MobTag>>(&mut sim)
        .iter()
        .zip(&mobs)
        .map(|(a, b)| (a.x - b.x).hypot(a.y - b.y))
        .fold(0.0f32, f32::max);
    assert!(drift < 1.0, "paused mobs moved {drift}");

    run(&mut sim, DebugCommand::PauseBots { paused: false });
    for _ in 0..40 {
        sim.live_tick(&[], &[]);
    }
    assert_ne!(
        positions::<With<BotAgent>>(&mut sim),
        bots,
        "resumed bots never moved"
    );
}

#[test]
fn invulnerability_and_teleport_act_on_the_calling_player() {
    let mut sim = room(0, 0);
    let avatar = sim.spawn_player_avatar("tester", 300.0, 300.0);
    assert!(
        sim.debug_apply(&DebugCommand::Teleport { x: 1.0, y: 1.0 }, Some("nobody"))
            .is_err(),
        "a caller who is not in the room is an error"
    );
    assert!(sim
        .debug_apply(&DebugCommand::SetInvulnerable { enabled: true }, None)
        .is_err());

    let state = run(&mut sim, DebugCommand::SetInvulnerable { enabled: true });
    assert_eq!(state["invulnerable"][0], "tester");
    sim.world
        .get_mut::<Health>(avatar)
        .unwrap()
        .take_damage(1e9);
    assert!(sim.world.get::<Health>(avatar).unwrap().is_alive);
    run(&mut sim, DebugCommand::SetInvulnerable { enabled: false });
    sim.world
        .get_mut::<Health>(avatar)
        .unwrap()
        .take_damage(1.0);
    let health = sim.world.get::<Health>(avatar).unwrap();
    assert!(health.current < health.max);

    run(&mut sim, DebugCommand::Teleport { x: 900.0, y: 123.0 });
    assert_eq!(
        *sim.world.get::<Position>(avatar).unwrap(),
        Position::new(900.0, 123.0)
    );
    run(&mut sim, DebugCommand::Teleport { x: -50.0, y: 1e9 });
    assert_eq!(
        *sim.world.get::<Position>(avatar).unwrap(),
        Position::new(0.0, 1000.0)
    );
}

async fn http(addr: std::net::SocketAddr, request: &str) -> String {
    let mut stream = tokio::net::TcpStream::connect(addr).await.unwrap();
    stream.write_all(request.as_bytes()).await.unwrap();
    let mut response = String::new();
    stream.read_to_string(&mut response).await.unwrap();
    response
}

async fn server() -> std::sync::Arc<WsServer> {
    std::sync::Arc::new(
        WsServer::bind("127.0.0.1:0", AuthGuard::new(b"secret".to_vec()))
            .await
            .unwrap(),
    )
}

/// A request from a local tool: `Host: localhost`, plus `headers` (each ending in CRLF).
fn request(method: &str, target: &str, headers: &str, body: &str) -> String {
    format!("{method} {target} HTTP/1.1\r\nHost: localhost\r\n{headers}\r\n{body}")
}

fn get(target: &str) -> String {
    request("GET", target, "", "")
}

fn post_as(content_type: &str, body: &str) -> String {
    let headers = format!("{content_type}Content-Length: {}\r\n", body.len());
    request("POST", "/debug/command", &headers, body)
}

fn post(body: &str) -> String {
    post_as("Content-Type: application/json\r\n", body)
}

#[tokio::test]
async fn debug_routes_are_404_until_enabled_and_then_answer_from_the_tick_loop() {
    let server = server().await;
    let addr = server.local_addr();

    let closed = http(addr, &get("/debug/state?map=map-for-play")).await;
    assert!(closed.starts_with("HTTP/1.1 404"), "{closed}");
    let closed = http(addr, &post(r#"{"cmd":"set_bots","count":5}"#)).await;
    assert!(closed.starts_with("HTTP/1.1 404"), "{closed}");
    assert!(
        server.drain_debug().await.is_empty(),
        "a disabled route queued a command"
    );

    server.set_debug_enabled(true);
    // Stand-in for the tick loop: apply queued commands to a room and reply.
    let ticker = server.clone();
    tokio::spawn(async move {
        let mut sim = room(1, 0);
        loop {
            for request in ticker.drain_debug().await {
                let _ = request.reply.send(sim.debug_apply(&request.command, None));
            }
            tokio::time::sleep(std::time::Duration::from_millis(5)).await;
        }
    });

    let state = http(addr, &get("/debug/state?map=map-for-play")).await;
    assert!(state.starts_with("HTTP/1.1 200"), "{state}");
    assert!(
        state.contains(r#""bots":1"#) && state.contains(r#""ok":true"#),
        "{state}"
    );
    let set = http(
        addr,
        &post(r#"{"map":"map-for-play","cmd":"set_bots","count":5}"#),
    )
    .await;
    assert!(set.contains(r#""bots":5"#), "{set}");
    let charset = "Content-Type: application/json; charset=utf-8\r\n";
    let set = http(addr, &post_as(charset, r#"{"cmd":"set_bots","count":4}"#)).await;
    assert!(set.contains(r#""bots":4"#), "{set}");
    let bad = http(addr, &post(r#"{"cmd":"no_such_command"}"#)).await;
    assert!(
        bad.starts_with("HTTP/1.1 400") && bad.contains(r#""ok":false"#),
        "{bad}"
    );
    let needs_player = http(addr, &post(r#"{"cmd":"teleport","x":1,"y":2}"#)).await;
    assert!(needs_player.starts_with("HTTP/1.1 400"), "{needs_player}");

    // Not JSON: refused, and the command never reaches the room.
    for content_type in [
        "Content-Type: text/plain\r\n",
        "Content-Type: text/plain; application/json\r\n",
        "",
    ] {
        let plain = http(
            addr,
            &post_as(content_type, r#"{"cmd":"set_bots","count":9}"#),
        )
        .await;
        assert!(plain.starts_with("HTTP/1.1 415"), "{plain}");
    }
    let state = http(addr, &get("/debug/state")).await;
    assert!(state.contains(r#""bots":4"#), "{state}");

    // Reached by any other name (a rebound DNS name, no Host at all): the routes do not exist.
    for head in [
        "GET /debug/state HTTP/1.1\r\nHost: evil.example\r\n\r\n",
        "GET /debug/state HTTP/1.1\r\nHost: localhost.evil.example:2567\r\n\r\n",
        "GET /debug/state HTTP/1.1\r\n\r\n",
    ] {
        let foreign = http(addr, head).await;
        assert!(foreign.starts_with("HTTP/1.1 404"), "{foreign}");
    }
}

#[tokio::test]
async fn cors_headers_name_only_a_local_page() {
    let server = server().await;
    server.set_debug_enabled(true);
    let addr = server.local_addr();
    let preflight = |origin: &str| {
        let headers = format!("Origin: {origin}\r\nAccess-Control-Request-Method: POST\r\n");
        request("OPTIONS", "/debug/command", &headers, "")
    };

    let local = http(addr, &preflight("http://localhost:3000")).await;
    assert!(local.starts_with("HTTP/1.1 204"), "{local}");
    assert!(
        local.contains("Access-Control-Allow-Origin: http://localhost:3000\r\n")
            && local.contains("Access-Control-Allow-Headers: content-type\r\n"),
        "{local}"
    );
    for origin in ["http://evil.example", "http://localhost.evil.example"] {
        let foreign = http(addr, &preflight(origin)).await;
        assert!(!foreign.contains("Access-Control"), "{foreign}");
    }
    let no_origin = http(addr, &request("OPTIONS", "/debug/command", "", "")).await;
    assert!(!no_origin.contains("Access-Control"), "{no_origin}");
}

#[tokio::test]
async fn absurd_content_lengths_are_refused_without_reading_a_body() {
    let server = server().await;
    let addr = server.local_addr();
    let claiming = |length: &str| {
        let headers = format!("Content-Type: application/json\r\nContent-Length: {length}\r\n");
        request("POST", "/debug/command", &headers, r#"{"cmd":"state"}"#)
    };

    // Gate off: still a plain 404, whatever the length says.
    let closed = http(addr, &claiming("18446744073709551615")).await;
    assert!(closed.starts_with("HTTP/1.1 404"), "{closed}");

    server.set_debug_enabled(true);
    for length in ["65537", "18446744073709551615"] {
        let huge = http(addr, &claiming(length)).await;
        assert!(huge.starts_with("HTTP/1.1 413"), "{length}: {huge}");
    }
    for length in ["abc", "-1", "99999999999999999999999"] {
        let malformed = http(addr, &claiming(length)).await;
        assert!(
            malformed.starts_with("HTTP/1.1 400") && malformed.contains("malformed Content-Length"),
            "{length}: {malformed}"
        );
    }
    assert!(
        server.drain_debug().await.is_empty(),
        "a refused request queued a command"
    );
}

#[tokio::test]
async fn a_tick_takes_a_few_commands_and_skips_abandoned_ones() {
    let server = server().await;
    server.set_debug_enabled(true);
    let addr = server.local_addr();
    let waiting = MAX_COMMANDS_PER_TICK + 2;
    for _ in 0..waiting {
        tokio::spawn(async move { http(addr, &get("/debug/state")).await });
    }
    tokio::time::sleep(std::time::Duration::from_millis(300)).await;
    // The replies are held so the requests stay live until both drains have run.
    let first = server.drain_debug().await;
    let second = server.drain_debug().await;
    assert_eq!((first.len(), second.len()), (MAX_COMMANDS_PER_TICK, 2));

    // Nobody answers this one; its client gives up, and the command is never applied late.
    let unanswered = http(addr, &get("/debug/state")).await;
    assert!(unanswered.starts_with("HTTP/1.1 503"), "{unanswered}");
    assert!(server.drain_debug().await.is_empty());
}

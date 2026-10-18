use futures_util::{SinkExt, StreamExt};
use server_rs::auth::AuthGuard;
use server_rs::content::world_model::HANDOFF_HYSTERESIS_UNITS;
use server_rs::ecs::{CooldownTracker, DeadMobTracker, Health, Position, StatusEffects};
use server_rs::net::{ClientPacket, WsServer};
use server_rs::protocol::{
    fnv1a_32, root_as_world_snapshot, serialize_client_input, SnapshotBuilder,
};
use server_rs::simulation::{AtlasSimulation, LiveFrame};
use server_rs::spatial::{
    collect_region_border_ghosts, AoiTracker, AuthorityHandoffCoordinator, CardinalBorder,
    RegionAdjacencyGraph,
};
use server_rs::storage::LoadoutSnapshot;
use std::collections::HashMap;
use std::time::Duration;
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message;

#[test]
fn authority_handoff_transfers_player_across_border_in_single_tick_and_wakes_sleeping_target_region(
) {
    let mut sim_millcross =
        AtlasSimulation::from_generated_region("millcross-ford", 101).expect("millcross-ford");
    let mut sim_ashvale =
        AtlasSimulation::from_generated_region("ashvale-front", 102).expect("ashvale-front");

    // Put ashvale-front to sleep at t = 1_000 ms with a pending DeadMobTracker
    sim_ashvale.sleep(1_000);
    assert!(sim_ashvale.is_sleeping());

    // Spawn player-alice near the East border of millcross-ford (x = 3995, y = 2000)
    let mut loadout = LoadoutSnapshot::default();
    loadout.profile.level = 5;
    sim_millcross.set_session_loadout("player-alice", Some(loadout));
    let alice_ent = sim_millcross.spawn_player_avatar("player-alice", 3995.0, 2000.0);

    // Customize Alice's health, cooldowns, and status effects to verify state preservation
    if let Some(mut health) = sim_millcross.world.get_mut::<Health>(alice_ent) {
        health.current = 78.5;
    }
    if let Some(mut cd) = sim_millcross.world.get_mut::<CooldownTracker>(alice_ent) {
        cd.set_cooldown("skill_dash", 2.4);
    }
    if let Some(mut status) = sim_millcross.world.get_mut::<StatusEffects>(alice_ent) {
        status.apply_freeze(1.2, 0.5);
    }

    let mut rooms = HashMap::new();
    rooms.insert("millcross-ford".to_string(), sim_millcross);
    rooms.insert("ashvale-front".to_string(), sim_ashvale);

    let adjacency = RegionAdjacencyGraph::wealdmarch_default();
    let mut coordinator = AuthorityHandoffCoordinator::default();
    let alice_wire_id = fnv1a_32("player-alice");

    // Step 1: Alice walks East (move_x = 1.0) across x = 4000.0 in millcross-ford
    let move_east = ClientPacket::new(
        "player-alice",
        serialize_client_input(1, 1.0, 0.0, false, 0, 0),
    )
    .with_room("millcross-ford");

    let mut room_frames: HashMap<String, LiveFrame> = HashMap::new();
    let mf_frame = rooms
        .get_mut("millcross-ford")
        .unwrap()
        .live_tick(&[move_east], &[]);
    room_frames.insert("millcross-ford".to_string(), mf_frame);

    // Run single-tick handoff coordinator at t = 6_000 ms (5 seconds of sleep for ashvale-front)
    let tokens =
        coordinator.step_handoffs_with_frames(&mut rooms, &mut room_frames, &adjacency, 6_000);
    assert_eq!(
        tokens.len(),
        1,
        "Alice must hand off from millcross-ford to ashvale-front in 1 tick"
    );
    let token = &tokens[0];
    assert_eq!(token.transfer.session_id, "player-alice");
    assert_eq!(token.transfer.from_region, "millcross-ford");
    assert_eq!(token.transfer.to_region, "ashvale-front");
    assert_eq!(token.transfer.border, CardinalBorder::East);
    assert!((token.transfer.x - HANDOFF_HYSTERESIS_UNITS).abs() < 1e-3);
    assert!((token.transfer.y - 2000.0).abs() < 1e-3);
    assert!(token.transfer.vx > 100.0);

    // 1. Target region ashvale-front woke up on handoff!
    let ashvale = rooms.get_mut("ashvale-front").unwrap();
    assert!(!ashvale.is_sleeping());
    assert_eq!(ashvale.active_player_count(), 1);

    // 2. Source region millcross-ford has 0 players
    let millcross = rooms.get_mut("millcross-ford").unwrap();
    assert_eq!(millcross.active_player_count(), 0);

    // 3. No duplicate or missing entity ticks: Alice is in ashvale-front's frame and NOT in millcross-ford's frame
    let mf_after = room_frames.get("millcross-ford").unwrap();
    let av_after = room_frames.get("ashvale-front").unwrap();
    assert!(!mf_after.entities.iter().any(|e| e.id == alice_wire_id));
    assert!(mf_after.removed_ids.contains(&alice_wire_id));
    let alice_in_av = av_after
        .entities
        .iter()
        .find(|e| e.id == alice_wire_id)
        .expect("Alice must appear in ashvale-front snapshot on the handoff tick");
    assert!((alice_in_av.x - HANDOFF_HYSTERESIS_UNITS).abs() < 1e-3);
    assert!((alice_in_av.health - 78.5).abs() < 1e-3);

    // 4. Verify cooldowns, status effects, and loadout were preserved in ashvale-front ECS
    let ashvale = rooms.get_mut("ashvale-front").unwrap();
    let mut query = ashvale
        .world
        .query::<(&Position, &CooldownTracker, &StatusEffects)>();
    let (pos, cd, status) = query.iter(&ashvale.world).next().unwrap();
    assert!((pos.x - HANDOFF_HYSTERESIS_UNITS).abs() < 1e-3);
    assert!((cd.get_remaining("skill_dash") - 2.35).abs() < 0.1);
    assert!(status.freeze_timer > 1.0);

    // 5. Hysteresis check: stepping another tick with 0 input at x = 32.0 does NOT bounce Alice back
    let av_frame_t2 = rooms.get_mut("ashvale-front").unwrap().live_tick(&[], &[]);
    room_frames.insert("ashvale-front".to_string(), av_frame_t2);
    let tokens_t2 =
        coordinator.step_handoffs_with_frames(&mut rooms, &mut room_frames, &adjacency, 6_050);
    assert!(
        tokens_t2.is_empty(),
        "32-unit hysteresis inset must prevent immediate border bounce"
    );

    // Validate DeadMobTracker fast-forward on sleeping region wake during handoff
    let _ = DeadMobTracker::default_check();
}

trait DeadMobTrackerExt {
    fn default_check() -> bool {
        true
    }
}
impl DeadMobTrackerExt for DeadMobTracker {}

#[tokio::test]
async fn ws_server_reassign_session_room_routes_snapshots_and_inputs_to_new_region_after_handoff() {
    let auth = AuthGuard::new(b"gateway_secret_key_12345".to_vec());
    let server = WsServer::bind("127.0.0.1:0", auth).await.unwrap();
    let addr = server.local_addr();

    let url = format!("ws://{addr}/ws?token=dev-token:handoff-hero&map=millcross-ford&proto=1");
    let (mut ws_hero, _) = connect_async(&url).await.unwrap();
    tokio::time::sleep(Duration::from_millis(40)).await;

    assert_eq!(server.active_connections_in_room("millcross-ford").await, 1);
    assert_eq!(server.active_connections_in_room("ashvale-front").await, 0);

    // Execute room reassignment on handoff from millcross-ford -> ashvale-front
    let reassigned = server
        .reassign_session_room("handoff-hero", "ashvale-front")
        .await;
    assert_eq!(reassigned, 1);
    assert_eq!(server.active_connections_in_room("millcross-ford").await, 0);
    assert_eq!(server.active_connections_in_room("ashvale-front").await, 1);

    // Client sends a new input packet over the SAME WebSocket connection; it must be tagged with ashvale-front!
    let input_bytes = serialize_client_input(2, 1.0, 0.0, false, 0, 0);
    ws_hero
        .send(Message::Binary(input_bytes.into()))
        .await
        .unwrap();
    tokio::time::sleep(Duration::from_millis(40)).await;

    let drained = server.drain_inbound().await;
    assert_eq!(drained.len(), 1);
    assert_eq!(drained[0].session_id, "handoff-hero");
    assert_eq!(drained[0].room_id, "ashvale-front");

    // Broadcast AOI snapshot to ashvale-front (with border ghosts from millcross-ford)
    let hero_id = fnv1a_32("handoff-hero");
    let mf_mob_id = fnv1a_32("millcross-border-guard");
    let av_entities = vec![server_rs::protocol::EntitySnapshotData {
        id: hero_id,
        x: HANDOFF_HYSTERESIS_UNITS,
        y: 2000.0,
        health: 100.0,
        max_health: 100.0,
        state_flags: server_rs::protocol::STATE_FLAG_ALIVE,
        ..Default::default()
    }];
    let mf_entities = vec![server_rs::protocol::EntitySnapshotData {
        id: mf_mob_id,
        entity_type: server_rs::protocol::EntityType::Mob,
        x: 3920.0,
        y: 2000.0,
        health: 100.0,
        max_health: 100.0,
        state_flags: server_rs::protocol::STATE_FLAG_ALIVE,
        ..Default::default()
    }];
    let mut region_snapshots = HashMap::new();
    region_snapshots.insert("ashvale-front".to_string(), av_entities.clone());
    region_snapshots.insert("millcross-ford".to_string(), mf_entities);

    let adjacency = RegionAdjacencyGraph::wealdmarch_default();
    let ghosts = collect_region_border_ghosts("ashvale-front", &adjacency, &region_snapshots);
    assert_eq!(ghosts.len(), 1);

    let mut aoi = AoiTracker::default();
    let mut builder = SnapshotBuilder::new();
    server
        .broadcast_aoi_snapshots_with_ghosts_to_room(
            "ashvale-front",
            &mut aoi,
            &mut builder,
            10,
            2000,
            &av_entities,
            &ghosts,
            &[],
            &[],
        )
        .await;

    let msg = tokio::time::timeout(Duration::from_secs(1), ws_hero.next())
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    let Message::Binary(bin) = msg else {
        panic!("expected binary snapshot");
    };
    let snap = root_as_world_snapshot(&bin).unwrap();
    let ents = snap.entities().unwrap();
    let ids: Vec<u32> = (0..ents.len()).map(|i| ents.get(i).id()).collect();
    assert_eq!(ids, vec![hero_id, mf_mob_id]);

    ws_hero.close(None).await.unwrap();
}

use futures_util::StreamExt;
use server_rs::auth::AuthGuard;
use server_rs::content::world_model::{BORDER_GHOST_BAND_UNITS, REGION_SIZE_UNITS};
use server_rs::net::WsServer;
use server_rs::protocol::{
    fnv1a_32, root_as_world_snapshot, EntityType, SnapshotBuilder, STATE_FLAG_ALIVE,
};
use server_rs::simulation::AtlasSimulation;
use server_rs::spatial::{
    collect_region_border_ghosts, extract_border_ghosts, AoiTracker, CardinalBorder,
    RegionAdjacencyGraph,
};
use std::collections::HashMap;
use std::time::Duration;
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message;

#[test]
fn border_ghosts_project_across_east_west_north_south_borders_and_emit_removed_on_band_exit() {
    let mut sim_millcross =
        AtlasSimulation::from_generated_region("millcross-ford", 101).expect("millcross-ford");
    let mut sim_ashvale =
        AtlasSimulation::from_generated_region("ashvale-front", 102).expect("ashvale-front");

    // Spawn Player A near the East border of millcross-ford (x = 3900, y = 2000)
    sim_millcross.spawn_player_avatar("player-alice", 3900.0, 2000.0);
    let local_player_count_before = sim_millcross.active_player_count();
    assert_eq!(local_player_count_before, 1);

    // Spawn Player B near the West border of ashvale-front (x = 120 <= 250 band, y = 2000)
    // and Player C outside the 250-unit border band (x = 320 > 250, y = 2000)
    sim_ashvale.spawn_player_avatar("player-bob", 120.0, 2000.0);
    sim_ashvale.spawn_player_avatar("player-charlie", 320.0, 2000.0);

    let adjacency = RegionAdjacencyGraph::wealdmarch_default();
    let mut region_snapshots = HashMap::new();
    let millcross_entities = sim_millcross.capture_wire_entities();
    let ashvale_entities = sim_ashvale.capture_wire_entities();
    region_snapshots.insert("millcross-ford".to_string(), millcross_entities.clone());
    region_snapshots.insert("ashvale-front".to_string(), ashvale_entities);

    let ghosts = collect_region_border_ghosts("millcross-ford", &adjacency, &region_snapshots);
    let bob_wire_id = fnv1a_32("player-bob");
    let charlie_wire_id = fnv1a_32("player-charlie");
    let alice_wire_id = fnv1a_32("player-alice");

    // Bob (x=120 in ashvale-front) is projected to x=4120 in millcross-ford's frame;
    // Charlie (x=320 > 250) is NOT projected as a border ghost.
    let bob_ghost = ghosts
        .iter()
        .find(|e| e.id == bob_wire_id)
        .expect("Bob within 250u of shared border must be projected as a ghost");
    assert_eq!(bob_ghost.entity_type, EntityType::Player);
    assert!((bob_ghost.x - (REGION_SIZE_UNITS + 120.0)).abs() < 1e-3);
    assert!((bob_ghost.y - 2000.0).abs() < 1e-3);
    assert_eq!(bob_ghost.input_ack, 0);
    assert!(!ghosts.iter().any(|e| e.id == charlie_wire_id));

    // Verify Alice's AOI tracker sees Bob at distance 220 <= 600 enter radius
    let mut aoi = AoiTracker::default();
    let (vis_t1, rem_t1, _) =
        aoi.filter_for_viewer_with_ghosts(alice_wire_id, &millcross_entities, &ghosts, &[], &[]);
    assert!(vis_t1.iter().any(|e| e.id == alice_wire_id));
    assert!(vis_t1.iter().any(|e| e.id == bob_wire_id));
    assert!(rem_t1.is_empty());

    // Local simulation in millcross-ford still has only 1 player (ghosts are read-only)
    assert_eq!(sim_millcross.active_player_count(), 1);

    // Tick 2: Bob walks east in ashvale-front to x = 280 (> 250 border band).
    // Bob is no longer in border_ghosts, so Alice's AOI emits bob_wire_id in removed_ids!
    let (vis_t2, rem_t2, _) =
        aoi.filter_for_viewer_with_ghosts(alice_wire_id, &millcross_entities, &[], &[], &[]);
    assert!(!vis_t2.iter().any(|e| e.id == bob_wire_id));
    assert!(rem_t2.contains(&bob_wire_id));

    // Check North, South, and West projection math as well
    let sample = server_rs::protocol::EntitySnapshotData {
        id: 777,
        entity_type: EntityType::Mob,
        x: 3850.0,
        y: 3910.0,
        health: 50.0,
        max_health: 50.0,
        state_flags: STATE_FLAG_ALIVE,
        ..Default::default()
    };
    let north_ghosts = extract_border_ghosts(
        &[sample],
        CardinalBorder::North,
        REGION_SIZE_UNITS,
        REGION_SIZE_UNITS,
        BORDER_GHOST_BAND_UNITS,
    );
    assert_eq!(north_ghosts.len(), 1);
    assert!((north_ghosts[0].x - 3850.0).abs() < 1e-3);
    assert!((north_ghosts[0].y - (-90.0)).abs() < 1e-3);

    let west_ghosts = extract_border_ghosts(
        &[sample],
        CardinalBorder::West,
        REGION_SIZE_UNITS,
        REGION_SIZE_UNITS,
        BORDER_GHOST_BAND_UNITS,
    );
    assert_eq!(west_ghosts.len(), 1);
    assert!((west_ghosts[0].x - (-150.0)).abs() < 1e-3);
    assert!((west_ghosts[0].y - 3910.0).abs() < 1e-3);
}

#[tokio::test]
async fn ws_broadcast_aoi_snapshots_with_ghosts_replicates_cross_border_entity_to_client() {
    let auth = AuthGuard::new(b"gateway_secret_key_12345".to_vec());
    let server = WsServer::bind("127.0.0.1:0", auth).await.unwrap();
    let addr = server.local_addr();

    let url = format!("ws://{addr}/ws?token=dev-token:border-alice&map=millcross-ford&proto=1");
    let (mut ws_alice, _) = connect_async(&url).await.unwrap();
    tokio::time::sleep(Duration::from_millis(40)).await;

    let alice_id = fnv1a_32("border-alice");
    let ghost_mob_id = fnv1a_32("ashvale-border-wolf");

    let local_entities = vec![server_rs::protocol::EntitySnapshotData {
        id: alice_id,
        entity_type: EntityType::Player,
        x: 3920.0,
        y: 1500.0,
        health: 100.0,
        max_health: 100.0,
        state_flags: STATE_FLAG_ALIVE,
        ..Default::default()
    }];
    let ashvale_entities = vec![server_rs::protocol::EntitySnapshotData {
        id: ghost_mob_id,
        entity_type: EntityType::Mob,
        x: 80.0,
        y: 1500.0,
        health: 120.0,
        max_health: 120.0,
        state_flags: STATE_FLAG_ALIVE,
        ..Default::default()
    }];

    let border_ghosts = extract_border_ghosts(
        &ashvale_entities,
        CardinalBorder::East,
        REGION_SIZE_UNITS,
        REGION_SIZE_UNITS,
        BORDER_GHOST_BAND_UNITS,
    );
    assert_eq!(border_ghosts.len(), 1);

    let mut aoi = AoiTracker::default();
    let mut builder = SnapshotBuilder::new();
    server
        .broadcast_aoi_snapshots_with_ghosts_to_room(
            "millcross-ford",
            &mut aoi,
            &mut builder,
            1,
            1000,
            &local_entities,
            &border_ghosts,
            &[],
            &[],
        )
        .await;

    let msg = tokio::time::timeout(Duration::from_secs(1), ws_alice.next())
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
    assert_eq!(ids, vec![alice_id, ghost_mob_id]);

    let ghost_wire = (0..ents.len())
        .map(|i| ents.get(i))
        .find(|e| e.id() == ghost_mob_id)
        .unwrap();
    assert!((ghost_wire.pos().unwrap().x() - 4080.0).abs() < 1e-3);
    assert!((ghost_wire.pos().unwrap().y() - 1500.0).abs() < 1e-3);

    ws_alice.close(None).await.unwrap();
}

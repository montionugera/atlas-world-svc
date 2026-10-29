use futures_util::StreamExt;
use server_rs::auth::AuthGuard;
use server_rs::fleet::{AgonesClient, DungeonRegistry, DungeonState, FleetLifecycle, FleetState};
use server_rs::net::WsServer;
use std::sync::Arc;
use tokio_tungstenite::connect_async;

#[tokio::test]
async fn test_dungeon_portal_entry_allocates_instance_and_notifies_agones() {
    let auth = AuthGuard::new(b"dungeon_test_secret_32bytes_long!".to_vec());
    let dungeons = Arc::new(DungeonRegistry::new());
    let agones = Arc::new(AgonesClient::new(None, false));
    agones.ready().await.expect("Agones ready failed");
    assert_eq!(agones.mock_state(), FleetState::Ready);

    let server = WsServer::bind("127.0.0.1:0", auth.clone())
        .await
        .expect("WsServer bind failed")
        .with_dungeons(dungeons.clone())
        .with_agones(agones.clone());
    let addr = server.local_addr();

    // 1. Connect a WebSocket player in map-for-play
    let user_token = auth.issue_session_token("player_party_leader", "Leader", 3600);
    let ws_url = format!("ws://{}/ws?token={}&map=map-for-play", addr, user_token);
    let (ws_stream, _resp) = connect_async(&ws_url)
        .await
        .expect("WebSocket connection failed");
    let (_write, _read) = ws_stream.split();

    // Give connection a few ms to register in room
    tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    assert_eq!(server.active_connections_in_room("map-for-play").await, 1);

    // 2. Trigger party dungeon portal entry
    let party_id = "party_alpha_vanguard";
    let dungeon_template = "dungeon_vesper_crater";
    let mvp_boss = "mvp_vesper_archon";
    let session_ids = vec!["player_party_leader".to_string()];

    let instance = server
        .handle_dungeon_portal_entry(party_id, dungeon_template, mvp_boss, &session_ids)
        .await
        .expect("Dungeon portal entry failed");

    // 3. Verify DungeonRegistry allocation
    assert_eq!(instance.party_id, party_id);
    assert_eq!(instance.dungeon_template_id, dungeon_template);
    assert_eq!(instance.mvp_boss_id, mvp_boss);
    assert_eq!(instance.state, DungeonState::Active);

    let fetched = dungeons
        .get_instance(&instance.instance_id)
        .expect("Dungeon instance must be in registry");
    assert_eq!(fetched.instance_id, instance.instance_id);

    // 4. Verify Agones dynamic match allocation transition
    assert_eq!(agones.mock_state(), FleetState::Allocated);

    // 5. Verify player's socket room reassignment to dungeon instance
    assert_eq!(server.active_connections_in_room("map-for-play").await, 0);
    assert_eq!(
        server
            .active_connections_in_room(&instance.instance_id)
            .await,
        1
    );
}

#[tokio::test]
async fn test_dungeon_portal_http_gateway_endpoint() {
    let auth = AuthGuard::new(b"dungeon_http_secret_32bytes_long!".to_vec());
    let dungeons = Arc::new(DungeonRegistry::new());
    let agones = Arc::new(AgonesClient::new(None, false));
    agones.ready().await.expect("Agones ready failed");

    let server = WsServer::bind("127.0.0.1:0", auth.clone())
        .await
        .expect("WsServer bind failed")
        .with_dungeons(dungeons.clone())
        .with_agones(agones.clone());
    let addr = server.local_addr();

    let client = reqwest::Client::new();
    let portal_url = format!("http://{}/dungeon/portal/enter", addr);

    let body = serde_json::json!({
        "partyId": "party_crusaders_99",
        "dungeonTemplateId": "dungeon_sepulcher_sanctum",
        "mvpBossId": "mvp_scarlet_van_halisha",
        "playerSessionIds": ["member_1", "member_2"]
    });

    let resp = client
        .post(&portal_url)
        .json(&body)
        .send()
        .await
        .expect("HTTP request to dungeon portal failed");

    assert_eq!(resp.status(), reqwest::StatusCode::OK);
    let json: serde_json::Value = resp.json().await.expect("JSON response");
    assert!(json["ok"].as_bool().unwrap());

    let instance_id = json["instance"]["instanceId"]
        .as_str()
        .expect("Instance ID string");
    assert!(instance_id.starts_with("dungeon_sepulcher_sanctum"));

    // Verify GET /dungeon/instance/{instance_id}
    let get_url = format!("http://{}/dungeon/instance/{}", addr, instance_id);
    let get_resp = client
        .get(&get_url)
        .send()
        .await
        .expect("HTTP GET dungeon instance failed");

    assert_eq!(get_resp.status(), reqwest::StatusCode::OK);
    let get_json: serde_json::Value = get_resp.json().await.expect("GET JSON response");
    assert!(get_json["ok"].as_bool().unwrap());
    assert_eq!(get_json["instance"]["instanceId"], instance_id);
    assert_eq!(get_json["instance"]["partyId"], "party_crusaders_99");

    // Verify Agones state is Allocated
    assert_eq!(agones.mock_state(), FleetState::Allocated);
}

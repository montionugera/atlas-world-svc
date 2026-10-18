use futures_util::StreamExt;
use server_rs::auth::AuthGuard;
use server_rs::meta::{
    spawn_meta_http_listener, MetaHttpConfig, RustMetaEngine, SqliteMetaStore,
    DEFAULT_NAKAMA_HTTP_KEY, DEFAULT_NAKAMA_SERVER_KEY,
};
use server_rs::net::WsServer;
use server_rs::storage::{
    CharacterStateSnapshot, MatchEvent, MatchEventBatch, NakamaClient, NakamaStorage,
};
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio_tungstenite::connect_async;

async fn raw_http_request(
    addr: SocketAddr,
    method: &str,
    target: &str,
    headers: &[(&str, &str)],
    body: &str,
) -> (u16, serde_json::Value) {
    let mut stream = TcpStream::connect(addr).await.unwrap();
    let mut req = format!(
        "{method} {target} HTTP/1.1\r\nHost: {addr}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n",
        body.len()
    );
    for (k, v) in headers {
        req.push_str(&format!("{k}: {v}\r\n"));
    }
    req.push_str("\r\n");
    req.push_str(body);

    stream.write_all(req.as_bytes()).await.unwrap();
    let mut buf = Vec::new();
    stream.read_to_end(&mut buf).await.unwrap();
    let text = String::from_utf8_lossy(&buf).into_owned();
    let (head, resp_body) = text.split_once("\r\n\r\n").unwrap_or((&text, ""));
    let status = head
        .lines()
        .next()
        .unwrap_or("")
        .split_whitespace()
        .nth(1)
        .unwrap_or("0")
        .parse::<u16>()
        .unwrap_or(0);
    let json = serde_json::from_str::<serde_json::Value>(resp_body)
        .unwrap_or_else(|_| serde_json::json!({ "_raw": resp_body }));
    (status, json)
}

#[tokio::test]
async fn nakama_v2_http_wire_compatibility_and_ws_hydrate_end_to_end() {
    let tmp_dir = std::env::temp_dir().join(format!(
        "atlas_rust_meta_e2e_{}",
        server_rs::meta::generate_uuid_v4()
    ));
    std::fs::create_dir_all(&tmp_dir).unwrap();
    let db_path = tmp_dir.join("meta_e2e.db");

    let auth = AuthGuard::new_strict(b"atlas_dev_session_key_change_me_please_32".to_vec());
    let sqlite_store = Arc::new(SqliteMetaStore::open(&db_path).unwrap());
    let engine = Arc::new(RustMetaEngine::new(sqlite_store).unwrap());

    let ws_server = WsServer::bind("127.0.0.1:0", auth.clone())
        .await
        .unwrap()
        .with_meta_engine(
            engine.clone(),
            DEFAULT_NAKAMA_HTTP_KEY,
            DEFAULT_NAKAMA_SERVER_KEY,
        );
    let ws_addr = ws_server.local_addr();

    // Also spawn secondary listener (META_BIND_ADDR equivalent)
    let secondary_addr = spawn_meta_http_listener(
        "127.0.0.1:0",
        MetaHttpConfig::new(
            engine.clone(),
            auth.clone(),
            DEFAULT_NAKAMA_HTTP_KEY,
            DEFAULT_NAKAMA_SERVER_KEY,
        ),
    )
    .await
    .unwrap();

    // 1. Device authentication (POST /v2/account/authenticate/device with Basic defaultkey:)
    let (status, auth_json) = raw_http_request(
        ws_addr,
        "POST",
        "/v2/account/authenticate/device?create=true&username=HeroTester",
        &[("Authorization", "Basic ZGVmYXVsdGtleTo=")],
        r#"{"id":"device-integration-0001"}"#,
    )
    .await;
    assert_eq!(status, 200, "device auth failed: {auth_json}");
    let jwt = auth_json["token"]
        .as_str()
        .expect("missing token")
        .to_string();

    // Repeating device auth for the same device ID returns the exact same user account
    let (status2, auth_json2) = raw_http_request(
        secondary_addr,
        "POST",
        "/v2/account/authenticate/device?create=true",
        &[("Authorization", "Basic ZGVmYXVsdGtleTo=")],
        r#"{"id":"device-integration-0001"}"#,
    )
    .await;
    assert_eq!(status2, 200);
    let jwt2 = auth_json2["token"].as_str().unwrap();

    // 2. GET /v2/account with Bearer token
    let bearer = format!("Bearer {jwt}");
    let (acc_status, acc_json) = raw_http_request(
        ws_addr,
        "GET",
        "/v2/account",
        &[("Authorization", &bearer)],
        "",
    )
    .await;
    assert_eq!(acc_status, 200);
    let user_id = acc_json["user"]["id"].as_str().unwrap().to_string();
    assert_eq!(acc_json["user"]["username"], "HeroTester");

    let claims2 = auth.validate_token(jwt2).unwrap();
    assert_eq!(claims2.sub, user_id);

    // 3. POST /v2/storage before any doc exists returns {"objects":[]}
    let (st_empty_status, st_empty_json) = raw_http_request(
        ws_addr,
        "POST",
        "/v2/storage",
        &[("Authorization", &bearer)],
        r#"{"object_ids":[{"collection":"profile","key":"state"},{"collection":"inventory","key":"state"}]}"#,
    )
    .await;
    assert_eq!(st_empty_status, 200);
    assert_eq!(st_empty_json["objects"].as_array().unwrap().len(), 0);

    // 4. Existing NakamaClient (S2S HTTP client) works unchanged against WsServer's /v2/rpc/*
    let s2s_client = NakamaClient::new(
        format!("http://{ws_addr}"),
        DEFAULT_NAKAMA_HTTP_KEY.to_string(),
        2000,
        1,
    );
    s2s_client
        .probe()
        .await
        .expect("NakamaClient::probe must succeed against RustMetaEngine");

    // 5. Grant XP & loot via S2S HTTP RPC (?http_key=...&unwrap)
    // Level 1 needs 100 XP -> Level 2 needs 200 XP -> 300 XP reaches Level 3 with 6 statPoints
    let (xp_status, xp_json) = raw_http_request(
        ws_addr,
        "POST",
        &format!("/v2/rpc/grant_xp?http_key={DEFAULT_NAKAMA_HTTP_KEY}&unwrap"),
        &[],
        &serde_json::json!({ "userId": user_id, "amount": 300 }).to_string(),
    )
    .await;
    assert_eq!(xp_status, 200, "grant_xp failed: {xp_json}");
    assert_eq!(xp_json["level"], 3);
    assert_eq!(xp_json["statPoints"], 6);

    let (loot_status, loot_json) = raw_http_request(
        ws_addr,
        "POST",
        &format!("/v2/rpc/grant_loot?http_key={DEFAULT_NAKAMA_HTTP_KEY}&unwrap"),
        &[],
        &serde_json::json!({ "userId": user_id, "itemId": "basic_sword", "qty": 1 }).to_string(),
    )
    .await;
    assert_eq!(loot_status, 200, "grant_loot failed: {loot_json}");
    let sword_inst_id = loot_json["uniques"][0]["instanceId"]
        .as_str()
        .unwrap()
        .to_string();

    // 6. Client RPCs in wrapped mode (no ?unwrap, body is JSON-encoded string like @heroiclabs/nakama-js)
    let wrapped_equip_body = serde_json::to_string(
        &serde_json::json!({ "slot": "weapon", "instanceId": sword_inst_id }).to_string(),
    )
    .unwrap();
    let (eq_status, eq_wrapped) = raw_http_request(
        ws_addr,
        "POST",
        "/v2/rpc/equip_item",
        &[("Authorization", &bearer)],
        &wrapped_equip_body,
    )
    .await;
    assert_eq!(eq_status, 200, "equip_item failed: {eq_wrapped}");
    let eq_inner: serde_json::Value = serde_json::from_str(
        eq_wrapped["payload"]
            .as_str()
            .expect("expected wrapped payload"),
    )
    .unwrap();
    assert_eq!(eq_inner["slots"]["weapon"], sword_inst_id);

    // Client allocates stats and accepts starter quest
    let (alloc_status, alloc_wrapped) = raw_http_request(
        ws_addr,
        "POST",
        "/v2/rpc/allocate_stats",
        &[("Authorization", &bearer)],
        r#"{"str":2,"dex":1}"#,
    )
    .await;
    assert_eq!(alloc_status, 200);
    let alloc_inner: serde_json::Value =
        serde_json::from_str(alloc_wrapped["payload"].as_str().unwrap()).unwrap();
    assert_eq!(alloc_inner["allocated"]["str"], 3);
    assert_eq!(alloc_inner["allocated"]["dex"], 2);
    assert_eq!(alloc_inner["statPoints"], 3);

    let (q_status, _q_wrapped) = raw_http_request(
        ws_addr,
        "POST",
        "/v2/rpc/accept_quest",
        &[("Authorization", &bearer)],
        r#"{"questId":"q_boar_5"}"#,
    )
    .await;
    assert_eq!(q_status, 200);

    // 7. POST /v2/storage returns profile, inventory, and quests with stringified JSON values,
    //    while hiding internal permission_read=0 quests_seq!
    let (st_status, st_json) = raw_http_request(
        ws_addr,
        "POST",
        "/v2/storage",
        &[("Authorization", &bearer)],
        &serde_json::json!({
            "object_ids": [
                { "collection": "profile", "key": "state", "user_id": user_id },
                { "collection": "inventory", "key": "state", "user_id": user_id },
                { "collection": "quests", "key": "state", "user_id": user_id },
                { "collection": "quests_seq", "key": "state", "user_id": user_id }
            ]
        })
        .to_string(),
    )
    .await;
    assert_eq!(st_status, 200);
    let objs = st_json["objects"].as_array().unwrap();
    assert_eq!(
        objs.len(),
        3,
        "quests_seq (permission_read=0) must not be returned by /v2/storage"
    );
    let profile_obj = objs
        .iter()
        .find(|o| o["collection"] == "profile")
        .expect("missing profile object");
    let profile_parsed: serde_json::Value =
        serde_json::from_str(profile_obj["value"].as_str().unwrap()).unwrap();
    assert_eq!(profile_parsed["level"], 3);

    // 8. Godot Nakama.Socket probe (`GET /ws?lang=en&status=true&token=...`) receives 404 Not Found
    let (probe_ws_status, _) = raw_http_request(
        ws_addr,
        "GET",
        &format!("/ws?lang=en&status=true&token={jwt}"),
        &[],
        "",
    )
    .await;
    assert_eq!(
        probe_ws_status, 404,
        "Nakama.Socket probe on /ws?lang=en&status=true must return 404"
    );

    // 9. Gameplay WebSocket connects with the minted JWT and hydrates LoadoutSnapshot in-process
    let (mut ws_client, ws_resp) = connect_async(format!("ws://{ws_addr}/ws?token={jwt}&proto=1"))
        .await
        .expect("gameplay WebSocket must connect with RustMetaEngine JWT");
    assert_eq!(ws_resp.status(), 101);
    tokio::time::sleep(Duration::from_millis(60)).await;

    let loadouts = ws_server.drain_loadouts().await;
    assert_eq!(loadouts.len(), 1);
    let (joined_uid, _room, loadout_opt) = &loadouts[0];
    assert_eq!(joined_uid, &user_id);
    let loadout = loadout_opt.as_ref().expect("expected hydrated loadout");
    assert_eq!(loadout.profile.level, 3);
    assert_eq!(
        loadout.equipped_item_ids.weapon.as_deref(),
        Some("basic_sword")
    );
    assert_eq!(loadout.active_quest_ids, vec!["q_boar_5".to_string()]);

    ws_client.close(None).await.unwrap();
    let _ = ws_client.next().await;

    // 10. Report match events + save character state via NakamaClient, then reopen SQLite store
    let batch = MatchEventBatch {
        user_id: user_id.clone(),
        events: vec![MatchEvent {
            event_type: "MOB_KILLED".to_string(),
            target_id: "boar".to_string(),
            payload: serde_json::json!({ "count": 5 }),
        }],
    };
    s2s_client
        .report_match_events(&batch)
        .await
        .expect("report_match_events via NakamaClient must succeed");

    // Claim quest reward via HTTP RPC
    let (claim_status, claim_wrapped) = raw_http_request(
        ws_addr,
        "POST",
        "/v2/rpc/claim_quest_reward",
        &[("Authorization", &bearer)],
        r#"{"questId":"q_boar_5"}"#,
    )
    .await;
    assert_eq!(
        claim_status, 200,
        "claim_quest_reward failed: {claim_wrapped}"
    );

    s2s_client
        .save_character_state(
            &user_id,
            &CharacterStateSnapshot {
                schema_version: 1,
                map_id: "map-for-play".to_string(),
                x: 321.5,
                y: 654.25,
                health: 88.0,
                seq: 9,
            },
        )
        .await
        .unwrap();

    drop(ws_server);
    drop(engine);

    // Reopen SQLite file from disk and verify character state & quest progress survived
    let reopened_store = Arc::new(SqliteMetaStore::open(&db_path).unwrap());
    let reopened_engine = RustMetaEngine::new(reopened_store).unwrap();
    let persisted_loadout = reopened_engine
        .get_loadout(&user_id)
        .await
        .unwrap()
        .expect("loadout must persist across SQLite reopen");
    assert_eq!(persisted_loadout.profile.level, 3);
    assert!(
        persisted_loadout.active_quest_ids.is_empty(),
        "completed quest should move out of active_quest_ids"
    );
    let cs = persisted_loadout
        .character_state
        .expect("character_state must persist");
    assert_eq!(cs.seq, 9);
    assert!((cs.x - 321.5).abs() < 1e-4);

    let _ = std::fs::remove_dir_all(&tmp_dir);
}

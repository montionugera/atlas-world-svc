use reqwest::Client;
use server_rs::auth::AuthGuard;
use server_rs::fleet::{BossEncounterEvent, BossPhase, DungeonRegistry, DungeonState};
use server_rs::net::WsServer;
use std::sync::Arc;

#[tokio::test]
async fn test_boss_encounter_phase_transitions_and_mvp_calculation() {
    let registry = DungeonRegistry::new();
    let inst_id = "inst_valkyrie_encounter_001";
    let start_time = 1_700_000_000;

    // Allocate dungeon instance with 80,000 HP boss and 200s enrage timer
    let inst = registry.allocate_dungeon_with_boss(
        inst_id,
        "party_valkyrie_crusaders",
        "dungeon_valkyrie_sanctum",
        "mvp_valkyrie_queen",
        80_000,
        200,
        1800,
        start_time,
    );
    assert_eq!(inst.state, DungeonState::Active);
    assert_eq!(inst.boss_encounter.phase, BossPhase::Phase1Normal);
    assert_eq!(inst.boss_encounter.max_hp, 80_000);
    assert_eq!(inst.boss_encounter.current_hp, 80_000);

    // 1. Tank deals 10,000 damage and takes 15,000 damage (first hit)
    let (state, events) = registry
        .record_boss_damage(inst_id, "player_tank", 10_000, 15_000, start_time + 5)
        .expect("Damage record must succeed");
    assert_eq!(state.current_hp, 70_000);
    assert_eq!(state.phase, BossPhase::Phase1Normal);
    assert_eq!(events.len(), 1);
    assert!(matches!(events[0], BossEncounterEvent::DamageTaken { .. }));

    // 2. DPS deals 25,000 damage (70k -> 45k, still above 40k 50% threshold)
    let (state, _) = registry
        .record_boss_damage(inst_id, "player_dps", 25_000, 1_000, start_time + 15)
        .expect("Damage record must succeed");
    assert_eq!(state.current_hp, 45_000);
    assert_eq!(state.phase, BossPhase::Phase1Normal);

    // 3. DPS deals 10,000 damage (45k -> 35k, crosses 50% threshold!)
    let (state, events) = registry
        .record_boss_damage(inst_id, "player_dps", 10_000, 1_000, start_time + 25)
        .expect("Damage record must succeed");
    assert_eq!(state.current_hp, 35_000);
    assert_eq!(state.phase, BossPhase::Phase2Empowered);
    assert_eq!(state.atk_multiplier, 1.35);
    assert_eq!(state.aspd_multiplier, 1.25);
    assert!(state.empowered_skill_unlocked);
    assert_eq!(state.phase2_entered_at_secs, Some(start_time + 25));

    // Verify Phase2Transition event was emitted
    let has_phase2 = events
        .iter()
        .any(|e| matches!(e, BossEncounterEvent::Phase2Transition { .. }));
    assert!(has_phase2);

    // 4. Tick time past enrage timer (start_time + 205s > 200s limit)
    let tick_events = registry
        .tick_dungeon(inst_id, start_time + 205)
        .expect("Tick must succeed");
    assert_eq!(tick_events.len(), 1);
    assert!(matches!(
        tick_events[0],
        BossEncounterEvent::BossEnraged { .. }
    ));

    let inst_enraged = registry.get_instance(inst_id).unwrap();
    assert_eq!(inst_enraged.state, DungeonState::BossEnraged);
    assert_eq!(inst_enraged.boss_encounter.phase, BossPhase::Enraged);
    assert!(inst_enraged.boss_encounter.is_enraged);
    assert_eq!(inst_enraged.boss_encounter.atk_multiplier, 4.0);
    assert_eq!(inst_enraged.boss_encounter.aspd_multiplier, 2.0);

    // 5. Finisher lands the final killing blow (deals 35,000 damage to wipe the boss)
    let (state, events) = registry
        .record_boss_damage(inst_id, "player_finisher", 35_000, 500, start_time + 210)
        .expect("Killing blow must succeed");
    assert_eq!(state.current_hp, 0);
    assert_eq!(state.phase, BossPhase::Defeated);
    assert!(events
        .iter()
        .any(|e| matches!(e, BossEncounterEvent::BossDefeated { .. })));

    // 6. Verify MVP calculation and reward distribution
    let rewards = state
        .mvp_rewards
        .expect("MVP rewards must be present upon boss defeat");
    assert_eq!(rewards.len(), 3);

    // player_dps dealt 35k / 80k (43.75% dmg = ~2625 pts), took 2k dmg
    // player_tank took 15k / 17k (88.2% tank = ~1764 pts) + 10k dmg (~750 pts) + 1000 first hit = ~3514 pts!
    // Tank has high tanking + first hit + damage -> let's inspect the MVP winner
    let winner = &rewards[0];
    assert!(winner.is_mvp_winner);
    assert_eq!(winner.reward_item_id, "mvp_crown_of_victory");
    assert_eq!(winner.bonus_exp, 25_000);

    // All participants receive rewards
    for r in &rewards[1..] {
        assert!(!r.is_mvp_winner);
        assert_eq!(r.reward_item_id, "dungeon_participant_chest");
        assert_eq!(r.bonus_exp, 8_000);
    }

    let cleared_inst = registry.get_instance(inst_id).unwrap();
    assert_eq!(cleared_inst.state, DungeonState::Cleared);
    assert!(!cleared_inst.mvp_boss_alive);
}

#[tokio::test]
async fn test_boss_encounter_http_endpoints() {
    let auth = AuthGuard::new(b"boss_test_secret_32bytes_long!!".to_vec());
    let dungeons = Arc::new(DungeonRegistry::new());

    let server = WsServer::bind("127.0.0.1:0", auth)
        .await
        .expect("WsServer bind failed")
        .with_dungeons(dungeons.clone());
    let addr = server.local_addr();
    let client = Client::new();

    // 1. Allocate a dungeon instance via HTTP
    let enter_url = format!("http://{}/dungeon/portal/enter", addr);
    let enter_resp = client
        .post(&enter_url)
        .json(&serde_json::json!({
            "partyId": "party_raid_champions",
            "dungeonTemplateId": "dungeon_tower_insolence",
            "mvpBossId": "mvp_baium_emperor",
            "sessionIds": ["player_mage", "player_knight"]
        }))
        .send()
        .await
        .expect("HTTP enter request failed");
    assert_eq!(enter_resp.status(), 200);

    let enter_body: serde_json::Value = enter_resp.json().await.unwrap();
    assert!(enter_body["ok"].as_bool().unwrap());
    let instance_id = enter_body["instance"]["instanceId"].as_str().unwrap();
    let created_at = enter_body["instance"]["createdAtSecs"].as_u64().unwrap();

    // 2. Deal damage via POST /dungeon/instance/{id}/boss/damage
    let dmg_url = format!(
        "http://{}/dungeon/instance/{}/boss/damage",
        addr, instance_id
    );
    let dmg_resp = client
        .post(&dmg_url)
        .json(&serde_json::json!({
            "playerId": "player_mage",
            "damage": 30_000,
            "damageTaken": 500,
            "nowSecs": created_at + 20
        }))
        .send()
        .await
        .expect("Damage request failed");
    assert_eq!(dmg_resp.status(), 200);

    let dmg_body: serde_json::Value = dmg_resp.json().await.unwrap();
    assert!(dmg_body["ok"].as_bool().unwrap());
    assert_eq!(dmg_body["encounter"]["currentHp"], 20_000); // 50k - 30k = 20k (< 50%!)
    assert_eq!(dmg_body["encounter"]["phase"], "phase2_empowered");
    assert_eq!(dmg_body["encounter"]["atkMultiplier"], 1.35);

    // 3. Tick dungeon via POST /dungeon/instance/{id}/tick
    let tick_url = format!("http://{}/dungeon/instance/{}/tick", addr, instance_id);
    let tick_resp = client
        .post(&tick_url)
        .json(&serde_json::json!({
            "nowSecs": created_at + 350 // Past 300s enrage
        }))
        .send()
        .await
        .expect("Tick request failed");
    assert_eq!(tick_resp.status(), 200);

    let tick_body: serde_json::Value = tick_resp.json().await.unwrap();
    assert!(tick_body["ok"].as_bool().unwrap());
    assert_eq!(tick_body["instance"]["state"], "boss_enraged");

    // 4. Defeat the boss via POST /dungeon/instance/{id}/boss/damage
    let kill_resp = client
        .post(&dmg_url)
        .json(&serde_json::json!({
            "playerId": "player_knight",
            "damage": 25_000,
            "damageTaken": 2_000,
            "nowSecs": created_at + 360
        }))
        .send()
        .await
        .expect("Kill request failed");
    assert_eq!(kill_resp.status(), 200);

    let kill_body: serde_json::Value = kill_resp.json().await.unwrap();
    assert!(kill_body["ok"].as_bool().unwrap());
    assert_eq!(kill_body["encounter"]["phase"], "defeated");
    assert_eq!(kill_body["encounter"]["currentHp"], 0);

    let mvp_rewards = kill_body["encounter"]["mvpRewards"].as_array().unwrap();
    assert_eq!(mvp_rewards.len(), 2);
    assert!(mvp_rewards[0]["isMvpWinner"].as_bool().unwrap());
    assert_eq!(mvp_rewards[0]["rewardItemId"], "mvp_crown_of_victory");
}

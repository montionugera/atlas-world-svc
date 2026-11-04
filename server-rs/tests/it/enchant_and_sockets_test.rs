use server_rs::content::enchantment::compute_enchant_stat_multipliers;
use server_rs::meta::engine::{RpcContext, RustMetaEngine};
use server_rs::meta::store::InMemoryMetaStore;
use std::sync::Arc;

#[test]
fn test_enchant_stat_multipliers_scale_quadratically() {
    let (p0, d0, h0) = compute_enchant_stat_multipliers(0);
    assert_eq!(p0, 1.0);
    assert_eq!(d0, 1.0);
    assert_eq!(h0, 1.0);

    let (p4, _, _) = compute_enchant_stat_multipliers(4);
    assert!(p4 > 1.20, "Safe zone provides solid starting power");

    let (p10, _, _) = compute_enchant_stat_multipliers(10);
    let (p20, d20, h20) = compute_enchant_stat_multipliers(20);

    // Non-linear scaling: +20 gives > 3x attack power multiplier!
    assert!(p20 > p10 * 1.5);
    assert!(p20 >= 3.0);
    assert!(d20 >= 2.0);
    assert!(h20 >= 1.6);
}

#[test]
fn test_pure_rust_meta_engine_enchant_and_socketing_rpc_flow() {
    let store = Arc::new(InMemoryMetaStore::new());
    let engine = RustMetaEngine::new(store).expect("Engine initialization should succeed");

    let user_id = "test_player_enchanter";
    let ctx = RpcContext::client(user_id, Some("BlacksmithLegend".to_string()));

    // 1. Grant a unique weapon to the player
    let grant_payload = format!(
        r#"{{"userId": "{}", "itemId": "basic_sword", "qty": 1}}"#,
        user_id
    );
    let grant_res = engine
        .invoke_rpc(&RpcContext::s2s(), "grant_loot", &grant_payload)
        .expect("grant_loot should succeed");

    let instance_id = grant_res["granted"][0]["instanceId"]
        .as_str()
        .expect("Unique instanceId must be returned");

    // 2. Enchant from +0 to +1 (deterministic roll_bps = 0 => 100% success)
    let enchant_1 = engine
        .invoke_rpc(
            &ctx,
            "enchant_equipment",
            &format!(r#"{{"instanceId": "{}", "rollBps": 0}}"#, instance_id),
        )
        .expect("enchant_equipment should succeed");

    assert!(enchant_1["ok"].as_bool().unwrap());
    assert_eq!(enchant_1["newTier"].as_u64().unwrap(), 1);
    assert_eq!(enchant_1["glow"].as_str().unwrap(), "none");

    // 3. Enchant to +4 (Safe tier cap)
    for target_tier in 2..=4 {
        let payload = format!(r#"{{"instanceId": "{}", "rollBps": 0}}"#, instance_id);
        let res = engine
            .invoke_rpc(&ctx, "enchant_equipment", &payload)
            .expect("safe enchant should succeed");
        assert_eq!(res["newTier"].as_u64().unwrap(), target_tier);
    }

    // Tier 4 -> 5 transitions to LuminescentBlue glow
    let glow_check = engine
        .invoke_rpc(
            &ctx,
            "enchant_equipment",
            &format!(r#"{{"instanceId": "{}", "rollBps": 0}}"#, instance_id),
        )
        .expect("enchant to 5 should succeed");
    assert_eq!(glow_check["newTier"].as_u64().unwrap(), 5);
    assert_eq!(glow_check["glow"].as_str().unwrap(), "luminescent_blue");

    // 4. Test Failure with Protection Stone at tier 5 (roll_bps = 9999 fails)
    let protect_fail = engine
        .invoke_rpc(
            &ctx,
            "enchant_equipment",
            &format!(
                r#"{{"instanceId": "{}", "rollBps": 9999, "hasProtectionStone": true}}"#,
                instance_id
            ),
        )
        .expect("protected enchant should succeed");
    assert_eq!(protect_fail["newTier"].as_u64().unwrap(), 5);
    assert_eq!(protect_fail["result"].as_str().unwrap(), "failedProtected");

    // 5. Test Failure without Protection (Degrades from 5 to 4)
    let degrade_fail = engine
        .invoke_rpc(
            &ctx,
            "enchant_equipment",
            &format!(
                r#"{{"instanceId": "{}", "rollBps": 9999, "hasProtectionStone": false}}"#,
                instance_id
            ),
        )
        .expect("unprotected enchant failure should degrade");
    assert_eq!(degrade_fail["newTier"].as_u64().unwrap(), 4);
    assert_eq!(degrade_fail["result"].as_str().unwrap(), "failedDegraded");

    // 6. Socket Cards into the weapon
    let socket_1 = engine
        .invoke_rpc(
            &ctx,
            "socket_card",
            &format!(
                r#"{{"instanceId": "{}", "cardId": "card_skeleton_soldier"}}"#,
                instance_id
            ),
        )
        .expect("socketing first card should succeed");
    assert_eq!(
        socket_1["socketedCardIds"]
            .as_array()
            .unwrap()
            .iter()
            .map(|v| v.as_str().unwrap())
            .collect::<Vec<_>>(),
        vec!["card_skeleton_soldier"]
    );

    let socket_2 = engine
        .invoke_rpc(
            &ctx,
            "socket_card",
            &format!(
                r#"{{"instanceId": "{}", "cardId": "card_orc_warlord"}}"#,
                instance_id
            ),
        )
        .expect("socketing second card should succeed");
    assert_eq!(socket_2["socketedCardIds"].as_array().unwrap().len(), 2);
}

//! Integration tests for F-146 (E-005 Slice 9: Quests at runtime).

use bevy_ecs::prelude::*;
use server_rs::ecs::components::{CombatStats, Health, PlayerProgression, PlayerWallet};
use server_rs::systems::progression::{
    claim_quest_reward, PlayerQuestTracker, QuestStatus, RuntimeQuestCatalog,
};

#[test]
fn runtime_quest_catalog_loads_all_28_authored_quests_and_enforces_prerequisites() {
    let catalog = RuntimeQuestCatalog::global();
    assert!(
        catalog.all().len() >= 28,
        "Expected at least 28 authored quests in content/story/quests.json, found {}",
        catalog.all().len()
    );

    // Find a root quest (unlocked_by is empty) and a dependent quest (unlocked_by non-empty)
    let root_quest = catalog
        .all()
        .iter()
        .find(|q| q.unlocked_by.is_empty())
        .expect("at least one root quest without prerequisites must exist");
    let dependent_quest = catalog
        .all()
        .iter()
        .find(|q| !q.unlocked_by.is_empty())
        .expect("at least one quest with prerequisites must exist");

    let mut tracker = PlayerQuestTracker::new();

    // Accepting dependent quest before its prerequisite is completed must fail
    let err = tracker
        .accept_quest(&dependent_quest.id)
        .expect_err("accepting locked quest must fail");
    assert!(err.contains("requires prerequisite"));

    // Accepting root quest succeeds
    tracker
        .accept_quest(&root_quest.id)
        .expect("accepting root quest should succeed");
    assert_eq!(
        tracker.quests.get(&root_quest.id).unwrap().status,
        QuestStatus::Active
    );
}

#[test]
fn completing_quest_objectives_and_claiming_reward_grants_xp_and_gold_idempotently() {
    let catalog = RuntimeQuestCatalog::global();
    let root_quest = catalog
        .all()
        .iter()
        .find(|q| q.unlocked_by.is_empty())
        .expect("root quest must exist");

    let mut world = World::new();
    let mut tracker = PlayerQuestTracker::new();
    tracker.accept_quest(&root_quest.id).unwrap();

    let player = world
        .spawn((
            Health::new(100.0),
            CombatStats::default(),
            PlayerProgression::new(),
            PlayerWallet { gold: 50 },
            tracker,
        ))
        .id();

    // Claiming before objectives are completed must fail
    let early_err = claim_quest_reward(&mut world, player, &root_quest.id)
        .expect_err("cannot claim reward while Active");
    assert!(early_err.contains("not yet completed"));

    // Record objective progress to completion
    let req = root_quest.required_count();
    let status = world
        .get_mut::<PlayerQuestTracker>(player)
        .unwrap()
        .record_objective_progress(&root_quest.id, req)
        .unwrap();
    assert_eq!(status, QuestStatus::Completed);

    // Claim reward once
    let (xp_granted, gold_granted) = claim_quest_reward(&mut world, player, &root_quest.id)
        .expect("claiming completed quest should succeed");
    assert_eq!(xp_granted, root_quest.xp_reward());
    assert_eq!(gold_granted, root_quest.gold_reward());

    let prog = world.get::<PlayerProgression>(player).unwrap();
    assert_eq!(prog.total_xp, xp_granted);
    let wallet = world.get::<PlayerWallet>(player).unwrap();
    assert_eq!(wallet.gold, 50 + gold_granted);

    // Second claim must be rejected idempotently without double-granting
    let dup_err = claim_quest_reward(&mut world, player, &root_quest.id)
        .expect_err("duplicate claim must be rejected");
    assert!(dup_err.contains("already claimed"));
    assert_eq!(
        world.get::<PlayerProgression>(player).unwrap().total_xp,
        xp_granted
    );
    assert_eq!(
        world.get::<PlayerWallet>(player).unwrap().gold,
        50 + gold_granted
    );
}

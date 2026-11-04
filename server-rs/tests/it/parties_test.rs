//! Integration tests for F-149 (E-008 Slice 3: Parties).

use bevy_ecs::prelude::*;
use server_rs::content::MobTier;
use server_rs::ecs::components::{CombatStats, Health, PlayerProgression, Position};
use server_rs::systems::social::{
    accept_party_invite, create_party, grant_party_kill_rewards, invite_to_party,
    sync_party_member_snapshots, SocialHub, SocialSession,
};

#[test]
fn party_members_share_live_health_position_snapshots_and_mob_kill_credit() {
    let mut world = World::new();

    let alice = world
        .spawn((
            SocialSession::new("p-alice", "Alice", "region-hearthstone"),
            Health {
                current: 85.0,
                max: 120.0,
                is_alive: true,
                invulnerable: false,
            },
            CombatStats::default(),
            PlayerProgression::new(),
            Position::new(200.0, 200.0),
        ))
        .id();

    let bob = world
        .spawn((
            SocialSession::new("p-bob", "Bob", "region-hearthstone"),
            Health {
                current: 100.0,
                max: 100.0,
                is_alive: true,
                invulnerable: false,
            },
            CombatStats::default(),
            PlayerProgression::new(),
            Position::new(350.0, 200.0), // 150 units from Alice (within 300.0 PARTY_SHARE_RADIUS)
        ))
        .id();

    // Cara is in the party too, but far away (800 units away, outside 300.0 PARTY_SHARE_RADIUS)
    let cara = world
        .spawn((
            SocialSession::new("p-cara", "Cara", "region-hearthstone"),
            Health::new(100.0),
            CombatStats::default(),
            PlayerProgression::new(),
            Position::new(1000.0, 200.0),
        ))
        .id();

    let party_id = create_party(&mut world, "p-alice").expect("party creation should succeed");
    invite_to_party(&mut world, &party_id, "p-alice", "p-bob")
        .expect("inviting Bob should succeed");
    accept_party_invite(&mut world, &party_id, "p-bob")
        .expect("Bob accepting invite should succeed");
    invite_to_party(&mut world, &party_id, "p-alice", "p-cara")
        .expect("inviting Cara should succeed");
    accept_party_invite(&mut world, &party_id, "p-cara")
        .expect("Cara accepting invite should succeed");

    // Live party snapshots reflect each member's HP, level, position, and region
    let snapshots = sync_party_member_snapshots(&mut world, &party_id)
        .expect("syncing party snapshots should succeed");
    assert_eq!(snapshots.len(), 3);
    assert_eq!(snapshots[0].player_id, "p-alice");
    assert_eq!(snapshots[0].current_hp, 85.0);
    assert_eq!(snapshots[0].position, Position::new(200.0, 200.0));
    assert_eq!(snapshots[1].player_id, "p-bob");
    assert_eq!(snapshots[1].position, Position::new(350.0, 200.0));

    // Alice kills a mob at (250, 200): both Alice (50u) and Bob (100u) get kill credit & XP, while Cara (750u) does not
    let awarded = grant_party_kill_rewards(
        &mut world,
        alice,
        "mob-ember-wolf-1",
        MobTier::Route,
        Position::new(250.0, 200.0),
    )
    .expect("granting party kill rewards should succeed");

    assert_eq!(awarded.len(), 2);
    assert!(awarded.iter().any(|(pid, xp)| pid == "p-alice" && *xp > 0));
    assert!(awarded.iter().any(|(pid, xp)| pid == "p-bob" && *xp > 0));

    assert!(world.get::<PlayerProgression>(alice).unwrap().total_xp > 0);
    assert!(world.get::<PlayerProgression>(bob).unwrap().total_xp > 0);
    assert_eq!(world.get::<PlayerProgression>(cara).unwrap().total_xp, 0);

    let hub = world.resource::<SocialHub>();
    let party = hub.parties.get(&party_id).unwrap();
    assert_eq!(party.kill_credits.get("p-alice").copied(), Some(1));
    assert_eq!(party.kill_credits.get("p-bob").copied(), Some(1));
    assert_eq!(party.kill_credits.get("p-cara").copied(), Some(0));

    // Replaying the same mob kill idempotently awards nothing extra
    let replay = grant_party_kill_rewards(
        &mut world,
        alice,
        "mob-ember-wolf-1",
        MobTier::Route,
        Position::new(250.0, 200.0),
    )
    .unwrap();
    assert!(replay.is_empty());
}

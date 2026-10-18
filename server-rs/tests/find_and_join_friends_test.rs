//! Integration tests for F-150 (E-008 Slice 4: Find and join friends in the world).

use bevy_ecs::prelude::*;
use server_rs::ecs::components::{Health, Position, Velocity};
use server_rs::systems::social::{
    accept_friend_request, accept_party_invite, create_party, invite_to_party,
    join_friend_in_world, locate_friend_in_world, send_friend_request, SocialSession,
};

#[test]
fn player_locates_and_joins_party_or_accepted_friend_region_and_rejects_strangers() {
    let mut world = World::new();

    let alice = world
        .spawn((
            SocialSession::new("p-alice", "Alice", "region-hearthstone"),
            Health::new(100.0),
            Position::new(100.0, 100.0),
            Velocity::new(4.0, -2.0),
        ))
        .id();

    let bob = world
        .spawn((
            SocialSession::new("p-bob", "Bob", "region-embervale"),
            Health::new(100.0),
            Position::new(2400.0, 1800.0),
            Velocity::zero(),
        ))
        .id();

    let stranger = world
        .spawn((
            SocialSession::new("p-stranger", "Stranger", "region-cindervast"),
            Health::new(100.0),
            Position::new(3000.0, 3000.0),
        ))
        .id();

    // Cannot locate or join a stranger who is neither friend nor party member
    let stranger_err = locate_friend_in_world(&mut world, "p-alice", "p-stranger")
        .expect_err("locating non-friend non-party player must fail");
    assert!(stranger_err.contains("neither an accepted friend nor a party member"));

    // Form a party with Bob and locate/join Bob's region instance
    let party_id = create_party(&mut world, "p-bob").unwrap();
    invite_to_party(&mut world, &party_id, "p-bob", "p-alice").unwrap();
    accept_party_invite(&mut world, &party_id, "p-alice").unwrap();

    let (found_region, found_pos) = locate_friend_in_world(&mut world, "p-alice", "p-bob")
        .expect("locating party member should succeed");
    assert_eq!(found_region, "region-embervale");
    assert_eq!(found_pos, Position::new(2400.0, 1800.0));

    let (joined_region, joined_pos) = join_friend_in_world(&mut world, alice, "p-bob")
        .expect("joining party friend should transition region and coordinates");
    assert_eq!(joined_region, "region-embervale");
    assert_eq!(joined_pos, Position::new(2400.0, 1800.0));
    assert_eq!(
        world.get::<SocialSession>(alice).unwrap().region_id,
        "region-embervale"
    );
    assert_eq!(
        *world.get::<Position>(alice).unwrap(),
        Position::new(2400.0, 1800.0)
    );
    assert_eq!(*world.get::<Velocity>(alice).unwrap(), Velocity::zero());

    // Accepted friend (not in party) can also be joined
    send_friend_request(&mut world, "p-alice", "p-stranger").unwrap();
    accept_friend_request(&mut world, "p-stranger", "p-alice").unwrap();
    let (friend_region, friend_pos) = join_friend_in_world(&mut world, alice, "p-stranger")
        .expect("joining accepted friend should succeed");
    assert_eq!(friend_region, "region-cindervast");
    assert_eq!(friend_pos, Position::new(3000.0, 3000.0));

    let _ = (bob, stranger);
}

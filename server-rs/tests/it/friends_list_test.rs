//! Integration tests for F-148 (E-008 Slice 2: Friends list).

use bevy_ecs::prelude::*;
use server_rs::systems::social::{
    accept_friend_request, list_friends_with_presence, send_friend_request, SocialSession,
};

#[test]
fn friend_request_is_sent_accepted_and_reflects_live_online_presence() {
    let mut world = World::new();

    let alice_ent = world
        .spawn(SocialSession::new("p-alice", "Alice", "region-hearthstone"))
        .id();
    let bob_ent = world
        .spawn(SocialSession::new("p-bob", "Bob", "region-embervale"))
        .id();

    // Accepting without a pending request fails
    let missing_err = accept_friend_request(&mut world, "p-bob", "p-alice")
        .expect_err("accepting without pending request must fail");
    assert!(missing_err.contains("No pending friend request"));

    // Alice sends friend request to Bob and Bob accepts
    send_friend_request(&mut world, "p-alice", "p-bob")
        .expect("sending friend request should succeed");
    accept_friend_request(&mut world, "p-bob", "p-alice")
        .expect("accepting pending friend request should succeed");

    // Both Alice and Bob see each other online in their active regions
    let alice_friends = list_friends_with_presence(&mut world, "p-alice");
    assert_eq!(alice_friends.len(), 1);
    assert_eq!(alice_friends[0].friend_id, "p-bob");
    assert_eq!(alice_friends[0].display_name, "Bob");
    assert!(alice_friends[0].online);
    assert_eq!(
        alice_friends[0].region_id.as_deref(),
        Some("region-embervale")
    );

    let bob_friends = list_friends_with_presence(&mut world, "p-bob");
    assert_eq!(bob_friends.len(), 1);
    assert_eq!(bob_friends[0].friend_id, "p-alice");
    assert!(bob_friends[0].online);
    assert_eq!(
        bob_friends[0].region_id.as_deref(),
        Some("region-hearthstone")
    );

    // When Bob goes offline, Alice's friends list shows Bob offline with no active region
    world.get_mut::<SocialSession>(bob_ent).unwrap().online = false;
    let alice_friends_after = list_friends_with_presence(&mut world, "p-alice");
    assert!(!alice_friends_after[0].online);
    assert!(alice_friends_after[0].region_id.is_none());

    let _ = alice_ent;
}

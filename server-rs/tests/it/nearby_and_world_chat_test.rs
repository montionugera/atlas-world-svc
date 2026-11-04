//! Integration tests for F-147 (E-008 Slice 1: Nearby and world chat).

use bevy_ecs::prelude::*;
use server_rs::ecs::components::Position;
use server_rs::systems::social::{
    send_chat_message, ChatChannel, ChatInbox, SocialSession, MAX_CHAT_MESSAGES_PER_SECOND,
};

#[test]
fn nearby_chat_delivers_only_within_50_units_and_world_chat_reaches_all_online_players() {
    let mut world = World::new();

    let alice = world
        .spawn((
            SocialSession::new("p-alice", "Alice", "region-hearthstone"),
            Position::new(100.0, 100.0),
            ChatInbox::default(),
        ))
        .id();
    // Bob is 30 units away in the same region (within 50.0 radius)
    let bob = world
        .spawn((
            SocialSession::new("p-bob", "Bob", "region-hearthstone"),
            Position::new(130.0, 100.0),
            ChatInbox::default(),
        ))
        .id();
    // Cara is 80 units away in the same region (outside 50.0 radius)
    let cara = world
        .spawn((
            SocialSession::new("p-cara", "Cara", "region-hearthstone"),
            Position::new(180.0, 100.0),
            ChatInbox::default(),
        ))
        .id();
    // Dan is in a different region
    let dan = world
        .spawn((
            SocialSession::new("p-dan", "Dan", "region-embervale"),
            Position::new(100.0, 100.0),
            ChatInbox::default(),
        ))
        .id();

    let nearby_recipients = send_chat_message(
        &mut world,
        alice,
        ChatChannel::Nearby,
        "Hello nearby!",
        1_000,
    )
    .expect("nearby chat should succeed");

    assert!(nearby_recipients.contains(&alice));
    assert!(nearby_recipients.contains(&bob));
    assert!(!nearby_recipients.contains(&cara));
    assert!(!nearby_recipients.contains(&dan));

    assert_eq!(world.get::<ChatInbox>(bob).unwrap().messages.len(), 1);
    assert_eq!(
        world.get::<ChatInbox>(bob).unwrap().messages[0].text,
        "Hello nearby!"
    );
    assert!(world.get::<ChatInbox>(cara).unwrap().messages.is_empty());
    assert!(world.get::<ChatInbox>(dan).unwrap().messages.is_empty());

    // World channel reaches all 4 online players across regions
    let world_recipients =
        send_chat_message(&mut world, alice, ChatChannel::World, "Hello world!", 1_100)
            .expect("world chat should succeed");
    assert_eq!(world_recipients.len(), 4);
    assert_eq!(world.get::<ChatInbox>(cara).unwrap().messages.len(), 1);
    assert_eq!(world.get::<ChatInbox>(dan).unwrap().messages.len(), 1);
}

#[test]
fn sending_more_than_5_chat_messages_per_second_triggers_rate_limiting() {
    let mut world = World::new();

    let alice = world
        .spawn((
            SocialSession::new("p-alice", "Alice", "region-hearthstone"),
            Position::new(100.0, 100.0),
            ChatInbox::default(),
        ))
        .id();
    let bob = world
        .spawn((
            SocialSession::new("p-bob", "Bob", "region-hearthstone"),
            Position::new(110.0, 100.0),
            ChatInbox::default(),
        ))
        .id();

    for i in 0..MAX_CHAT_MESSAGES_PER_SECOND {
        send_chat_message(
            &mut world,
            alice,
            ChatChannel::Nearby,
            format!("msg-{}", i),
            2_000 + (i as u64) * 100,
        )
        .expect("messages 1..=5 within 1s window must succeed");
    }

    // 6th message within the same 1000ms window must be rate-limited
    let err = send_chat_message(&mut world, alice, ChatChannel::Nearby, "msg-6-spam", 2_500)
        .expect_err("6th message within 1s must be rejected");
    assert!(err.contains("Rate limit exceeded"));
    assert_eq!(
        world.get::<ChatInbox>(bob).unwrap().messages.len(),
        MAX_CHAT_MESSAGES_PER_SECOND
    );

    // After 1000ms has elapsed since the 1st message (at 3_001ms), sending succeeds again
    send_chat_message(
        &mut world,
        alice,
        ChatChannel::Nearby,
        "msg-after-cooldown",
        3_001,
    )
    .expect("message after 1s window slides must succeed");
    assert_eq!(
        world.get::<ChatInbox>(bob).unwrap().messages.len(),
        MAX_CHAT_MESSAGES_PER_SECOND + 1
    );
}

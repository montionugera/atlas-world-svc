//! Social Play Systems (Epic E-008, Slices 1–4: `I-181..I-184`).
//!
//! Provides deterministic, server-authoritative implementations for:
//! - Slice 1 (`I-181`): Nearby (`50.0` world units) and World text chat with per-sender
//!   rate limiting (`MAX_CHAT_MESSAGES_PER_SECOND = 5`).
//! - Slice 2 (`I-182`): Friends list (`send_friend_request`, `accept_friend_request`,
//!   `list_friends_with_presence`) with online/offline and region presence tracking.
//! - Slice 3 (`I-183`): Parties (`create_party`, `invite_to_party`, `accept_party_invite`,
//!   `sync_party_member_snapshots`, `grant_party_kill_rewards`) sharing live health/position
//!   and idempotent mob kill credit + XP across nearby party members.
//! - Slice 4 (`I-184`): Find and join friends in the world (`locate_friend_in_world`,
//!   `join_friend_in_world`) transitioning an alive player into their friend's or party
//!   member's active region instance and coordinates.

use std::collections::{HashMap, HashSet, VecDeque};

use bevy_ecs::prelude::*;
use serde::{Deserialize, Serialize};

use crate::content::MobTier;
use crate::ecs::components::{CombatStats, Health, PlayerProgression, Position, Velocity};
use crate::systems::progression::{grant_xp_and_scale_stats, mob_xp_reward, GrantLedger};

/// Maximum Euclidean distance (`50.0` world units) for `ChatChannel::Nearby` delivery (E-008 Slice 1).
pub const NEARBY_CHAT_RADIUS: f32 = 50.0;

/// Maximum chat messages allowed per sender within any rolling `1000ms` window (E-008 Slice 1).
pub const MAX_CHAT_MESSAGES_PER_SECOND: usize = 5;

/// Maximum Euclidean distance (`300.0` world units) within the same region for party XP/kill sharing (E-008 Slice 3).
pub const PARTY_SHARE_RADIUS: f32 = 300.0;

#[inline]
fn distance_2d(a: Position, b: Position) -> f32 {
    ((a.x - b.x).powi(2) + (a.y - b.y).powi(2)).sqrt()
}

/// Associates an ECS player entity with their authenticated social identity and active region instance.
#[derive(Component, Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SocialSession {
    pub player_id: String,
    pub display_name: String,
    pub region_id: String,
    pub online: bool,
}

impl SocialSession {
    pub fn new(
        player_id: impl Into<String>,
        display_name: impl Into<String>,
        region_id: impl Into<String>,
    ) -> Self {
        Self {
            player_id: player_id.into(),
            display_name: display_name.into(),
            region_id: region_id.into(),
            online: true,
        }
    }
}

/// Chat channel selector (E-008 Slice 1).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ChatChannel {
    Nearby,
    World,
    Party,
}

/// Delivered chat message record (E-008 Slice 1).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ChatMessage {
    pub sender_id: String,
    pub sender_name: String,
    pub channel: ChatChannel,
    pub text: String,
    pub timestamp_ms: u64,
}

/// Per-player chat inbox component storing received messages in order (E-008 Slice 1).
#[derive(Component, Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct ChatInbox {
    pub messages: Vec<ChatMessage>,
}

/// World-level chat rate limiter tracking message timestamps per `sender_id` (E-008 Slice 1).
#[derive(Resource, Debug, Clone, Default)]
pub struct ChatRateLimiter {
    history_ms: HashMap<String, VecDeque<u64>>,
}

impl ChatRateLimiter {
    pub fn new() -> Self {
        Self::default()
    }

    /// Checks and records a chat send attempt at `now_ms`.
    /// Returns `Err` if the sender has already sent `MAX_CHAT_MESSAGES_PER_SECOND` messages
    /// within `(now_ms - 1000, now_ms]`.
    pub fn check_and_record(&mut self, sender_id: &str, now_ms: u64) -> Result<(), String> {
        let queue = self.history_ms.entry(sender_id.to_string()).or_default();
        let cutoff = now_ms.saturating_sub(1_000);
        while let Some(&front) = queue.front() {
            if front <= cutoff {
                queue.pop_front();
            } else {
                break;
            }
        }
        if queue.len() >= MAX_CHAT_MESSAGES_PER_SECOND {
            return Err(format!(
                "Rate limit exceeded: max {} messages per second",
                MAX_CHAT_MESSAGES_PER_SECOND
            ));
        }
        queue.push_back(now_ms);
        Ok(())
    }
}

/// Sends a chat message from `sender` on `channel` at `now_ms` (E-008 Slice 1).
///
/// - Enforces `MAX_CHAT_MESSAGES_PER_SECOND` (`5` messages / `1000ms` window) via `ChatRateLimiter`.
/// - For `ChatChannel::Nearby`, delivers to online players in the same `region_id` within `NEARBY_CHAT_RADIUS` (`50.0` units).
/// - For `ChatChannel::World`, delivers to all online players across all regions.
/// - Returns the list of recipient `Entity` IDs that received the message.
pub fn send_chat_message(
    world: &mut World,
    sender: Entity,
    channel: ChatChannel,
    text: impl Into<String>,
    now_ms: u64,
) -> Result<Vec<Entity>, String> {
    let text = text.into();
    if text.trim().is_empty() {
        return Err("Chat message cannot be empty".to_string());
    }

    let sender_session = world
        .get::<SocialSession>(sender)
        .cloned()
        .ok_or_else(|| "Sender has no SocialSession".to_string())?;
    if !sender_session.online {
        return Err("Offline player cannot send chat messages".to_string());
    }
    let sender_pos = world
        .get::<Position>(sender)
        .copied()
        .unwrap_or(Position::new(0.0, 0.0));

    if world.get_resource::<ChatRateLimiter>().is_none() {
        world.insert_resource(ChatRateLimiter::new());
    }
    world
        .resource_mut::<ChatRateLimiter>()
        .check_and_record(&sender_session.player_id, now_ms)?;

    let party_member_ids: Option<HashSet<String>> = if channel == ChatChannel::Party {
        let hub = world
            .get_resource::<SocialHub>()
            .ok_or_else(|| "No SocialHub resource for Party chat".to_string())?;
        let party_id = hub
            .player_party
            .get(&sender_session.player_id)
            .ok_or_else(|| "Sender is not in a party".to_string())?;
        let party = hub
            .parties
            .get(party_id)
            .ok_or_else(|| "Party not found".to_string())?;
        Some(party.members.iter().cloned().collect())
    } else {
        None
    };

    let msg = ChatMessage {
        sender_id: sender_session.player_id.clone(),
        sender_name: sender_session.display_name.clone(),
        channel,
        text,
        timestamp_ms: now_ms,
    };

    let mut recipients = Vec::new();
    let mut query = world.query::<(Entity, &SocialSession, Option<&Position>)>();
    for (entity, session, pos_opt) in query.iter(world) {
        if !session.online {
            continue;
        }
        let deliver = match channel {
            ChatChannel::World => true,
            ChatChannel::Nearby => {
                if session.region_id != sender_session.region_id {
                    false
                } else {
                    let pos = pos_opt.copied().unwrap_or(Position::new(0.0, 0.0));
                    distance_2d(sender_pos, pos) <= NEARBY_CHAT_RADIUS
                }
            }
            ChatChannel::Party => party_member_ids
                .as_ref()
                .is_some_and(|members| members.contains(&session.player_id)),
        };
        if deliver {
            recipients.push(entity);
        }
    }

    for &recipient in &recipients {
        if world.get::<ChatInbox>(recipient).is_none() {
            world.entity_mut(recipient).insert(ChatInbox::default());
        }
        world
            .get_mut::<ChatInbox>(recipient)
            .unwrap()
            .messages
            .push(msg.clone());
    }

    Ok(recipients)
}

/// Friend presence entry returned by `list_friends_with_presence` (E-008 Slice 2).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FriendPresenceEntry {
    pub friend_id: String,
    pub display_name: String,
    pub online: bool,
    pub region_id: Option<String>,
}

/// Live party member snapshot returned by `sync_party_member_snapshots` (E-008 Slice 3).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PartyMemberSnapshot {
    pub player_id: String,
    pub display_name: String,
    pub current_hp: f32,
    pub max_hp: f32,
    pub level: u32,
    pub position: Position,
    pub region_id: String,
    pub is_alive: bool,
}

/// Party state stored in `SocialHub` (E-008 Slice 3).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PartyState {
    pub party_id: String,
    pub leader_id: String,
    pub members: Vec<String>,
    pub pending_invites: HashSet<String>,
    pub kill_credits: HashMap<String, u32>,
}

/// World-level social coordinator managing friendships, pending requests, and parties (E-008 Slices 2–4).
#[derive(Resource, Debug, Clone, Default)]
pub struct SocialHub {
    /// `recipient_id -> set of sender_ids`
    pub pending_friend_requests: HashMap<String, HashSet<String>>,
    /// `player_id -> set of accepted friend_ids`
    pub friends: HashMap<String, HashSet<String>>,
    /// `party_id -> PartyState`
    pub parties: HashMap<String, PartyState>,
    /// `player_id -> party_id`
    pub player_party: HashMap<String, String>,
    next_party_seq: u64,
}

impl SocialHub {
    pub fn new() -> Self {
        Self::default()
    }
}

fn ensure_social_hub(world: &mut World) {
    if world.get_resource::<SocialHub>().is_none() {
        world.insert_resource(SocialHub::new());
    }
}

/// Sends a friend request from `from_player_id` to `to_player_id` (E-008 Slice 2).
pub fn send_friend_request(
    world: &mut World,
    from_player_id: &str,
    to_player_id: &str,
) -> Result<(), String> {
    if from_player_id.is_empty() || to_player_id.is_empty() {
        return Err("Player IDs cannot be empty".to_string());
    }
    if from_player_id == to_player_id {
        return Err("Cannot send a friend request to yourself".to_string());
    }
    ensure_social_hub(world);
    let mut hub = world.resource_mut::<SocialHub>();
    if hub
        .friends
        .get(from_player_id)
        .is_some_and(|f| f.contains(to_player_id))
    {
        return Err("Players are already friends".to_string());
    }
    hub.pending_friend_requests
        .entry(to_player_id.to_string())
        .or_default()
        .insert(from_player_id.to_string());
    Ok(())
}

/// Accepts a pending friend request from `requester_id` to `recipient_id`, establishing
/// a bidirectional friendship (E-008 Slice 2).
pub fn accept_friend_request(
    world: &mut World,
    recipient_id: &str,
    requester_id: &str,
) -> Result<(), String> {
    ensure_social_hub(world);
    let mut hub = world.resource_mut::<SocialHub>();
    let removed = hub
        .pending_friend_requests
        .get_mut(recipient_id)
        .map(|reqs| reqs.remove(requester_id))
        .unwrap_or(false);
    if !removed {
        return Err(format!(
            "No pending friend request from '{}' to '{}'",
            requester_id, recipient_id
        ));
    }
    hub.friends
        .entry(recipient_id.to_string())
        .or_default()
        .insert(requester_id.to_string());
    hub.friends
        .entry(requester_id.to_string())
        .or_default()
        .insert(recipient_id.to_string());
    Ok(())
}

/// Returns the player's accepted friends along with their live online presence and active region (E-008 Slice 2).
pub fn list_friends_with_presence(world: &mut World, player_id: &str) -> Vec<FriendPresenceEntry> {
    ensure_social_hub(world);
    let friend_ids: Vec<String> = {
        let hub = world.resource::<SocialHub>();
        let mut ids: Vec<String> = hub
            .friends
            .get(player_id)
            .map(|set| set.iter().cloned().collect())
            .unwrap_or_default();
        ids.sort();
        ids
    };

    let mut sessions_by_id: HashMap<String, SocialSession> = HashMap::new();
    let mut query = world.query::<&SocialSession>();
    for session in query.iter(world) {
        sessions_by_id.insert(session.player_id.clone(), session.clone());
    }

    friend_ids
        .into_iter()
        .map(|fid| {
            if let Some(sess) = sessions_by_id.get(&fid) {
                FriendPresenceEntry {
                    friend_id: fid,
                    display_name: sess.display_name.clone(),
                    online: sess.online,
                    region_id: if sess.online {
                        Some(sess.region_id.clone())
                    } else {
                        None
                    },
                }
            } else {
                FriendPresenceEntry {
                    friend_id: fid.clone(),
                    display_name: fid,
                    online: false,
                    region_id: None,
                }
            }
        })
        .collect()
}

/// Creates a new party with `leader_id` as its initial member and returns `party_id` (E-008 Slice 3).
pub fn create_party(world: &mut World, leader_id: &str) -> Result<String, String> {
    if leader_id.is_empty() {
        return Err("Leader ID cannot be empty".to_string());
    }
    ensure_social_hub(world);
    let mut hub = world.resource_mut::<SocialHub>();
    if hub.player_party.contains_key(leader_id) {
        return Err(format!("Player '{}' is already in a party", leader_id));
    }
    hub.next_party_seq += 1;
    let party_id = format!("party-{}", hub.next_party_seq);
    let mut kill_credits = HashMap::new();
    kill_credits.insert(leader_id.to_string(), 0);
    hub.parties.insert(
        party_id.clone(),
        PartyState {
            party_id: party_id.clone(),
            leader_id: leader_id.to_string(),
            members: vec![leader_id.to_string()],
            pending_invites: HashSet::new(),
            kill_credits,
        },
    );
    hub.player_party
        .insert(leader_id.to_string(), party_id.clone());
    Ok(party_id)
}

/// Invites `invitee_id` to `party_id` on behalf of `inviter_id` (E-008 Slice 3).
pub fn invite_to_party(
    world: &mut World,
    party_id: &str,
    inviter_id: &str,
    invitee_id: &str,
) -> Result<(), String> {
    ensure_social_hub(world);
    let mut hub = world.resource_mut::<SocialHub>();
    if hub.player_party.contains_key(invitee_id) {
        return Err(format!("Player '{}' is already in a party", invitee_id));
    }
    let party = hub
        .parties
        .get_mut(party_id)
        .ok_or_else(|| format!("Unknown party '{}'", party_id))?;
    if !party.members.iter().any(|m| m == inviter_id) {
        return Err(format!(
            "Inviter '{}' is not a member of '{}'",
            inviter_id, party_id
        ));
    }
    party.pending_invites.insert(invitee_id.to_string());
    Ok(())
}

/// Accepts a pending party invite for `invitee_id` into `party_id` (E-008 Slice 3).
pub fn accept_party_invite(
    world: &mut World,
    party_id: &str,
    invitee_id: &str,
) -> Result<(), String> {
    ensure_social_hub(world);
    let mut hub = world.resource_mut::<SocialHub>();
    if hub.player_party.contains_key(invitee_id) {
        return Err(format!("Player '{}' is already in a party", invitee_id));
    }
    let party = hub
        .parties
        .get_mut(party_id)
        .ok_or_else(|| format!("Unknown party '{}'", party_id))?;
    if !party.pending_invites.remove(invitee_id) {
        return Err(format!(
            "No pending invite for '{}' in party '{}'",
            invitee_id, party_id
        ));
    }
    party.members.push(invitee_id.to_string());
    party
        .kill_credits
        .entry(invitee_id.to_string())
        .or_insert(0);
    hub.player_party
        .insert(invitee_id.to_string(), party_id.to_string());
    Ok(())
}

/// Collects live health, level, position, and region snapshots for all members of `party_id` (E-008 Slice 3).
pub fn sync_party_member_snapshots(
    world: &mut World,
    party_id: &str,
) -> Result<Vec<PartyMemberSnapshot>, String> {
    ensure_social_hub(world);
    let member_ids: Vec<String> = {
        let hub = world.resource::<SocialHub>();
        let party = hub
            .parties
            .get(party_id)
            .ok_or_else(|| format!("Unknown party '{}'", party_id))?;
        party.members.clone()
    };

    let mut entity_by_pid: HashMap<String, PartyMemberSnapshot> = HashMap::new();
    let mut query = world.query::<(
        &SocialSession,
        Option<&Health>,
        Option<&PlayerProgression>,
        Option<&Position>,
    )>();
    for (sess, hp_opt, prog_opt, pos_opt) in query.iter(world) {
        let (current_hp, max_hp, is_alive) = hp_opt
            .map(|h| (h.current, h.max, h.is_alive))
            .unwrap_or((100.0, 100.0, true));
        let level = prog_opt.map(|p| p.level).unwrap_or(1);
        let position = pos_opt.copied().unwrap_or(Position::new(0.0, 0.0));
        entity_by_pid.insert(
            sess.player_id.clone(),
            PartyMemberSnapshot {
                player_id: sess.player_id.clone(),
                display_name: sess.display_name.clone(),
                current_hp,
                max_hp,
                level,
                position,
                region_id: sess.region_id.clone(),
                is_alive,
            },
        );
    }

    Ok(member_ids
        .into_iter()
        .filter_map(|pid| entity_by_pid.remove(&pid))
        .collect())
}

/// Grants shared kill credit and XP to all alive party members of `killer` in the same region
/// within `PARTY_SHARE_RADIUS` (`300.0` units), idempotently guarded by `GrantLedger` (E-008 Slice 3).
///
/// Returns the list of `(player_id, xp_granted)` for all party members who received credit.
pub fn grant_party_kill_rewards(
    world: &mut World,
    killer: Entity,
    mob_id: &str,
    mob_tier: MobTier,
    mob_pos: Position,
) -> Result<Vec<(String, u32)>, String> {
    ensure_social_hub(world);
    if world.get_resource::<GrantLedger>().is_none() {
        world.insert_resource(GrantLedger::default());
    }

    let killer_sess = world
        .get::<SocialSession>(killer)
        .cloned()
        .ok_or_else(|| "Killer has no SocialSession".to_string())?;

    let party_id_opt = world
        .resource::<SocialHub>()
        .player_party
        .get(&killer_sess.player_id)
        .cloned();

    let member_set: HashSet<String> = if let Some(ref pid) = party_id_opt {
        world
            .resource::<SocialHub>()
            .parties
            .get(pid)
            .map(|p| p.members.iter().cloned().collect())
            .unwrap_or_default()
    } else {
        let mut s = HashSet::new();
        s.insert(killer_sess.player_id.clone());
        s
    };

    let mut eligible_entities: Vec<(Entity, String)> = Vec::new();
    let mut query = world.query::<(Entity, &SocialSession, Option<&Position>, Option<&Health>)>();
    for (ent, sess, pos_opt, hp_opt) in query.iter(world) {
        if !sess.online || sess.region_id != killer_sess.region_id {
            continue;
        }
        if !member_set.contains(&sess.player_id) {
            continue;
        }
        if hp_opt.is_some_and(|h| !h.is_alive) {
            continue;
        }
        let pos = pos_opt.copied().unwrap_or(Position::new(0.0, 0.0));
        if distance_2d(pos, mob_pos) <= PARTY_SHARE_RADIUS {
            eligible_entities.push((ent, sess.player_id.clone()));
        }
    }

    let base_xp = mob_xp_reward(Some(mob_tier));
    let mut awarded = Vec::new();

    for (ent, pid) in eligible_entities {
        let grant_key = format!("party_kill:{}:{}", mob_id, pid);
        let is_new = world
            .resource_mut::<GrantLedger>()
            .try_claim_grant(&grant_key);
        if !is_new {
            continue;
        }

        let mut hp = world
            .get::<Health>(ent)
            .copied()
            .unwrap_or_else(|| Health::new(100.0));
        let mut stats = world.get::<CombatStats>(ent).copied();
        if let Some(mut prog) = world.get_mut::<PlayerProgression>(ent) {
            grant_xp_and_scale_stats(&mut prog, &mut hp, stats.as_mut(), base_xp);
        }
        if let Some(mut h) = world.get_mut::<Health>(ent) {
            *h = hp;
        }
        if let (Some(mut s), Some(updated_s)) = (world.get_mut::<CombatStats>(ent), stats) {
            *s = updated_s;
        }

        if let Some(ref party_id) = party_id_opt {
            if let Some(party) = world.resource_mut::<SocialHub>().parties.get_mut(party_id) {
                *party.kill_credits.entry(pid.clone()).or_insert(0) += 1;
            }
        }

        awarded.push((pid, base_xp));
    }

    Ok(awarded)
}

/// Checks whether `target_id` is an accepted friend or current party member of `requester_id`.
fn is_friend_or_party_member(hub: &SocialHub, requester_id: &str, target_id: &str) -> bool {
    if hub
        .friends
        .get(requester_id)
        .is_some_and(|set| set.contains(target_id))
    {
        return true;
    }
    if let Some(party_id) = hub.player_party.get(requester_id) {
        if let Some(party) = hub.parties.get(party_id) {
            if party.members.iter().any(|m| m == target_id) {
                return true;
            }
        }
    }
    false
}

/// Locates an online friend or party member in the world, returning `(region_id, Position)` (E-008 Slice 4).
pub fn locate_friend_in_world(
    world: &mut World,
    requester_id: &str,
    target_id: &str,
) -> Result<(String, Position), String> {
    ensure_social_hub(world);
    {
        let hub = world.resource::<SocialHub>();
        if !is_friend_or_party_member(hub, requester_id, target_id) {
            return Err(format!(
                "'{}' is neither an accepted friend nor a party member of '{}'",
                target_id, requester_id
            ));
        }
    }

    let mut query = world.query::<(&SocialSession, Option<&Position>)>();
    for (sess, pos_opt) in query.iter(world) {
        if sess.player_id == target_id {
            if !sess.online {
                return Err(format!(
                    "Target player '{}' is currently offline",
                    target_id
                ));
            }
            let pos = pos_opt.copied().unwrap_or(Position::new(0.0, 0.0));
            return Ok((sess.region_id.clone(), pos));
        }
    }

    Err(format!("Target player '{}' not found in world", target_id))
}

/// Transitions an alive player (`player`) into their friend's or party member's active region
/// instance and world coordinates (E-008 Slice 4).
pub fn join_friend_in_world(
    world: &mut World,
    player: Entity,
    target_id: &str,
) -> Result<(String, Position), String> {
    let is_alive = world.get::<Health>(player).is_none_or(|h| h.is_alive);
    if !is_alive {
        return Err("Dead players cannot join a friend in the world".to_string());
    }

    let requester_id = world
        .get::<SocialSession>(player)
        .map(|s| s.player_id.clone())
        .ok_or_else(|| "Player has no SocialSession".to_string())?;

    let (target_region, target_pos) = locate_friend_in_world(world, &requester_id, target_id)?;

    if let Some(mut sess) = world.get_mut::<SocialSession>(player) {
        sess.region_id = target_region.clone();
    }
    if let Some(mut pos) = world.get_mut::<Position>(player) {
        *pos = target_pos;
    }
    if let Some(mut vel) = world.get_mut::<Velocity>(player) {
        *vel = Velocity::zero();
    }

    Ok((target_region, target_pos))
}

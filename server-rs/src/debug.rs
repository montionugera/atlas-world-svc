//! Development-only controls for a running room: resize the bot and mob populations, pause
//! AI, toggle invulnerability, teleport, and report counts. Off unless [`debug_enabled`];
//! requests arrive over HTTP (`net::ws`) and are applied by the tick loop between ticks.

use bevy_ecs::prelude::*;
use serde::Deserialize;
use serde_json::{json, Value};

use crate::content::map::ROOM_IDS;
use crate::content::{BestiaryCatalog, MobTier};
use crate::core::prng::Mulberry32;
use crate::ecs::components::{
    BotAgent, DeadMobTracker, DespawnedIds, EntityId, Health, MobSpawnAnchor, MobTag, PlayerAvatar,
    Position, Projectile, Velocity,
};
use crate::simulation::AtlasSimulation;
use crate::systems::mob_bundle;

/// Hard ceilings per room, so a typo cannot freeze the host.
pub const MAX_BOTS: usize = 300;
pub const MAX_MOBS: usize = 1000;

/// Most queued commands applied in one tick; the rest wait for the next.
pub const MAX_COMMANDS_PER_TICK: usize = 4;

/// `ATLAS_DEBUG=1|true` forces the controls on and any other value forces them off. Unset,
/// they are on only in a debug build with no auth secret configured, so a release build
/// stays off unless told otherwise.
pub fn debug_enabled(flag: Option<&str>, has_auth_secret: bool, debug_build: bool) -> bool {
    match flag.map(str::trim) {
        Some("1") | Some("true") => true,
        Some(_) => false,
        None => debug_build && !has_auth_secret,
    }
}

pub fn debug_enabled_from_env() -> bool {
    let has_auth_secret =
        std::env::var("NAKAMA_SERVER_KEY").is_ok() || std::env::var("JWT_SECRET").is_ok();
    debug_enabled(
        std::env::var("ATLAS_DEBUG").ok().as_deref(),
        has_auth_secret,
        cfg!(debug_assertions),
    )
}

/// Applies a command to the room `map` names (empty: `ROOM_IDS[0]`). An unknown room is an
/// error rather than a fallback, so a typo never edits another room.
pub fn debug_apply_to_room(
    rooms: &mut std::collections::HashMap<String, AtlasSimulation>,
    map: &str,
    command: &DebugCommand,
    player: Option<&str>,
) -> Result<Value, String> {
    let map = if map.is_empty() { ROOM_IDS[0] } else { map };
    match rooms.get_mut(map) {
        Some(sim) => sim.debug_apply(command, player),
        None => Err(format!("unknown map {map}")),
    }
}

/// AI switches read by `mob_ai_system`, `live_bot_ai_system` and `combat_system`.
#[derive(Resource, Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct DebugToggles {
    pub mobs_paused: bool,
    pub bots_paused: bool,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(tag = "cmd", rename_all = "snake_case")]
pub enum DebugCommand {
    State,
    SetBots {
        count: usize,
    },
    AddBots {
        delta: i64,
    },
    SetMobs {
        count: usize,
    },
    AddMobs {
        delta: i64,
    },
    /// At `x`,`y` when given, else around the calling player.
    SpawnMobs {
        mob_type: String,
        count: usize,
        x: Option<f32>,
        y: Option<f32>,
    },
    ClearMobs,
    PauseMobs {
        paused: bool,
    },
    PauseBots {
        paused: bool,
    },
    SetInvulnerable {
        enabled: bool,
    },
    Teleport {
        x: f32,
        y: f32,
    },
}

/// Body of `POST /debug/command`: the command's own fields plus the room and the caller.
#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct DebugCommandBody {
    #[serde(default)]
    pub map: String,
    #[serde(default)]
    pub player: Option<String>,
    #[serde(flatten)]
    pub command: DebugCommand,
}

fn offset(count: usize, delta: i64) -> usize {
    (count as i64).saturating_add(delta).max(0) as usize
}

impl AtlasSimulation {
    /// Applies one command and returns the room's state afterwards. Inert unless
    /// `debug_enabled`.
    pub fn debug_apply(
        &mut self,
        command: &DebugCommand,
        player: Option<&str>,
    ) -> Result<Value, String> {
        if !self.debug_enabled {
            return Err("debug controls are disabled".to_string());
        }
        match command {
            DebugCommand::State => {}
            DebugCommand::SetBots { count } => self.debug_set_bots(*count),
            DebugCommand::AddBots { delta } => {
                let bots = self.debug_bots().len();
                self.debug_set_bots(offset(bots, *delta))
            }
            DebugCommand::SetMobs { count } => self.debug_set_mobs(*count),
            DebugCommand::AddMobs { delta } => {
                let slots = self.debug_mob_slots();
                self.debug_set_mobs(offset(slots, *delta))
            }
            DebugCommand::SpawnMobs {
                mob_type,
                count,
                x,
                y,
            } => {
                if self
                    .world
                    .resource::<BestiaryCatalog>()
                    .get_mob(mob_type)
                    .is_none()
                {
                    return Err(format!("unknown mob_type {mob_type}"));
                }
                let centre = match (x, y) {
                    (Some(x), Some(y)) => Position::new(*x, *y),
                    _ => {
                        let caller = self.debug_caller(player)?;
                        *self.world.get::<Position>(caller).unwrap()
                    }
                };
                let room = MAX_MOBS.saturating_sub(self.debug_mob_slots());
                for _ in 0..(*count).min(room) {
                    let mut prng = self.world.resource_mut::<Mulberry32>();
                    let (dx, dy) = (prng.range(-40.0, 40.0), prng.range(-40.0, 40.0));
                    self.debug_spawn_mob(mob_type, centre.x + dx, centre.y + dy);
                }
            }
            DebugCommand::ClearMobs => self.debug_set_mobs(0),
            DebugCommand::PauseMobs { paused } => {
                self.world
                    .get_resource_or_insert_with(DebugToggles::default)
                    .mobs_paused = *paused;
            }
            DebugCommand::PauseBots { paused } => {
                self.world
                    .get_resource_or_insert_with(DebugToggles::default)
                    .bots_paused = *paused;
            }
            DebugCommand::SetInvulnerable { enabled } => {
                let caller = self.debug_caller(player)?;
                self.world.get_mut::<Health>(caller).unwrap().invulnerable = *enabled;
            }
            DebugCommand::Teleport { x, y } => {
                if !x.is_finite() || !y.is_finite() {
                    return Err("x and y must be finite".to_string());
                }
                let caller = self.debug_caller(player)?;
                *self.world.get_mut::<Position>(caller).unwrap() = Position::new(
                    x.clamp(0.0, self.arena_width),
                    y.clamp(0.0, self.arena_height),
                );
                *self.world.get_mut::<Velocity>(caller).unwrap() = Velocity::zero();
            }
        }
        Ok(self.debug_state())
    }

    /// Counts, switches and limits of this room.
    pub fn debug_state(&mut self) -> Value {
        let toggles = self
            .world
            .get_resource::<DebugToggles>()
            .copied()
            .unwrap_or_default();
        let mut avatars = self
            .world
            .query_filtered::<(&EntityId, &Health), With<PlayerAvatar>>();
        let players = avatars.iter(&self.world).count();
        let invulnerable: Vec<&str> = avatars
            .iter(&self.world)
            .filter(|(_, health)| health.invulnerable)
            .map(|(id, _)| id.0.as_str())
            .collect();
        let invulnerable = json!(invulnerable);
        let mobs = self
            .world
            .query_filtered::<(), With<MobTag>>()
            .iter(&self.world)
            .count();
        let projectiles = self
            .world
            .query_filtered::<(), With<Projectile>>()
            .iter(&self.world)
            .count();
        json!({
            "tick": self.clock.tick(),
            "width": self.arena_width,
            "height": self.arena_height,
            "player_spawn": { "x": self.player_spawn.x, "y": self.player_spawn.y },
            "players": players,
            "bots": self.debug_bots().len(),
            "mobs": mobs,
            "mobs_respawning": self.debug_mob_slots() - mobs,
            "projectiles": projectiles,
            "mobs_paused": toggles.mobs_paused,
            "bots_paused": toggles.bots_paused,
            "invulnerable": invulnerable,
            "limits": { "max_bots": MAX_BOTS, "max_mobs": MAX_MOBS },
        })
    }

    fn debug_caller(&mut self, player: Option<&str>) -> Result<Entity, String> {
        let player = player.ok_or("this command needs \"player\"")?;
        self.world
            .query_filtered::<(Entity, &EntityId), With<PlayerAvatar>>()
            .iter(&self.world)
            .find(|(_, id)| id.0 == player)
            .map(|(entity, _)| entity)
            .ok_or_else(|| format!("player {player} is not in this room"))
    }

    /// Bots, oldest first.
    fn debug_bots(&mut self) -> Vec<(Entity, String)> {
        let mut bots: Vec<(Entity, String)> = self
            .world
            .query_filtered::<(Entity, &EntityId), With<BotAgent>>()
            .iter(&self.world)
            .map(|(entity, id)| (entity, id.0.clone()))
            .collect();
        bots.sort_by_key(|(entity, _)| *entity);
        bots
    }

    /// Living mobs plus dead ones waiting to respawn.
    fn debug_mob_slots(&mut self) -> usize {
        let world = &mut self.world;
        world
            .query_filtered::<(), With<MobTag>>()
            .iter(world)
            .count()
            + world.query::<&DeadMobTracker>().iter(world).count()
    }

    fn debug_despawn(&mut self, entity: Entity, id: String) {
        self.world.despawn(entity);
        self.world.resource_mut::<DespawnedIds>().0.push(id);
    }

    fn debug_set_bots(&mut self, count: usize) {
        let count = count.min(MAX_BOTS);
        let mut bots = self.debug_bots();
        while bots.len() > count {
            let (entity, id) = bots.pop().unwrap();
            self.debug_despawn(entity, id);
        }
        for _ in bots.len()..count {
            let mut prng = self.world.resource_mut::<Mulberry32>();
            let x = prng.range(100.0, self.arena_width - 100.0);
            let y = prng.range(100.0, self.arena_height - 100.0);
            let angle = prng.range(0.0, std::f32::consts::TAU);
            self.spawn_bot(x, y, angle);
        }
    }

    fn debug_set_mobs(&mut self, count: usize) {
        let count = count.min(MAX_MOBS);
        let mut slots = self.debug_mob_slots();
        if slots > count {
            // Pending respawns go first, then living mobs.
            let world = &mut self.world;
            let pending: Vec<Entity> = world
                .query_filtered::<Entity, With<DeadMobTracker>>()
                .iter(world)
                .collect();
            for entity in pending.into_iter().take(slots - count) {
                self.world.despawn(entity);
                slots -= 1;
            }
            let world = &mut self.world;
            let living: Vec<(Entity, String)> = world
                .query_filtered::<(Entity, &EntityId), With<MobTag>>()
                .iter(world)
                .map(|(entity, id)| (entity, id.0.clone()))
                .collect();
            for (entity, id) in living.into_iter().take(slots - count) {
                self.debug_despawn(entity, id);
            }
            return;
        }
        let mut mob_types: Vec<String> = self
            .world
            .resource::<BestiaryCatalog>()
            .entries()
            .map(|entry| entry.id.clone())
            .collect();
        mob_types.sort();
        if mob_types.is_empty() {
            return;
        }
        for _ in slots..count {
            let mut prng = self.world.resource_mut::<Mulberry32>();
            let pick = (prng.range(0.0, mob_types.len() as f32) as usize).min(mob_types.len() - 1);
            let x = prng.range(50.0, self.arena_width - 50.0);
            let y = prng.range(50.0, self.arena_height - 50.0);
            self.debug_spawn_mob(&mob_types[pick], x, y);
        }
    }

    fn debug_spawn_mob(&mut self, mob_type: &str, x: f32, y: f32) {
        let pos = Position::new(
            x.clamp(5.0, self.arena_width - 5.0),
            y.clamp(5.0, self.arena_height - 5.0),
        );
        let anchor = MobSpawnAnchor::new(pos, mob_type, MobTier::Route, self.mob_respawn_sec);
        self.debug_mob_seq += 1;
        let id = format!("{}-debug-{}", mob_type, self.debug_mob_seq);
        let bundle = mob_bundle(self.world.resource::<BestiaryCatalog>(), &anchor, id);
        self.world.spawn(bundle);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn controls_follow_the_flag_and_default_on_only_in_a_secretless_debug_build() {
        // (flag, has_auth_secret, debug_build) -> enabled
        let table = [
            (None, false, true, true),
            (None, true, true, false),
            (None, false, false, false),
            (None, true, false, false),
            (Some("1"), true, false, true),
            (Some("true"), true, false, true),
            (Some(" 1 "), true, false, true),
            (Some("0"), false, true, false),
            (Some(""), false, true, false),
            (Some("yes"), false, true, false),
        ];
        for (flag, secret, debug_build, expected) in table {
            assert_eq!(
                debug_enabled(flag, secret, debug_build),
                expected,
                "flag={flag:?} secret={secret} debug_build={debug_build}"
            );
        }
    }

    #[test]
    fn a_command_goes_to_the_named_room_the_default_room_or_nowhere() {
        let mut rooms = std::collections::HashMap::new();
        for (id, bots) in [(ROOM_IDS[0], 1), (ROOM_IDS[1], 2)] {
            let mut sim = AtlasSimulation::live(crate::simulation::LiveConfig {
                bot_count: bots,
                mob_count: 0,
                ..Default::default()
            });
            sim.debug_enabled = true;
            rooms.insert(id.to_string(), sim);
        }
        let mut bots = |map: &str| {
            debug_apply_to_room(&mut rooms, map, &DebugCommand::State, None)
                .map(|state| state["bots"].as_u64().unwrap())
        };
        assert_eq!(bots(ROOM_IDS[1]), Ok(2));
        assert_eq!(bots(""), Ok(1), "no map means the default room");
        assert_eq!(
            bots("map-no-such-room"),
            Err("unknown map map-no-such-room".to_string())
        );
    }

    #[test]
    fn command_body_parses_the_tagged_command_with_room_and_caller() {
        let body: DebugCommandBody = serde_json::from_str(
            r#"{"map":"map-for-play","player":"alice","cmd":"spawn_mobs","mob_type":"mob-veil-cub","count":3}"#,
        )
        .unwrap();
        assert_eq!(body.map, "map-for-play");
        assert_eq!(body.player.as_deref(), Some("alice"));
        assert_eq!(
            body.command,
            DebugCommand::SpawnMobs {
                mob_type: "mob-veil-cub".to_string(),
                count: 3,
                x: None,
                y: None
            }
        );
        let state: DebugCommandBody = serde_json::from_str(r#"{"cmd":"state"}"#).unwrap();
        assert_eq!((state.map.as_str(), state.player), ("", None));
        assert!(serde_json::from_str::<DebugCommandBody>(r#"{"cmd":"set_bots"}"#).is_err());
    }
}

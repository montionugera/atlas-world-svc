use crate::combat::{DamageType, Element, SkillEffect};
use bevy_ecs::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Component, Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Position {
    pub x: f32,
    pub y: f32,
}

impl Position {
    pub fn new(x: f32, y: f32) -> Self {
        Self { x, y }
    }
}

#[derive(Component, Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Velocity {
    pub vx: f32,
    pub vy: f32,
}

impl Velocity {
    pub fn new(vx: f32, vy: f32) -> Self {
        Self { vx, vy }
    }

    pub fn zero() -> Self {
        Self { vx: 0.0, vy: 0.0 }
    }
}

#[derive(Component, Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Health {
    pub current: f32,
    pub max: f32,
    pub is_alive: bool,
    /// Debug control: damage is ignored while set.
    #[serde(skip)]
    pub invulnerable: bool,
}

impl Health {
    pub fn new(max: f32) -> Self {
        Self {
            current: max,
            max,
            is_alive: true,
            invulnerable: false,
        }
    }

    pub fn take_damage(&mut self, amount: f32) {
        if !self.is_alive || self.invulnerable {
            return;
        }
        self.current = (self.current - amount).max(0.0);
        if self.current <= 0.0 {
            self.current = 0.0;
            self.is_alive = false;
        }
    }

    pub fn heal(&mut self, amount: f32) {
        if !self.is_alive || amount <= 0.0 {
            return;
        }
        self.current = (self.current + amount).min(self.max);
    }
}

/// Default passive health regeneration rate in HP/second (E-007 Slice 6).
pub const DEFAULT_HEALTH_REGEN_PER_SEC: f32 = 5.0;

/// Passive health regeneration component that restores HP over time while alive (E-007 Slice 6).
#[derive(Component, Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct HealthRegen {
    pub hp_per_sec: f32,
}

impl HealthRegen {
    pub fn new(hp_per_sec: f32) -> Self {
        Self {
            hp_per_sec: hp_per_sec.max(0.0),
        }
    }
}

impl Default for HealthRegen {
    fn default() -> Self {
        Self::new(DEFAULT_HEALTH_REGEN_PER_SEC)
    }
}

#[derive(Component, Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Mass(pub f32);

impl Mass {
    pub fn new(mass: f32) -> Self {
        Self(mass)
    }

    pub fn value(&self) -> f32 {
        self.0.max(1.0)
    }
}

impl Default for Mass {
    fn default() -> Self {
        Self(15.0)
    }
}

/// Knockback velocity decay rate (1/s) while `StatusEffects::is_knocked_back()`:
/// `vel *= exp(-rate * dt)`, so the shove eases out instead of snapping at timer end.
pub const KNOCKBACK_DECAY_PER_SEC: f32 = 6.0;

/// Speed (u/s) a hit shoves its victim away at, tuned for the 10x world scale
/// (run speed 200, dash 450): 120..=240 for a player (mass 15), 72..=144 for a
/// standard mob (mass 25), reaching the cap at 12 damage. With the decay above over the
/// 0.2 s knockback timer a live mob melee hit moves a player about 18..=36 u.
pub fn knockback_speed(damage: f32, victim_mass: f32) -> f32 {
    (damage * 300.0).clamp(1800.0, 3600.0) / victim_mass
}

#[derive(Component, Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct EntityId(pub String);

#[derive(Component, Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct PlayerTag;

#[derive(Component, Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PlayerAvatar {
    pub session_id: String,
    pub speed: f32,
}

impl PlayerAvatar {
    pub fn new(session_id: impl Into<String>, speed: f32) -> Self {
        Self {
            session_id: session_id.into(),
            speed,
        }
    }
}

#[derive(Component, Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct MobTag;

/// Player body radius (px). Matches the client's `SERVER_RS_PLAYER_RADIUS`.
pub const PLAYER_BODY_RADIUS: f32 = 12.0;
/// Mob body radius (px). Matches the client's `SERVER_RS_MOB_RADIUS`.
pub const MOB_BODY_RADIUS: f32 = 14.0;
/// Boss collision body radius (px) (`1.5x` standard mob body radius) (E-007 Slice 7).
pub const BOSS_BODY_RADIUS: f32 = 21.0;
/// Boss visual/model scale multiplier (`1.5x`) (E-007 Slice 7).
pub const BOSS_VISUAL_SCALE: f32 = 1.5;

/// Identifies whether a spawned mob is a boss-tier encounter and carries its scale multiplier (E-007 Slice 7).
#[derive(Component, Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct BossTag {
    pub is_boss: bool,
    pub visual_scale: f32,
}

impl BossTag {
    pub fn boss() -> Self {
        Self {
            is_boss: true,
            visual_scale: BOSS_VISUAL_SCALE,
        }
    }

    pub fn normal() -> Self {
        Self {
            is_boss: false,
            visual_scale: 1.0,
        }
    }
}

impl Default for BossTag {
    fn default() -> Self {
        Self::normal()
    }
}

/// Circular collision body. Only live-runtime entities carry it, so the golden-trace
/// harness population (which has none) is unaffected by body collision.
#[derive(Component, Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct BodyRadius(pub f32);

/// Where a player (human or bot) respawns after death.
#[derive(Component, Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct SpawnPoint(pub Position);

/// Present on a dead player while it waits to respawn (sim seconds).
#[derive(Component, Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct PlayerRespawnTimer {
    pub respawn_at: f32,
}

/// Live-runtime rules. Its presence enables live-only systems (player respawn).
#[derive(Resource, Debug, Clone, Copy, PartialEq)]
pub struct LiveRules {
    pub player_respawn_sec: f32,
    /// How long a dead mob stays in the world (sent flagged dead) before it despawns into
    /// `removed_ids`, so clients see at least one dead frame.
    pub mob_corpse_sec: f32,
}

/// On a dead mob that is still visible as a corpse (sim seconds).
#[derive(Component, Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct MobCorpse {
    pub died_at: f32,
}

/// Wire ids of entities despawned since the last drain (fed into snapshot `removed_ids`).
#[derive(Resource, Debug, Clone, Default, PartialEq)]
pub struct DespawnedIds(pub Vec<String>);

/// One damage application, recorded for the wire `events` (live runtime only).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct HitRecord {
    pub attacker: Entity,
    pub target: Entity,
    pub amount: f32,
    /// This hit took the target from alive to dead.
    pub killed: bool,
}

/// Damage dealt since the last drain. Only the live runtime inserts it, so the golden-trace
/// harness records nothing.
#[derive(Resource, Debug, Clone, Default, PartialEq)]
pub struct HitLog(pub Vec<HitRecord>);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
pub enum AiState {
    #[default]
    Idle,
    Wander,
    Chase,
    Attack,
    ReturnHome,
}

/// Standard 800 ms wind-up tell before a mob attack lands (E-007 Slice 1).
pub const MOB_WINDUP_DURATION_SEC: f32 = 0.8;
/// Cosine of the 60-degree half-angle (120-degree total cone) for mob attack facing checks.
pub const MOB_FACING_CONE_HALF_ANGLE_COS: f32 = 0.5;

fn default_facing_cone_cos() -> f32 {
    MOB_FACING_CONE_HALF_ANGLE_COS
}

/// Optional simulation-wide resource configuring default mob wind-up tell duration and facing cone.
#[derive(Resource, Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct MobWindupConfig {
    pub windup_duration_sec: f32,
    pub facing_cone_cos: f32,
}

impl Default for MobWindupConfig {
    fn default() -> Self {
        Self {
            windup_duration_sec: MOB_WINDUP_DURATION_SEC,
            facing_cone_cos: MOB_FACING_CONE_HALF_ANGLE_COS,
        }
    }
}

/// Enforces a directional facing cone check on an attack projectile so targets outside
/// the attacker's locked facing cone when the swing lands take no damage.
#[derive(Component, Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct AttackFacingCone {
    pub origin: Position,
    pub dir_x: f32,
    pub dir_y: f32,
    pub min_cos: f32,
}

impl AttackFacingCone {
    pub fn new(origin: Position, dir_x: f32, dir_y: f32, min_cos: f32) -> Self {
        let len = (dir_x * dir_x + dir_y * dir_y).sqrt();
        let (nx, ny) = if len > 1e-4 {
            (dir_x / len, dir_y / len)
        } else {
            (1.0, 0.0)
        };
        Self {
            origin,
            dir_x: nx,
            dir_y: ny,
            min_cos,
        }
    }

    pub fn contains(&self, target_pos: Position) -> bool {
        let dx = target_pos.x - self.origin.x;
        let dy = target_pos.y - self.origin.y;
        let dist = (dx * dx + dy * dy).sqrt();
        if dist <= 1e-4 {
            return true;
        }
        let dot = (dx / dist) * self.dir_x + (dy / dist) * self.dir_y;
        dot >= self.min_cos
    }
}

#[derive(Component, Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MobAi {
    pub state: AiState,
    pub home_pos: Position,
    pub leash_distance: f32,
    pub chase_range: f32,
    pub attack_range: f32,
    pub is_ranged: bool,
    pub wander_timer: f32,
    pub wander_target: Position,
    /// Chase / return speed in px/s (bestiary `derive_mob_stats().speed`).
    pub move_speed: f32,
    /// Wind-up tell duration in seconds before an attack fires (e.g. `MOB_WINDUP_DURATION_SEC = 0.8`).
    #[serde(default)]
    pub windup_duration_sec: f32,
    /// Remaining wind-up tell timer in seconds (`> 0.0` while showing the wind-up tell).
    #[serde(default)]
    pub windup_timer: f32,
    /// Unit facing direction locked when the wind-up tell begins.
    #[serde(default = "default_facing")]
    pub windup_facing: (f32, f32),
    /// Cosine of half-angle for the mob's attack facing cone (`0.5` = 60 deg half-angle).
    #[serde(default = "default_facing_cone_cos")]
    pub facing_cone_cos: f32,
}

impl MobAi {
    pub fn new(home_pos: Position, chase_range: f32, attack_range: f32, is_ranged: bool) -> Self {
        Self {
            state: AiState::Idle,
            home_pos,
            leash_distance: 300.0,
            chase_range,
            attack_range,
            is_ranged,
            wander_timer: 0.0,
            wander_target: home_pos,
            // Bestiary "mid" speed (8 legacy units * 10).
            move_speed: 80.0,
            windup_duration_sec: 0.0,
            windup_timer: 0.0,
            windup_facing: (1.0, 0.0),
            facing_cone_cos: MOB_FACING_CONE_HALF_ANGLE_COS,
        }
    }

    pub fn with_leash_distance(mut self, leash_distance: f32) -> Self {
        self.leash_distance = leash_distance;
        self
    }

    pub fn with_move_speed(mut self, move_speed: f32) -> Self {
        self.move_speed = move_speed;
        self
    }

    pub fn with_windup(mut self, duration_sec: f32) -> Self {
        self.windup_duration_sec = duration_sec.max(0.0);
        self
    }

    pub fn with_default_windup(self) -> Self {
        self.with_windup(MOB_WINDUP_DURATION_SEC)
    }

    pub fn with_facing_cone_cos(mut self, cos_threshold: f32) -> Self {
        self.facing_cone_cos = cos_threshold.clamp(-1.0, 1.0);
        self
    }

    /// True while the mob is in its pre-attack wind-up tell.
    pub fn is_winding_up(&self) -> bool {
        self.windup_timer > 0.0
    }

    /// Returns normalized progress (`0.0..=1.0`) through the current wind-up tell.
    pub fn windup_progress(&self) -> f32 {
        if self.windup_timer <= 0.0 || self.windup_duration_sec <= 0.0 {
            0.0
        } else {
            (1.0 - (self.windup_timer / self.windup_duration_sec)).clamp(0.0, 1.0)
        }
    }

    /// Checks whether `target_pos` lies inside the mob's locked `windup_facing` cone from `mob_pos`.
    pub fn is_in_facing_cone(&self, mob_pos: Position, target_pos: Position) -> bool {
        AttackFacingCone::new(
            mob_pos,
            self.windup_facing.0,
            self.windup_facing.1,
            self.facing_cone_cos,
        )
        .contains(target_pos)
    }
}

impl Default for MobAi {
    fn default() -> Self {
        Self::new(Position::new(0.0, 0.0), 200.0, 25.0, false)
    }
}

#[derive(Component, Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MobSpawnAnchor {
    pub spawn_pos: Position,
    pub mob_id: String,
    pub tier: crate::content::MobTier,
    pub respawn_delay_sec: f32,
}

impl MobSpawnAnchor {
    pub fn new(
        spawn_pos: Position,
        mob_id: impl Into<String>,
        tier: crate::content::MobTier,
        respawn_delay_sec: f32,
    ) -> Self {
        Self {
            spawn_pos,
            mob_id: mob_id.into(),
            tier,
            respawn_delay_sec,
        }
    }
}

impl Default for MobSpawnAnchor {
    fn default() -> Self {
        Self {
            spawn_pos: Position::new(0.0, 0.0),
            mob_id: String::new(),
            tier: crate::content::MobTier::Route,
            respawn_delay_sec: 10.0,
        }
    }
}

#[derive(Component, Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DeadMobTracker {
    pub death_time: f32,
    pub respawn_at: f32,
    pub anchor: MobSpawnAnchor,
}

impl DeadMobTracker {
    pub fn new(death_time: f32, respawn_at: f32, anchor: MobSpawnAnchor) -> Self {
        Self {
            death_time,
            respawn_at,
            anchor,
        }
    }
}

#[derive(Component, Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BotAgent {
    pub id: String,
    pub vx: f32,
    pub vy: f32,
    #[serde(skip)]
    pub target_entity: Option<Entity>,
}

impl BotAgent {
    pub fn new(id: String, vx: f32, vy: f32) -> Self {
        Self {
            id,
            vx,
            vy,
            target_entity: None,
        }
    }
}

#[derive(Component, Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AiAgent {
    pub behavior: String,
    pub target_id: Option<String>,
}

impl Default for AiAgent {
    fn default() -> Self {
        Self {
            behavior: "idle".to_string(),
            target_id: None,
        }
    }
}

impl AiAgent {
    pub fn new(behavior: impl Into<String>, target_id: Option<String>) -> Self {
        Self {
            behavior: behavior.into(),
            target_id,
        }
    }
}

#[derive(Component, Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct CombatStats {
    pub attack_power: f32,
    pub defense: f32,
    pub attack_range: f32,
    pub attack_cooldown: f32,
    pub cooldown_timer: f32,
    pub is_player: bool,
}

impl Default for CombatStats {
    fn default() -> Self {
        Self {
            attack_power: 10.0,
            defense: 0.0,
            attack_range: 30.0,
            attack_cooldown: 1.0,
            cooldown_timer: 0.0,
            is_player: false,
        }
    }
}

#[derive(Component, Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct ElementalAttributes {
    pub element: Element,
    pub p_def: f32,
    pub m_def: f32,
    pub armor: f32,
}

impl Default for ElementalAttributes {
    fn default() -> Self {
        Self {
            element: Element::Neutral,
            p_def: 0.0,
            m_def: 0.0,
            armor: 0.0,
        }
    }
}

impl ElementalAttributes {
    pub fn new(element: Element, p_def: f32, m_def: f32, armor: f32) -> Self {
        Self {
            element,
            p_def,
            m_def,
            armor,
        }
    }
}

#[derive(Component, Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct CooldownTracker {
    pub cooldowns: HashMap<String, f32>,
}

impl CooldownTracker {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn can_perform(&self, keys: &[&str]) -> bool {
        for key in keys {
            if let Some(&remaining) = self.cooldowns.get(*key) {
                if remaining > 0.0 {
                    return false;
                }
            }
        }
        true
    }

    pub fn set_cooldown(&mut self, key: impl Into<String>, duration_sec: f32) {
        self.cooldowns.insert(key.into(), duration_sec);
    }

    pub fn get_remaining(&self, key: &str) -> f32 {
        self.cooldowns.get(key).copied().unwrap_or(0.0).max(0.0)
    }
}

#[derive(Component, Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct CastingState {
    pub casting_until: f32,
    pub skill_id: Option<String>,
    pub cast_duration: f32,
}

impl CastingState {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn is_casting(&self, current_time: f32) -> bool {
        self.skill_id.is_some() && current_time < self.casting_until
    }

    pub fn start_cast(
        &mut self,
        skill_id: impl Into<String>,
        duration_sec: f32,
        current_time: f32,
    ) {
        self.skill_id = Some(skill_id.into());
        self.cast_duration = duration_sec;
        self.casting_until = current_time + duration_sec;
    }

    pub fn finish_or_cancel(&mut self) {
        self.skill_id = None;
        self.cast_duration = 0.0;
        self.casting_until = 0.0;
    }
}

#[derive(Component, Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct DashState {
    pub remaining_sec: f32,
    pub dir_x: f32,
    pub dir_y: f32,
    pub speed: f32,
}

impl DashState {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn is_dashing(&self) -> bool {
        self.remaining_sec > 0.0
    }
}

/// Default duration in seconds (`5.0s`) for damage-over-time statuses (`Burn`, `Poison`) (E-007 Slice 5).
pub const DOT_DEFAULT_DURATION_SEC: f32 = 5.0;
/// Default damage per second (`8.0`) for damage-over-time statuses.
pub const DOT_DEFAULT_DPS: f32 = 8.0;

#[derive(Component, Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct StatusEffects {
    pub freeze_timer: f32,
    pub freeze_speed_multiplier: f32,
    pub stun_timer: f32,
    pub knockback_timer: f32,
    #[serde(default)]
    pub burn_timer: f32,
    #[serde(default)]
    pub burn_dps: f32,
    #[serde(default)]
    pub poison_timer: f32,
    #[serde(default)]
    pub poison_dps: f32,
    #[serde(default)]
    pub regen_timer: f32,
    #[serde(default)]
    pub regen_hps: f32,
}

impl StatusEffects {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn is_stunned(&self) -> bool {
        self.stun_timer > 0.0
    }

    pub fn is_knocked_back(&self) -> bool {
        self.knockback_timer > 0.0
    }

    pub fn is_burning(&self) -> bool {
        self.burn_timer > 0.0 && self.burn_dps > 0.0
    }

    pub fn is_poisoned(&self) -> bool {
        self.poison_timer > 0.0 && self.poison_dps > 0.0
    }

    pub fn apply_knockback(&mut self, duration_sec: f32) {
        if duration_sec > self.knockback_timer {
            self.knockback_timer = duration_sec;
        }
    }

    pub fn speed_multiplier(&self) -> f32 {
        if self.is_stunned() {
            0.0
        } else if self.freeze_timer > 0.0 {
            self.freeze_speed_multiplier
        } else {
            1.0
        }
    }

    pub fn apply_freeze(&mut self, duration_sec: f32, speed_multiplier: f32) {
        if duration_sec > self.freeze_timer {
            self.freeze_timer = duration_sec;
            self.freeze_speed_multiplier = speed_multiplier;
        }
    }

    pub fn apply_stun(&mut self, duration_sec: f32) {
        if duration_sec > self.stun_timer {
            self.stun_timer = duration_sec;
        }
    }

    pub fn apply_burn(&mut self, duration_sec: f32, dps: f32) {
        if duration_sec > self.burn_timer {
            self.burn_timer = duration_sec;
        }
        if dps > self.burn_dps {
            self.burn_dps = dps;
        }
    }

    pub fn apply_default_burn(&mut self, dps: f32) {
        self.apply_burn(DOT_DEFAULT_DURATION_SEC, dps);
    }

    pub fn apply_poison(&mut self, duration_sec: f32, dps: f32) {
        if duration_sec > self.poison_timer {
            self.poison_timer = duration_sec;
        }
        if dps > self.poison_dps {
            self.poison_dps = dps;
        }
    }

    pub fn apply_default_poison(&mut self, dps: f32) {
        self.apply_poison(DOT_DEFAULT_DURATION_SEC, dps);
    }

    pub fn is_regenerating(&self) -> bool {
        self.regen_timer > 0.0 && self.regen_hps > 0.0
    }

    pub fn apply_regen(&mut self, duration_sec: f32, hps: f32) {
        if duration_sec > self.regen_timer {
            self.regen_timer = duration_sec;
        }
        if hps > self.regen_hps {
            self.regen_hps = hps;
        }
    }
}

mod entity_serde {
    use bevy_ecs::entity::Entity;
    use serde::{Deserialize, Deserializer, Serializer};

    pub fn serialize<S>(entity: &Entity, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_u64(entity.to_bits())
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<Entity, D::Error>
    where
        D: Deserializer<'de>,
    {
        let bits = u64::deserialize(deserializer)?;
        Ok(Entity::from_bits(bits))
    }
}

mod opt_entity_serde {
    use bevy_ecs::entity::Entity;
    use serde::{Deserialize, Deserializer, Serializer};

    pub fn serialize<S>(entity: &Option<Entity>, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        match entity {
            Some(e) => serializer.serialize_some(&e.to_bits()),
            None => serializer.serialize_none(),
        }
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<Option<Entity>, D::Error>
    where
        D: Deserializer<'de>,
    {
        let opt = Option::<u64>::deserialize(deserializer)?;
        Ok(opt.map(Entity::from_bits))
    }
}

#[derive(Component, Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Projectile {
    #[serde(with = "entity_serde")]
    pub owner: Entity,
    #[serde(with = "opt_entity_serde", default)]
    pub target: Option<Entity>,
    pub damage: f32,
    pub damage_type: DamageType,
    pub element: Element,
    pub speed: f32,
    pub radius: f32,
    pub max_range: f32,
    pub traveled_distance: f32,
    pub lifetime: f32,
    pub effects: Vec<SkillEffect>,
    pub is_player_projectile: bool,
    #[serde(default)]
    pub aoe_radius: f32,
    #[serde(default)]
    pub skill_id: Option<String>,
    #[serde(default)]
    pub detonated: bool,
}

/// Default lingering hazard field duration in seconds (`3.0s`) (E-007 Slice 4).
pub const LINGERING_ZONE_DURATION_SEC: f32 = 3.0;
/// Default interval between lingering hazard field damage ticks (`1.0s`).
pub const LINGERING_ZONE_TICK_INTERVAL_SEC: f32 = 1.0;
/// Default number of damage ticks delivered across a lingering hazard field's lifetime (`3`).
pub const LINGERING_ZONE_MAX_TICKS: u32 = 3;

/// Persistent ground hazard field spawned by area skills (`Meteor Strike` / `Blizzard`)
/// that ticks damage across 3 distinct intervals over its lifetime (E-007 Slice 4).
#[derive(Component, Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct LingeringZone {
    #[serde(with = "entity_serde")]
    pub owner: Entity,
    pub skill_id: String,
    pub radius: f32,
    pub damage_per_tick: f32,
    pub damage_type: DamageType,
    pub element: Element,
    pub effects: Vec<SkillEffect>,
    pub is_player_zone: bool,
    pub remaining_duration_sec: f32,
    pub tick_interval_sec: f32,
    pub tick_accumulator_sec: f32,
    pub ticks_applied: u32,
    pub max_ticks: u32,
}

impl LingeringZone {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        owner: Entity,
        skill_id: impl Into<String>,
        radius: f32,
        damage_per_tick: f32,
        damage_type: DamageType,
        element: Element,
        effects: Vec<SkillEffect>,
        is_player_zone: bool,
    ) -> Self {
        Self {
            owner,
            skill_id: skill_id.into(),
            radius,
            damage_per_tick,
            damage_type,
            element,
            effects,
            is_player_zone,
            remaining_duration_sec: LINGERING_ZONE_DURATION_SEC,
            tick_interval_sec: LINGERING_ZONE_TICK_INTERVAL_SEC,
            tick_accumulator_sec: 0.0,
            ticks_applied: 0,
            max_ticks: LINGERING_ZONE_MAX_TICKS,
        }
    }
}

/// Marks a projectile that a parry has already reflected. A second parry
/// destroys it instead of reflecting it again.
#[derive(Component, Debug, Clone, Copy, PartialEq, Eq)]
pub struct Parried;

/// Maximum continuous hold window (seconds) during which holding attack can parry incoming projectiles.
pub const MAX_PARRY_HOLD_WINDOW_SEC: f32 = 0.4;
/// Maximum consecutive parry deflections before parry stamina enters recovery cooldown.
pub const MAX_PARRY_CHARGES: u8 = 2;
/// Recovery cooldown (seconds) after exhausting parry charges or exceeding the active hold window.
pub const PARRY_COOLDOWN_SEC: f32 = 1.5;
/// Stagger/stun duration (seconds) applied to a mob struck by its own reflected projectile.
pub const PARRY_REFLECT_STAGGER_SEC: f32 = 0.6;

/// Tracks active parry window, remaining deflection charges, and recovery cooldown for a player (E-007 Slice 2).
#[derive(Component, Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ParryState {
    pub max_hold_window_sec: f32,
    pub active_hold_sec: f32,
    pub max_charges: u8,
    pub charges: u8,
    pub cooldown_sec: f32,
    pub cooldown_timer: f32,
    pub reflect_stagger_sec: f32,
}

impl Default for ParryState {
    fn default() -> Self {
        Self::new()
    }
}

impl ParryState {
    pub fn new() -> Self {
        Self {
            max_hold_window_sec: MAX_PARRY_HOLD_WINDOW_SEC,
            active_hold_sec: 0.0,
            max_charges: MAX_PARRY_CHARGES,
            charges: MAX_PARRY_CHARGES,
            cooldown_sec: PARRY_COOLDOWN_SEC,
            cooldown_timer: 0.0,
            reflect_stagger_sec: PARRY_REFLECT_STAGGER_SEC,
        }
    }

    /// True when the player is within the active parry window, has at least one parry charge,
    /// and is not on parry recovery cooldown.
    pub fn can_parry(&self) -> bool {
        self.cooldown_timer <= 0.0
            && self.charges > 0
            && self.active_hold_sec <= self.max_hold_window_sec
    }

    /// Consumes one parry charge and enters recovery cooldown when charges reach zero.
    pub fn record_parry(&mut self) {
        self.charges = self.charges.saturating_sub(1);
        if self.charges == 0 {
            self.cooldown_timer = self.cooldown_sec;
        }
    }

    /// Advances the active hold timer and recovery cooldown for a simulation tick (`dt` seconds).
    pub fn tick_hold(&mut self, dt: f32, attack_held: bool) {
        if self.cooldown_timer > 0.0 {
            self.cooldown_timer = (self.cooldown_timer - dt).max(0.0);
            if self.cooldown_timer <= 0.0 && !attack_held {
                self.charges = self.max_charges;
                self.active_hold_sec = 0.0;
            }
        }
        if attack_held {
            self.active_hold_sec += dt;
            if self.active_hold_sec > self.max_hold_window_sec && self.cooldown_timer <= 0.0 {
                self.cooldown_timer = self.cooldown_sec;
            }
        } else {
            self.active_hold_sec = 0.0;
            if self.cooldown_timer <= 0.0 {
                self.charges = self.max_charges;
            }
        }
    }
}

/// Weapon archetype controlling whether a primary attack is a melee strike or an aimed projectile (E-007 Slice 3).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
pub enum WeaponKind {
    #[default]
    Melee,
    Bow,
    Staff,
}

/// Equipped weapon profile attached to a player or combatant entity.
#[derive(Component, Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct EquippedWeapon {
    pub weapon_id: String,
    pub kind: WeaponKind,
    pub projectile_speed: f32,
    pub projectile_range: f32,
    pub projectile_radius: f32,
}

impl Default for EquippedWeapon {
    fn default() -> Self {
        Self::sword()
    }
}

impl EquippedWeapon {
    pub fn sword() -> Self {
        Self {
            weapon_id: "w_sword".to_string(),
            kind: WeaponKind::Melee,
            projectile_speed: 0.0,
            projectile_range: 40.0,
            projectile_radius: 0.0,
        }
    }

    pub fn bow() -> Self {
        Self {
            weapon_id: "w_bow".to_string(),
            kind: WeaponKind::Bow,
            projectile_speed: 250.0,
            projectile_range: 300.0,
            projectile_radius: 4.0,
        }
    }

    pub fn staff() -> Self {
        Self {
            weapon_id: "w_staff".to_string(),
            kind: WeaponKind::Staff,
            projectile_speed: 200.0,
            projectile_range: 280.0,
            projectile_radius: 5.0,
        }
    }

    pub fn from_weapon_id(weapon_id: Option<&str>) -> Self {
        let id = weapon_id.unwrap_or("basic_sword");
        let lower = id.to_ascii_lowercase();
        if lower.contains("bow") {
            let mut w = Self::bow();
            w.weapon_id = id.to_string();
            w
        } else if lower.contains("staff") || lower.contains("wand") {
            let mut w = Self::staff();
            w.weapon_id = id.to_string();
            w
        } else {
            let mut w = Self::sword();
            w.weapon_id = id.to_string();
            w
        }
    }

    pub fn is_ranged(&self) -> bool {
        matches!(self.kind, WeaponKind::Bow | WeaponKind::Staff)
    }
}

#[derive(Component, Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PlayerInputState {
    pub move_x: f32,
    pub move_y: f32,
    pub attack: bool,
    #[serde(default)]
    pub attack_held: bool,
    pub skill_slot: u8,
    pub target_id: u32,
    pub client_tick: u32,
    #[serde(with = "opt_entity_serde", default)]
    pub target_entity: Option<Entity>,
    pub target_pos: Option<Position>,
    #[serde(default = "default_facing")]
    pub last_facing: (f32, f32),
}

fn default_facing() -> (f32, f32) {
    (1.0, 0.0)
}

impl Default for PlayerInputState {
    fn default() -> Self {
        Self {
            move_x: 0.0,
            move_y: 0.0,
            attack: false,
            attack_held: false,
            skill_slot: 0,
            target_id: 0,
            client_tick: 0,
            target_entity: None,
            target_pos: None,
            last_facing: (1.0, 0.0),
        }
    }
}

impl PlayerInputState {
    pub fn new(move_x: f32, move_y: f32, attack: bool, skill_slot: u8) -> Self {
        Self {
            move_x,
            move_y,
            attack,
            attack_held: attack,
            skill_slot,
            target_id: 0,
            client_tick: 0,
            target_entity: None,
            target_pos: None,
            last_facing: (1.0, 0.0),
        }
    }

    pub fn with_target_entity(mut self, target: Entity) -> Self {
        self.target_entity = Some(target);
        self
    }

    pub fn with_target_pos(mut self, x: f32, y: f32) -> Self {
        self.target_pos = Some(Position::new(x, y));
        self
    }

    /// Computes the unit aim vector from `origin` toward `target_pos` (if set),
    /// otherwise along the movement input vector, falling back to `last_facing`.
    pub fn aim_direction(&self, origin: Position) -> (f32, f32) {
        if let Some(t_pos) = self.target_pos {
            let dx = t_pos.x - origin.x;
            let dy = t_pos.y - origin.y;
            let dist = (dx * dx + dy * dy).sqrt();
            if dist > 1e-4 {
                return (dx / dist, dy / dist);
            }
        }
        let move_len = (self.move_x * self.move_x + self.move_y * self.move_y).sqrt();
        if move_len > 1e-4 {
            return (self.move_x / move_len, self.move_y / move_len);
        }
        let (fx, fy) = self.last_facing;
        let face_len = (fx * fx + fy * fy).sqrt();
        if face_len > 1e-4 {
            (fx / face_len, fy / face_len)
        } else {
            (1.0, 0.0)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_elemental_attributes_default() {
        let attrs = ElementalAttributes::default();
        assert_eq!(attrs.element, Element::Neutral);
        assert_eq!(attrs.p_def, 0.0);
        assert_eq!(attrs.m_def, 0.0);
        assert_eq!(attrs.armor, 0.0);
    }

    #[test]
    fn test_cooldown_tracker() {
        let mut tracker = CooldownTracker::new();
        assert!(tracker.can_perform(&["skill_1", "global_magic_cd"]));

        tracker.set_cooldown("skill_1", 5.0);
        assert!(!tracker.can_perform(&["skill_1"]));
        assert!(tracker.can_perform(&["skill_2"]));
        assert!(!tracker.can_perform(&["skill_2", "skill_1"]));

        tracker.set_cooldown("skill_1", 0.0);
        assert!(tracker.can_perform(&["skill_1"]));
    }

    #[test]
    fn test_casting_state() {
        let mut state = CastingState::new();
        assert!(!state.is_casting(0.0));

        state.start_cast("skill_1", 1.5, 10.0);
        assert!(state.is_casting(10.0));
        assert!(state.is_casting(11.0));
        assert!(!state.is_casting(11.5));
        assert!(!state.is_casting(12.0));

        state.finish_or_cancel();
        assert!(!state.is_casting(10.5));
    }

    #[test]
    fn test_dash_state() {
        let mut dash = DashState::new();
        assert!(!dash.is_dashing());
        dash.remaining_sec = 0.2;
        dash.speed = 450.0;
        dash.dir_x = 1.0;
        assert!(dash.is_dashing());
    }

    #[test]
    fn test_status_effects() {
        let mut status = StatusEffects::default();
        assert!(!status.is_stunned());
        assert_eq!(status.speed_multiplier(), 1.0);

        status.apply_freeze(5.0, 0.2);
        assert_eq!(status.speed_multiplier(), 0.2);
        assert!(!status.is_stunned());

        status.apply_stun(1.2);
        assert!(status.is_stunned());
        assert_eq!(status.speed_multiplier(), 0.0);
    }

    #[test]
    fn test_projectile_component() {
        let proj = Projectile {
            owner: Entity::PLACEHOLDER,
            target: None,
            damage: 25.0,
            damage_type: DamageType::Magical,
            element: Element::Fire,
            speed: 150.0,
            radius: 6.0,
            max_range: 300.0,
            traveled_distance: 0.0,
            lifetime: 5.0,
            effects: vec![SkillEffect::Damage(20.0)],
            is_player_projectile: true,
            aoe_radius: 60.0,
            skill_id: Some("skill_1".to_string()),
            detonated: false,
        };
        assert_eq!(proj.damage, 25.0);
        assert_eq!(proj.element, Element::Fire);
        assert!(proj.is_player_projectile);
        assert_eq!(proj.aoe_radius, 60.0);
        assert_eq!(proj.skill_id.as_deref(), Some("skill_1"));
    }

    #[test]
    fn test_player_input_state() {
        let input = PlayerInputState::new(1.0, -0.5, true, 2)
            .with_target_pos(50.0, 100.0)
            .with_target_entity(Entity::PLACEHOLDER);
        assert_eq!(input.move_x, 1.0);
        assert_eq!(input.move_y, -0.5);
        assert!(input.attack);
        assert_eq!(input.skill_slot, 2);
        assert_eq!(input.target_pos, Some(Position::new(50.0, 100.0)));
        assert_eq!(input.target_entity, Some(Entity::PLACEHOLDER));
    }

    #[test]
    fn test_mob_ai_and_lifecycle_components() {
        let home = Position::new(100.0, 200.0);
        let ai = MobAi::new(home, 150.0, 25.0, false);
        assert_eq!(ai.state, AiState::Idle);
        assert_eq!(ai.home_pos, home);
        assert_eq!(ai.leash_distance, 300.0);
        assert_eq!(ai.chase_range, 150.0);
        assert_eq!(ai.attack_range, 25.0);
        assert!(!ai.is_ranged);

        let anchor = MobSpawnAnchor::new(
            home,
            "mob-bramble-stalker",
            crate::content::MobTier::Route,
            12.0,
        );
        assert_eq!(anchor.spawn_pos, home);
        assert_eq!(anchor.mob_id, "mob-bramble-stalker");
        assert_eq!(anchor.tier, crate::content::MobTier::Route);
        assert_eq!(anchor.respawn_delay_sec, 12.0);

        let tracker = DeadMobTracker::new(10.0, 22.0, anchor.clone());
        assert_eq!(tracker.death_time, 10.0);
        assert_eq!(tracker.respawn_at, 22.0);
        assert_eq!(tracker.anchor, anchor);
    }
}

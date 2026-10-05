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
}

impl Health {
    pub fn new(max: f32) -> Self {
        Self {
            current: max,
            max,
            is_alive: true,
        }
    }

    pub fn take_damage(&mut self, amount: f32) {
        if !self.is_alive {
            return;
        }
        self.current = (self.current - amount).max(0.0);
        if self.current <= 0.0 {
            self.current = 0.0;
            self.is_alive = false;
        }
    }
}

#[derive(Component, Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct EntityId(pub String);

#[derive(Component, Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct PlayerTag;

#[derive(Component, Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct MobTag;

#[derive(Component, Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BotAgent {
    pub id: String,
    pub vx: f32,
    pub vy: f32,
}

impl BotAgent {
    pub fn new(id: String, vx: f32, vy: f32) -> Self {
        Self { id, vx, vy }
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
pub struct StatusEffects {
    pub freeze_timer: f32,
    pub freeze_speed_multiplier: f32,
    pub stun_timer: f32,
}

impl StatusEffects {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn is_stunned(&self) -> bool {
        self.stun_timer > 0.0
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
}

#[derive(Component, Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct PlayerInputState {
    pub move_x: f32,
    pub move_y: f32,
    pub attack: bool,
    pub skill_slot: u8,
    pub target_id: Option<u32>,
    #[serde(with = "opt_entity_serde", default)]
    pub target_entity: Option<Entity>,
    pub target_pos: Option<Position>,
}

impl PlayerInputState {
    pub fn new(move_x: f32, move_y: f32, attack: bool, skill_slot: u8) -> Self {
        Self {
            move_x,
            move_y,
            attack,
            skill_slot,
            target_id: None,
            target_entity: None,
            target_pos: None,
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
        };
        assert_eq!(proj.damage, 25.0);
        assert_eq!(proj.element, Element::Fire);
        assert!(proj.is_player_projectile);
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
}

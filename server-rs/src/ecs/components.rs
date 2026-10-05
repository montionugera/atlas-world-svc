use bevy_ecs::prelude::*;
use serde::{Deserialize, Serialize};

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

#[derive(Component, Debug, Clone, Copy, PartialEq, Default, Serialize, Deserialize)]
pub struct PlayerInputState {
    pub move_x: f32,
    pub move_y: f32,
    pub attack: bool,
    pub skill_slot: u8,
    pub target_id: u32,
    pub client_tick: u32,
}

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

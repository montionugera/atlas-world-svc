use bevy_ecs::prelude::*;
use serde::{Deserialize, Serialize};

/// Maximum standard buffs a character can sustain simultaneously.
pub const MAX_STANDARD_BUFF_SLOTS: usize = 24;
/// Maximum song/dance buffs a character can sustain simultaneously.
pub const MAX_SONG_DANCE_SLOTS: usize = 12;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BuffCategory {
    Offensive,
    Defensive,
    Utility,
    SongDance,
    Debuff,
}

/// An active buff or debuff instance applied to an entity.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiveBuff {
    pub id: String,
    pub name: String,
    pub category: BuffCategory,
    pub duration_sec: f32,
    pub remaining_sec: f32,
    #[serde(default = "default_mult_one")]
    pub p_atk_mult: f32,
    #[serde(default = "default_mult_one")]
    pub m_atk_mult: f32,
    #[serde(default = "default_mult_one")]
    pub p_def_mult: f32,
    #[serde(default = "default_mult_one")]
    pub m_def_mult: f32,
    #[serde(default = "default_mult_one")]
    pub move_speed_mult: f32,
    #[serde(default = "default_mult_one")]
    pub aspd_mult: f32,
    #[serde(default = "default_mult_one")]
    pub cast_time_mult: f32,
    #[serde(default)]
    pub crit_rate_bonus: f32,
}

fn default_mult_one() -> f32 {
    1.0
}

impl ActiveBuff {
    pub fn new(
        id: impl Into<String>,
        name: impl Into<String>,
        category: BuffCategory,
        duration_sec: f32,
    ) -> Self {
        Self {
            id: id.into(),
            name: name.into(),
            category,
            duration_sec,
            remaining_sec: duration_sec,
            p_atk_mult: 1.0,
            m_atk_mult: 1.0,
            p_def_mult: 1.0,
            m_def_mult: 1.0,
            move_speed_mult: 1.0,
            aspd_mult: 1.0,
            cast_time_mult: 1.0,
            crit_rate_bonus: 0.0,
        }
    }
}

/// Combined multiplier aggregate computed from all active buffs.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CombinedBuffMultipliers {
    pub p_atk_mult: f32,
    pub m_atk_mult: f32,
    pub p_def_mult: f32,
    pub m_def_mult: f32,
    pub move_speed_mult: f32,
    pub aspd_mult: f32,
    pub cast_time_mult: f32,
    pub crit_rate_bonus: f32,
}

impl Default for CombinedBuffMultipliers {
    fn default() -> Self {
        Self {
            p_atk_mult: 1.0,
            m_atk_mult: 1.0,
            p_def_mult: 1.0,
            m_def_mult: 1.0,
            move_speed_mult: 1.0,
            aspd_mult: 1.0,
            cast_time_mult: 1.0,
            crit_rate_bonus: 0.0,
        }
    }
}

/// ECS Component holding all currently active buffs/debuffs on an entity.
#[derive(Component, Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct BuffContainer {
    pub buffs: Vec<ActiveBuff>,
}

impl BuffContainer {
    pub fn new() -> Self {
        Self { buffs: Vec::new() }
    }

    /// Applies a buff, refreshing duration if present, or adding if slots allow.
    pub fn apply_buff(&mut self, new_buff: ActiveBuff) -> bool {
        // If already present, refresh duration and take higher multipliers
        if let Some(existing) = self.buffs.iter_mut().find(|b| b.id == new_buff.id) {
            existing.remaining_sec = new_buff.duration_sec.max(existing.remaining_sec);
            existing.p_atk_mult = existing.p_atk_mult.max(new_buff.p_atk_mult);
            existing.m_atk_mult = existing.m_atk_mult.max(new_buff.m_atk_mult);
            existing.p_def_mult = existing.p_def_mult.max(new_buff.p_def_mult);
            existing.m_def_mult = existing.m_def_mult.max(new_buff.m_def_mult);
            existing.move_speed_mult = existing.move_speed_mult.max(new_buff.move_speed_mult);
            existing.aspd_mult = existing.aspd_mult.max(new_buff.aspd_mult);
            existing.crit_rate_bonus = existing.crit_rate_bonus.max(new_buff.crit_rate_bonus);
            return true;
        }

        // Check slot limits
        let count_by_cat = self
            .buffs
            .iter()
            .filter(|b| b.category == new_buff.category)
            .count();
        let max_slots = if new_buff.category == BuffCategory::SongDance {
            MAX_SONG_DANCE_SLOTS
        } else {
            MAX_STANDARD_BUFF_SLOTS
        };

        if count_by_cat >= max_slots {
            return false;
        }

        self.buffs.push(new_buff);
        true
    }

    pub fn remove_buff(&mut self, buff_id: &str) {
        self.buffs.retain(|b| b.id != buff_id);
    }

    pub fn has_buff(&self, buff_id: &str) -> bool {
        self.buffs
            .iter()
            .any(|b| b.id == buff_id && b.remaining_sec > 0.0)
    }

    /// Advances timers and removes expired buffs. Returns IDs of expired buffs.
    pub fn tick(&mut self, dt: f32) -> Vec<String> {
        let mut expired = Vec::new();
        for b in &mut self.buffs {
            b.remaining_sec -= dt;
            if b.remaining_sec <= 0.0 {
                expired.push(b.id.clone());
            }
        }
        self.buffs.retain(|b| b.remaining_sec > 0.0);
        expired
    }

    /// Computes aggregated multiplicative stat multipliers.
    pub fn aggregate_multipliers(&self) -> CombinedBuffMultipliers {
        let mut agg = CombinedBuffMultipliers::default();
        for b in &self.buffs {
            if b.remaining_sec <= 0.0 {
                continue;
            }
            agg.p_atk_mult *= b.p_atk_mult;
            agg.m_atk_mult *= b.m_atk_mult;
            agg.p_def_mult *= b.p_def_mult;
            agg.m_def_mult *= b.m_def_mult;
            agg.move_speed_mult *= b.move_speed_mult;
            agg.aspd_mult *= b.aspd_mult;
            agg.cast_time_mult *= b.cast_time_mult;
            agg.crit_rate_bonus += b.crit_rate_bonus;
        }
        agg
    }
}

/// ECS Component for periodic spatial aura propagation (e.g. Paladin/Priest blessings, L2 Songs).
#[derive(Component, Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AuraEmitter {
    pub aura_buff: ActiveBuff,
    pub radius_m: f32,
    pub pulse_interval_sec: f32,
    pub pulse_timer: f32,
    pub affects_allies: bool,
}

impl AuraEmitter {
    pub fn new(
        aura_buff: ActiveBuff,
        radius_m: f32,
        pulse_interval_sec: f32,
        affects_allies: bool,
    ) -> Self {
        Self {
            aura_buff,
            radius_m,
            pulse_interval_sec,
            pulse_timer: 0.0,
            affects_allies,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_buff_application_and_refresh() {
        let mut container = BuffContainer::new();
        let mut haste = ActiveBuff::new("haste_2", "Haste Lv.2", BuffCategory::Utility, 120.0);
        haste.move_speed_mult = 1.33;
        haste.aspd_mult = 1.33;

        assert!(container.apply_buff(haste.clone()));
        assert_eq!(container.buffs.len(), 1);
        assert!(container.has_buff("haste_2"));

        // Tick 10 seconds
        container.tick(10.0);
        assert!((container.buffs[0].remaining_sec - 110.0).abs() < 1e-3);

        // Reapply refresh
        assert!(container.apply_buff(haste));
        assert!((container.buffs[0].remaining_sec - 120.0).abs() < 1e-3);
    }

    #[test]
    fn test_buff_stacking_and_multipliers() {
        let mut container = BuffContainer::new();

        let mut might = ActiveBuff::new("might_3", "Might Lv.3", BuffCategory::Offensive, 60.0);
        might.p_atk_mult = 1.15;
        container.apply_buff(might);

        let mut dance = ActiveBuff::new(
            "dance_warrior",
            "Dance of the Warrior",
            BuffCategory::SongDance,
            120.0,
        );
        dance.p_atk_mult = 1.12;
        dance.crit_rate_bonus = 10.0;
        container.apply_buff(dance);

        let mults = container.aggregate_multipliers();
        // 1.15 * 1.12 = 1.288
        assert!((mults.p_atk_mult - 1.288).abs() < 1e-3);
        assert_eq!(mults.crit_rate_bonus, 10.0);
    }

    #[test]
    fn test_buff_expiry_cleanup() {
        let mut container = BuffContainer::new();
        let short_buff = ActiveBuff::new("shield_1", "Shield Lv.1", BuffCategory::Defensive, 2.0);
        container.apply_buff(short_buff);

        let expired = container.tick(3.0);
        assert_eq!(expired, vec!["shield_1"]);
        assert_eq!(container.buffs.len(), 0);
        assert!(!container.has_buff("shield_1"));
    }
}

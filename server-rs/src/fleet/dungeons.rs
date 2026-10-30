use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, RwLock};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DungeonState {
    Allocating,
    Active,
    BossEnraged,
    Cleared,
    Failed,
    TornDown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BossPhase {
    Phase1Normal,
    Phase2Empowered,
    Enraged,
    Defeated,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BossEncounterEvent {
    DamageTaken {
        boss_id: String,
        damage: u64,
        remaining_hp: u64,
    },
    Phase2Transition {
        boss_id: String,
        hp_percent: f64,
        at_secs: u64,
    },
    BossEnraged {
        boss_id: String,
        at_secs: u64,
    },
    BossDefeated {
        boss_id: String,
        at_secs: u64,
    },
    DungeonFailed {
        reason: String,
        at_secs: u64,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BossEncounterState {
    pub boss_id: String,
    pub name: String,
    pub max_hp: u64,
    pub current_hp: u64,
    pub phase: BossPhase,
    pub phase_transition_hp_threshold: u64,
    pub phase2_entered_at_secs: Option<u64>,
    pub enrage_timer_secs: u64,
    pub encounter_start_secs: u64,
    pub is_enraged: bool,
    pub enraged_at_secs: Option<u64>,
    pub atk_multiplier: f64,
    pub aspd_multiplier: f64,
    pub empowered_skill_unlocked: bool,
    pub mvp_rewards: Option<Vec<MvpRewardDistribution>>,
}

impl BossEncounterState {
    pub fn new(
        boss_id: impl Into<String>,
        name: impl Into<String>,
        max_hp: u64,
        enrage_timer_secs: u64,
        now_secs: u64,
    ) -> Self {
        let b_id = boss_id.into();
        let b_name = name.into();
        Self {
            boss_id: b_id,
            name: b_name,
            max_hp,
            current_hp: max_hp,
            phase: BossPhase::Phase1Normal,
            phase_transition_hp_threshold: max_hp / 2,
            phase2_entered_at_secs: None,
            enrage_timer_secs,
            encounter_start_secs: now_secs,
            is_enraged: false,
            enraged_at_secs: None,
            atk_multiplier: 1.0,
            aspd_multiplier: 1.0,
            empowered_skill_unlocked: false,
            mvp_rewards: None,
        }
    }

    /// Applies damage to the boss, checks 50% HP phase transition and boss defeat.
    /// Returns (events, is_first_hit, is_last_hit).
    pub fn apply_damage(
        &mut self,
        damage: u64,
        now_secs: u64,
    ) -> (Vec<BossEncounterEvent>, bool, bool) {
        if self.phase == BossPhase::Defeated || self.current_hp == 0 {
            return (Vec::new(), false, false);
        }

        let is_first_hit = self.current_hp == self.max_hp;
        let mut events = Vec::new();

        if damage >= self.current_hp {
            self.current_hp = 0;
            self.phase = BossPhase::Defeated;
            events.push(BossEncounterEvent::BossDefeated {
                boss_id: self.boss_id.clone(),
                at_secs: now_secs,
            });
            (events, is_first_hit, true)
        } else {
            self.current_hp -= damage;
            events.push(BossEncounterEvent::DamageTaken {
                boss_id: self.boss_id.clone(),
                damage,
                remaining_hp: self.current_hp,
            });

            // Phase transition at 50% HP: boss Frenzy / Empowered Phase
            if self.current_hp <= self.phase_transition_hp_threshold
                && self.phase == BossPhase::Phase1Normal
            {
                self.phase = BossPhase::Phase2Empowered;
                self.phase2_entered_at_secs = Some(now_secs);
                self.atk_multiplier = 1.35;
                self.aspd_multiplier = 1.25;
                self.empowered_skill_unlocked = true;
                events.push(BossEncounterEvent::Phase2Transition {
                    boss_id: self.boss_id.clone(),
                    hp_percent: (self.current_hp as f64 / self.max_hp as f64) * 100.0,
                    at_secs: now_secs,
                });
            }

            (events, is_first_hit, false)
        }
    }

    /// Evaluates enrage timer on encounter tick.
    pub fn tick(&mut self, now_secs: u64) -> Option<BossEncounterEvent> {
        if self.phase == BossPhase::Defeated || self.current_hp == 0 {
            return None;
        }

        if !self.is_enraged
            && now_secs.saturating_sub(self.encounter_start_secs) >= self.enrage_timer_secs
        {
            self.is_enraged = true;
            self.phase = BossPhase::Enraged;
            self.enraged_at_secs = Some(now_secs);
            self.atk_multiplier = 4.0;
            self.aspd_multiplier = 2.0;
            Some(BossEncounterEvent::BossEnraged {
                boss_id: self.boss_id.clone(),
                at_secs: now_secs,
            })
        } else {
            None
        }
    }

    /// Resets the boss encounter state on full party wipe, restoring maximum HP and resetting enrage timer.
    pub fn reset_on_wipe(&mut self, now_secs: u64) {
        self.current_hp = self.max_hp;
        self.phase = BossPhase::Phase1Normal;
        self.phase2_entered_at_secs = None;
        self.encounter_start_secs = now_secs;
        self.is_enraged = false;
        self.enraged_at_secs = None;
        self.atk_multiplier = 1.0;
        self.aspd_multiplier = 1.0;
        self.empowered_skill_unlocked = false;
        self.mvp_rewards = None;
    }
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerDungeonContribution {
    pub damage_dealt: u64,
    pub damage_taken: u64,
    pub healing_done: u64,
    pub has_first_hit: bool,
    pub has_last_hit: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DungeonFloorEvent {
    FloorMobKilled {
        floor: u32,
        current_killed: u32,
        required: u32,
    },
    FloorCleared {
        floor: u32,
        at_secs: u64,
    },
    FloorAdvanced {
        from_floor: u32,
        to_floor: u32,
        is_boss_floor: bool,
        at_secs: u64,
    },
    BossFloorReached {
        floor: u32,
        boss_id: String,
        at_secs: u64,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DungeonFloorState {
    pub current_floor: u32,
    pub total_floors: u32,
    pub mobs_required: u32,
    pub mobs_killed: u32,
    pub is_floor_cleared: bool,
    pub is_boss_floor: bool,
}

impl Default for DungeonFloorState {
    fn default() -> Self {
        Self {
            current_floor: 1,
            total_floors: 1,
            mobs_required: 0,
            mobs_killed: 0,
            is_floor_cleared: true,
            is_boss_floor: true,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DungeonInstance {
    pub instance_id: String,
    pub dungeon_template_id: String,
    pub party_id: String,
    pub created_at_secs: u64,
    pub time_limit_secs: u64,
    pub state: DungeonState,
    pub mvp_boss_id: String,
    pub mvp_boss_alive: bool,
    pub boss_encounter: BossEncounterState,
    pub contributions: HashMap<String, PlayerDungeonContribution>,
    pub floor_state: DungeonFloorState,
    pub origin_region_id: Option<String>,
    pub origin_coords: Option<(f32, f32)>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MvpRewardDistribution {
    pub player_id: String,
    pub score: u32,
    pub rank: usize,
    pub is_mvp_winner: bool,
    pub reward_item_id: String,
    pub bonus_exp: u64,
}

/// Computes RO/L2 weighted MVP ranking from player contributions:
/// Damage: 50%, Healing: 20%, Tanking: 15%, First Hit: 7.5%, Last Hit: 7.5%
pub fn compute_mvp_rewards_from_contributions(
    contributions: &HashMap<String, PlayerDungeonContribution>,
) -> Vec<MvpRewardDistribution> {
    if contributions.is_empty() {
        return Vec::new();
    }

    let total_dmg: u64 = contributions.values().map(|c| c.damage_dealt).sum();
    let total_heal: u64 = contributions.values().map(|c| c.healing_done).sum();
    let total_tank: u64 = contributions.values().map(|c| c.damage_taken).sum();

    let mut scored: Vec<(String, u32)> = contributions
        .iter()
        .map(|(player_id, c)| {
            let dmg_score = if total_dmg > 0 {
                ((c.damage_dealt as f64 / total_dmg as f64) * 5000.0) as u32
            } else {
                0
            };

            let heal_score = if total_heal > 0 {
                ((c.healing_done as f64 / total_heal as f64) * 2000.0) as u32
            } else {
                0
            };

            let tank_score = if total_tank > 0 {
                ((c.damage_taken as f64 / total_tank as f64) * 1500.0) as u32
            } else {
                0
            };

            let first_score = if c.has_first_hit { 750 } else { 0 };
            let last_score = if c.has_last_hit { 750 } else { 0 };

            let total_score = dmg_score + heal_score + tank_score + first_score + last_score;
            (player_id.clone(), total_score)
        })
        .collect();

    // Sort descending by score
    scored.sort_by_key(|a| std::cmp::Reverse(a.1));

    scored
        .into_iter()
        .enumerate()
        .map(|(rank, (player_id, score))| {
            let is_winner = rank == 0;
            MvpRewardDistribution {
                player_id,
                score,
                rank: rank + 1,
                is_mvp_winner: is_winner,
                reward_item_id: if is_winner {
                    "mvp_crown_of_victory".to_string()
                } else {
                    "dungeon_participant_chest".to_string()
                },
                bonus_exp: if is_winner { 25_000 } else { 8_000 },
            }
        })
        .collect()
}

/// In-memory thread-safe registry tracking instanced dungeon allocations and MVP contribution tables.
#[derive(Debug, Clone, Default)]
pub struct DungeonRegistry {
    instances: Arc<RwLock<HashMap<String, DungeonInstance>>>,
}

impl DungeonRegistry {
    pub fn new() -> Self {
        Self {
            instances: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Allocates a dedicated dungeon instance for a party with default boss parameters (50,000 HP, 300s enrage).
    pub fn allocate_dungeon(
        &self,
        instance_id: impl Into<String>,
        party_id: impl Into<String>,
        dungeon_template_id: impl Into<String>,
        mvp_boss_id: impl Into<String>,
        time_limit_secs: u64,
        now_secs: u64,
    ) -> DungeonInstance {
        self.allocate_dungeon_with_boss(
            instance_id,
            party_id,
            dungeon_template_id,
            mvp_boss_id,
            50_000,
            300,
            time_limit_secs,
            now_secs,
        )
    }

    /// Allocates a dedicated dungeon instance with custom boss stats and enrage timer (defaults to single boss floor).
    pub fn allocate_dungeon_with_boss(
        &self,
        instance_id: impl Into<String>,
        party_id: impl Into<String>,
        dungeon_template_id: impl Into<String>,
        mvp_boss_id: impl Into<String>,
        boss_max_hp: u64,
        boss_enrage_timer_secs: u64,
        time_limit_secs: u64,
        now_secs: u64,
    ) -> DungeonInstance {
        self.allocate_dungeon_with_floors(
            instance_id,
            party_id,
            dungeon_template_id,
            mvp_boss_id,
            boss_max_hp,
            boss_enrage_timer_secs,
            1,
            0,
            time_limit_secs,
            now_secs,
        )
    }

    /// Allocates a dedicated multi-floor dungeon instance with floor mob requirements.
    pub fn allocate_dungeon_with_floors(
        &self,
        instance_id: impl Into<String>,
        party_id: impl Into<String>,
        dungeon_template_id: impl Into<String>,
        mvp_boss_id: impl Into<String>,
        boss_max_hp: u64,
        boss_enrage_timer_secs: u64,
        total_floors: u32,
        mobs_per_floor: u32,
        time_limit_secs: u64,
        now_secs: u64,
    ) -> DungeonInstance {
        let b_id = mvp_boss_id.into();
        let encounter = BossEncounterState::new(
            b_id.clone(),
            format!("Boss-{}", b_id),
            boss_max_hp,
            boss_enrage_timer_secs,
            now_secs,
        );

        let total = total_floors.max(1);
        let is_boss = total == 1;
        let req = if is_boss { 0 } else { mobs_per_floor.max(1) };
        let floor_state = DungeonFloorState {
            current_floor: 1,
            total_floors: total,
            mobs_required: req,
            mobs_killed: 0,
            is_floor_cleared: is_boss,
            is_boss_floor: is_boss,
        };

        let inst = DungeonInstance {
            instance_id: instance_id.into(),
            dungeon_template_id: dungeon_template_id.into(),
            party_id: party_id.into(),
            created_at_secs: now_secs,
            time_limit_secs,
            state: DungeonState::Active,
            mvp_boss_id: b_id,
            mvp_boss_alive: true,
            boss_encounter: encounter,
            contributions: HashMap::new(),
            floor_state,
            origin_region_id: None,
            origin_coords: None,
        };

        let mut lock = self.instances.write().unwrap();
        lock.insert(inst.instance_id.clone(), inst.clone());
        inst
    }

    /// Records mob kills on the current floor, unlocking floor advancement when requirements are met.
    pub fn record_floor_mob_kills(
        &self,
        instance_id: &str,
        kills: u32,
        now_secs: u64,
    ) -> Option<(DungeonFloorState, Vec<DungeonFloorEvent>)> {
        let mut lock = self.instances.write().unwrap();
        let inst = lock.get_mut(instance_id)?;
        if inst.state != DungeonState::Active && inst.state != DungeonState::BossEnraged {
            return None;
        }

        let mut events = Vec::new();
        inst.floor_state.mobs_killed = inst.floor_state.mobs_killed.saturating_add(kills);
        events.push(DungeonFloorEvent::FloorMobKilled {
            floor: inst.floor_state.current_floor,
            current_killed: inst.floor_state.mobs_killed,
            required: inst.floor_state.mobs_required,
        });

        if !inst.floor_state.is_floor_cleared
            && inst.floor_state.mobs_killed >= inst.floor_state.mobs_required
        {
            inst.floor_state.is_floor_cleared = true;
            events.push(DungeonFloorEvent::FloorCleared {
                floor: inst.floor_state.current_floor,
                at_secs: now_secs,
            });
        }

        Some((inst.floor_state.clone(), events))
    }

    /// Advances to the next floor in a multi-floor spire if the current floor has been cleared.
    pub fn advance_floor(
        &self,
        instance_id: &str,
        now_secs: u64,
    ) -> Result<(DungeonFloorState, Vec<DungeonFloorEvent>), &'static str> {
        let mut lock = self.instances.write().unwrap();
        let inst = lock.get_mut(instance_id).ok_or("Dungeon instance not found")?;
        if inst.state != DungeonState::Active && inst.state != DungeonState::BossEnraged {
            return Err("Dungeon is not active");
        }
        if !inst.floor_state.is_floor_cleared {
            return Err("Current floor mobs not cleared yet");
        }
        if inst.floor_state.is_boss_floor {
            return Err("Already on the final boss floor");
        }

        let from_floor = inst.floor_state.current_floor;
        let to_floor = from_floor + 1;
        inst.floor_state.current_floor = to_floor;
        let is_boss = to_floor >= inst.floor_state.total_floors;
        inst.floor_state.is_boss_floor = is_boss;
        inst.floor_state.mobs_killed = 0;

        if is_boss {
            inst.floor_state.mobs_required = 0;
            inst.floor_state.is_floor_cleared = false; // cleared when boss dies
        } else {
            inst.floor_state.is_floor_cleared = false;
        }

        let mut events = vec![DungeonFloorEvent::FloorAdvanced {
            from_floor,
            to_floor,
            is_boss_floor: is_boss,
            at_secs: now_secs,
        }];

        if is_boss {
            events.push(DungeonFloorEvent::BossFloorReached {
                floor: to_floor,
                boss_id: inst.mvp_boss_id.clone(),
                at_secs: now_secs,
            });
        }

        Ok((inst.floor_state.clone(), events))
    }

    /// Records damage or event contribution against the dungeon MVP.
    pub fn record_contribution(
        &self,
        instance_id: &str,
        player_id: &str,
        damage: u64,
        damage_taken: u64,
        is_first_hit: bool,
        is_last_hit: bool,
    ) -> bool {
        let mut lock = self.instances.write().unwrap();
        if let Some(inst) = lock.get_mut(instance_id) {
            let entry = inst.contributions.entry(player_id.to_string()).or_default();
            entry.damage_dealt = entry.damage_dealt.saturating_add(damage);
            entry.damage_taken = entry.damage_taken.saturating_add(damage_taken);
            if is_first_hit {
                entry.has_first_hit = true;
            }
            if is_last_hit {
                entry.has_last_hit = true;
                inst.mvp_boss_alive = false;
                inst.state = DungeonState::Cleared;
                inst.boss_encounter.phase = BossPhase::Defeated;
                inst.boss_encounter.current_hp = 0;
            }
            true
        } else {
            false
        }
    }

    /// Sets originating overworld return map ID and coordinates for the dungeon instance.
    pub fn set_instance_origin(
        &self,
        instance_id: &str,
        region_id: impl Into<String>,
        x: f32,
        y: f32,
    ) -> bool {
        let mut lock = self.instances.write().unwrap();
        if let Some(inst) = lock.get_mut(instance_id) {
            inst.origin_region_id = Some(region_id.into());
            inst.origin_coords = Some((x, y));
            true
        } else {
            false
        }
    }

    /// Records healing done by support classes for fair MVP reward contribution.
    pub fn record_healing(
        &self,
        instance_id: &str,
        player_id: &str,
        healing: u64,
    ) -> bool {
        let mut lock = self.instances.write().unwrap();
        if let Some(inst) = lock.get_mut(instance_id) {
            let entry = inst.contributions.entry(player_id.to_string()).or_default();
            entry.healing_done = entry.healing_done.saturating_add(healing);
            true
        } else {
            false
        }
    }

    /// Evaluates party wipe condition. If alive player count drops to 0,
    /// marks the dungeon as Failed and resets the boss encounter to full HP.
    pub fn check_party_wipe(
        &self,
        instance_id: &str,
        alive_player_count: usize,
        now_secs: u64,
    ) -> bool {
        let mut lock = self.instances.write().unwrap();
        if let Some(inst) = lock.get_mut(instance_id) {
            if (inst.state == DungeonState::Active || inst.state == DungeonState::BossEnraged)
                && alive_player_count == 0
            {
                inst.state = DungeonState::Failed;
                inst.boss_encounter.reset_on_wipe(now_secs);
                return true;
            }
        }
        false
    }

    /// Records damage dealt to the boss encounter, manages phase transitions, enrage, and MVP rewards.
    pub fn record_boss_damage(
        &self,
        instance_id: &str,
        player_id: &str,
        damage: u64,
        damage_taken: u64,
        now_secs: u64,
    ) -> Option<(BossEncounterState, Vec<BossEncounterEvent>)> {
        let mut lock = self.instances.write().unwrap();
        let inst = lock.get_mut(instance_id)?;

        let (events, is_first, is_last) = inst.boss_encounter.apply_damage(damage, now_secs);

        let entry = inst.contributions.entry(player_id.to_string()).or_default();
        entry.damage_dealt = entry.damage_dealt.saturating_add(damage);
        entry.damage_taken = entry.damage_taken.saturating_add(damage_taken);
        if is_first {
            entry.has_first_hit = true;
        }

        if is_last {
            entry.has_last_hit = true;
            inst.mvp_boss_alive = false;
            inst.state = DungeonState::Cleared;

            let rewards = compute_mvp_rewards_from_contributions(&inst.contributions);
            inst.boss_encounter.mvp_rewards = Some(rewards);
        }

        Some((inst.boss_encounter.clone(), events))
    }

    /// Evaluates dungeon timers (enrage and time limit).
    pub fn tick_dungeon(
        &self,
        instance_id: &str,
        now_secs: u64,
    ) -> Option<Vec<BossEncounterEvent>> {
        let mut lock = self.instances.write().unwrap();
        let inst = lock.get_mut(instance_id)?;
        let mut events = Vec::new();

        // 1. Check dungeon total time limit
        if inst.state == DungeonState::Active || inst.state == DungeonState::BossEnraged {
            if now_secs.saturating_sub(inst.created_at_secs) >= inst.time_limit_secs {
                inst.state = DungeonState::Failed;
                events.push(BossEncounterEvent::DungeonFailed {
                    reason: "Dungeon time limit expired".to_string(),
                    at_secs: now_secs,
                });
                return Some(events);
            }
        }

        // 2. Tick boss encounter enrage timer
        if let Some(enrage_event) = inst.boss_encounter.tick(now_secs) {
            inst.state = DungeonState::BossEnraged;
            events.push(enrage_event);
        }

        Some(events)
    }

    /// Computes RO/L2 weighted MVP ranking:
    /// Damage: 60%, Tanking: 20%, First Hit: 10%, Last Hit: 10%
    pub fn calculate_mvp_rewards(&self, instance_id: &str) -> Vec<MvpRewardDistribution> {
        let lock = self.instances.read().unwrap();
        let Some(inst) = lock.get(instance_id) else {
            return Vec::new();
        };
        compute_mvp_rewards_from_contributions(&inst.contributions)
    }

    /// Retrieves a cloned snapshot of a dungeon instance if it exists.
    pub fn get_instance(&self, instance_id: &str) -> Option<DungeonInstance> {
        let lock = self.instances.read().unwrap();
        lock.get(instance_id).cloned()
    }

    /// Lists all active dungeon instances.
    pub fn list_instances(&self) -> Vec<DungeonInstance> {
        let lock = self.instances.read().unwrap();
        lock.values().cloned().collect()
    }

    /// Destroys a finished dungeon instance.
    pub fn teardown_dungeon(&self, instance_id: &str) -> bool {
        let mut lock = self.instances.write().unwrap();
        if let Some(mut inst) = lock.remove(instance_id) {
            inst.state = DungeonState::TornDown;
            true
        } else {
            false
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_dungeon_lifecycle_and_mvp_scoring() {
        let registry = DungeonRegistry::new();
        let inst_id = "inst_valkyrie_sanctum_01";

        // 1. Allocate dungeon
        let inst = registry.allocate_dungeon(
            inst_id,
            "party_guild_alpha",
            "dungeon_vesper_crater",
            "mvp_vesper_astral_weaver",
            1800,
            1_700_000_000,
        );
        assert_eq!(inst.state, DungeonState::Active);
        assert!(inst.mvp_boss_alive);
        assert_eq!(inst.boss_encounter.phase, BossPhase::Phase1Normal);
        assert_eq!(inst.boss_encounter.current_hp, 50_000);

        // 2. Player 1: Tank (takes 10,000 damage, lands first hit, deals 2,000 damage)
        registry.record_contribution(inst_id, "player_tank", 2_000, 10_000, true, false);

        // 3. Player 2: DPS (deals 20,000 damage, takes 1,000 damage)
        registry.record_contribution(inst_id, "player_dps", 20_000, 1_000, false, false);

        // 4. Player 3: Finisher (deals 5,000 damage, lands last hit)
        registry.record_contribution(inst_id, "player_finisher", 5_000, 500, false, true);

        // 5. Compute MVP Rewards
        let rewards = registry.calculate_mvp_rewards(inst_id);
        assert_eq!(rewards.len(), 3);

        // Player DPS should win MVP due to 60% damage weighting
        assert_eq!(rewards[0].player_id, "player_dps");
        assert!(rewards[0].is_mvp_winner);
        assert_eq!(rewards[0].reward_item_id, "mvp_crown_of_victory");
        assert_eq!(rewards[0].rank, 1);

        // Verify teardown
        assert!(registry.teardown_dungeon(inst_id));
        assert!(registry.calculate_mvp_rewards(inst_id).is_empty());
    }

    #[test]
    fn test_boss_encounter_phases_50_percent_enrage_and_mvp_rewards() {
        let registry = DungeonRegistry::new();
        let inst_id = "inst_boss_test_encounter";
        let start_time = 1_700_000_000;

        // Allocate dungeon with boss having 100,000 HP and 300s enrage timer
        registry.allocate_dungeon_with_boss(
            inst_id,
            "party_omega",
            "dungeon_antharas_lair",
            "mvp_antharas_earth_dragon",
            100_000,
            300,
            1200,
            start_time,
        );

        // First hit by tank for 10,000 damage (100k -> 90k)
        let (state, events) = registry
            .record_boss_damage(inst_id, "player_tank", 10_000, 2_000, start_time + 10)
            .unwrap();
        assert_eq!(state.current_hp, 90_000);
        assert_eq!(state.phase, BossPhase::Phase1Normal);
        assert_eq!(state.atk_multiplier, 1.0);
        assert_eq!(events.len(), 1);

        // DPS hits for 35,000 damage (90k -> 55k, still > 50%)
        let (state, _) = registry
            .record_boss_damage(inst_id, "player_dps", 35_000, 500, start_time + 20)
            .unwrap();
        assert_eq!(state.current_hp, 55_000);
        assert_eq!(state.phase, BossPhase::Phase1Normal);

        // DPS hits for 10,000 damage (55k -> 45k, crosses 50% threshold!)
        let (state, events) = registry
            .record_boss_damage(inst_id, "player_dps", 10_000, 500, start_time + 30)
            .unwrap();
        assert_eq!(state.current_hp, 45_000);
        assert_eq!(state.phase, BossPhase::Phase2Empowered);
        assert_eq!(state.atk_multiplier, 1.35);
        assert_eq!(state.aspd_multiplier, 1.25);
        assert!(state.empowered_skill_unlocked);
        assert_eq!(state.phase2_entered_at_secs, Some(start_time + 30));

        let phase2_event = events
            .iter()
            .find(|e| matches!(e, BossEncounterEvent::Phase2Transition { .. }));
        assert!(phase2_event.is_some());

        // Fast forward time past 300s enrage timer
        let tick_events = registry.tick_dungeon(inst_id, start_time + 305).unwrap();
        assert_eq!(tick_events.len(), 1);
        assert!(matches!(tick_events[0], BossEncounterEvent::BossEnraged { .. }));

        let inst = registry.get_instance(inst_id).unwrap();
        assert_eq!(inst.state, DungeonState::BossEnraged);
        assert_eq!(inst.boss_encounter.phase, BossPhase::Enraged);
        assert!(inst.boss_encounter.is_enraged);
        assert_eq!(inst.boss_encounter.atk_multiplier, 4.0);
        assert_eq!(inst.boss_encounter.aspd_multiplier, 2.0);

        // Finisher kills the enraged boss for 50,000 damage
        let (state, events) = registry
            .record_boss_damage(inst_id, "player_finisher", 50_000, 100, start_time + 310)
            .unwrap();
        assert_eq!(state.current_hp, 0);
        assert_eq!(state.phase, BossPhase::Defeated);
        assert!(events.iter().any(|e| matches!(e, BossEncounterEvent::BossDefeated { .. })));

        // Verify MVP rewards automatically attached
        let rewards = state.mvp_rewards.expect("MVP rewards must be populated upon defeat");
        assert_eq!(rewards.len(), 3);

        // DPS dealt 45,000 out of 100,000, tank took most damage, finisher got last hit
        let mvp = &rewards[0];
        assert!(mvp.is_mvp_winner);
        assert_eq!(mvp.reward_item_id, "mvp_crown_of_victory");
        assert_eq!(mvp.bonus_exp, 25_000);

        let final_inst = registry.get_instance(inst_id).unwrap();
        assert_eq!(final_inst.state, DungeonState::Cleared);
        assert!(!final_inst.mvp_boss_alive);
    }

    #[test]
    fn test_multi_floor_spire_progression() {
        let registry = DungeonRegistry::new();
        let inst_id = "inst_cindervast_spire";
        let start_time = 1_700_000_000;

        // Allocate Cindervast Under-City: 3 floors for test, 5 mobs per floor
        let inst = registry.allocate_dungeon_with_floors(
            inst_id,
            "party_cindervast_expedition",
            "dungeon-cindervast-under-city",
            "mvp-cindervast-under-city",
            75_000,
            400,
            3,
            5,
            3600,
            start_time,
        );

        assert_eq!(inst.floor_state.current_floor, 1);
        assert_eq!(inst.floor_state.total_floors, 3);
        assert_eq!(inst.floor_state.mobs_required, 5);
        assert_eq!(inst.floor_state.mobs_killed, 0);
        assert!(!inst.floor_state.is_floor_cleared);
        assert!(!inst.floor_state.is_boss_floor);

        // Cannot advance floor without clearing mobs
        let advance_err = registry.advance_floor(inst_id, start_time + 10);
        assert!(advance_err.is_err());

        // Kill 3 mobs (out of 5)
        let (floor, events) = registry
            .record_floor_mob_kills(inst_id, 3, start_time + 20)
            .unwrap();
        assert_eq!(floor.mobs_killed, 3);
        assert!(!floor.is_floor_cleared);
        assert_eq!(events.len(), 1);

        // Kill 2 more mobs (total 5, triggers FloorCleared)
        let (floor, events) = registry
            .record_floor_mob_kills(inst_id, 2, start_time + 30)
            .unwrap();
        assert_eq!(floor.mobs_killed, 5);
        assert!(floor.is_floor_cleared);
        assert!(events.iter().any(|e| matches!(e, DungeonFloorEvent::FloorCleared { floor: 1, .. })));

        // Advance to Floor 2
        let (floor, events) = registry.advance_floor(inst_id, start_time + 35).unwrap();
        assert_eq!(floor.current_floor, 2);
        assert_eq!(floor.mobs_killed, 0);
        assert_eq!(floor.mobs_required, 5);
        assert!(!floor.is_floor_cleared);
        assert!(!floor.is_boss_floor);
        assert!(events.iter().any(|e| matches!(e, DungeonFloorEvent::FloorAdvanced { from_floor: 1, to_floor: 2, is_boss_floor: false, .. })));

        // Clear Floor 2
        registry.record_floor_mob_kills(inst_id, 5, start_time + 50).unwrap();

        // Advance to Floor 3 (Boss Floor!)
        let (floor, events) = registry.advance_floor(inst_id, start_time + 60).unwrap();
        assert_eq!(floor.current_floor, 3);
        assert!(floor.is_boss_floor);
        assert!(events.iter().any(|e| matches!(e, DungeonFloorEvent::BossFloorReached { floor: 3, .. })));

        // Cannot advance past the final floor
        assert!(registry.advance_floor(inst_id, start_time + 70).is_err());
    }
}

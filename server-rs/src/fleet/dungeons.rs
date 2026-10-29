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
    pub contributions: HashMap<String, PlayerDungeonContribution>,
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

    /// Allocates a dedicated dungeon instance for a party.
    pub fn allocate_dungeon(
        &self,
        instance_id: impl Into<String>,
        party_id: impl Into<String>,
        dungeon_template_id: impl Into<String>,
        mvp_boss_id: impl Into<String>,
        time_limit_secs: u64,
        now_secs: u64,
    ) -> DungeonInstance {
        let inst = DungeonInstance {
            instance_id: instance_id.into(),
            dungeon_template_id: dungeon_template_id.into(),
            party_id: party_id.into(),
            created_at_secs: now_secs,
            time_limit_secs,
            state: DungeonState::Active,
            mvp_boss_id: mvp_boss_id.into(),
            mvp_boss_alive: true,
            contributions: HashMap::new(),
        };

        let mut lock = self.instances.write().unwrap();
        lock.insert(inst.instance_id.clone(), inst.clone());
        inst
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
            }
            true
        } else {
            false
        }
    }

    /// Computes RO/L2 weighted MVP ranking:
    /// Damage: 60%, Tanking: 20%, First Hit: 10%, Last Hit: 10%
    pub fn calculate_mvp_rewards(&self, instance_id: &str) -> Vec<MvpRewardDistribution> {
        let lock = self.instances.read().unwrap();
        let Some(inst) = lock.get(instance_id) else {
            return Vec::new();
        };

        if inst.contributions.is_empty() {
            return Vec::new();
        }

        let total_dmg: u64 = inst.contributions.values().map(|c| c.damage_dealt).sum();
        let total_tank: u64 = inst.contributions.values().map(|c| c.damage_taken).sum();

        let mut scored: Vec<(String, u32)> = inst
            .contributions
            .iter()
            .map(|(player_id, c)| {
                let dmg_score = if total_dmg > 0 {
                    ((c.damage_dealt as f64 / total_dmg as f64) * 6000.0) as u32
                } else {
                    0
                };

                let tank_score = if total_tank > 0 {
                    ((c.damage_taken as f64 / total_tank as f64) * 2000.0) as u32
                } else {
                    0
                };

                let first_score = if c.has_first_hit { 1000 } else { 0 };
                let last_score = if c.has_last_hit { 1000 } else { 0 };

                let total_score = dmg_score + tank_score + first_score + last_score;
                (player_id.clone(), total_score)
            })
            .collect();

        // Sort descending by score
        scored.sort_by(|a, b| b.1.cmp(&a.1));

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
}

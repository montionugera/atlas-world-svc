use crate::content::{EquipmentSlot, ItemCatalog, MobTier};
use crate::ecs::components::*;
use bevy_ecs::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::sync::OnceLock;

/// Max HP bonus granted per player level-up (`+20.0` HP/level) (E-005 Slice 1).
pub const HP_GAIN_PER_LEVEL: f32 = 20.0;
/// Attack power bonus granted per player level-up (`+3.0` ATK/level) (E-005 Slice 1).
pub const ATK_GAIN_PER_LEVEL: f32 = 3.0;
/// Maximum pickup distance (`25.0` units) for world loot drops (E-005 Slice 3).
pub const LOOT_PICKUP_RADIUS: f32 = 25.0;
/// Percentage (`10%`) of current level threshold deducted on death, clamped so the player never de-levels (E-005 Slice 7).
pub const DEATH_XP_PENALTY_PERCENT: u32 = 10;

/// Deterministic XP reward for defeating a mob of the given tier (E-005 Slice 1).
pub fn mob_xp_reward(tier: Option<MobTier>) -> u32 {
    match tier {
        Some(MobTier::Verge) => 30,
        Some(MobTier::Route) => 40,
        Some(MobTier::Interior) => 65,
        Some(MobTier::Heart) => 120,
        Some(MobTier::Boss) => 300,
        None => 50,
    }
}

/// Grants `amount` XP to `progression` and applies level-up stat bonuses (`Health::max`, `CombatStats::attack_power`)
/// whenever one or more level thresholds are crossed (E-005 Slice 1).
pub fn grant_xp_and_scale_stats(
    progression: &mut PlayerProgression,
    health: &mut Health,
    stats: Option<&mut CombatStats>,
    amount: u32,
) -> u32 {
    let levels_gained = progression.grant_xp(amount);
    if levels_gained > 0 {
        let hp_bonus = HP_GAIN_PER_LEVEL * (levels_gained as f32);
        health.max += hp_bonus;
        if health.is_alive {
            health.current = health.max;
        }
        if let Some(s) = stats {
            s.attack_power += ATK_GAIN_PER_LEVEL * (levels_gained as f32);
        }
    }
    levels_gained
}

/// Server-authoritative idempotency ledger preventing duplicate XP, item, or currency grants (E-005 Slice 4).
#[derive(Resource, Debug, Clone, Default)]
pub struct GrantLedger {
    claimed_keys: HashSet<String>,
}

impl GrantLedger {
    pub fn new() -> Self {
        Self::default()
    }

    /// Attempts to claim `grant_key`. Returns `true` on the first claim and `false` on any replay or race loser.
    pub fn try_claim_grant(&mut self, grant_key: &str) -> bool {
        if self.claimed_keys.contains(grant_key) {
            return false;
        }
        self.claimed_keys.insert(grant_key.to_string());
        true
    }

    pub fn is_claimed(&self, grant_key: &str) -> bool {
        self.claimed_keys.contains(grant_key)
    }
}

/// Processes lethal hits recorded in `HitLog` and awards experience (and level-up stat increases)
/// to the killing player (or the owner of a killing companion) (E-005 Slices 1 & 4).
#[allow(clippy::type_complexity)]
pub fn experience_on_kill_system(
    hit_log: Option<Res<HitLog>>,
    mut ledger: Option<ResMut<GrantLedger>>,
    companions: Query<&CompanionAi, With<CompanionTag>>,
    mobs: Query<(Option<&EntityId>, Option<&MobSpawnAnchor>), With<MobTag>>,
    mut players: Query<
        (
            &mut PlayerProgression,
            &mut Health,
            Option<&mut CombatStats>,
        ),
        With<PlayerTag>,
    >,
) {
    let Some(log) = hit_log else {
        return;
    };

    for hit in &log.0 {
        if !hit.killed {
            continue;
        }

        let (opt_mob_id, opt_anchor) = mobs.get(hit.target).ok().unwrap_or((None, None));
        let grant_key = opt_mob_id
            .map(|id| format!("kill:{}", id.0))
            .unwrap_or_else(|| format!("kill:entity:{}", hit.target.to_bits()));

        if let Some(ref mut l) = ledger {
            if !l.try_claim_grant(&grant_key) {
                continue;
            }
        }

        let tier = opt_anchor.map(|anchor| anchor.tier);
        let xp_amount = mob_xp_reward(tier);

        // Credit the player directly, or if a companion landed the killing blow, credit its owner.
        let killer_entity = companions
            .get(hit.attacker)
            .map(|c| c.owner)
            .unwrap_or(hit.attacker);

        if let Ok((mut prog, mut hp, mut opt_stats)) = players.get_mut(killer_entity) {
            grant_xp_and_scale_stats(&mut prog, &mut hp, opt_stats.as_deref_mut(), xp_amount);
        }
    }
}

/// Spawns a world `LootDrop` at the position of each mob killed this tick (E-005 Slice 3).
#[allow(clippy::type_complexity)]
pub fn loot_drop_on_kill_system(
    mut commands: Commands,
    hit_log: Option<Res<HitLog>>,
    mut ledger: Option<ResMut<GrantLedger>>,
    mobs: Query<(&Position, Option<&EntityId>, Option<&MobSpawnAnchor>), With<MobTag>>,
) {
    let Some(log) = hit_log else {
        return;
    };
    let catalog = ItemCatalog::global();

    for hit in &log.0 {
        if !hit.killed {
            continue;
        }
        let Ok((mob_pos, opt_id, opt_anchor)) = mobs.get(hit.target) else {
            continue;
        };
        let drop_id = opt_id
            .map(|id| format!("drop-{}", id.0))
            .unwrap_or_else(|| format!("drop-{}", hit.target.to_bits()));
        let grant_key = format!("drop_spawn:{}", drop_id);
        if let Some(ref mut l) = ledger {
            if !l.try_claim_grant(&grant_key) {
                continue;
            }
        }
        let tier = opt_anchor.map(|a| a.tier).unwrap_or(MobTier::Route);
        let spec = catalog.loot_for_tier(tier);
        commands.spawn((
            *mob_pos,
            LootDrop {
                drop_id,
                item_id: spec.item_id,
                quantity: spec.quantity,
                gold: spec.gold,
                claimed: false,
            },
        ));
    }
}

/// Picks up unclaimed `LootDrop` entities within `LOOT_PICKUP_RADIUS` (`<= 25.0` units) of an alive player,
/// enforcing idempotent single-winner ownership when multiple players race for the same drop (E-005 Slices 3 & 4).
#[allow(clippy::type_complexity)]
pub fn loot_pickup_system(
    mut commands: Commands,
    mut ledger: Option<ResMut<GrantLedger>>,
    mut drops: Query<(Entity, &Position, &mut LootDrop), Without<PlayerTag>>,
    mut players: Query<
        (
            Entity,
            &Position,
            &Health,
            &mut PlayerInventory,
            Option<&mut PlayerWallet>,
        ),
        With<PlayerTag>,
    >,
) {
    for (drop_entity, drop_pos, mut drop) in drops.iter_mut() {
        if drop.claimed {
            continue;
        }

        // Find the closest alive player within pickup radius.
        let mut winner: Option<(Entity, f32)> = None;
        for (p_ent, p_pos, p_hp, _, _) in players.iter() {
            if !p_hp.is_alive {
                continue;
            }
            let dist = ((p_pos.x - drop_pos.x).powi(2) + (p_pos.y - drop_pos.y).powi(2)).sqrt();
            if dist <= LOOT_PICKUP_RADIUS
                && winner
                    .as_ref()
                    .map(|(_, best_d)| dist < *best_d)
                    .unwrap_or(true)
            {
                winner = Some((p_ent, dist));
            }
        }

        let Some((winner_ent, _)) = winner else {
            continue;
        };

        let grant_key = format!("pickup:{}", drop.drop_id);
        if let Some(ref mut l) = ledger {
            if !l.try_claim_grant(&grant_key) {
                drop.claimed = true;
                commands.entity(drop_entity).despawn();
                continue;
            }
        }

        drop.claimed = true;
        if let Ok((_, _, _, mut inv, opt_wallet)) = players.get_mut(winner_ent) {
            inv.add_item(drop.item_id.clone(), drop.quantity);
            if let Some(mut wallet) = opt_wallet {
                wallet.gold = wallet.gold.saturating_add(drop.gold);
            }
        }
        commands.entity(drop_entity).despawn();
    }
}

/// Recalculates live avatar `Health::max`, `CombatStats`, and `EquippedWeapon` from `PlayerEquipment` and `PlayerProgression` (E-005 Slice 5).
#[allow(clippy::too_many_arguments)]
pub fn recalculate_equipment_stats(
    base_hp: f32,
    base_atk: f32,
    base_def: f32,
    prog: Option<&PlayerProgression>,
    equip: &PlayerEquipment,
    hp: &mut Health,
    stats: &mut CombatStats,
    equipped_weapon: Option<&mut EquippedWeapon>,
) {
    let catalog = ItemCatalog::global();
    let mut bonus_hp = 0.0;
    let mut bonus_atk = 0.0;
    let mut bonus_def = 0.0;

    for slot_id in [&equip.weapon_id, &equip.armor_id, &equip.accessory_id]
        .into_iter()
        .flatten()
    {
        if let Some(item) = catalog.get(slot_id) {
            bonus_hp += item.bonus_hp;
            bonus_atk += item.bonus_atk;
            bonus_def += item.bonus_def;
        }
    }

    let levels_above_one = prog.map(|p| p.level.saturating_sub(1)).unwrap_or(0) as f32;
    hp.max = base_hp + levels_above_one * HP_GAIN_PER_LEVEL + bonus_hp;
    if hp.current > hp.max {
        hp.current = hp.max;
    }
    stats.attack_power = base_atk + levels_above_one * ATK_GAIN_PER_LEVEL + bonus_atk;
    stats.defense = base_def + bonus_def;

    if let Some(w) = equipped_weapon {
        *w = EquippedWeapon::from_weapon_id(equip.weapon_id.as_deref());
        stats.attack_range = w.projectile_range;
    }
}

/// Equips `item_id` from the player's `PlayerInventory` into the matching `PlayerEquipment` slot
/// and recalculates live avatar stats immediately (E-005 Slice 5).
pub fn equip_item_from_inventory(
    world: &mut World,
    player: Entity,
    item_id: &str,
) -> Result<EquipmentSlot, String> {
    let catalog = ItemCatalog::global();
    let item = catalog
        .get(item_id)
        .ok_or_else(|| format!("Unknown item_id '{}'", item_id))?;

    let inv = world
        .get::<PlayerInventory>(player)
        .ok_or_else(|| "Player has no PlayerInventory".to_string())?;
    if !inv.has_item(item_id) {
        return Err(format!("Player does not own '{}'", item_id));
    }

    let slot = item.slot;
    if !matches!(
        slot,
        EquipmentSlot::Weapon | EquipmentSlot::Armor | EquipmentSlot::Accessory
    ) {
        return Err(format!("Item '{}' is not equippable", item_id));
    }

    if world.get::<PlayerEquipment>(player).is_none() {
        world.entity_mut(player).insert(PlayerEquipment::default());
    }
    if world.get::<EquippedWeapon>(player).is_none() {
        world.entity_mut(player).insert(EquippedWeapon::default());
    }

    {
        let mut equip = world.get_mut::<PlayerEquipment>(player).unwrap();
        match slot {
            EquipmentSlot::Weapon => equip.weapon_id = Some(item_id.to_string()),
            EquipmentSlot::Armor => equip.armor_id = Some(item_id.to_string()),
            EquipmentSlot::Accessory => equip.accessory_id = Some(item_id.to_string()),
            _ => unreachable!(),
        }
    }

    let equip_snapshot = world.get::<PlayerEquipment>(player).unwrap().clone();
    let prog_snapshot = world.get::<PlayerProgression>(player).copied();
    let mut hp = *world
        .get::<Health>(player)
        .ok_or_else(|| "Player has no Health".to_string())?;
    let mut stats = *world
        .get::<CombatStats>(player)
        .ok_or_else(|| "Player has no CombatStats".to_string())?;
    let mut weapon = world
        .get::<EquippedWeapon>(player)
        .cloned()
        .unwrap_or_default();

    recalculate_equipment_stats(
        100.0,
        10.0,
        0.0,
        prog_snapshot.as_ref(),
        &equip_snapshot,
        &mut hp,
        &mut stats,
        Some(&mut weapon),
    );

    *world.get_mut::<Health>(player).unwrap() = hp;
    *world.get_mut::<CombatStats>(player).unwrap() = stats;
    *world.get_mut::<EquippedWeapon>(player).unwrap() = weapon;

    Ok(slot)
}

/// Switches a player's active weapon at runtime (verifying ownership if `PlayerInventory` is present)
/// and updates `EquippedWeapon` + `CombatStats` on the live avatar (E-005 Slice 6).
pub fn switch_active_weapon(
    world: &mut World,
    player: Entity,
    weapon_id: &str,
) -> Result<WeaponKind, String> {
    if world.get::<PlayerInventory>(player).is_some() {
        equip_item_from_inventory(world, player, weapon_id)?;
    } else {
        let w = EquippedWeapon::from_weapon_id(Some(weapon_id));
        if let Some(mut stats) = world.get_mut::<CombatStats>(player) {
            stats.attack_range = w.projectile_range;
        }
        world.entity_mut(player).insert(w);
    }
    Ok(world
        .get::<EquippedWeapon>(player)
        .map(|w| w.kind)
        .unwrap_or(WeaponKind::Melee))
}

/// Updates a player's `SkillLoadout` slots `1..=4` at runtime (E-005 Slice 6).
pub fn configure_skill_loadout(world: &mut World, player: Entity, slots: [String; 4]) {
    world.entity_mut(player).insert(SkillLoadout { slots });
}

/// Binds a player's respawn location to `(region_id, pos)` and records the waypoint as discovered (E-005 Slice 7).
pub fn set_bind_point(
    world: &mut World,
    player: Entity,
    region_id: impl Into<String>,
    pos: Position,
) {
    let reg = region_id.into();
    if let Some(mut bp) = world.get_mut::<BindPoint>(player) {
        bp.region_id = reg.clone();
        bp.position = pos;
        if !bp.discovered_waypoints.iter().any(|(r, _)| r == &reg) {
            bp.discovered_waypoints.push((reg, pos));
        }
    } else {
        world.entity_mut(player).insert(BindPoint {
            region_id: reg.clone(),
            position: pos,
            discovered_waypoints: vec![(reg, pos)],
        });
    }
}

/// Registers a discovered fast-travel waypoint on the player's `BindPoint` (E-005 Slice 7).
pub fn discover_waypoint(
    world: &mut World,
    player: Entity,
    region_id: impl Into<String>,
    pos: Position,
) {
    let reg = region_id.into();
    if world.get::<BindPoint>(player).is_none() {
        world.entity_mut(player).insert(BindPoint::default());
    }
    let mut bp = world.get_mut::<BindPoint>(player).unwrap();
    if let Some(entry) = bp.discovered_waypoints.iter_mut().find(|(r, _)| r == &reg) {
        entry.1 = pos;
    } else {
        bp.discovered_waypoints.push((reg, pos));
    }
}

/// Applies the death XP penalty (`10%` of `xp_to_next_level`, never de-leveling the player),
/// restores full health, clears negative statuses, and respawns the player at their `BindPoint` (E-005 Slice 7).
pub fn apply_death_penalty_and_bind_respawn(world: &mut World, player: Entity) -> u32 {
    let deducted = if let Some(mut prog) = world.get_mut::<PlayerProgression>(player) {
        let penalty = (prog.xp_to_next_level * DEATH_XP_PENALTY_PERCENT) / 100;
        prog.apply_xp_penalty(penalty)
    } else {
        0
    };

    let bind_pos = world
        .get::<BindPoint>(player)
        .map(|bp| bp.position)
        .unwrap_or(Position::new(200.0, 200.0));

    if let Some(mut pos) = world.get_mut::<Position>(player) {
        *pos = bind_pos;
    }
    if let Some(mut vel) = world.get_mut::<Velocity>(player) {
        *vel = Velocity::zero();
    }
    if let Some(mut hp) = world.get_mut::<Health>(player) {
        hp.current = hp.max;
        hp.is_alive = true;
    }
    if let Some(mut status) = world.get_mut::<StatusEffects>(player) {
        *status = StatusEffects::default();
    }

    deducted
}

/// Teleports an alive player across the open world to a discovered waypoint (E-005 Slice 7).
pub fn fast_travel_to_waypoint(
    world: &mut World,
    player: Entity,
    target_region_id: &str,
) -> Result<Position, String> {
    let is_alive = world.get::<Health>(player).is_some_and(|h| h.is_alive);
    if !is_alive {
        return Err("Dead players cannot fast travel".to_string());
    }

    let bp = world
        .get::<BindPoint>(player)
        .ok_or_else(|| "Player has no BindPoint / discovered waypoints".to_string())?;
    let (_, dest_pos) = bp
        .discovered_waypoints
        .iter()
        .find(|(r, _)| r == target_region_id)
        .cloned()
        .ok_or_else(|| format!("Waypoint '{}' has not been discovered", target_region_id))?;

    if let Some(mut pos) = world.get_mut::<Position>(player) {
        *pos = dest_pos;
    }
    if let Some(mut vel) = world.get_mut::<Velocity>(player) {
        *vel = Velocity::zero();
    }
    Ok(dest_pos)
}

/// Server-authoritative vendor purchase: deducts `price_gold * quantity` from `PlayerWallet`
/// and adds the purchased item stack to `PlayerInventory` (E-005 Slice 8).
pub fn vendor_buy_item(
    world: &mut World,
    player: Entity,
    item_id: &str,
    quantity: u32,
) -> Result<u64, String> {
    if quantity == 0 {
        return Err("Quantity must be >= 1".to_string());
    }
    let item = ItemCatalog::global()
        .get(item_id)
        .ok_or_else(|| format!("Unknown item '{}'", item_id))?;
    let total_cost = item.price_gold.saturating_mul(quantity as u64);

    let current_gold = world
        .get::<PlayerWallet>(player)
        .map(|w| w.gold)
        .ok_or_else(|| "Player has no PlayerWallet".to_string())?;
    if current_gold < total_cost {
        return Err(format!(
            "Insufficient gold: have {}, need {}",
            current_gold, total_cost
        ));
    }

    if world.get::<PlayerInventory>(player).is_none() {
        world.entity_mut(player).insert(PlayerInventory::new());
    }
    world.get_mut::<PlayerWallet>(player).unwrap().gold -= total_cost;
    world
        .get_mut::<PlayerInventory>(player)
        .unwrap()
        .add_item(item_id.to_string(), quantity);

    Ok(world.get::<PlayerWallet>(player).unwrap().gold)
}

/// Server-authoritative vendor sale: removes `quantity` of `item_id` from `PlayerInventory`
/// and credits `sell_gold * quantity` to `PlayerWallet` (E-005 Slice 8).
pub fn vendor_sell_item(
    world: &mut World,
    player: Entity,
    item_id: &str,
    quantity: u32,
) -> Result<u64, String> {
    if quantity == 0 {
        return Err("Quantity must be >= 1".to_string());
    }
    let item = ItemCatalog::global()
        .get(item_id)
        .ok_or_else(|| format!("Unknown item '{}'", item_id))?;
    let payout = item.sell_gold.saturating_mul(quantity as u64);

    let removed = world
        .get_mut::<PlayerInventory>(player)
        .map(|mut inv| inv.remove_item(item_id, quantity))
        .unwrap_or(false);
    if !removed {
        return Err(format!("Player does not own {}x '{}'", quantity, item_id));
    }

    if world.get::<PlayerWallet>(player).is_none() {
        world.entity_mut(player).insert(PlayerWallet::default());
    }
    world.get_mut::<PlayerWallet>(player).unwrap().gold += payout;
    Ok(world.get::<PlayerWallet>(player).unwrap().gold)
}

/// Embedded 28-quest story catalogue from `content/story/quests.json` (E-005 Slice 9).
pub const STORY_QUESTS_JSON: &str = include_str!("../../../content/story/quests.json");

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RuntimeQuestObjective {
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(rename = "targetId")]
    pub target_id: String,
    pub count: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RuntimeQuestEntry {
    pub id: String,
    pub title: String,
    pub summary: String,
    #[serde(default)]
    pub giver: String,
    #[serde(default)]
    pub region: String,
    #[serde(default)]
    pub faction: String,
    #[serde(rename = "unlockedBy", default)]
    pub unlocked_by: Vec<String>,
    #[serde(rename = "arcId", default)]
    pub arc_id: String,
    #[serde(default)]
    pub objectives: Vec<RuntimeQuestObjective>,
}

impl RuntimeQuestEntry {
    pub fn required_count(&self) -> u32 {
        self.objectives
            .iter()
            .map(|o| o.count.max(1))
            .sum::<u32>()
            .max(1)
    }

    pub fn xp_reward(&self) -> u32 {
        120 + self.required_count() * 25
    }

    pub fn gold_reward(&self) -> u64 {
        40 + (self.required_count() as u64) * 10
    }
}

/// Runtime quest catalogue holding all 28 authored story quests (E-005 Slice 9).
#[derive(Debug, Clone)]
pub struct RuntimeQuestCatalog {
    quests: Vec<RuntimeQuestEntry>,
    by_id: HashMap<String, usize>,
}

impl RuntimeQuestCatalog {
    pub fn global() -> &'static RuntimeQuestCatalog {
        static CATALOG: OnceLock<RuntimeQuestCatalog> = OnceLock::new();
        CATALOG.get_or_init(|| {
            let quests: Vec<RuntimeQuestEntry> =
                serde_json::from_str(STORY_QUESTS_JSON).expect("valid content/story/quests.json");
            let mut by_id = HashMap::with_capacity(quests.len());
            for (idx, q) in quests.iter().enumerate() {
                by_id.insert(q.id.clone(), idx);
            }
            Self { quests, by_id }
        })
    }

    pub fn all(&self) -> &[RuntimeQuestEntry] {
        &self.quests
    }

    pub fn get(&self, quest_id: &str) -> Option<&RuntimeQuestEntry> {
        self.by_id.get(quest_id).map(|&idx| &self.quests[idx])
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum QuestStatus {
    Active,
    Completed,
    Claimed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ActiveQuestProgress {
    pub quest_id: String,
    pub progress: u32,
    pub required: u32,
    pub status: QuestStatus,
}

/// Tracks a player's active, completed, and claimed story quests at runtime (E-005 Slice 9).
#[derive(Component, Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct PlayerQuestTracker {
    pub quests: HashMap<String, ActiveQuestProgress>,
}

impl PlayerQuestTracker {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn accept_quest(&mut self, quest_id: &str) -> Result<(), String> {
        let catalog = RuntimeQuestCatalog::global();
        let entry = catalog
            .get(quest_id)
            .ok_or_else(|| format!("Unknown quest '{}'", quest_id))?;

        for prereq in &entry.unlocked_by {
            let prereq_done = self
                .quests
                .get(prereq)
                .is_some_and(|p| matches!(p.status, QuestStatus::Completed | QuestStatus::Claimed));
            if !prereq_done {
                return Err(format!(
                    "Quest '{}' requires prerequisite '{}'",
                    quest_id, prereq
                ));
            }
        }

        if self.quests.contains_key(quest_id) {
            return Ok(());
        }

        self.quests.insert(
            quest_id.to_string(),
            ActiveQuestProgress {
                quest_id: quest_id.to_string(),
                progress: 0,
                required: entry.required_count(),
                status: QuestStatus::Active,
            },
        );
        Ok(())
    }

    pub fn record_objective_progress(
        &mut self,
        quest_id: &str,
        amount: u32,
    ) -> Option<QuestStatus> {
        let entry = self.quests.get_mut(quest_id)?;
        if entry.status == QuestStatus::Active {
            entry.progress = (entry.progress + amount).min(entry.required);
            if entry.progress >= entry.required {
                entry.status = QuestStatus::Completed;
            }
        }
        Some(entry.status)
    }
}

/// Claims a completed quest's XP and gold rewards idempotently at runtime (E-005 Slice 9).
pub fn claim_quest_reward(
    world: &mut World,
    player: Entity,
    quest_id: &str,
) -> Result<(u32, u64), String> {
    let catalog = RuntimeQuestCatalog::global();
    let quest = catalog
        .get(quest_id)
        .ok_or_else(|| format!("Unknown quest '{}'", quest_id))?;

    {
        let mut tracker = world
            .get_mut::<PlayerQuestTracker>(player)
            .ok_or_else(|| "Player has no PlayerQuestTracker".to_string())?;
        let state = tracker
            .quests
            .get_mut(quest_id)
            .ok_or_else(|| format!("Quest '{}' has not been accepted", quest_id))?;
        match state.status {
            QuestStatus::Active => {
                return Err(format!(
                    "Quest '{}' is not yet completed ({}/{})",
                    quest_id, state.progress, state.required
                ))
            }
            QuestStatus::Claimed => {
                return Err(format!("Quest '{}' reward already claimed", quest_id))
            }
            QuestStatus::Completed => {
                state.status = QuestStatus::Claimed;
            }
        }
    }

    let xp_reward = quest.xp_reward();
    let gold_reward = quest.gold_reward();

    let mut hp = world
        .get::<Health>(player)
        .copied()
        .unwrap_or_else(|| Health::new(100.0));
    let mut stats = world.get::<CombatStats>(player).copied();
    if let Some(mut prog) = world.get_mut::<PlayerProgression>(player) {
        grant_xp_and_scale_stats(&mut prog, &mut hp, stats.as_mut(), xp_reward);
    }
    if let Some(mut h) = world.get_mut::<Health>(player) {
        *h = hp;
    }
    if let (Some(mut s), Some(updated_s)) = (world.get_mut::<CombatStats>(player), stats) {
        *s = updated_s;
    }
    if let Some(mut wallet) = world.get_mut::<PlayerWallet>(player) {
        wallet.gold = wallet.gold.saturating_add(gold_reward);
    }

    Ok((xp_reward, gold_reward))
}

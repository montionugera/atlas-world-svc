use crate::content::MobTier;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::OnceLock;

/// Canonical equipment or inventory category for an item in `ItemCatalog` (E-005 Slice 2).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EquipmentSlot {
    Weapon,
    Armor,
    Accessory,
    Consumable,
    Material,
}

/// Typed item definition in the minimal item catalogue (E-005 Slice 2).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ItemDefinition {
    pub id: String,
    pub name: String,
    pub slot: EquipmentSlot,
    pub bonus_atk: f32,
    pub bonus_def: f32,
    pub bonus_hp: f32,
    pub price_gold: u64,
    pub sell_gold: u64,
}

/// Deterministic loot reward rolled for a mob tier (E-005 Slices 2 & 3).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct LootDropSpec {
    pub item_id: String,
    pub quantity: u32,
    pub gold: u64,
}

/// Canonical server-authoritative item catalogue used for loot drops, equipment, and vendors (E-005 Slice 2).
#[derive(Debug, Clone)]
pub struct ItemCatalog {
    items: Vec<ItemDefinition>,
    by_id: HashMap<String, usize>,
}

impl Default for ItemCatalog {
    fn default() -> Self {
        Self::new_minimal()
    }
}

impl ItemCatalog {
    pub fn global() -> &'static ItemCatalog {
        static CATALOG: OnceLock<ItemCatalog> = OnceLock::new();
        CATALOG.get_or_init(ItemCatalog::new_minimal)
    }

    pub fn new_minimal() -> Self {
        let items = vec![
            ItemDefinition {
                id: "w_sword".to_string(),
                name: "Iron Broadsword".to_string(),
                slot: EquipmentSlot::Weapon,
                bonus_atk: 8.0,
                bonus_def: 1.0,
                bonus_hp: 0.0,
                price_gold: 50,
                sell_gold: 25,
            },
            ItemDefinition {
                id: "w_bow".to_string(),
                name: "Ashwood Hunting Bow".to_string(),
                slot: EquipmentSlot::Weapon,
                bonus_atk: 7.0,
                bonus_def: 0.0,
                bonus_hp: 0.0,
                price_gold: 55,
                sell_gold: 27,
            },
            ItemDefinition {
                id: "w_staff".to_string(),
                name: "Resonance Conduit Staff".to_string(),
                slot: EquipmentSlot::Weapon,
                bonus_atk: 9.0,
                bonus_def: 0.0,
                bonus_hp: 10.0,
                price_gold: 65,
                sell_gold: 32,
            },
            ItemDefinition {
                id: "w_ember_blade".to_string(),
                name: "Emberforged Greatsword".to_string(),
                slot: EquipmentSlot::Weapon,
                bonus_atk: 16.0,
                bonus_def: 2.0,
                bonus_hp: 20.0,
                price_gold: 160,
                sell_gold: 80,
            },
            ItemDefinition {
                id: "a_cloth".to_string(),
                name: "Wayfarer Linen Tunic".to_string(),
                slot: EquipmentSlot::Armor,
                bonus_atk: 0.0,
                bonus_def: 3.0,
                bonus_hp: 25.0,
                price_gold: 40,
                sell_gold: 20,
            },
            ItemDefinition {
                id: "a_leather".to_string(),
                name: "Bracken Brigandine".to_string(),
                slot: EquipmentSlot::Armor,
                bonus_atk: 1.0,
                bonus_def: 6.0,
                bonus_hp: 45.0,
                price_gold: 85,
                sell_gold: 42,
            },
            ItemDefinition {
                id: "a_plate".to_string(),
                name: "Clockwork Carapace Plate".to_string(),
                slot: EquipmentSlot::Armor,
                bonus_atk: 2.0,
                bonus_def: 12.0,
                bonus_hp: 90.0,
                price_gold: 180,
                sell_gold: 90,
            },
            ItemDefinition {
                id: "acc_vigor_ring".to_string(),
                name: "Signet of Vigor".to_string(),
                slot: EquipmentSlot::Accessory,
                bonus_atk: 2.0,
                bonus_def: 2.0,
                bonus_hp: 40.0,
                price_gold: 75,
                sell_gold: 37,
            },
            ItemDefinition {
                id: "acc_swift_charm".to_string(),
                name: "Wind-Chime Talisman".to_string(),
                slot: EquipmentSlot::Accessory,
                bonus_atk: 5.0,
                bonus_def: 1.0,
                bonus_hp: 15.0,
                price_gold: 90,
                sell_gold: 45,
            },
            ItemDefinition {
                id: "pot_minor_heal".to_string(),
                name: "Minor Healing Draught".to_string(),
                slot: EquipmentSlot::Consumable,
                bonus_atk: 0.0,
                bonus_def: 0.0,
                bonus_hp: 50.0,
                price_gold: 15,
                sell_gold: 7,
            },
            ItemDefinition {
                id: "mat_wolf_pelt".to_string(),
                name: "Weald Wolf Pelt".to_string(),
                slot: EquipmentSlot::Material,
                bonus_atk: 0.0,
                bonus_def: 0.0,
                bonus_hp: 0.0,
                price_gold: 12,
                sell_gold: 6,
            },
            ItemDefinition {
                id: "mat_clockwork_cog".to_string(),
                name: "Verdigris Brass Cog".to_string(),
                slot: EquipmentSlot::Material,
                bonus_atk: 0.0,
                bonus_def: 0.0,
                bonus_hp: 0.0,
                price_gold: 24,
                sell_gold: 12,
            },
            ItemDefinition {
                id: "mat_star_shard".to_string(),
                name: "Shattered Halo Shard".to_string(),
                slot: EquipmentSlot::Material,
                bonus_atk: 0.0,
                bonus_def: 0.0,
                bonus_hp: 0.0,
                price_gold: 60,
                sell_gold: 30,
            },
        ];

        let mut by_id = HashMap::with_capacity(items.len());
        for (idx, item) in items.iter().enumerate() {
            by_id.insert(item.id.clone(), idx);
        }
        Self { items, by_id }
    }

    pub fn get(&self, item_id: &str) -> Option<&ItemDefinition> {
        self.by_id.get(item_id).map(|&idx| &self.items[idx])
    }

    pub fn all(&self) -> &[ItemDefinition] {
        &self.items
    }

    /// Resolves a deterministic loot drop specification for a defeated mob of `tier`.
    pub fn loot_for_tier(&self, tier: MobTier) -> LootDropSpec {
        match tier {
            MobTier::Verge => LootDropSpec {
                item_id: "mat_wolf_pelt".to_string(),
                quantity: 1,
                gold: 8,
            },
            MobTier::Route => LootDropSpec {
                item_id: "pot_minor_heal".to_string(),
                quantity: 1,
                gold: 15,
            },
            MobTier::Interior => LootDropSpec {
                item_id: "a_leather".to_string(),
                quantity: 1,
                gold: 30,
            },
            MobTier::Heart => LootDropSpec {
                item_id: "acc_vigor_ring".to_string(),
                quantity: 1,
                gold: 60,
            },
            MobTier::Boss => LootDropSpec {
                item_id: "w_ember_blade".to_string(),
                quantity: 1,
                gold: 200,
            },
        }
    }
}

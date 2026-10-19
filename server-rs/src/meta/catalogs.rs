use serde::{Deserialize, Serialize};
use std::collections::HashMap;

const ITEMS_JSON: &str = include_str!("../../../contracts/content/items.json");
const SKILLS_JSON: &str = include_str!("../../../contracts/content/skills.json");
const QUESTS_JSON: &str = include_str!("../../../contracts/content/quests.json");

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ItemKind {
    Weapon,
    Armor,
    Accessory,
    Consumable,
    Material,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemDef {
    pub id: String,
    pub name: String,
    pub kind: ItemKind,
    pub stackable: bool,
    #[serde(default)]
    pub p_atk: Option<u32>,
    #[serde(default)]
    pub m_atk: Option<u32>,
    #[serde(default)]
    pub atk_stat: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillDef {
    pub id: String,
    pub name: String,
    pub max_level: u32,
    pub requires: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestObjectiveDef {
    pub id: String,
    #[serde(rename = "type")]
    pub objective_type: String,
    pub target_id: String,
    pub required: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestRewardItem {
    pub item_id: String,
    pub qty: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestRewardsDef {
    pub xp: u32,
    pub items: Vec<QuestRewardItem>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestDef {
    pub id: String,
    pub objectives: Vec<QuestObjectiveDef>,
    pub rewards: QuestRewardsDef,
}

#[derive(Debug, Clone)]
pub struct MetaCatalogs {
    pub items: HashMap<String, ItemDef>,
    pub skills: HashMap<String, SkillDef>,
    pub quests: HashMap<String, QuestDef>,
}

impl MetaCatalogs {
    pub fn load_embedded() -> Result<Self, String> {
        Self::from_json_strs(ITEMS_JSON, SKILLS_JSON, QUESTS_JSON)
    }

    pub fn from_json_strs(
        items_raw: &str,
        skills_raw: &str,
        quests_raw: &str,
    ) -> Result<Self, String> {
        let item_list: Vec<ItemDef> =
            serde_json::from_str(items_raw).map_err(|e| format!("Invalid items catalog: {}", e))?;
        let mut items = HashMap::new();
        for item in item_list {
            if item.id.trim().is_empty() || item.name.trim().is_empty() {
                return Err("Invalid item entry: empty id or name".to_string());
            }
            if items.insert(item.id.clone(), item.clone()).is_some() {
                return Err(format!("Duplicate item id: {}", item.id));
            }
        }

        let skill_list: Vec<SkillDef> = serde_json::from_str(skills_raw)
            .map_err(|e| format!("Invalid skills catalog: {}", e))?;
        let mut skills = HashMap::new();
        for skill in skill_list {
            if skill.id.trim().is_empty() || skill.name.trim().is_empty() || skill.max_level == 0 {
                return Err(format!("Invalid skill entry: {}", skill.id));
            }
            if skills.insert(skill.id.clone(), skill.clone()).is_some() {
                return Err(format!("Duplicate skill id: {}", skill.id));
            }
        }

        let quest_list: Vec<QuestDef> = serde_json::from_str(quests_raw)
            .map_err(|e| format!("Invalid quests catalog: {}", e))?;
        let mut quests = HashMap::new();
        for quest in quest_list {
            if quest.id.trim().is_empty() || quest.objectives.is_empty() {
                return Err(format!("Invalid quest entry: {}", quest.id));
            }
            for obj in &quest.objectives {
                if obj.id.trim().is_empty() || obj.required == 0 {
                    return Err(format!("Invalid objective in quest {}", quest.id));
                }
                if !matches!(
                    obj.objective_type.as_str(),
                    "MOB_KILLED" | "ITEM_PICKED_UP" | "ZONE_ENTERED"
                ) {
                    return Err(format!(
                        "Unsupported objective type {} in quest {}",
                        obj.objective_type, quest.id
                    ));
                }
            }
            if quests.insert(quest.id.clone(), quest.clone()).is_some() {
                return Err(format!("Duplicate quest id: {}", quest.id));
            }
        }

        validate_catalog_integrity(&items, &skills, &quests)?;
        Ok(Self {
            items,
            skills,
            quests,
        })
    }
}

pub fn validate_catalog_integrity(
    items: &HashMap<String, ItemDef>,
    skills: &HashMap<String, SkillDef>,
    quests: &HashMap<String, QuestDef>,
) -> Result<(), String> {
    for skill in skills.values() {
        for req_id in &skill.requires {
            if !skills.contains_key(req_id) {
                return Err(format!(
                    "Skill \"{}\" requires unknown skill \"{}\"",
                    skill.id, req_id
                ));
            }
        }
    }

    for quest in quests.values() {
        for reward_item in &quest.rewards.items {
            if !items.contains_key(&reward_item.item_id) {
                return Err(format!(
                    "Quest \"{}\" rewards unknown item \"{}\"",
                    quest.id, reward_item.item_id
                ));
            }
        }
        for obj in &quest.objectives {
            if obj.target_id.trim().is_empty() {
                return Err(format!(
                    "Quest \"{}\" objective \"{}\" has empty targetId",
                    quest.id, obj.id
                ));
            }
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn loads_and_validates_embedded_catalogs() {
        let catalogs = MetaCatalogs::load_embedded().expect("embedded catalogs should be valid");
        assert!(catalogs.items.contains_key("basic_sword"));
        assert!(catalogs.items.contains_key("potion_minor"));
        assert!(catalogs.skills.contains_key("cleave"));
        assert!(catalogs.quests.contains_key("q_boar_5"));
    }

    #[test]
    fn rejects_broken_skill_prerequisite_and_quest_reward() {
        let catalogs = MetaCatalogs::load_embedded().unwrap();
        let mut bad_skills = catalogs.skills.clone();
        bad_skills.get_mut("cleave").unwrap().requires = vec!["nonexistent_skill".to_string()];
        let err = validate_catalog_integrity(&catalogs.items, &bad_skills, &catalogs.quests)
            .expect_err("broken skill prereq must fail");
        assert!(err.contains("nonexistent_skill"));

        let mut bad_quests = catalogs.quests.clone();
        bad_quests.get_mut("q_boar_5").unwrap().rewards.items[0].item_id = "ghost_item".to_string();
        let err2 = validate_catalog_integrity(&catalogs.items, &catalogs.skills, &bad_quests)
            .expect_err("broken quest reward item must fail");
        assert!(err2.contains("ghost_item"));
    }
}

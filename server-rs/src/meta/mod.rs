pub mod catalogs;
pub mod engine;
pub mod models;
pub mod store;

pub use catalogs::{
    validate_catalog_integrity, ItemDef, ItemKind, MetaCatalogs, QuestDef, QuestObjectiveDef,
    QuestRewardItem, QuestRewardsDef, SkillDef,
};
pub use engine::{
    apply_xp, xp_to_next, MetaNotification, RpcContext, RustMetaEngine, MAX_NOTIFICATIONS_PER_USER,
    MAX_SKILL_LOADOUT,
};
pub use models::{
    default_character_state_doc, default_equipment_doc, default_inventory_doc, default_profile_doc,
    default_quests_doc, default_skills_doc, migrate_profile_value, parse_character_state_value,
    parse_equipment_value, parse_inventory_value, parse_quests_value, parse_skills_value,
    ActiveQuestEntry, CharacterStateDoc, CompletedQuestEntry, EquipmentDoc, EquipmentSlotsDoc,
    InventoryDoc, MetaError, QuestObjectivesMap, QuestsDoc, QuestsSeqDoc, SkillsDoc,
    StackableEntry, UniqueEntry,
};
pub use store::{
    generate_uuid_v4, validate_device_id, DocWrite, InMemoryMetaStore, MetaDocStore,
    PostgresMetaStore, SqliteMetaStore, StoredDoc, UserAccount,
};

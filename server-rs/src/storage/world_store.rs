use crate::meta::{DocWrite, MetaDocStore};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::future::Future;
use std::path::{Path, PathBuf};
use std::pin::Pin;
use std::sync::{Arc, RwLock};

/// Nil/system account UUID used to own world-region documents in `MetaDocStore`.
pub const WORLD_SYSTEM_USER_ID: &str = "00000000-0000-0000-0000-000000000000";
/// Collection storing serialized `RegionStateSnapshot` documents keyed by `region_id`.
pub const WORLD_REGIONS_COLLECTION: &str = "world_regions";
/// Collection storing the region index (`_regions`) for `MetaWorldStateStore::list_region_ids`.
pub const WORLD_REGIONS_INDEX_COLLECTION: &str = "world_regions_index";
pub const WORLD_REGIONS_INDEX_KEY: &str = "_regions";

/// Serializable snapshot of a single living mob in a region.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MobStateRecord {
    pub entity_id: String,
    pub mob_id: String,
    pub tier: String,
    pub x: f32,
    pub y: f32,
    pub vx: f32,
    pub vy: f32,
    pub health: f32,
    pub max_health: f32,
    pub spawn_x: f32,
    pub spawn_y: f32,
    pub respawn_delay_sec: f32,
}

/// Serializable snapshot of a dead mob's pending respawn timer and spawn anchor.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeadMobRespawnRecord {
    pub mob_id: String,
    pub tier: String,
    pub spawn_x: f32,
    pub spawn_y: f32,
    pub respawn_delay_sec: f32,
    pub remaining_respawn_sec: f32,
}

/// Serializable snapshot of a persistent world object in a region (beacons, gates, etc.).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldObjectRecord {
    pub object_id: String,
    pub kind: String,
    pub x: f32,
    pub y: f32,
    #[serde(default)]
    pub properties: BTreeMap<String, String>,
}

/// Complete serializable state of a `4000 x 4000` world region.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegionStateSnapshot {
    pub schema_version: u32,
    pub region_id: String,
    pub saved_at_tick: u32,
    pub saved_at_ms: u64,
    #[serde(default)]
    pub sleeping_since_ms: Option<u64>,
    #[serde(default)]
    pub mobs: Vec<MobStateRecord>,
    #[serde(default)]
    pub dead_mob_respawns: Vec<DeadMobRespawnRecord>,
    #[serde(default)]
    pub world_objects: Vec<WorldObjectRecord>,
}

/// Async trait for reading, writing, listing, and deleting region state snapshots.
pub trait WorldStateStore: Send + Sync {
    fn save_region_state<'a>(
        &'a self,
        snapshot: &'a RegionStateSnapshot,
    ) -> Pin<Box<dyn Future<Output = Result<(), String>> + Send + 'a>>;

    fn load_region_state<'a>(
        &'a self,
        region_id: &'a str,
    ) -> Pin<Box<dyn Future<Output = Result<Option<RegionStateSnapshot>, String>> + Send + 'a>>;

    fn delete_region_state<'a>(
        &'a self,
        region_id: &'a str,
    ) -> Pin<Box<dyn Future<Output = Result<(), String>> + Send + 'a>>;

    fn list_region_ids<'a>(
        &'a self,
    ) -> Pin<Box<dyn Future<Output = Result<Vec<String>, String>> + Send + 'a>>;
}

// ============================================================================
// 1. MemoryWorldStateStore
// ============================================================================

#[derive(Default, Clone)]
pub struct MemoryWorldStateStore {
    regions: Arc<RwLock<HashMap<String, RegionStateSnapshot>>>,
}

impl MemoryWorldStateStore {
    pub fn new() -> Self {
        Self::default()
    }
}

impl WorldStateStore for MemoryWorldStateStore {
    fn save_region_state<'a>(
        &'a self,
        snapshot: &'a RegionStateSnapshot,
    ) -> Pin<Box<dyn Future<Output = Result<(), String>> + Send + 'a>> {
        let snap = snapshot.clone();
        Box::pin(async move {
            let mut guard = self
                .regions
                .write()
                .map_err(|_| "MemoryWorldStateStore lock poisoned".to_string())?;
            guard.insert(snap.region_id.clone(), snap);
            Ok(())
        })
    }

    fn load_region_state<'a>(
        &'a self,
        region_id: &'a str,
    ) -> Pin<Box<dyn Future<Output = Result<Option<RegionStateSnapshot>, String>> + Send + 'a>>
    {
        let id = region_id.to_string();
        Box::pin(async move {
            let guard = self
                .regions
                .read()
                .map_err(|_| "MemoryWorldStateStore lock poisoned".to_string())?;
            Ok(guard.get(&id).cloned())
        })
    }

    fn delete_region_state<'a>(
        &'a self,
        region_id: &'a str,
    ) -> Pin<Box<dyn Future<Output = Result<(), String>> + Send + 'a>> {
        let id = region_id.to_string();
        Box::pin(async move {
            let mut guard = self
                .regions
                .write()
                .map_err(|_| "MemoryWorldStateStore lock poisoned".to_string())?;
            guard.remove(&id);
            Ok(())
        })
    }

    fn list_region_ids<'a>(
        &'a self,
    ) -> Pin<Box<dyn Future<Output = Result<Vec<String>, String>> + Send + 'a>> {
        Box::pin(async move {
            let guard = self
                .regions
                .read()
                .map_err(|_| "MemoryWorldStateStore lock poisoned".to_string())?;
            let mut ids: Vec<String> = guard.keys().cloned().collect();
            ids.sort();
            Ok(ids)
        })
    }
}

// ============================================================================
// 2. FileWorldStateStore
// ============================================================================

#[derive(Debug, Clone)]
pub struct FileWorldStateStore {
    dir: PathBuf,
}

impl FileWorldStateStore {
    pub fn new(dir: impl AsRef<Path>) -> Result<Self, String> {
        let path = dir.as_ref().to_path_buf();
        std::fs::create_dir_all(&path)
            .map_err(|e| format!("Failed to create world state dir {:?}: {}", path, e))?;
        Ok(Self { dir: path })
    }

    fn sanitize_region_id(region_id: &str) -> Result<String, String> {
        if region_id.is_empty()
            || !region_id
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
        {
            return Err(format!("Invalid region_id: {}", region_id));
        }
        Ok(region_id.to_string())
    }

    fn region_path(&self, region_id: &str) -> Result<PathBuf, String> {
        let clean = Self::sanitize_region_id(region_id)?;
        Ok(self.dir.join(format!("{}.json", clean)))
    }
}

impl WorldStateStore for FileWorldStateStore {
    fn save_region_state<'a>(
        &'a self,
        snapshot: &'a RegionStateSnapshot,
    ) -> Pin<Box<dyn Future<Output = Result<(), String>> + Send + 'a>> {
        let snap = snapshot.clone();
        Box::pin(async move {
            let target = self.region_path(&snap.region_id)?;
            let tmp = self.dir.join(format!(
                ".{}.{}.tmp",
                snap.region_id,
                crate::meta::generate_uuid_v4()
            ));
            let bytes = serde_json::to_vec_pretty(&snap)
                .map_err(|e| format!("Failed to serialize RegionStateSnapshot: {}", e))?;
            std::fs::write(&tmp, bytes)
                .map_err(|e| format!("Failed to write temp file {:?}: {}", tmp, e))?;
            std::fs::rename(&tmp, &target).map_err(|e| {
                format!(
                    "Failed to rename temp file {:?} -> {:?}: {}",
                    tmp, target, e
                )
            })?;
            Ok(())
        })
    }

    fn load_region_state<'a>(
        &'a self,
        region_id: &'a str,
    ) -> Pin<Box<dyn Future<Output = Result<Option<RegionStateSnapshot>, String>> + Send + 'a>>
    {
        let id = region_id.to_string();
        Box::pin(async move {
            let target = self.region_path(&id)?;
            if !target.exists() {
                return Ok(None);
            }
            let bytes = std::fs::read(&target)
                .map_err(|e| format!("Failed to read {:?}: {}", target, e))?;
            let snap: RegionStateSnapshot = serde_json::from_slice(&bytes)
                .map_err(|e| format!("Failed to parse {:?}: {}", target, e))?;
            Ok(Some(snap))
        })
    }

    fn delete_region_state<'a>(
        &'a self,
        region_id: &'a str,
    ) -> Pin<Box<dyn Future<Output = Result<(), String>> + Send + 'a>> {
        let id = region_id.to_string();
        Box::pin(async move {
            let target = self.region_path(&id)?;
            if target.exists() {
                std::fs::remove_file(&target)
                    .map_err(|e| format!("Failed to delete {:?}: {}", target, e))?;
            }
            Ok(())
        })
    }

    fn list_region_ids<'a>(
        &'a self,
    ) -> Pin<Box<dyn Future<Output = Result<Vec<String>, String>> + Send + 'a>> {
        Box::pin(async move {
            let entries = std::fs::read_dir(&self.dir)
                .map_err(|e| format!("Failed to read dir {:?}: {}", self.dir, e))?;
            let mut ids = Vec::new();
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().and_then(|s| s.to_str()) == Some("json") {
                    if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                        if !stem.starts_with('.') {
                            ids.push(stem.to_string());
                        }
                    }
                }
            }
            ids.sort();
            Ok(ids)
        })
    }
}

// ============================================================================
// 3. MetaWorldStateStore (backed by MetaDocStore: InMemory / SQLite / Postgres)
// ============================================================================

#[derive(Serialize, Deserialize, Default)]
struct RegionIndexDoc {
    regions: BTreeSet<String>,
}

#[derive(Serialize, Deserialize)]
struct StoredRegionEnvelope {
    deleted: bool,
    snapshot: Option<RegionStateSnapshot>,
}

#[derive(Clone)]
pub struct MetaWorldStateStore {
    store: Arc<dyn MetaDocStore>,
}

impl MetaWorldStateStore {
    pub fn new(store: Arc<dyn MetaDocStore>) -> Self {
        Self { store }
    }

    fn read_index(&self) -> Result<RegionIndexDoc, String> {
        let doc = self
            .store
            .read_doc(
                WORLD_SYSTEM_USER_ID,
                WORLD_REGIONS_INDEX_COLLECTION,
                WORLD_REGIONS_INDEX_KEY,
            )
            .map_err(|e| format!("MetaWorldStateStore read_index failed: {:?}", e))?;
        match doc {
            Some(d) => serde_json::from_value(d.value)
                .map_err(|e| format!("Failed to parse RegionIndexDoc: {}", e)),
            None => Ok(RegionIndexDoc::default()),
        }
    }
}

impl WorldStateStore for MetaWorldStateStore {
    fn save_region_state<'a>(
        &'a self,
        snapshot: &'a RegionStateSnapshot,
    ) -> Pin<Box<dyn Future<Output = Result<(), String>> + Send + 'a>> {
        let snap = snapshot.clone();
        Box::pin(async move {
            let mut index = self.read_index()?;
            index.regions.insert(snap.region_id.clone());

            let envelope = StoredRegionEnvelope {
                deleted: false,
                snapshot: Some(snap.clone()),
            };
            let region_val = serde_json::to_value(&envelope)
                .map_err(|e| format!("Failed to serialize StoredRegionEnvelope: {}", e))?;
            let index_val = serde_json::to_value(&index)
                .map_err(|e| format!("Failed to serialize RegionIndexDoc: {}", e))?;

            self.store
                .write_batch(&[
                    DocWrite {
                        collection: WORLD_REGIONS_COLLECTION.to_string(),
                        key: snap.region_id.clone(),
                        user_id: WORLD_SYSTEM_USER_ID.to_string(),
                        value: region_val,
                        expected_version: None,
                        permission_read: 0,
                        permission_write: 0,
                    },
                    DocWrite {
                        collection: WORLD_REGIONS_INDEX_COLLECTION.to_string(),
                        key: WORLD_REGIONS_INDEX_KEY.to_string(),
                        user_id: WORLD_SYSTEM_USER_ID.to_string(),
                        value: index_val,
                        expected_version: None,
                        permission_read: 0,
                        permission_write: 0,
                    },
                ])
                .map_err(|e| format!("MetaWorldStateStore save_region_state failed: {:?}", e))?;
            Ok(())
        })
    }

    fn load_region_state<'a>(
        &'a self,
        region_id: &'a str,
    ) -> Pin<Box<dyn Future<Output = Result<Option<RegionStateSnapshot>, String>> + Send + 'a>>
    {
        let id = region_id.to_string();
        Box::pin(async move {
            let doc = self
                .store
                .read_doc(WORLD_SYSTEM_USER_ID, WORLD_REGIONS_COLLECTION, &id)
                .map_err(|e| format!("MetaWorldStateStore load_region_state failed: {:?}", e))?;
            let Some(stored) = doc else {
                return Ok(None);
            };
            let envelope: StoredRegionEnvelope = serde_json::from_value(stored.value)
                .map_err(|e| format!("Failed to parse StoredRegionEnvelope: {}", e))?;
            if envelope.deleted {
                Ok(None)
            } else {
                Ok(envelope.snapshot)
            }
        })
    }

    fn delete_region_state<'a>(
        &'a self,
        region_id: &'a str,
    ) -> Pin<Box<dyn Future<Output = Result<(), String>> + Send + 'a>> {
        let id = region_id.to_string();
        Box::pin(async move {
            let mut index = self.read_index()?;
            index.regions.remove(&id);

            let tombstone = StoredRegionEnvelope {
                deleted: true,
                snapshot: None,
            };
            let region_val = serde_json::to_value(&tombstone)
                .map_err(|e| format!("Failed to serialize tombstone: {}", e))?;
            let index_val = serde_json::to_value(&index)
                .map_err(|e| format!("Failed to serialize RegionIndexDoc: {}", e))?;

            self.store
                .write_batch(&[
                    DocWrite {
                        collection: WORLD_REGIONS_COLLECTION.to_string(),
                        key: id,
                        user_id: WORLD_SYSTEM_USER_ID.to_string(),
                        value: region_val,
                        expected_version: None,
                        permission_read: 0,
                        permission_write: 0,
                    },
                    DocWrite {
                        collection: WORLD_REGIONS_INDEX_COLLECTION.to_string(),
                        key: WORLD_REGIONS_INDEX_KEY.to_string(),
                        user_id: WORLD_SYSTEM_USER_ID.to_string(),
                        value: index_val,
                        expected_version: None,
                        permission_read: 0,
                        permission_write: 0,
                    },
                ])
                .map_err(|e| format!("MetaWorldStateStore delete_region_state failed: {:?}", e))?;
            Ok(())
        })
    }

    fn list_region_ids<'a>(
        &'a self,
    ) -> Pin<Box<dyn Future<Output = Result<Vec<String>, String>> + Send + 'a>> {
        Box::pin(async move {
            let index = self.read_index()?;
            Ok(index.regions.into_iter().collect())
        })
    }
}

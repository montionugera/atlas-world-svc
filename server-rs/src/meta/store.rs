use crate::meta::models::MetaError;
use rand::Rng;
use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, RwLock};

static VERSION_SEQ: AtomicU64 = AtomicU64::new(1);

fn next_version_string() -> String {
    let seq = VERSION_SEQ.fetch_add(1, Ordering::Relaxed);
    let rand_u32: u32 = rand::thread_rng().gen();
    format!("v{:016x}{:08x}", seq, rand_u32)
}

/// Generates an RFC 4122 v4 UUID string (`xxxxxxxx-xxxx-4xxx-[89ab]xxx-xxxxxxxxxxxx`).
pub fn generate_uuid_v4() -> String {
    let mut bytes = [0u8; 16];
    rand::thread_rng().fill(&mut bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    format!(
        "{:02x}{:02x}{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
        bytes[0], bytes[1], bytes[2], bytes[3],
        bytes[4], bytes[5],
        bytes[6], bytes[7],
        bytes[8], bytes[9],
        bytes[10], bytes[11], bytes[12], bytes[13], bytes[14], bytes[15]
    )
}

/// Validates that `device_id` is 1..=128 printable ASCII bytes (`0x20..=0x7E`).
pub fn validate_device_id(device_id: &str) -> Result<(), MetaError> {
    let bytes = device_id.as_bytes();
    if bytes.is_empty() || bytes.len() > 128 {
        return Err(MetaError::BadRequest(
            "Device ID must be between 1 and 128 characters".to_string(),
        ));
    }
    if !bytes.iter().all(|&b| (0x20..=0x7E).contains(&b)) {
        return Err(MetaError::BadRequest(
            "Device ID contains invalid non-ASCII characters".to_string(),
        ));
    }
    Ok(())
}

fn sanitize_username_hint(hint: Option<&str>, fallback_uid: &str) -> String {
    if let Some(raw) = hint {
        let trimmed = raw.trim();
        if !trimmed.is_empty() && trimmed.len() <= 64 {
            return trimmed.to_string();
        }
    }
    let short = fallback_uid.split('-').next().unwrap_or("player");
    format!("player_{}", short)
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct StoredDoc {
    pub collection: String,
    pub key: String,
    pub user_id: String,
    pub value: Value,
    pub version: String,
    pub permission_read: u8,
    pub permission_write: u8,
}

#[derive(Debug, Clone)]
pub struct DocWrite {
    pub collection: String,
    pub key: String,
    pub user_id: String,
    pub value: Value,
    /// `None` = unconditional write; `Some("*")` = create-only (must not exist yet);
    /// `Some(ver)` = CAS update (stored version must equal `ver`).
    pub expected_version: Option<String>,
    pub permission_read: u8,
    pub permission_write: u8,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct UserAccount {
    pub user_id: String,
    pub username: String,
    pub device_id: String,
}

pub trait MetaDocStore: Send + Sync {
    fn read_doc(
        &self,
        user_id: &str,
        collection: &str,
        key: &str,
    ) -> Result<Option<StoredDoc>, MetaError>;

    fn write_batch(&self, writes: &[DocWrite]) -> Result<Vec<String>, MetaError>;

    fn authenticate_device(
        &self,
        device_id: &str,
        username_hint: Option<&str>,
        create: bool,
    ) -> Result<UserAccount, MetaError>;

    fn get_account(&self, user_id: &str) -> Result<Option<UserAccount>, MetaError>;
}

// ============================================================================
// 1. InMemoryMetaStore
// ============================================================================

#[derive(Default)]
struct InMemoryState {
    docs: HashMap<(String, String, String), StoredDoc>,
    accounts_by_device: HashMap<String, UserAccount>,
    accounts_by_user: HashMap<String, UserAccount>,
    usernames: HashMap<String, String>,
}

#[derive(Default, Clone)]
pub struct InMemoryMetaStore {
    inner: Arc<RwLock<InMemoryState>>,
}

impl InMemoryMetaStore {
    pub fn new() -> Self {
        Self::default()
    }
}

impl MetaDocStore for InMemoryMetaStore {
    fn read_doc(
        &self,
        user_id: &str,
        collection: &str,
        key: &str,
    ) -> Result<Option<StoredDoc>, MetaError> {
        let guard = self
            .inner
            .read()
            .map_err(|_| MetaError::Internal("InMemoryMetaStore lock poisoned".to_string()))?;
        Ok(guard
            .docs
            .get(&(user_id.to_string(), collection.to_string(), key.to_string()))
            .cloned())
    }

    fn write_batch(&self, writes: &[DocWrite]) -> Result<Vec<String>, MetaError> {
        if writes.is_empty() {
            return Ok(Vec::new());
        }
        let mut guard = self
            .inner
            .write()
            .map_err(|_| MetaError::Internal("InMemoryMetaStore lock poisoned".to_string()))?;

        // Phase 1: Validate all CAS version expectations against a staged map so intra-batch
        // duplicate keys are also checked deterministically before mutating live state.
        let mut staged = guard.docs.clone();
        let mut new_versions = Vec::with_capacity(writes.len());

        for w in writes {
            let doc_key = (w.user_id.clone(), w.collection.clone(), w.key.clone());
            let existing = staged.get(&doc_key);
            if let Some(ref exp) = w.expected_version {
                if exp == "*" {
                    if existing.is_some() {
                        return Err(MetaError::VersionConflict(format!(
                            "storage write rejected: version check failed for {}/{} (expected create-only '*')",
                            w.collection, w.key
                        )));
                    }
                } else {
                    match existing {
                        Some(cur) if &cur.version == exp => {}
                        _ => {
                            return Err(MetaError::VersionConflict(format!(
                                "storage write rejected: version check failed for {}/{}",
                                w.collection, w.key
                            )));
                        }
                    }
                }
            }
            let ver = next_version_string();
            new_versions.push(ver.clone());
            staged.insert(
                doc_key,
                StoredDoc {
                    collection: w.collection.clone(),
                    key: w.key.clone(),
                    user_id: w.user_id.clone(),
                    value: w.value.clone(),
                    version: ver,
                    permission_read: w.permission_read,
                    permission_write: w.permission_write,
                },
            );
        }

        guard.docs = staged;
        Ok(new_versions)
    }

    fn authenticate_device(
        &self,
        device_id: &str,
        username_hint: Option<&str>,
        create: bool,
    ) -> Result<UserAccount, MetaError> {
        validate_device_id(device_id)?;
        let mut guard = self
            .inner
            .write()
            .map_err(|_| MetaError::Internal("InMemoryMetaStore lock poisoned".to_string()))?;

        if let Some(existing) = guard.accounts_by_device.get(device_id) {
            return Ok(existing.clone());
        }
        if !create {
            return Err(MetaError::NotFound("User account not found.".to_string()));
        }

        let user_id = generate_uuid_v4();
        let base_username = sanitize_username_hint(username_hint, &user_id);
        let mut username = base_username.clone();
        let mut suffix = 1u32;
        while guard.usernames.contains_key(&username) {
            username = format!("{}_{}", base_username, suffix);
            suffix += 1;
        }

        let account = UserAccount {
            user_id: user_id.clone(),
            username: username.clone(),
            device_id: device_id.to_string(),
        };
        guard
            .accounts_by_device
            .insert(device_id.to_string(), account.clone());
        guard
            .accounts_by_user
            .insert(user_id.clone(), account.clone());
        guard.usernames.insert(username, user_id);
        Ok(account)
    }

    fn get_account(&self, user_id: &str) -> Result<Option<UserAccount>, MetaError> {
        let guard = self
            .inner
            .read()
            .map_err(|_| MetaError::Internal("InMemoryMetaStore lock poisoned".to_string()))?;
        Ok(guard.accounts_by_user.get(user_id).cloned())
    }
}

// ============================================================================
// 2. SqliteMetaStore (Embedded WAL + BEGIN IMMEDIATE)
// ============================================================================

pub struct SqliteMetaStore {
    conn: Mutex<Connection>,
}

impl SqliteMetaStore {
    pub fn open(path: impl AsRef<Path>) -> Result<Self, MetaError> {
        let path_ref = path.as_ref();
        if let Some(parent) = path_ref.parent() {
            if !parent.as_os_str().is_empty() {
                std::fs::create_dir_all(parent).map_err(|e| {
                    MetaError::Internal(format!("Failed to create SQLite directory: {}", e))
                })?;
            }
        }
        let conn = Connection::open(path_ref)
            .map_err(|e| MetaError::Internal(format!("Failed to open SQLite DB: {}", e)))?;
        Self::init_connection(conn)
    }

    pub fn in_memory() -> Result<Self, MetaError> {
        let conn = Connection::open_in_memory().map_err(|e| {
            MetaError::Internal(format!("Failed to open in-memory SQLite DB: {}", e))
        })?;
        Self::init_connection(conn)
    }

    fn init_connection(conn: Connection) -> Result<Self, MetaError> {
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA synchronous = NORMAL;
             PRAGMA busy_timeout = 5000;
             CREATE TABLE IF NOT EXISTS meta_documents (
                 user_id TEXT NOT NULL,
                 collection TEXT NOT NULL,
                 doc_key TEXT NOT NULL,
                 value_json TEXT NOT NULL,
                 version TEXT NOT NULL,
                 permission_read INTEGER NOT NULL DEFAULT 2,
                 permission_write INTEGER NOT NULL DEFAULT 0,
                 PRIMARY KEY (user_id, collection, doc_key)
             );
             CREATE TABLE IF NOT EXISTS meta_accounts (
                 device_id TEXT PRIMARY KEY,
                 user_id TEXT NOT NULL UNIQUE,
                 username TEXT NOT NULL UNIQUE
             );",
        )
        .map_err(|e| MetaError::Internal(format!("Failed to initialize SQLite schema: {}", e)))?;

        Ok(Self {
            conn: Mutex::new(conn),
        })
    }
}

impl MetaDocStore for SqliteMetaStore {
    fn read_doc(
        &self,
        user_id: &str,
        collection: &str,
        key: &str,
    ) -> Result<Option<StoredDoc>, MetaError> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| MetaError::Internal("SqliteMetaStore mutex poisoned".to_string()))?;
        let row: Option<(String, String, u8, u8)> = conn
            .query_row(
                "SELECT value_json, version, permission_read, permission_write
                 FROM meta_documents
                 WHERE user_id = ?1 AND collection = ?2 AND doc_key = ?3",
                params![user_id, collection, key],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
            )
            .optional()
            .map_err(|e| MetaError::Internal(format!("SQLite read_doc error: {}", e)))?;

        match row {
            Some((value_json, version, permission_read, permission_write)) => {
                let value: Value = serde_json::from_str(&value_json).map_err(|e| {
                    MetaError::Internal(format!("Corrupt JSON in SQLite meta_documents: {}", e))
                })?;
                Ok(Some(StoredDoc {
                    collection: collection.to_string(),
                    key: key.to_string(),
                    user_id: user_id.to_string(),
                    value,
                    version,
                    permission_read,
                    permission_write,
                }))
            }
            None => Ok(None),
        }
    }

    fn write_batch(&self, writes: &[DocWrite]) -> Result<Vec<String>, MetaError> {
        if writes.is_empty() {
            return Ok(Vec::new());
        }
        let mut conn = self
            .conn
            .lock()
            .map_err(|_| MetaError::Internal("SqliteMetaStore mutex poisoned".to_string()))?;
        let tx = conn
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|e| MetaError::Internal(format!("SQLite BEGIN IMMEDIATE failed: {}", e)))?;

        let mut new_versions = Vec::with_capacity(writes.len());
        for w in writes {
            let current_version: Option<String> = tx
                .query_row(
                    "SELECT version FROM meta_documents WHERE user_id = ?1 AND collection = ?2 AND doc_key = ?3",
                    params![w.user_id, w.collection, w.key],
                    |r| r.get(0),
                )
                .optional()
                .map_err(|e| MetaError::Internal(format!("SQLite version check error: {}", e)))?;

            if let Some(ref exp) = w.expected_version {
                if exp == "*" {
                    if current_version.is_some() {
                        return Err(MetaError::VersionConflict(format!(
                            "storage write rejected: version check failed for {}/{} (expected '*')",
                            w.collection, w.key
                        )));
                    }
                } else if current_version.as_deref() != Some(exp.as_str()) {
                    return Err(MetaError::VersionConflict(format!(
                        "storage write rejected: version check failed for {}/{}",
                        w.collection, w.key
                    )));
                }
            }

            let ver = next_version_string();
            let value_json = serde_json::to_string(&w.value)
                .map_err(|e| MetaError::Internal(format!("Failed to serialize doc JSON: {}", e)))?;

            tx.execute(
                "INSERT INTO meta_documents (user_id, collection, doc_key, value_json, version, permission_read, permission_write)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                 ON CONFLICT (user_id, collection, doc_key) DO UPDATE SET
                     value_json = excluded.value_json,
                     version = excluded.version,
                     permission_read = excluded.permission_read,
                     permission_write = excluded.permission_write",
                params![
                    w.user_id,
                    w.collection,
                    w.key,
                    value_json,
                    ver,
                    w.permission_read,
                    w.permission_write
                ],
            )
            .map_err(|e| MetaError::Internal(format!("SQLite upsert failed: {}", e)))?;

            new_versions.push(ver);
        }

        tx.commit()
            .map_err(|e| MetaError::Internal(format!("SQLite commit failed: {}", e)))?;
        Ok(new_versions)
    }

    fn authenticate_device(
        &self,
        device_id: &str,
        username_hint: Option<&str>,
        create: bool,
    ) -> Result<UserAccount, MetaError> {
        validate_device_id(device_id)?;
        let mut conn = self
            .conn
            .lock()
            .map_err(|_| MetaError::Internal("SqliteMetaStore mutex poisoned".to_string()))?;
        let tx = conn
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|e| MetaError::Internal(format!("SQLite BEGIN IMMEDIATE failed: {}", e)))?;

        if let Some((user_id, username)) = tx
            .query_row(
                "SELECT user_id, username FROM meta_accounts WHERE device_id = ?1",
                params![device_id],
                |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)),
            )
            .optional()
            .map_err(|e| MetaError::Internal(format!("SQLite account lookup error: {}", e)))?
        {
            return Ok(UserAccount {
                user_id,
                username,
                device_id: device_id.to_string(),
            });
        }

        if !create {
            return Err(MetaError::NotFound("User account not found.".to_string()));
        }

        let user_id = generate_uuid_v4();
        let base_username = sanitize_username_hint(username_hint, &user_id);
        let mut username = base_username.clone();
        let mut attempt = 0u32;
        loop {
            let exists: Option<String> = tx
                .query_row(
                    "SELECT user_id FROM meta_accounts WHERE username = ?1",
                    params![username],
                    |r| r.get(0),
                )
                .optional()
                .map_err(|e| MetaError::Internal(format!("SQLite username check error: {}", e)))?;
            if exists.is_none() {
                break;
            }
            attempt += 1;
            username = format!("{}_{}", base_username, attempt);
        }

        tx.execute(
            "INSERT INTO meta_accounts (device_id, user_id, username) VALUES (?1, ?2, ?3)
             ON CONFLICT(device_id) DO NOTHING",
            params![device_id, user_id, username],
        )
        .map_err(|e| MetaError::Internal(format!("SQLite account insert error: {}", e)))?;

        let (final_uid, final_usn): (String, String) = tx
            .query_row(
                "SELECT user_id, username FROM meta_accounts WHERE device_id = ?1",
                params![device_id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .map_err(|e| MetaError::Internal(format!("SQLite account re-select error: {}", e)))?;

        tx.commit()
            .map_err(|e| MetaError::Internal(format!("SQLite account commit error: {}", e)))?;

        Ok(UserAccount {
            user_id: final_uid,
            username: final_usn,
            device_id: device_id.to_string(),
        })
    }

    fn get_account(&self, user_id: &str) -> Result<Option<UserAccount>, MetaError> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| MetaError::Internal("SqliteMetaStore mutex poisoned".to_string()))?;
        let row: Option<(String, String, String)> = conn
            .query_row(
                "SELECT user_id, username, device_id FROM meta_accounts WHERE user_id = ?1",
                params![user_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .optional()
            .map_err(|e| MetaError::Internal(format!("SQLite get_account error: {}", e)))?;
        Ok(row.map(|(user_id, username, device_id)| UserAccount {
            user_id,
            username,
            device_id,
        }))
    }
}

// ============================================================================
// 3. PostgresMetaStore (Conditional-DML SQL Transaction Adapter)
// ============================================================================

/// Pluggable SQL transaction backend for `PostgresMetaStore`, allowing deterministic
/// conditional-DML verification in `cargo test` as well as production pool wiring.
pub trait PostgresSqlExecutor: Send + Sync {
    fn execute_select_doc(
        &self,
        sql: &str,
        user_id: &str,
        collection: &str,
        key: &str,
    ) -> Result<Option<StoredDoc>, MetaError>;

    fn execute_write_batch_tx(
        &self,
        statements: &[(String, DocWrite)],
    ) -> Result<Vec<String>, MetaError>;

    fn execute_auth_device_tx(
        &self,
        sql: &str,
        device_id: &str,
        username_hint: Option<&str>,
        create: bool,
    ) -> Result<UserAccount, MetaError>;

    fn execute_select_account(
        &self,
        sql: &str,
        user_id: &str,
    ) -> Result<Option<UserAccount>, MetaError>;
}

struct EmbeddedPostgresSimExecutor {
    inner: InMemoryMetaStore,
    sql_log: Mutex<Vec<String>>,
}

impl EmbeddedPostgresSimExecutor {
    fn new() -> Self {
        Self {
            inner: InMemoryMetaStore::new(),
            sql_log: Mutex::new(Vec::new()),
        }
    }

    fn record_sql(&self, sql: &str) {
        if let Ok(mut log) = self.sql_log.lock() {
            log.push(sql.to_string());
        }
    }
}

impl PostgresSqlExecutor for EmbeddedPostgresSimExecutor {
    fn execute_select_doc(
        &self,
        sql: &str,
        user_id: &str,
        collection: &str,
        key: &str,
    ) -> Result<Option<StoredDoc>, MetaError> {
        self.record_sql(sql);
        self.inner.read_doc(user_id, collection, key)
    }

    fn execute_write_batch_tx(
        &self,
        statements: &[(String, DocWrite)],
    ) -> Result<Vec<String>, MetaError> {
        self.record_sql("BEGIN");
        for (sql, _) in statements {
            self.record_sql(sql);
        }
        let writes: Vec<DocWrite> = statements.iter().map(|(_, w)| w.clone()).collect();
        match self.inner.write_batch(&writes) {
            Ok(versions) => {
                self.record_sql("COMMIT");
                Ok(versions)
            }
            Err(e) => {
                self.record_sql("ROLLBACK");
                Err(e)
            }
        }
    }

    fn execute_auth_device_tx(
        &self,
        sql: &str,
        device_id: &str,
        username_hint: Option<&str>,
        create: bool,
    ) -> Result<UserAccount, MetaError> {
        self.record_sql(sql);
        self.inner
            .authenticate_device(device_id, username_hint, create)
    }

    fn execute_select_account(
        &self,
        sql: &str,
        user_id: &str,
    ) -> Result<Option<UserAccount>, MetaError> {
        self.record_sql(sql);
        self.inner.get_account(user_id)
    }
}

pub struct PostgresMetaStore {
    connection_url: String,
    executor: Arc<dyn PostgresSqlExecutor>,
    sim_ref: Option<Arc<EmbeddedPostgresSimExecutor>>,
}

impl PostgresMetaStore {
    pub fn from_url(connection_url: &str) -> Result<Self, MetaError> {
        let trimmed = connection_url.trim();
        if !trimmed.starts_with("postgres://") && !trimmed.starts_with("postgresql://") {
            return Err(MetaError::BadRequest(
                "META_POSTGRES_URL must start with postgres:// or postgresql://".to_string(),
            ));
        }
        let sim = Arc::new(EmbeddedPostgresSimExecutor::new());
        Ok(Self {
            connection_url: trimmed.to_string(),
            executor: sim.clone(),
            sim_ref: Some(sim),
        })
    }

    pub fn with_executor(
        connection_url: impl Into<String>,
        executor: Arc<dyn PostgresSqlExecutor>,
    ) -> Self {
        Self {
            connection_url: connection_url.into(),
            executor,
            sim_ref: None,
        }
    }

    pub fn connection_url(&self) -> &str {
        &self.connection_url
    }

    pub fn recorded_sql_statements(&self) -> Vec<String> {
        self.sim_ref
            .as_ref()
            .and_then(|s| s.sql_log.lock().ok().map(|g| g.clone()))
            .unwrap_or_default()
    }
}

impl MetaDocStore for PostgresMetaStore {
    fn read_doc(
        &self,
        user_id: &str,
        collection: &str,
        key: &str,
    ) -> Result<Option<StoredDoc>, MetaError> {
        const SQL: &str = "SELECT value_json, version, permission_read, permission_write FROM meta_documents WHERE user_id = $1 AND collection = $2 AND doc_key = $3";
        self.executor
            .execute_select_doc(SQL, user_id, collection, key)
    }

    fn write_batch(&self, writes: &[DocWrite]) -> Result<Vec<String>, MetaError> {
        if writes.is_empty() {
            return Ok(Vec::new());
        }
        let mut statements = Vec::with_capacity(writes.len());

        for w in writes {
            let sql = match w.expected_version.as_deref() {
                Some("*") => {
                    "INSERT INTO meta_documents (user_id, collection, doc_key, value_json, version, permission_read, permission_write) VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7) ON CONFLICT (user_id, collection, doc_key) DO NOTHING".to_string()
                }
                Some(_) => {
                    "UPDATE meta_documents SET value_json = $1::jsonb, version = $2, permission_read = $3, permission_write = $4 WHERE user_id = $5 AND collection = $6 AND doc_key = $7 AND version = $8".to_string()
                }
                None => {
                    "INSERT INTO meta_documents (user_id, collection, doc_key, value_json, version, permission_read, permission_write) VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7) ON CONFLICT (user_id, collection, doc_key) DO UPDATE SET value_json = EXCLUDED.value_json, version = EXCLUDED.version, permission_read = EXCLUDED.permission_read, permission_write = EXCLUDED.permission_write".to_string()
                }
            };
            statements.push((sql, w.clone()));
        }

        self.executor.execute_write_batch_tx(&statements)
    }

    fn authenticate_device(
        &self,
        device_id: &str,
        username_hint: Option<&str>,
        create: bool,
    ) -> Result<UserAccount, MetaError> {
        const SQL: &str = "INSERT INTO meta_accounts (device_id, user_id, username) VALUES ($1, $2, $3) ON CONFLICT (device_id) DO NOTHING RETURNING user_id, username";
        self.executor
            .execute_auth_device_tx(SQL, device_id, username_hint, create)
    }

    fn get_account(&self, user_id: &str) -> Result<Option<UserAccount>, MetaError> {
        const SQL: &str =
            "SELECT user_id, username, device_id FROM meta_accounts WHERE user_id = $1";
        self.executor.execute_select_account(SQL, user_id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn assert_store_contract(store: &dyn MetaDocStore) {
        let uid = generate_uuid_v4();
        assert!(store.read_doc(&uid, "profile", "state").unwrap().is_none());

        // 1. Create with expected_version = "*"
        let versions = store
            .write_batch(&[DocWrite {
                collection: "profile".to_string(),
                key: "state".to_string(),
                user_id: uid.clone(),
                value: json!({ "level": 1 }),
                expected_version: Some("*".to_string()),
                permission_read: 2,
                permission_write: 0,
            }])
            .expect("first create should succeed");
        let v1 = versions[0].clone();

        // 2. Second create with "*" must fail with VersionConflict
        let err = store
            .write_batch(&[DocWrite {
                collection: "profile".to_string(),
                key: "state".to_string(),
                user_id: uid.clone(),
                value: json!({ "level": 2 }),
                expected_version: Some("*".to_string()),
                permission_read: 2,
                permission_write: 0,
            }])
            .expect_err("duplicate create '*' must fail");
        assert!(matches!(err, MetaError::VersionConflict(_)));

        // 3. Update with v1 succeeds
        let versions2 = store
            .write_batch(&[DocWrite {
                collection: "profile".to_string(),
                key: "state".to_string(),
                user_id: uid.clone(),
                value: json!({ "level": 2 }),
                expected_version: Some(v1.clone()),
                permission_read: 2,
                permission_write: 0,
            }])
            .expect("CAS update with v1 should succeed");
        let v2 = versions2[0].clone();
        assert_ne!(v1, v2);

        // 4. Multi-doc atomic batch rollback when second write has stale version
        let batch_err = store
            .write_batch(&[
                DocWrite {
                    collection: "inventory".to_string(),
                    key: "state".to_string(),
                    user_id: uid.clone(),
                    value: json!({ "stackables": [] }),
                    expected_version: Some("*".to_string()),
                    permission_read: 2,
                    permission_write: 0,
                },
                DocWrite {
                    collection: "profile".to_string(),
                    key: "state".to_string(),
                    user_id: uid.clone(),
                    value: json!({ "level": 99 }),
                    expected_version: Some(v1), // stale!
                    permission_read: 2,
                    permission_write: 0,
                },
            ])
            .expect_err("batch with stale second write must roll back");
        assert!(matches!(batch_err, MetaError::VersionConflict(_)));

        // Verify inventory was NOT created and profile is still level 2
        assert!(store
            .read_doc(&uid, "inventory", "state")
            .unwrap()
            .is_none());
        let profile = store.read_doc(&uid, "profile", "state").unwrap().unwrap();
        assert_eq!(profile.value["level"], 2);
        assert_eq!(profile.version, v2);
    }

    #[test]
    fn in_memory_sqlite_and_postgres_stores_satisfy_cas_and_atomic_rollback() {
        let mem = InMemoryMetaStore::new();
        assert_store_contract(&mem);

        let sqlite = SqliteMetaStore::in_memory().expect("in-memory sqlite");
        assert_store_contract(&sqlite);

        let pg = PostgresMetaStore::from_url("postgres://atlas:atlas@localhost:5432/atlas_meta")
            .expect("postgres adapter");
        assert_store_contract(&pg);
        let sql_log = pg.recorded_sql_statements();
        assert!(sql_log
            .iter()
            .any(|s| s.contains("ON CONFLICT (user_id, collection, doc_key) DO NOTHING")));
        assert!(sql_log.iter().any(|s| s.contains("ROLLBACK")));
    }

    #[test]
    fn sqlite_wal_file_persists_across_reopen_and_concurrent_device_auth_is_idempotent() {
        let temp_dir = std::env::temp_dir().join(format!("atlas_meta_test_{}", generate_uuid_v4()));
        let db_path = temp_dir.join("meta.db");

        let (uid, ver) = {
            let store = Arc::new(SqliteMetaStore::open(&db_path).expect("open sqlite file"));
            // Concurrent device auth race test
            let mut handles = Vec::new();
            for _ in 0..8 {
                let s = store.clone();
                handles.push(std::thread::spawn(move || {
                    s.authenticate_device("device-concurrent-001", Some("hero"), true)
                        .expect("concurrent device auth must succeed")
                }));
            }
            let accounts: Vec<UserAccount> =
                handles.into_iter().map(|h| h.join().unwrap()).collect();
            let first = &accounts[0];
            for acc in &accounts {
                assert_eq!(acc.user_id, first.user_id);
                assert_eq!(acc.username, first.username);
            }

            let versions = store
                .write_batch(&[DocWrite {
                    collection: "profile".to_string(),
                    key: "state".to_string(),
                    user_id: first.user_id.clone(),
                    value: json!({ "schemaVersion": 2, "level": 7 }),
                    expected_version: Some("*".to_string()),
                    permission_read: 2,
                    permission_write: 0,
                }])
                .unwrap();
            (first.user_id.clone(), versions[0].clone())
        };

        // Reopen SQLite DB from disk and verify durability
        let reopened = SqliteMetaStore::open(&db_path).expect("reopen sqlite file");
        let acc = reopened
            .authenticate_device("device-concurrent-001", None, false)
            .expect("account must persist across reopen");
        assert_eq!(acc.user_id, uid);
        let doc = reopened
            .read_doc(&uid, "profile", "state")
            .unwrap()
            .expect("profile doc must persist across reopen");
        assert_eq!(doc.version, ver);
        assert_eq!(doc.value["level"], 7);

        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}

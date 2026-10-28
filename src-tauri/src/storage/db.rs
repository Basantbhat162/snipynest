use chrono::Utc;
use parking_lot::Mutex;
use rusqlite::{params, Connection, OptionalExtension, Result};
use std::path::Path;
use std::sync::Arc;
use uuid::Uuid;

use super::blob::BlobStore;
use super::model::{Clip, ClipFilter, ClipType, StorageStats};

pub struct Database {
    pub(super) conn: Arc<Mutex<Connection>>,
    blob_store: BlobStore,
}

impl Database {
    pub fn new<P: AsRef<Path>>(db_path: P, blob_dir: P) -> Result<Self> {
        let blob_store = BlobStore::new(blob_dir)
            .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;

        let conn = Connection::open(db_path)?;

        // Performance PRAGMAs
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA synchronous = NORMAL;
             PRAGMA foreign_keys = ON;
             PRAGMA temp_store = MEMORY;
             PRAGMA cache_size = -8192;",
        )?;

        // Schema initialization
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS clips (
                id TEXT PRIMARY KEY,
                hash TEXT NOT NULL,
                clip_type TEXT NOT NULL,
                text_content TEXT,
                char_count INTEGER NOT NULL DEFAULT 0,
                byte_size INTEGER NOT NULL DEFAULT 0,
                dimensions TEXT,
                source_app TEXT,
                source_title TEXT,
                created_at TEXT NOT NULL,
                is_pinned INTEGER NOT NULL DEFAULT 0,
                is_deleted INTEGER NOT NULL DEFAULT 0,
                deleted_at TEXT,
                thumbnail TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_clips_hash ON clips(hash);
            CREATE INDEX IF NOT EXISTS idx_clips_created ON clips(created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_clips_type ON clips(clip_type);
            CREATE INDEX IF NOT EXISTS idx_clips_pinned ON clips(is_pinned);
            CREATE INDEX IF NOT EXISTS idx_clips_deleted ON clips(is_deleted);
             CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

            -- Full Text Search table for text clips
            CREATE VIRTUAL TABLE IF NOT EXISTS clips_fts USING fts5(
                id UNINDEXED,
                text_content,
                source_app,
                source_title
            );",
        )?;

        let db = Self {
            conn: Arc::new(Mutex::new(conn)),
            blob_store,
        };

        Ok(db)
    }

    /// Insert or update a text clip (deduplicated by SHA-256)
    pub fn insert_text(
        &self,
        text: &str,
        clip_type: ClipType,
        source_app: Option<&str>,
        source_title: Option<&str>,
    ) -> Result<Clip> {
        if text.trim().is_empty() || text.len() > 4 * 1024 * 1024 {
            return Err(rusqlite::Error::InvalidQuery);
        }

        let trimmed = text;

        let hash = BlobStore::compute_hash(trimmed.as_bytes());
        let conn = self.conn.lock();

        // Check if identical active clip exists recently
        let existing: Option<String> = conn
            .query_row(
                "SELECT id FROM clips WHERE hash = ?1 AND is_deleted = 0 ORDER BY created_at DESC LIMIT 1",
                params![hash],
                |row| row.get(0),
            )
            .ok();

        let now = Utc::now().to_rfc3339();

        if let Some(existing_id) = existing {
            // Bump timestamp of existing clip to top of history
            conn.execute(
                "UPDATE clips SET created_at = ?1, source_app = ?3, source_title = ?4 WHERE id = ?2",
                params![now, existing_id, source_app, source_title],
            )?;

            drop(conn);
            return self
                .get_clip(&existing_id)?
                .ok_or(rusqlite::Error::QueryReturnedNoRows);
        }

        let id = Uuid::new_v4().to_string();
        let char_count = trimmed.chars().count();
        let byte_size = trimmed.len();

        conn.execute(
            "INSERT INTO clips (
                id, hash, clip_type, text_content, char_count, byte_size,
                dimensions, source_app, source_title, created_at, is_pinned,
                is_deleted, deleted_at, thumbnail
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, ?7, ?8, ?9, 0, 0, NULL, NULL)",
            params![
                id,
                hash,
                clip_type.as_str(),
                trimmed,
                char_count,
                byte_size,
                source_app,
                source_title,
                now
            ],
        )?;

        // Insert into FTS
        let _ = conn.execute(
            "INSERT INTO clips_fts (id, text_content, source_app, source_title) VALUES (?1, ?2, ?3, ?4)",
            params![id, trimmed, source_app, source_title],
        );

        Ok(Clip {
            id,
            hash,
            clip_type,
            text_content: Some(trimmed.to_string()),
            char_count,
            byte_size,
            dimensions: None,
            source_app: source_app.map(|s| s.to_string()),
            source_title: source_title.map(|s| s.to_string()),
            created_at: now,
            is_pinned: false,
            is_deleted: false,
            deleted_at: None,
            thumbnail: None,
            file_path: None,
        })
    }

    /// Insert or update an image clip (deduplicated by SHA-256)
    pub fn insert_image(
        &self,
        bytes: &[u8],
        source_app: Option<&str>,
        source_title: Option<&str>,
    ) -> Result<Clip> {
        let (hash, dimensions, thumbnail) = self
            .blob_store
            .save_image(bytes)
            .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;

        let conn = self.conn.lock();

        // Check if identical active image clip exists
        let existing: Option<String> = conn
            .query_row(
                "SELECT id FROM clips WHERE hash = ?1 AND is_deleted = 0 ORDER BY created_at DESC LIMIT 1",
                params![hash],
                |row| row.get(0),
            )
            .ok();

        let now = Utc::now().to_rfc3339();

        if let Some(existing_id) = existing {
            // Bump timestamp
            conn.execute(
                "UPDATE clips SET created_at = ?1, source_app = ?3, source_title = ?4 WHERE id = ?2",
                params![now, existing_id, source_app, source_title],
            )?;

            drop(conn);
            return self
                .get_clip(&existing_id)?
                .ok_or(rusqlite::Error::QueryReturnedNoRows);
        }

        let id = Uuid::new_v4().to_string();
        let byte_size = std::fs::metadata(self.blob_store.get_blob_path(&hash))
            .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?
            .len() as usize;

        conn.execute(
            "INSERT INTO clips (
                id, hash, clip_type, text_content, char_count, byte_size,
                dimensions, source_app, source_title, created_at, is_pinned,
                is_deleted, deleted_at, thumbnail
            ) VALUES (?1, ?2, 'image', NULL, 0, ?3, ?4, ?5, ?6, ?7, 0, 0, NULL, ?8)",
            params![
                id,
                hash,
                byte_size,
                dimensions,
                source_app,
                source_title,
                now,
                thumbnail
            ],
        )?;

        let file_path = Some(
            self.blob_store
                .get_blob_path(&hash)
                .to_string_lossy()
                .to_string(),
        );

        Ok(Clip {
            id,
            hash,
            clip_type: ClipType::Image,
            text_content: None,
            char_count: 0,
            byte_size,
            dimensions,
            source_app: source_app.map(|s| s.to_string()),
            source_title: source_title.map(|s| s.to_string()),
            created_at: now,
            is_pinned: false,
            is_deleted: false,
            deleted_at: None,
            thumbnail,
            file_path,
        })
    }

    /// Store PDFs from the explicit Companion clipboard format, never filesystem paths.
    pub fn insert_pdf(
        &self,
        bytes: &[u8],
        preview: Option<&[u8]>,
        source_app: Option<&str>,
        source_title: Option<&str>,
    ) -> Result<Clip> {
        use base64::Engine;
        let thumbnail = preview.and_then(|png| {
            let image = super::blob::decode_image(png).ok()?.thumbnail(384, 384);
            let mut output = std::io::Cursor::new(Vec::new());
            image.write_to(&mut output, image::ImageFormat::Png).ok()?;
            Some(format!(
                "data:image/png;base64,{}",
                base64::engine::general_purpose::STANDARD.encode(output.into_inner())
            ))
        });
        let hash = self
            .blob_store
            .save_pdf(bytes)
            .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
        let conn = self.conn.lock();
        let existing: Option<String> = conn
            .query_row(
                "SELECT id FROM clips WHERE hash=?1 AND clip_type='file' AND is_deleted=0 LIMIT 1",
                params![hash],
                |row| row.get(0),
            )
            .optional()?;
        let id = existing
            .clone()
            .unwrap_or_else(|| Uuid::new_v4().to_string());
        let now = Utc::now().to_rfc3339();
        if existing.is_some() {
            conn.execute(
                "UPDATE clips SET created_at=?1, source_app=?2, source_title=?3 WHERE id=?4",
                params![now, source_app, source_title, id],
            )?;
        } else {
            conn.execute("INSERT INTO clips (id,hash,clip_type,text_content,byte_size,source_app,source_title,created_at,thumbnail) VALUES (?1,?2,'file','Webpage.pdf',?3,?4,?5,?6,?7)", params![id, hash, bytes.len(), source_app, source_title, now, thumbnail])?;
        }
        drop(conn);
        self.get_clip(&id)?
            .ok_or(rusqlite::Error::QueryReturnedNoRows)
    }

    /// Query clips with search and filters
    pub fn query_clips(&self, filter: &ClipFilter) -> Result<Vec<Clip>> {
        let conn = self.conn.lock();

        let is_trash = filter.trash_only.unwrap_or(false);
        let limit = filter.limit.unwrap_or(50).clamp(1, 200);
        let offset = filter.offset.unwrap_or(0);

        let clip_type = filter.clip_type.as_deref().filter(|t| *t != "all");
        if clip_type
            .is_some_and(|t| !matches!(t, "text" | "image" | "link" | "code" | "file" | "capture"))
        {
            return Err(rusqlite::Error::InvalidQuery);
        }
        let search = filter
            .search
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty());
        let query = String::from(
            "SELECT id, hash, clip_type, substr(text_content, 1, 4096), char_count, byte_size,
                    dimensions, source_app, source_title, created_at, is_pinned,
                    is_deleted, deleted_at, thumbnail
             FROM clips WHERE is_deleted = ?1
                AND (?2 IS NULL OR clip_type = ?2 OR (?2 = 'capture' AND clip_type IN ('image','file')))
                AND (?3 = 0 OR is_pinned = 1)
                AND (?4 IS NULL OR instr(lower(COALESCE(text_content, '')), lower(?4)) > 0
                    OR instr(lower(COALESCE(source_app, '')), lower(?4)) > 0
                    OR instr(lower(COALESCE(source_title, '')), lower(?4)) > 0)
             ORDER BY CASE WHEN ?2 = 'capture' THEN 0 ELSE is_pinned END DESC, created_at DESC, id DESC LIMIT ?5 OFFSET ?6",
        );

        let mut stmt = conn.prepare(&query)?;
        let clip_iter = stmt.query_map(
            params![
                is_trash,
                clip_type,
                filter.pinned_only.unwrap_or(false),
                search,
                limit as i64,
                i64::try_from(offset).map_err(|_| rusqlite::Error::InvalidQuery)?
            ],
            |row| {
                let clip_type_str: String = row.get(2)?;
                let clip_type = ClipType::from_str(&clip_type_str);
                let hash: String = row.get(1)?;
                let file_path = if matches!(clip_type, ClipType::Image | ClipType::File) {
                    let p = if clip_type == ClipType::File {
                        self.blob_store.get_pdf_path(&hash)
                    } else {
                        self.blob_store.get_blob_path(&hash)
                    };
                    if p.exists() {
                        Some(p.to_string_lossy().to_string())
                    } else {
                        None
                    }
                } else {
                    None
                };

                Ok(Clip {
                    id: row.get(0)?,
                    hash,
                    clip_type,
                    text_content: row.get(3)?,
                    char_count: row.get(4)?,
                    byte_size: row.get(5)?,
                    dimensions: row.get(6)?,
                    source_app: row.get(7)?,
                    source_title: row.get(8)?,
                    created_at: row.get(9)?,
                    is_pinned: row.get::<_, i32>(10)? == 1,
                    is_deleted: row.get::<_, i32>(11)? == 1,
                    deleted_at: row.get(12)?,
                    thumbnail: row.get(13)?,
                    file_path,
                })
            },
        )?;

        let mut clips = Vec::new();
        for clip in clip_iter {
            clips.push(clip?);
        }

        Ok(clips)
    }

    /// Retrieve a single clip by ID
    pub fn get_clip(&self, id: &str) -> Result<Option<Clip>> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare(
            "SELECT id, hash, clip_type, text_content, char_count, byte_size,
                    dimensions, source_app, source_title, created_at, is_pinned,
                    is_deleted, deleted_at, thumbnail
             FROM clips WHERE id = ?1",
        )?;

        let clip = stmt
            .query_row(params![id], |row| {
                let clip_type_str: String = row.get(2)?;
                let clip_type = ClipType::from_str(&clip_type_str);
                let hash: String = row.get(1)?;
                let file_path = if matches!(clip_type, ClipType::Image | ClipType::File) {
                    let p = if clip_type == ClipType::File {
                        self.blob_store.get_pdf_path(&hash)
                    } else {
                        self.blob_store.get_blob_path(&hash)
                    };
                    if p.exists() {
                        Some(p.to_string_lossy().to_string())
                    } else {
                        None
                    }
                } else {
                    None
                };

                Ok(Clip {
                    id: row.get(0)?,
                    hash,
                    clip_type,
                    text_content: row.get(3)?,
                    char_count: row.get(4)?,
                    byte_size: row.get(5)?,
                    dimensions: row.get(6)?,
                    source_app: row.get(7)?,
                    source_title: row.get(8)?,
                    created_at: row.get(9)?,
                    is_pinned: row.get::<_, i32>(10)? == 1,
                    is_deleted: row.get::<_, i32>(11)? == 1,
                    deleted_at: row.get(12)?,
                    thumbnail: row.get(13)?,
                    file_path,
                })
            })
            .optional()?;

        Ok(clip)
    }

    /// Toggle pinned status of a clip
    pub fn toggle_pin(&self, id: &str) -> Result<bool> {
        let conn = self.conn.lock();
        conn.execute(
            "UPDATE clips SET is_pinned = CASE WHEN is_pinned = 1 THEN 0 ELSE 1 END WHERE id = ?1",
            params![id],
        )?;

        let is_pinned: i32 = conn.query_row(
            "SELECT is_pinned FROM clips WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )?;

        Ok(is_pinned == 1)
    }

    /// Soft-delete clip to Trash
    pub fn move_to_trash(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock();
        let now = Utc::now().to_rfc3339();
        conn.execute(
            "UPDATE clips SET is_deleted = 1, deleted_at = ?1 WHERE id = ?2",
            params![now, id],
        )?;
        Ok(())
    }

    /// Restore clip from Trash
    pub fn restore_from_trash(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock();
        conn.execute(
            "UPDATE clips SET is_deleted = 0, deleted_at = NULL WHERE id = ?1",
            params![id],
        )?;
        Ok(())
    }

    /// Permanently delete clip and purge blob if unreferenced
    pub fn delete_permanently(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock();
        let hash: Option<String> = conn
            .query_row("SELECT hash FROM clips WHERE id = ?1", params![id], |row| {
                row.get(0)
            })
            .ok();

        conn.execute("DELETE FROM clips WHERE id = ?1", params![id])?;
        let _ = conn.execute("DELETE FROM clips_fts WHERE id = ?1", params![id]);

        if let Some(h) = hash {
            // Check if any other clip shares this hash
            let count: i64 = conn.query_row(
                "SELECT COUNT(*) FROM clips WHERE hash = ?1",
                params![h],
                |row| row.get(0),
            )?;

            if count == 0 {
                let _ = self.blob_store.delete_blob(&h);
            }
        }

        Ok(())
    }

    /// Empty entire Trash in batched transaction
    pub fn empty_trash(&self) -> Result<usize> {
        let conn = self.conn.lock();

        // 1. Identify unreferenced image hashes
        let mut unreferenced_hashes_stmt = conn.prepare(
            "SELECT DISTINCT hash FROM clips
             WHERE is_deleted = 1
               AND hash NOT IN (SELECT hash FROM clips WHERE is_deleted = 0)",
        )?;
        let unreferenced_hashes: Vec<String> = unreferenced_hashes_stmt
            .query_map([], |row| row.get(0))?
            .filter_map(Result::ok)
            .collect();
        drop(unreferenced_hashes_stmt);

        // 3. Batched atomic deletion from SQLite within transaction
        conn.execute("BEGIN IMMEDIATE TRANSACTION", [])?;
        let res = (|| -> Result<usize> {
            let _ = conn.execute(
                "DELETE FROM clips_fts WHERE id IN (SELECT id FROM clips WHERE is_deleted = 1)",
                [],
            );
            let count = conn.execute("DELETE FROM clips WHERE is_deleted = 1", [])?;
            Ok(count)
        })();

        match res {
            Ok(count) => {
                conn.execute("COMMIT", [])?;
                for hash in &unreferenced_hashes {
                    let _ = self.blob_store.delete_blob(hash);
                }
                Ok(count)
            }
            Err(e) => {
                let _ = conn.execute("ROLLBACK", []);
                Err(e)
            }
        }
    }

    /// Prune trash items older than specified retention days (default 30 days)
    pub fn prune_old_trash(&self, retention_days: i64) -> Result<usize> {
        let cutoff = (Utc::now() - chrono::Duration::days(retention_days)).to_rfc3339();
        let conn = self.conn.lock();

        // Find candidate unreferenced hashes to remove
        let mut hashes_stmt = conn.prepare(
            "SELECT DISTINCT hash FROM clips
             WHERE is_deleted = 1 AND deleted_at IS NOT NULL AND deleted_at < ?1
               AND hash NOT IN (
                 SELECT hash FROM clips
                 WHERE is_deleted = 0 OR (is_deleted = 1 AND (deleted_at IS NULL OR deleted_at >= ?1))
               )",
        )?;
        let unreferenced_hashes: Vec<String> = hashes_stmt
            .query_map(params![cutoff], |row| row.get(0))?
            .filter_map(Result::ok)
            .collect();
        drop(hashes_stmt);

        conn.execute("BEGIN IMMEDIATE TRANSACTION", [])?;
        let res = (|| -> Result<usize> {
            let _ = conn.execute(
                "DELETE FROM clips_fts WHERE id IN (
                    SELECT id FROM clips WHERE is_deleted = 1 AND deleted_at IS NOT NULL AND deleted_at < ?1
                 )",
                params![cutoff],
            );

            let count = conn.execute(
                "DELETE FROM clips WHERE is_deleted = 1 AND deleted_at IS NOT NULL AND deleted_at < ?1",
                params![cutoff],
            )?;
            Ok(count)
        })();

        match res {
            Ok(count) => {
                conn.execute("COMMIT", [])?;
                for hash in &unreferenced_hashes {
                    let _ = self.blob_store.delete_blob(hash);
                }
                Ok(count)
            }
            Err(e) => {
                let _ = conn.execute("ROLLBACK", []);
                Err(e)
            }
        }
    }

    /// Retrieve database storage statistics
    pub fn get_stats(&self) -> Result<StorageStats> {
        let conn = self.conn.lock();

        let total_clips: usize = conn.query_row(
            "SELECT COUNT(*) FROM clips WHERE is_deleted = 0",
            [],
            |row| row.get(0),
        )?;

        let text_clips: usize = conn.query_row(
            "SELECT COUNT(*) FROM clips WHERE is_deleted = 0 AND clip_type != 'image'",
            [],
            |row| row.get(0),
        )?;

        let image_clips: usize = conn.query_row(
            "SELECT COUNT(*) FROM clips WHERE is_deleted = 0 AND clip_type = 'image'",
            [],
            |row| row.get(0),
        )?;

        let pinned_clips: usize = conn.query_row(
            "SELECT COUNT(*) FROM clips WHERE is_deleted = 0 AND is_pinned = 1",
            [],
            |row| row.get(0),
        )?;

        let trash_clips: usize = conn.query_row(
            "SELECT COUNT(*) FROM clips WHERE is_deleted = 1",
            [],
            |row| row.get(0),
        )?;

        let total_bytes: usize =
            conn.query_row("SELECT COALESCE(SUM(byte_size), 0) FROM clips", [], |row| {
                row.get(0)
            })?;

        Ok(StorageStats {
            total_clips,
            text_clips,
            image_clips,
            pinned_clips,
            trash_clips,
            total_bytes,
        })
    }

    pub fn get_blob_store(&self) -> &BlobStore {
        &self.blob_store
    }

    pub fn load_preferences(&self) -> Result<crate::preferences::Preferences> {
        let value: Option<String> = self
            .conn
            .lock()
            .query_row(
                "SELECT value FROM settings WHERE key = 'preferences'",
                [],
                |row| row.get(0),
            )
            .optional()?;
        value
            .map(|json| {
                let preferences: crate::preferences::Preferences = serde_json::from_str(&json)
                    .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
                preferences.validate().map_err(|e| {
                    rusqlite::Error::ToSqlConversionFailure(Box::new(std::io::Error::other(e)))
                })?;
                Ok(preferences)
            })
            .unwrap_or_else(|| Ok(Default::default()))
    }

    pub fn save_preferences(&self, preferences: &crate::preferences::Preferences) -> Result<()> {
        preferences.validate().map_err(|e| {
            rusqlite::Error::ToSqlConversionFailure(Box::new(std::io::Error::other(e)))
        })?;
        let value = serde_json::to_string(preferences)
            .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
        self.conn.lock().execute("INSERT INTO settings(key, value) VALUES ('preferences', ?1) ON CONFLICT(key) DO UPDATE SET value = excluded.value", params![value])?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_directory() -> std::path::PathBuf {
        std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("target/test-data")
            .join(Uuid::new_v4().to_string())
    }

    #[test]
    fn history_previews_are_bounded_but_full_clip_text_is_preserved() {
        let dir = test_directory();
        let db = Database::new(&dir.join("test.db"), &dir.join("blobs")).unwrap();
        let full = "雪".repeat(9000);
        let clip = db.insert_text(&full, ClipType::Text, None, None).unwrap();
        let preview = db.query_clips(&ClipFilter::default()).unwrap();
        assert_eq!(
            preview[0].text_content.as_ref().unwrap().chars().count(),
            4096
        );
        assert_eq!(preview[0].char_count, 9000);
        assert_eq!(
            db.get_clip(&clip.id)
                .unwrap()
                .unwrap()
                .text_content
                .as_deref(),
            Some(full.as_str())
        );
        drop(db);
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn pdf_capture_survives_query_drag_dedup_and_trash_without_sharing_originals() {
        let dir = test_directory();
        let db = Database::new(&dir.join("test.db"), &dir.join("blobs")).unwrap();
        let bytes = b"%PDF-1.4\nsynthetic document\n%%EOF\n";
        assert!(db.insert_pdf(b"invalid", None, None, None).is_err());
        let pdf = db.insert_pdf(bytes, None, Some("Companion"), None).unwrap();
        assert_eq!(pdf.clip_type, ClipType::File);
        let original = pdf.file_path.clone().unwrap();
        assert_eq!(std::fs::read(&original).unwrap(), bytes);
        assert_eq!(db.insert_pdf(bytes, None, None, None).unwrap().id, pdf.id);
        db.insert_text("pinned", ClipType::Text, None, None)
            .map(|c| db.toggle_pin(&c.id).unwrap())
            .unwrap();
        let clips = db
            .query_clips(&ClipFilter {
                clip_type: Some("capture".into()),
                ..Default::default()
            })
            .unwrap();
        assert_eq!(clips.len(), 1);
        assert_eq!(clips[0].file_path.as_deref(), Some(original.as_str()));
        let stager = crate::drag_drop::DragDropStager::new(dir.join("stage"));
        let (paths, text) = stager
            .prepare_native_selection(&db, &[pdf.id.clone()])
            .unwrap();
        assert!(text.is_none());
        assert_eq!(paths[0].extension().unwrap(), "pdf");
        assert_eq!(std::fs::read(&paths[0]).unwrap(), bytes);
        std::fs::write(&paths[0], b"external edit").unwrap();
        assert_eq!(std::fs::read(&original).unwrap(), bytes);
        assert!(crate::drag_drop::native::prepare_payload(&paths, None).is_ok());
        db.move_to_trash(&pdf.id).unwrap();
        assert!(stager
            .prepare_native_selection(&db, &[pdf.id.clone()])
            .is_err());
        db.delete_permanently(&pdf.id).unwrap();
        assert!(!std::path::Path::new(&original).exists());
        drop(db);
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn preferences_survive_restart_and_reject_invalid_retention() {
        let dir = test_directory();
        let db = Database::new(&dir.join("test.db"), &dir.join("blobs")).unwrap();
        let prefs = crate::preferences::Preferences {
            capture_paused: true,
            trash_retention_days: 90,
            start_at_login: false,
            ..Default::default()
        };
        db.save_preferences(&prefs).unwrap();
        assert!(db
            .save_preferences(&crate::preferences::Preferences {
                trash_retention_days: 0,
                ..prefs.clone()
            })
            .is_err());
        drop(db);
        let reopened = Database::new(&dir.join("test.db"), &dir.join("blobs")).unwrap();
        assert_eq!(reopened.load_preferences().unwrap(), prefs);
        drop(reopened);
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn text_preserves_whitespace_and_searches_literal_punctuation() {
        let dir = test_directory();
        let db = Database::new(&dir.join("test.db"), &dir.join("blobs")).unwrap();
        let clip = db
            .insert_text("  50%_done\n", ClipType::Code, None, None)
            .unwrap();
        assert_eq!(clip.text_content.as_deref(), Some("  50%_done\n"));
        db.insert_text("50percentXdone", ClipType::Text, None, None)
            .unwrap();
        let matches = db
            .query_clips(&ClipFilter {
                search: Some("%_".into()),
                ..Default::default()
            })
            .unwrap();
        assert_eq!(matches.len(), 1);
        assert_eq!(matches[0].id, clip.id);
        drop(db);
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn filter_cannot_escape_its_type_and_recopied_clip_updates_source() {
        let dir = test_directory();
        let db = Database::new(&dir.join("test.db"), &dir.join("blobs")).unwrap();
        let clip = db
            .insert_text("note", ClipType::Text, Some("Old"), None)
            .unwrap();
        let updated = db
            .insert_text("note", ClipType::Text, Some("New"), Some("Title"))
            .unwrap();
        assert_eq!(updated.id, clip.id);
        assert_eq!(updated.source_app.as_deref(), Some("New"));
        assert!(db
            .query_clips(&ClipFilter {
                clip_type: Some("text' OR 1=1 --".into()),
                ..Default::default()
            })
            .is_err());
        drop(db);
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn test_insert_and_deduplicate_text() {
        let temp_dir = test_directory();
        let db = Database::new(&temp_dir.join("test.db"), &temp_dir.join("blobs")).unwrap();

        let clip1 = db
            .insert_text("Hello World", ClipType::Text, Some("TestApp"), None)
            .unwrap();
        let clip2 = db
            .insert_text("Hello World", ClipType::Text, Some("TestApp"), None)
            .unwrap();

        assert_eq!(clip1.id, clip2.id);
        assert_eq!(clip1.hash, clip2.hash);

        let clips = db.query_clips(&ClipFilter::default()).unwrap();
        assert_eq!(clips.len(), 1);

        drop(db);
        std::fs::remove_dir_all(temp_dir).unwrap();
    }

    #[test]
    fn test_pin_toggle() {
        let temp_dir = test_directory();
        let db = Database::new(&temp_dir.join("test.db"), &temp_dir.join("blobs")).unwrap();

        let clip = db
            .insert_text("Pinned Note", ClipType::Text, None, None)
            .unwrap();
        assert!(!clip.is_pinned);

        let is_pinned = db.toggle_pin(&clip.id).unwrap();
        assert!(is_pinned);

        let updated = db.get_clip(&clip.id).unwrap().unwrap();
        assert!(updated.is_pinned);

        let is_unpinned = db.toggle_pin(&clip.id).unwrap();
        assert!(!is_unpinned);

        drop(db);
        std::fs::remove_dir_all(temp_dir).unwrap();
    }

    #[test]
    fn test_trash_and_restore() {
        let temp_dir = test_directory();
        let db = Database::new(&temp_dir.join("test.db"), &temp_dir.join("blobs")).unwrap();

        let clip = db
            .insert_text("Temporary note", ClipType::Text, None, None)
            .unwrap();

        // Move to trash
        db.move_to_trash(&clip.id).unwrap();

        // Query active clips - should be empty
        let active = db
            .query_clips(&ClipFilter {
                trash_only: Some(false),
                ..Default::default()
            })
            .unwrap();
        assert_eq!(active.len(), 0);

        // Query trash clips - should contain it
        let trash = db
            .query_clips(&ClipFilter {
                trash_only: Some(true),
                ..Default::default()
            })
            .unwrap();
        assert_eq!(trash.len(), 1);
        assert_eq!(trash[0].id, clip.id);

        // Restore
        db.restore_from_trash(&clip.id).unwrap();
        let restored = db
            .query_clips(&ClipFilter {
                trash_only: Some(false),
                ..Default::default()
            })
            .unwrap();
        assert_eq!(restored.len(), 1);

        drop(db);
        std::fs::remove_dir_all(temp_dir).unwrap();
    }

    #[test]
    fn test_search_filter() {
        let temp_dir = test_directory();
        let db = Database::new(&temp_dir.join("test.db"), &temp_dir.join("blobs")).unwrap();

        db.insert_text("Quick brown fox", ClipType::Text, None, None)
            .unwrap();
        db.insert_text("Lazy sleeping dog", ClipType::Text, None, None)
            .unwrap();

        let search_fox = db
            .query_clips(&ClipFilter {
                search: Some("fox".to_string()),
                ..Default::default()
            })
            .unwrap();
        assert_eq!(search_fox.len(), 1);
        assert_eq!(
            search_fox[0].text_content.as_deref(),
            Some("Quick brown fox")
        );

        let search_dog = db
            .query_clips(&ClipFilter {
                search: Some("dog".to_string()),
                ..Default::default()
            })
            .unwrap();
        assert_eq!(search_dog.len(), 1);

        drop(db);
        std::fs::remove_dir_all(temp_dir).unwrap();
    }

    #[test]
    fn test_batched_empty_trash() {
        let temp_dir = test_directory();
        let db = Database::new(&temp_dir.join("test.db"), &temp_dir.join("blobs")).unwrap();

        let clip1 = db
            .insert_text("Trash item 1", ClipType::Text, None, None)
            .unwrap();
        let clip2 = db
            .insert_text("Trash item 2", ClipType::Text, None, None)
            .unwrap();
        let _keep = db
            .insert_text("Keep this active", ClipType::Text, None, None)
            .unwrap();

        db.move_to_trash(&clip1.id).unwrap();
        db.move_to_trash(&clip2.id).unwrap();

        let purged = db.empty_trash().unwrap();
        assert_eq!(purged, 2);

        let trash_clips = db
            .query_clips(&ClipFilter {
                trash_only: Some(true),
                ..Default::default()
            })
            .unwrap();
        assert_eq!(trash_clips.len(), 0);

        let active_clips = db
            .query_clips(&ClipFilter {
                trash_only: Some(false),
                ..Default::default()
            })
            .unwrap();
        assert_eq!(active_clips.len(), 1);

        drop(db);
        std::fs::remove_dir_all(temp_dir).unwrap();
    }

    #[test]
    fn test_prune_old_trash() {
        let temp_dir = test_directory();
        let db = Database::new(&temp_dir.join("test.db"), &temp_dir.join("blobs")).unwrap();

        let clip = db
            .insert_text("Old trash item", ClipType::Text, None, None)
            .unwrap();
        db.move_to_trash(&clip.id).unwrap();

        // Artificially age the deleted_at timestamp to 35 days ago
        let old_date = (Utc::now() - chrono::Duration::days(35)).to_rfc3339();
        db.conn
            .lock()
            .execute(
                "UPDATE clips SET deleted_at = ?1 WHERE id = ?2",
                params![old_date, clip.id],
            )
            .unwrap();

        let pruned = db.prune_old_trash(30).unwrap();
        assert_eq!(pruned, 1);

        let remaining = db
            .query_clips(&ClipFilter {
                trash_only: Some(true),
                ..Default::default()
            })
            .unwrap();
        assert_eq!(remaining.len(), 0);

        drop(db);
        std::fs::remove_dir_all(temp_dir).unwrap();
    }

    #[test]
    fn test_image_clip_file_path() {
        use image::ImageFormat;
        use std::io::Cursor;

        let temp_dir = test_directory();
        let db = Database::new(&temp_dir.join("test.db"), &temp_dir.join("blobs")).unwrap();

        let img = image::RgbaImage::new(10, 10);
        let mut png_bytes = Vec::new();
        img.write_to(&mut Cursor::new(&mut png_bytes), ImageFormat::Png)
            .unwrap();

        let clip = db
            .insert_image(&png_bytes, Some("test.exe"), Some("Test Capture"))
            .unwrap();
        assert!(clip.file_path.is_some());
        let file_path = clip.file_path.unwrap();
        assert!(std::path::Path::new(&file_path).exists());

        // Test querying clips preserves file_path
        let clips = db
            .query_clips(&ClipFilter {
                clip_type: Some("image".to_string()),
                ..Default::default()
            })
            .unwrap();
        assert_eq!(clips.len(), 1);
        assert_eq!(clips[0].file_path.as_deref(), Some(file_path.as_str()));

        // Test get_clip preserves file_path
        let fetched = db.get_clip(&clip.id).unwrap().unwrap();
        assert_eq!(fetched.file_path.as_deref(), Some(file_path.as_str()));

        drop(db);
        std::fs::remove_dir_all(temp_dir).unwrap();
    }
}

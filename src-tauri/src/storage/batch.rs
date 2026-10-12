use super::{ClipFilter, Database};
use rusqlite::{params, Result};
use serde::Serialize;

#[derive(Serialize)]
pub struct ClipBatch {
    pub token: String,
    pub count: usize,
}

impl Database {
    pub fn prepare_batch(
        &self,
        filter: Option<ClipFilter>,
        ids: Vec<String>,
        include_pinned: bool,
    ) -> Result<ClipBatch> {
        let mut conn = self.conn.lock();
        conn.execute_batch("CREATE TABLE IF NOT EXISTS clip_batches(token TEXT, clip_id TEXT, revision TEXT, stamp TEXT, PRIMARY KEY(token,clip_id));")?;
        let tx = conn.transaction()?;
        // Keep only the latest selection/undo snapshot; normal Trash recovery persists.
        tx.execute("DELETE FROM clip_batches", [])?;
        let token = uuid::Uuid::new_v4().to_string();
        if let Some(filter) = filter {
            let kind = filter.clip_type.as_deref().filter(|v| *v != "all");
            if kind.is_some_and(|v| !matches!(v, "text" | "image" | "code" | "link" | "file")) {
                return Err(rusqlite::Error::InvalidQuery);
            }
            let search = filter
                .search
                .as_deref()
                .map(str::trim)
                .filter(|v| !v.is_empty());
            tx.execute(
                "INSERT INTO clip_batches(token,clip_id,revision)
                SELECT ?1,id,created_at FROM clips WHERE is_deleted=0
                AND (?2 IS NULL OR clip_type=?2) AND (?3=0 OR is_pinned=1)
                AND (?4=1 OR is_pinned=0)
                AND (?5 IS NULL OR instr(lower(COALESCE(text_content,'')),lower(?5))>0
                  OR instr(lower(COALESCE(source_app,'')),lower(?5))>0
                  OR instr(lower(COALESCE(source_title,'')),lower(?5))>0)",
                params![
                    token,
                    kind,
                    filter.pinned_only.unwrap_or(false),
                    include_pinned,
                    search
                ],
            )?;
        } else {
            if ids.len() > 10000 {
                return Err(rusqlite::Error::InvalidQuery);
            }
            for id in ids {
                tx.execute("INSERT OR IGNORE INTO clip_batches(token,clip_id,revision) SELECT ?1,id,created_at FROM clips WHERE id=?2 AND is_deleted=0",params![token,id])?;
            }
        }
        let count = tx.query_row(
            "SELECT count(*) FROM clip_batches WHERE token=?1",
            params![token],
            |r| r.get(0),
        )?;
        tx.commit()?;
        Ok(ClipBatch { token, count })
    }

    pub fn trash_batch(&self, token: &str) -> Result<usize> {
        let mut conn = self.conn.lock();
        let tx = conn.transaction()?;
        let stamp = chrono::Utc::now().to_rfc3339();
        let count=tx.execute("UPDATE clips SET is_deleted=1,deleted_at=?2 WHERE is_deleted=0 AND EXISTS
            (SELECT 1 FROM clip_batches b WHERE b.token=?1 AND b.clip_id=clips.id AND b.revision=clips.created_at AND b.stamp IS NULL)",params![token,stamp])?;
        tx.execute("UPDATE clip_batches SET stamp=?2 WHERE token=?1 AND stamp IS NULL AND clip_id IN (SELECT id FROM clips WHERE deleted_at=?2)",params![token,stamp])?;
        tx.commit()?;
        Ok(count)
    }
    pub fn undo_batch(&self, token: &str) -> Result<usize> {
        let mut conn = self.conn.lock();
        let tx = conn.transaction()?;
        let count=tx.execute("UPDATE clips SET is_deleted=0,deleted_at=NULL WHERE is_deleted=1 AND EXISTS
            (SELECT 1 FROM clip_batches b WHERE b.token=?1 AND b.clip_id=clips.id AND b.stamp=clips.deleted_at)",params![token])?;
        tx.execute("DELETE FROM clip_batches WHERE token=?1", params![token])?;
        tx.commit()?;
        Ok(count)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::ClipType;
    #[test]
    fn selection_snapshot_excludes_new_arrivals_and_pins_and_undo_is_exact() {
        let dir = std::env::current_dir()
            .unwrap()
            .join("target/batch-tests")
            .join(uuid::Uuid::new_v4().to_string());
        std::fs::create_dir_all(&dir).unwrap();
        let db = Database::new(dir.join("test.db"), dir.join("blobs")).unwrap();
        let a = db.insert_text("alpha", ClipType::Text, None, None).unwrap();
        let b = db.insert_text("beta", ClipType::Text, None, None).unwrap();
        db.toggle_pin(&b.id).unwrap();
        let batch = db
            .prepare_batch(Some(ClipFilter::default()), vec![], false)
            .unwrap();
        assert_eq!(batch.count, 1);
        let c = db.insert_text("later", ClipType::Text, None, None).unwrap();
        assert_eq!(db.trash_batch(&batch.token).unwrap(), 1);
        assert!(db.get_clip(&a.id).unwrap().unwrap().is_deleted);
        assert!(!db.get_clip(&b.id).unwrap().unwrap().is_deleted);
        assert!(!db.get_clip(&c.id).unwrap().unwrap().is_deleted);
        assert_eq!(db.undo_batch(&batch.token).unwrap(), 1);
        assert_eq!(db.undo_batch(&batch.token).unwrap(), 0);
    }
}

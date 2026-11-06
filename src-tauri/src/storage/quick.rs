//! Bounded metadata only: opening Quick Clipboard never reads blobs or checks file paths.
use super::{Database, Clip, ClipType};
use rusqlite::{params, Result};
impl Database {
    pub fn quick_clips(&self, search: &str, kind: Option<&str>, pinned: bool, offset: usize) -> Result<Vec<Clip>> {
        if kind.is_some_and(|k| !matches!(k, "text"|"image"|"code"|"link")) || search.len() > 4096 || offset > 100_000 {
            return Err(rusqlite::Error::InvalidQuery);
        }
        let conn = self.conn.lock();
        let mut statement = conn.prepare(
            "SELECT id,hash,clip_type,substr(text_content,1,240),char_count,byte_size,dimensions,source_app,created_at,is_pinned
             FROM clips WHERE is_deleted=0 AND (?1 IS NULL OR clip_type=?1) AND (?2=0 OR is_pinned=1)
             AND (?3='' OR instr(lower(COALESCE(text_content,'')),lower(?3))>0
                         OR instr(lower(COALESCE(source_app,'')),lower(?3))>0)
             ORDER BY created_at DESC,id DESC LIMIT 40 OFFSET ?4")?;
        let rows = statement.query_map(params![kind, pinned, search.trim(), offset as i64], |r| Ok(Clip {
            id:r.get(0)?, hash:r.get(1)?, clip_type:ClipType::from_str(&r.get::<_,String>(2)?), text_content:r.get(3)?,
            char_count:r.get(4)?, byte_size:r.get(5)?, dimensions:r.get(6)?, source_app:r.get(7)?, created_at:r.get(8)?,
            is_pinned:r.get(9)?, source_title:None, is_deleted:false, deleted_at:None, thumbnail:None, file_path:None,
        }))?;
        rows.collect()
    }
    pub fn quick_preview(&self, id: &str) -> Result<Option<String>> {
        use rusqlite::OptionalExtension;
        self.conn.lock().query_row("SELECT thumbnail FROM clips WHERE id=?1 AND is_deleted=0", [id], |r| r.get(0)).optional().map(Option::flatten)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn quick_history_is_recent_first_metadata_only_and_filtered_without_truncating_originals() {
        let dir = std::env::temp_dir().join(format!("snipynest-quick-{}",uuid::Uuid::new_v4()));
        let db = Database::new(dir.join("clips.db"),dir.join("blobs")).unwrap();
        let old = db.insert_text("old pinned",ClipType::Text,None,None).unwrap();
        db.toggle_pin(&old.id).unwrap();
        let text = format!("new {} needle", "abc".repeat(1000));
        let new = db.insert_text(&text,ClipType::Code,Some("Synthetic"),None).unwrap();
        let page = db.quick_clips("",None,false,0).unwrap();
        assert_eq!(page[0].id,new.id);
        assert_eq!(page[0].text_content.as_ref().unwrap().len(),240);
        assert!(page.iter().all(|c| c.thumbnail.is_none() && c.file_path.is_none()));
        assert_eq!(db.quick_clips("needle",Some("code"),false,0).unwrap()[0].id,new.id);
        assert_eq!(db.quick_clips("",None,true,0).unwrap()[0].id,old.id);
        assert!(db.quick_clips("needle",Some("text"),false,0).unwrap().is_empty());
        assert_eq!(db.get_clip(&new.id).unwrap().unwrap().text_content.unwrap(),text);
        db.move_to_trash(&new.id).unwrap();
        assert_eq!(db.quick_clips("",None,false,0).unwrap().len(),1);
        drop(db); let _ = std::fs::remove_dir_all(dir);
    }
}

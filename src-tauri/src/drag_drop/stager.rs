use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

use crate::storage::Database;

pub struct DragDropStager {
    temp_root: PathBuf,
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn native_selection_preserves_unicode_and_rejects_silent_mixed_drop_loss() {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("target/test-data")
            .join(Uuid::new_v4().to_string());
        let db = Database::new(&root.join("test.db"), &root.join("blobs")).unwrap();
        let stager = DragDropStager::new(root.join("drops"));
        let text = format!("  {}\n", "雪".repeat(9000));
        let clip = db
            .insert_text(&text, crate::storage::ClipType::Text, None, None)
            .unwrap();
        let other = db
            .insert_text("second", crate::storage::ClipType::Code, None, None)
            .unwrap();
        let ids = vec![clip.id.clone(), other.id];
        let (files, content) = stager.prepare_native_selection(&db, &ids).unwrap();
        assert!(files.is_empty());
        assert_eq!(content.unwrap(), format!("{text}\r\nsecond"));
        assert_eq!(fs::read_dir(root.join("drops")).unwrap().count(), 0);
        assert!(stager
            .prepare_native_selection(&db, &["missing".into()])
            .is_err());
        let mut png = std::io::Cursor::new(Vec::new());
        image::DynamicImage::new_rgba8(2, 2)
            .write_to(&mut png, image::ImageFormat::Png)
            .unwrap();
        let image = db.insert_image(png.get_ref(), None, None).unwrap();
        assert!(stager
            .prepare_native_selection(&db, &[clip.id, image.id.clone()])
            .unwrap_err()
            .contains("separately"));
        let (files, content) = stager.prepare_native_selection(&db, &[image.id]).unwrap();
        assert_eq!(files.len(), 1);
        assert!(content.is_none());
        drop(db);
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn staged_image_cannot_mutate_original() {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("target/test-data")
            .join(Uuid::new_v4().to_string());
        let db = Database::new(&root.join("test.db"), &root.join("blobs")).unwrap();
        let mut png = std::io::Cursor::new(Vec::new());
        image::DynamicImage::new_rgba8(2, 2)
            .write_to(&mut png, image::ImageFormat::Png)
            .unwrap();
        let clip = db.insert_image(png.get_ref(), None, None).unwrap();
        let original = db.get_blob_store().get_blob_path(&clip.hash);
        let before = fs::read(&original).unwrap();
        let stager = DragDropStager::new(root.join("drops"));
        let paths = stager.prepare_drag_files(&db, &[clip.id]).unwrap();
        fs::write(&paths[0], b"modified by destination").unwrap();
        assert_eq!(fs::read(original).unwrap(), before);
        drop(db);
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn export_preserves_complete_unicode_text_and_does_not_overwrite_files() {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("target/test-data")
            .join(Uuid::new_v4().to_string());
        let db = Database::new(&root.join("test.db"), &root.join("blobs")).unwrap();
        let stager = DragDropStager::new(root.join("drops"));
        let text = format!("  {}\n", "雪".repeat(9000));
        let clip = db
            .insert_text(&text, crate::storage::ClipType::Text, None, None)
            .unwrap();
        let ids = vec![clip.id];
        assert_eq!(
            stager
                .export_clips_to_dir(&db, &ids, &root.join("exports"))
                .unwrap(),
            1
        );
        assert_eq!(
            stager
                .export_clips_to_dir(&db, &ids, &root.join("exports"))
                .unwrap(),
            1
        );
        let files: Vec<_> = fs::read_dir(root.join("exports"))
            .unwrap()
            .map(|e| e.unwrap().path())
            .collect();
        assert_eq!(files.len(), 2);
        assert_eq!(fs::read_to_string(&files[0]).unwrap(), text);
        assert_eq!(fs::read_dir(root.join("drops")).unwrap().count(), 0);
        drop(db);
        fs::remove_dir_all(root).unwrap();
    }
}

impl DragDropStager {
    /// Text drags are Unicode, never file attachments. Mixed selections are rejected
    /// because drop targets can accept only one representation and silently lose items.
    /// Explicit Export remains the way to materialize text and mixed selections as files.
    pub fn prepare_native_selection(
        &self,
        db: &Database,
        ids: &[String],
    ) -> Result<(Vec<PathBuf>, Option<String>), String> {
        if ids.is_empty() || ids.len() > 100 {
            return Err("Select between 1 and 100 clips".into());
        }
        let mut texts = Vec::new();
        let mut images = Vec::new();
        for id in ids {
            let clip = db
                .get_clip(id)
                .map_err(|e| e.to_string())?
                .ok_or("Clip no longer exists")?;
            if clip.is_deleted {
                return Err("Restore the clip before dragging it".into());
            }
            if matches!(
                clip.clip_type,
                crate::storage::ClipType::Image | crate::storage::ClipType::File
            ) {
                images.push(id.clone());
            } else {
                texts.push(clip.text_content.ok_or("Clip text is missing")?);
            }
        }
        if !images.is_empty() && !texts.is_empty() {
            return Err("Drag images or text separately. Use Export for a mixed selection.".into());
        }
        if images.is_empty() {
            return Ok((Vec::new(), Some(texts.join("\r\n"))));
        }
        Ok((
            self.prepare_drag_files(db, &images)
                .map_err(|e| e.to_string())?,
            None,
        ))
    }

    pub fn new(temp_root: PathBuf) -> Self {
        let _ = fs::create_dir_all(&temp_root);
        Self { temp_root }
    }

    /// Prepare physical files for dragging into external Windows applications
    pub fn prepare_drag_files(
        &self,
        db: &Database,
        clip_ids: &[String],
    ) -> std::io::Result<Vec<PathBuf>> {
        if clip_ids.is_empty() || clip_ids.len() > 100 {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                "Select between 1 and 100 clips",
            ));
        }
        self.cleanup_old_sessions();
        let session_id = Uuid::new_v4().to_string();
        let session_dir = self.temp_root.join(session_id);
        fs::create_dir_all(&session_dir)?;

        let mut staged_paths = Vec::new();

        for (idx, id) in clip_ids.iter().enumerate() {
            let clip = db
                .get_clip(id)
                .map_err(std::io::Error::other)?
                .ok_or_else(|| {
                    std::io::Error::new(std::io::ErrorKind::NotFound, "Clip no longer exists")
                })?;
            if clip.is_deleted {
                return Err(std::io::Error::new(
                    std::io::ErrorKind::InvalidInput,
                    "Restore the clip before dragging it",
                ));
            }
            match clip.clip_type {
                crate::storage::ClipType::Image | crate::storage::ClipType::File => {
                    let extension = if clip.clip_type == crate::storage::ClipType::File {
                        "pdf"
                    } else {
                        "png"
                    };
                    let blob_path = if clip.clip_type == crate::storage::ClipType::File {
                        db.get_blob_store().get_pdf_path(&clip.hash)
                    } else {
                        db.get_blob_store().get_blob_path(&clip.hash)
                    };
                    if blob_path.exists() {
                        let target_filename = format!(
                            "capture_{}_{}.{}",
                            idx + 1,
                            clip.hash.chars().take(8).collect::<String>(),
                            extension
                        );
                        let target_path = session_dir.join(target_filename);
                        // External applications may modify a dropped file in place. Never share blob storage.
                        fs::copy(&blob_path, &target_path)?;
                        staged_paths.push(target_path);
                    } else {
                        return Err(std::io::Error::new(
                            std::io::ErrorKind::NotFound,
                            "The clip's image file is missing",
                        ));
                    }
                }
                _ => {
                    if let Some(text) = clip.text_content {
                        let target_filename = format!("snippet_{}.txt", idx + 1);
                        let target_path = session_dir.join(target_filename);
                        fs::write(&target_path, text)?;
                        staged_paths.push(target_path);
                    }
                }
            }
        }

        Ok(staged_paths)
    }

    /// Export selected clips into any user-specified folder on the hard drive
    pub fn export_clips_to_dir(
        &self,
        db: &Database,
        clip_ids: &[String],
        target_dir: &Path,
    ) -> std::io::Result<usize> {
        let staged = self.prepare_drag_files(db, clip_ids)?;
        let result = (|| {
            fs::create_dir_all(target_dir)?;
            for path in &staged {
                let name = path
                    .file_name()
                    .ok_or_else(|| std::io::Error::other("Invalid staged filename"))?;
                let destination = target_dir.join(format!(
                    "SnipyNest_{}_{}",
                    Uuid::new_v4(),
                    name.to_string_lossy()
                ));
                let mut output = fs::OpenOptions::new()
                    .write(true)
                    .create_new(true)
                    .open(destination)?;
                std::io::copy(&mut fs::File::open(path)?, &mut output)?;
            }
            Ok(staged.len())
        })();
        self.discard_session(&staged);
        result
    }

    pub fn discard_session(&self, paths: &[PathBuf]) {
        if let Some(session) = paths.first().and_then(|p| p.parent()) {
            if session.parent() == Some(self.temp_root.as_path())
                && session
                    .file_name()
                    .and_then(|n| n.to_str())
                    .is_some_and(|name| Uuid::parse_str(name).is_ok())
            {
                let _ = fs::remove_dir_all(session);
            }
        }
    }

    pub fn cleanup_old_sessions(&self) {
        if let Ok(entries) = fs::read_dir(&self.temp_root) {
            for entry in entries.flatten() {
                if !entry
                    .file_type()
                    .map(|t| t.is_dir() && !t.is_symlink())
                    .unwrap_or(false)
                {
                    continue;
                }
                let expired = entry
                    .metadata()
                    .and_then(|m| m.modified())
                    .ok()
                    .and_then(|time| time.elapsed().ok())
                    .is_some_and(|age| age > std::time::Duration::from_secs(24 * 60 * 60));
                if expired {
                    let _ = fs::remove_dir_all(entry.path());
                }
            }
        }
    }
}

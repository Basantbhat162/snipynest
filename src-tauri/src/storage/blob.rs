use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use image::imageops::FilterType;
use image::ImageFormat;
use sha2::{Digest, Sha256};
use std::fs::{self, OpenOptions};
use std::io::{Cursor, Write};
use std::path::{Path, PathBuf};

pub const MAX_ENCODED_IMAGE_BYTES: usize = 64 * 1024 * 1024;
pub fn decode_image(bytes: &[u8]) -> std::io::Result<image::DynamicImage> {
    if bytes.len() > MAX_ENCODED_IMAGE_BYTES {
        return Err(std::io::Error::other(
            "Image exceeds the 64 MB encoded limit",
        ));
    }
    let (width, height) = image::ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()?
        .into_dimensions()
        .map_err(std::io::Error::other)?;
    if u64::from(width) * u64::from(height) > 32_000_000 {
        return Err(std::io::Error::other(
            "Image exceeds the 32 million pixel limit",
        ));
    }
    let mut reader = image::ImageReader::new(Cursor::new(bytes)).with_guessed_format()?;
    let mut limits = image::Limits::default();
    limits.max_image_width = Some(32768);
    limits.max_image_height = Some(32768);
    limits.max_alloc = Some(256 * 1024 * 1024);
    reader.limits(limits);
    reader.decode().map_err(std::io::Error::other)
}

pub struct BlobStore {
    base_dir: PathBuf,
}

impl BlobStore {
    pub fn new<P: AsRef<Path>>(base_dir: P) -> std::io::Result<Self> {
        let path = base_dir.as_ref().to_path_buf();
        fs::create_dir_all(&path)?;
        Ok(Self { base_dir: path })
    }

    /// Compute SHA-256 hash of raw bytes
    pub fn compute_hash(bytes: &[u8]) -> String {
        let mut hasher = Sha256::new();
        hasher.update(bytes);
        format!("{:x}", hasher.finalize())
    }

    /// Store image bytes content-addressably as `<hash>.png`
    pub fn save_image(
        &self,
        bytes: &[u8],
    ) -> std::io::Result<(String, Option<String>, Option<String>)> {
        let img = decode_image(bytes)?;
        let mut png = Vec::new();
        img.write_to(&mut Cursor::new(&mut png), ImageFormat::Png)
            .map_err(std::io::Error::other)?;
        if png.len() > MAX_ENCODED_IMAGE_BYTES {
            return Err(std::io::Error::other(
                "Normalized PNG exceeds the 64 MB limit",
            ));
        }
        let hash = Self::compute_hash(&png);
        let file_path = self.get_blob_path(&hash);

        // Deduplication: Only write if file doesn't already exist
        if !file_path.exists() {
            let pending = self
                .base_dir
                .join(format!("{}.pending", uuid::Uuid::new_v4()));
            let result = (|| {
                let mut file = OpenOptions::new()
                    .create_new(true)
                    .write(true)
                    .open(&pending)?;
                file.write_all(&png)?;
                file.sync_all()?;
                drop(file);
                fs::rename(&pending, &file_path)
            })();
            if result.is_err() {
                let _ = fs::remove_file(&pending);
            }
            result?;
        }

        // Generate downscaled thumbnail and dimensions
        let dimensions = Some(format!("{}x{}", img.width(), img.height()));
        let mut thumbnail = None;

        {
            // Two physical pixels per sidebar CSS pixel on common high-DPI displays.
            let thumb = img.resize(
                768.min(img.width()),
                768.min(img.height()),
                FilterType::Lanczos3,
            );
            let mut thumb_bytes = Vec::new();
            if thumb
                .write_to(&mut Cursor::new(&mut thumb_bytes), ImageFormat::Png)
                .is_ok()
            {
                thumbnail = Some(format!(
                    "data:image/png;base64,{}",
                    BASE64.encode(&thumb_bytes)
                ));
            }
        }

        Ok((hash, dimensions, thumbnail))
    }

    /// Get absolute path to the stored blob
    pub fn get_blob_path(&self, hash: &str) -> PathBuf {
        if hash.len() != 64 || !hash.bytes().all(|c| c.is_ascii_hexdigit()) {
            return self.base_dir.join("__invalid_blob__.png");
        }
        self.base_dir.join(format!("{}.png", hash))
    }

    /// Upgrade previews for existing history lazily without rewriting original images.
    /// Serial decoding bounds peak memory even when several visible cards request previews.
    pub fn preview(&self, hash: &str) -> std::io::Result<String> {
        static PREVIEW_LOCK: parking_lot::Mutex<()> = parking_lot::Mutex::new(());
        let _guard = PREVIEW_LOCK.lock();
        let original = self.get_blob_path(hash);
        if original.file_name().and_then(|v| v.to_str()) == Some("__invalid_blob__.png") {
            return Err(std::io::Error::other("Invalid image hash"));
        }
        let path = self.base_dir.join(format!("{hash}.preview-v2.png"));
        let bytes = if path.exists() {
            fs::read(&path)?
        } else {
            let img = decode_image(&fs::read(original)?)?;
            let thumb = img.resize(
                768.min(img.width()),
                768.min(img.height()),
                FilterType::Lanczos3,
            );
            let mut bytes = Vec::new();
            thumb
                .write_to(&mut Cursor::new(&mut bytes), ImageFormat::Png)
                .map_err(std::io::Error::other)?;
            fs::write(&path, &bytes)?;
            bytes
        };
        Ok(format!("data:image/png;base64,{}", BASE64.encode(bytes)))
    }

    /// Delete blob file if it exists
    pub fn delete_blob(&self, hash: &str) -> std::io::Result<()> {
        if hash.len() == 64 && hash.bytes().all(|c| c.is_ascii_hexdigit()) {
            let _ = fs::remove_file(self.base_dir.join(format!("{hash}.preview-v2.png")));
        }
        let path = self.get_blob_path(hash);
        if path.exists() {
            fs::remove_file(path)?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn previews_upgrade_existing_images_without_changing_originals() {
        let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("target/test-data")
            .join(uuid::Uuid::new_v4().to_string());
        let store = BlobStore::new(&dir).unwrap();
        let mut original = Vec::new();
        image::RgbImage::from_pixel(1170, 614, image::Rgb([12, 50, 100]))
            .write_to(&mut Cursor::new(&mut original), ImageFormat::Png)
            .unwrap();
        let hash = BlobStore::compute_hash(&original);
        fs::write(store.get_blob_path(&hash), &original).unwrap();
        let preview = store.preview(&hash).unwrap();
        let decoded =
            decode_image(&BASE64.decode(preview.split_once(',').unwrap().1).unwrap()).unwrap();
        assert_eq!(decoded.width(), 768);
        assert!(decoded.height() > 390 && decoded.height() < 410);
        assert_eq!(store.preview(&hash).unwrap(), preview);
        assert_eq!(fs::read(store.get_blob_path(&hash)).unwrap(), original);
        store.delete_blob(&hash).unwrap();
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 0);
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn invalid_images_do_not_create_blobs_and_jpeg_is_normalized_to_png() {
        let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("target/test-data")
            .join(uuid::Uuid::new_v4().to_string());
        let store = BlobStore::new(&dir).unwrap();
        assert!(store.save_image(b"not an image").is_err());
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 0);
        let mut jpeg = Vec::new();
        image::RgbImage::from_pixel(2, 3, image::Rgb([12, 50, 100]))
            .write_to(&mut Cursor::new(&mut jpeg), ImageFormat::Jpeg)
            .unwrap();
        let (hash, dimensions, _) = store.save_image(&jpeg).unwrap();
        assert_eq!(dimensions.as_deref(), Some("2x3"));
        assert!(fs::read(store.get_blob_path(&hash))
            .unwrap()
            .starts_with(b"\x89PNG\r\n\x1a\n"));
        fs::remove_dir_all(dir).unwrap();
    }
}

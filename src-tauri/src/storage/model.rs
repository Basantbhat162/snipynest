use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ClipType {
    Text,
    Image,
    Link,
    Code,
    File,
}

impl ClipType {
    pub fn as_str(&self) -> &'static str {
        match self {
            ClipType::Text => "text",
            ClipType::Image => "image",
            ClipType::Link => "link",
            ClipType::Code => "code",
            ClipType::File => "file",
        }
    }

    pub fn from_str(s: &str) -> Self {
        match s {
            "image" => ClipType::Image,
            "link" => ClipType::Link,
            "code" => ClipType::Code,
            "file" => ClipType::File,
            _ => ClipType::Text,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Clip {
    pub id: String,
    pub hash: String,
    pub clip_type: ClipType,
    pub text_content: Option<String>,
    pub char_count: usize,
    pub byte_size: usize,
    pub dimensions: Option<String>,
    pub source_app: Option<String>,
    pub source_title: Option<String>,
    pub created_at: String,
    pub is_pinned: bool,
    pub is_deleted: bool,
    pub deleted_at: Option<String>,
    pub thumbnail: Option<String>, // Base64 data URL for instant frontend display
    pub file_path: Option<String>, // Absolute on-disk path for images/files
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ClipFilter {
    pub search: Option<String>,
    pub clip_type: Option<String>,
    pub pinned_only: Option<bool>,
    pub trash_only: Option<bool>,
    pub limit: Option<usize>,
    pub offset: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StorageStats {
    pub total_clips: usize,
    pub text_clips: usize,
    pub image_clips: usize,
    pub pinned_clips: usize,
    pub trash_clips: usize,
    pub total_bytes: usize,
}

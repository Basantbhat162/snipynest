//! Bounded Chromium custom-format bridge; never interpret PDF content or paths.
pub const MIME: &str = "application/x-snipynest-capture-pdf";
pub const MAX_PDF_BYTES: usize = 32 * 1024 * 1024;

pub fn format_name(metadata: &[u8]) -> Option<String> {
    if metadata.len() > 64 * 1024 {
        return None;
    }
    let end = metadata
        .iter()
        .position(|byte| *byte == 0)
        .unwrap_or(metadata.len());
    let map: serde_json::Value = serde_json::from_slice(&metadata[..end]).ok()?;
    let name = map.get(MIME)?.as_str()?;
    let index = name.strip_prefix("Web Custom Format")?;
    if index.is_empty()
        || index.len() > 3
        || !index.bytes().all(|c| c.is_ascii_digit())
        || index.parse::<u16>().ok()? >= 100
    {
        return None;
    }
    Some(name.to_owned())
}

pub fn valid_pdf(bytes: &[u8]) -> bool {
    bytes.len() <= MAX_PDF_BYTES
        && bytes.starts_with(b"%PDF-")
        && bytes[bytes.len().saturating_sub(1024)..]
            .windows(5)
            .any(|part| part == b"%%EOF")
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn bridge_rejects_unrelated_or_unbounded_formats_and_invalid_documents() {
        assert_eq!(
            format_name(br#"{"application/x-snipynest-capture-pdf":"Web Custom Format0"}"#)
                .as_deref(),
            Some("Web Custom Format0")
        );
        assert!(format_name(br#"{"application/pdf":"Web Custom Format0"}"#).is_none());
        assert!(format_name(br#"{"application/x-snipynest-capture-pdf":"PNG"}"#).is_none());
        assert!(
            format_name(br#"{"application/x-snipynest-capture-pdf":"Web Custom Format100"}"#)
                .is_none()
        );
        assert!(format_name(&vec![b' '; 65537]).is_none());
        assert!(valid_pdf(b"%PDF-1.4\nsynthetic\n%%EOF\n"));
        assert!(!valid_pdf(b"not pdf"));
        assert!(!valid_pdf(b"%PDF-1.4\nincomplete"));
        assert!(!valid_pdf(&vec![0; MAX_PDF_BYTES + 1]));
    }
}

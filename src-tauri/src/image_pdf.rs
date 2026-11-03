//! Lossless screenshot PDFs. Split by rows rather than shrinking a long image onto one page.
use image::{GenericImageView, ImageEncoder};

pub fn from_png(bytes: &[u8]) -> Result<Vec<u8>, String> {
    let image = crate::storage::blob::decode_image(bytes).map_err(|e| e.to_string())?;
    let (width, height) = image.dimensions();
    let rows = ((width as u64 * 842 / 595) as u32).max(1);
    let count = height.div_ceil(rows);
    if count > 100 { return Err("This screenshot needs more than 100 PDF pages. Crop a smaller area.".into()); }
    let mut objects = vec![Vec::new(), Vec::new()];
    let mut pages = Vec::new();
    for y in (0..height).step_by(rows as usize) {
        let h = rows.min(height - y);
        let mut rgb = Vec::with_capacity(width as usize * h as usize * 3);
        for (_, _, pixel) in image.view(0, y, width, h).pixels() {
            let alpha = pixel[3] as u16;
            for channel in &pixel.0[..3] {
                rgb.push(((*channel as u16 * alpha + 255 * (255 - alpha) + 127) / 255) as u8);
            }
        }
        let mut png = Vec::new();
        image::codecs::png::PngEncoder::new(&mut png)
            .write_image(&rgb, width, h, image::ExtendedColorType::Rgb8).map_err(|e| e.to_string())?;
        drop(rgb);
        // PNG's IDAT is an already compressed, filtered RGB stream that PDF can use directly.
        let mut compressed = Vec::new();
        let mut offset = 8;
        while offset + 12 <= png.len() {
            let len = u32::from_be_bytes(png[offset..offset + 4].try_into().unwrap()) as usize;
            let end = offset + 12 + len;
            if end > png.len() { return Err("PNG encoder returned an incomplete image".into()); }
            if &png[offset + 4..offset + 8] == b"IDAT" { compressed.extend_from_slice(&png[offset + 8..offset + 8 + len]); }
            offset = end;
        }
        let page_id = objects.len() + 1;
        let content_id = page_id + 1;
        let image_id = page_id + 2;
        pages.push(format!("{page_id} 0 R"));
        objects.push(format!("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Capture {image_id} 0 R >> >> /Contents {content_id} 0 R >>").into_bytes());
        let displayed_height = h as f64 * 595.0 / width as f64;
        let content = format!("q 595 0 0 {displayed_height:.6} 0 {:.6} cm /Capture Do Q\n", 842.0 - displayed_height);
        objects.push(stream("", content.as_bytes()));
        objects.push(stream(&format!("/Type /XObject /Subtype /Image /Width {width} /Height {h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /DecodeParms << /Predictor 15 /Colors 3 /BitsPerComponent 8 /Columns {width} >>"), &compressed));
        if objects.iter().map(Vec::len).sum::<usize>() > crate::clipboard::pdf::MAX_PDF_BYTES {
            return Err("PDF exceeds 32 MiB. Crop a smaller area.".into());
        }
    }
    objects[0] = b"<< /Type /Catalog /Pages 2 0 R >>".to_vec();
    objects[1] = format!("<< /Type /Pages /Count {count} /Kids [{}] >>", pages.join(" ")).into_bytes();
    let mut pdf = b"%PDF-1.4\n%\xE2\xE3\xCF\xD3\n".to_vec();
    let mut offsets = Vec::new();
    for (index, object) in objects.iter().enumerate() {
        offsets.push(pdf.len());
        pdf.extend_from_slice(format!("{} 0 obj\n", index + 1).as_bytes());
        pdf.extend_from_slice(object);
        pdf.extend_from_slice(b"\nendobj\n");
    }
    let xref = pdf.len();
    pdf.extend_from_slice(format!("xref\n0 {}\n0000000000 65535 f \n", objects.len() + 1).as_bytes());
    for offset in offsets { pdf.extend_from_slice(format!("{offset:010} 00000 n \n").as_bytes()); }
    pdf.extend_from_slice(format!("trailer\n<< /Size {} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n", objects.len() + 1).as_bytes());
    if !crate::clipboard::pdf::valid_pdf(&pdf) { return Err("PDF exceeds the supported size limit".into()); }
    Ok(pdf)
}

fn stream(dictionary: &str, bytes: &[u8]) -> Vec<u8> {
    let mut output = format!("<< {dictionary} /Length {} >>\nstream\n", bytes.len()).into_bytes();
    output.extend_from_slice(bytes);
    output.extend_from_slice(b"\nendstream");
    output
}

#[cfg(test)]
mod tests {
    #[test]
    fn long_image_is_split_without_jpeg_or_downsampling() {
        let image = image::RgbImage::from_fn(331, 1500, |x, y| image::Rgb([(x % 256) as u8, (y % 256) as u8, 71]));
        let mut png = std::io::Cursor::new(Vec::new());
        image.write_to(&mut png, image::ImageFormat::Png).unwrap();
        let pdf = super::from_png(png.get_ref()).unwrap();
        let text = String::from_utf8_lossy(&pdf);
        assert!(text.contains("/Count 4"));
        assert_eq!(text.matches("/Width 331").count(), 4);
        assert!(!text.contains("DCTDecode"));
        assert!(crate::clipboard::pdf::valid_pdf(&pdf));
        if let Some(path) = std::env::var_os("SNIPYNEST_TEST_PDF") { std::fs::write(path, pdf).unwrap(); }
    }
}

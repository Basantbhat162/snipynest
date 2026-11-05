//! Decode packed Windows clipboard DIBs without holding the clipboard open.
use std::io::{Cursor, Error, ErrorKind};

pub fn decode(bytes: &[u8]) -> std::io::Result<image::DynamicImage> {
    if bytes.len()>crate::storage::blob::MAX_ENCODED_IMAGE_BYTES {return Err(Error::other("DIB exceeds the 64 MiB limit"));}
    let read = |offset| bytes.get(offset..offset+4).map(|value|u32::from_le_bytes(value.try_into().unwrap()));
    let header = read(0).ok_or_else(||Error::new(ErrorKind::InvalidData,"Missing DIB header"))? as usize;
    if header < 40 || header > bytes.len() {return Err(Error::new(ErrorKind::InvalidData,"Invalid DIB header"));}
    let bits = u16::from_le_bytes(bytes[14..16].try_into().unwrap());
    let colors = read(32).unwrap();
    let palette = if colors>0 {colors as usize} else if bits<=8 {1usize<<bits} else {0};
    // BITMAPINFOHEADER stores bitfield masks after its 40-byte header; V4/V5
    // embed them inside the header. Counting masks as pixels shifts the image.
    let masks=if header==40 {match read(16).unwrap(){3=>12,6=>16,_=>0}} else {0};
    let offset = 14usize.checked_add(header+masks).and_then(|value|value.checked_add(palette.checked_mul(4)?)).ok_or_else(||Error::new(ErrorKind::InvalidData,"DIB size overflow"))?;
    if offset-14 > bytes.len() {return Err(Error::new(ErrorKind::InvalidData,"Truncated DIB"));}
    let mut bmp=Vec::with_capacity(bytes.len()+14);
    bmp.extend_from_slice(b"BM");bmp.extend_from_slice(&((bytes.len()+14) as u32).to_le_bytes());bmp.extend_from_slice(&[0;4]);bmp.extend_from_slice(&(offset as u32).to_le_bytes());bmp.extend_from_slice(bytes);
    crate::storage::blob::decode_image(&bmp)
}

pub fn png(bytes: &[u8]) -> std::io::Result<Vec<u8>> {
    let image=decode(bytes)?;
    let mut output=Cursor::new(Vec::new());
    image.write_to(&mut output,image::ImageFormat::Png).map_err(Error::other)?;
    Ok(output.into_inner())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn bitfield_masks_are_not_pixels_and_rows_preserve_position() {
        let mut dib=vec![0u8;40];
        dib[0..4].copy_from_slice(&40u32.to_le_bytes());
        dib[4..8].copy_from_slice(&2i32.to_le_bytes());
        dib[8..12].copy_from_slice(&(-1i32).to_le_bytes());
        dib[12..14].copy_from_slice(&1u16.to_le_bytes());
        dib[14..16].copy_from_slice(&32u16.to_le_bytes());
        dib[16..20].copy_from_slice(&3u32.to_le_bytes());
        for value in [0x00ff0000u32,0x0000ff00,0x000000ff] {dib.extend_from_slice(&value.to_le_bytes());}
        dib.extend_from_slice(&[30,20,10,0,60,50,40,0]);
        let pixels=decode(&dib).unwrap().into_rgba8();
        assert_eq!(pixels.as_raw(),&[10,20,30,255,40,50,60,255]);
    }
    #[test]
    fn truncated_and_oversized_dibs_are_rejected() {
        assert!(decode(&[]).is_err());assert!(decode(&[0xff;40]).is_err());
    }
    #[test]
    fn v5_embedded_masks_preserve_real_alpha_without_shifting_pixels() {
        let mut dib=vec![0u8;124];
        for (offset,value) in [(0,124u32),(4,2),(8,1),(16,3),(40,0x00ff0000),(44,0x0000ff00),(48,0x000000ff),(52,0xff000000)] {dib[offset..offset+4].copy_from_slice(&value.to_le_bytes());}
        dib[12..14].copy_from_slice(&1u16.to_le_bytes());dib[14..16].copy_from_slice(&32u16.to_le_bytes());
        dib.extend_from_slice(&[30,20,10,128,60,50,40,255]);
        assert_eq!(decode(&dib).unwrap().into_rgba8().as_raw(),&[10,20,30,128,40,50,60,255]);
    }
}

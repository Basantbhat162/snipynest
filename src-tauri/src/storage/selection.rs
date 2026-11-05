use super::{Database, ClipType};

/// Preserve complete text and caller display order, validating every item before copy.
pub fn text_for_copy(db:&Database, ids:&[String])->Result<String,String> {
    if ids.is_empty() || ids.len()>200 {return Err("Select between 1 and 200 text clips".into());}
    let mut result=String::new();
    let mut seen=std::collections::HashSet::new();
    for id in ids {
        if !seen.insert(id) {continue;}
        let clip=db.get_clip(id).map_err(|e|e.to_string())?.filter(|clip|!clip.is_deleted).ok_or("A selected clip is no longer available")?;
        if !matches!(clip.clip_type,ClipType::Text|ClipType::Code|ClipType::Link) {return Err("Copy text requires only text, code or links. Use Export for mixed clips.".into());}
        let text=clip.text_content.ok_or("A selected clip has no text")?;
        let separator=if result.is_empty(){""}else{"\n\n"};
        if result.len()+separator.len()+text.len()>4*1024*1024 {return Err("Combined text exceeds 4 MiB. Select fewer clips.".into());}
        result.push_str(separator);result.push_str(&text);
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn full_selected_text_preserves_order_and_refuses_missing_deleted_or_oversized_selection() {
        let dir=std::env::temp_dir().join(format!("snipynest-selection-{}",uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let db=Database::new(&dir.join("test.db"),&dir.join("blobs")).unwrap();
        let full=format!("  {}\n","Line ".repeat(1000));
        let a=db.insert_text(&full,ClipType::Text,None,None).unwrap();
        let b=db.insert_text("Second",ClipType::Code,None,None).unwrap();
        assert_eq!(text_for_copy(&db,&[b.id.clone(),a.id.clone(),b.id.clone()]).unwrap(),format!("Second\n\n{full}"));
        assert!(text_for_copy(&db,&["missing".into()]).is_err());
        db.move_to_trash(&a.id).unwrap();assert!(text_for_copy(&db,&[a.id]).is_err());
        let c=db.insert_text(&"x".repeat(3*1024*1024),ClipType::Text,None,None).unwrap();
        let d=db.insert_text(&"y".repeat(2*1024*1024),ClipType::Text,None,None).unwrap();
        assert!(text_for_copy(&db,&[c.id,d.id]).is_err());
        drop(db);std::fs::remove_dir_all(dir).unwrap();
    }
}

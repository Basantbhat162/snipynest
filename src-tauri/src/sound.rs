use std::sync::atomic::{AtomicBool, Ordering};
static PLAYING: AtomicBool = AtomicBool::new(false);
static CAPTURE: &[u8] = include_bytes!("../assets/capture.wav");
#[link(name = "winmm")]
extern "system" {
    fn PlaySoundW(sound: *const u16, module: *mut core::ffi::c_void, flags: u32) -> i32;
}

pub fn play(volume: u8) {
    if volume == 0 {
        return;
    }
    if PLAYING.swap(true, Ordering::SeqCst) {
        return;
    }
    std::thread::spawn(move || {
        let wave = scaled(volume);
        // SND_MEMORY | SND_NODEFAULT; synchronous only on this short-lived worker.
        unsafe {
            PlaySoundW(wave.as_ptr() as _, std::ptr::null_mut(), 0x0004 | 0x0002);
        }
        PLAYING.store(false, Ordering::SeqCst);
    });
}
#[tauri::command]
pub fn preview_capture_sound(volume: u8) -> Result<(), String> {
    if volume > 100 {
        return Err("Invalid sound volume".into());
    }
    play(volume);
    Ok(())
}

fn scaled(volume: u8) -> Vec<u8> {
    let mut wave = CAPTURE.to_vec();
    let mut offset = 12;
    while offset + 8 <= wave.len() {
        let size = u32::from_le_bytes(wave[offset + 4..offset + 8].try_into().unwrap()) as usize;
        let start = offset + 8;
        let end = (start + size).min(wave.len());
        if &wave[offset..offset + 4] == b"data" {
            for sample in wave[start..end].chunks_exact_mut(2) {
                let value = i16::from_le_bytes([sample[0], sample[1]]) as i32
                    * volume.min(100) as i32
                    / 100;
                sample.copy_from_slice(&(value as i16).to_le_bytes());
            }
            break;
        }
        offset = end + (size % 2);
    }
    wave
}
#[cfg(test)]
mod tests {
    #[test]
    fn approved_sound_is_pcm_and_volume_preserves_header() {
        assert_eq!(&super::CAPTURE[..4], b"RIFF");
        assert_eq!(
            u16::from_le_bytes(super::CAPTURE[34..36].try_into().unwrap()),
            16
        );
        assert_eq!(super::scaled(100), super::CAPTURE);
        let muted = super::scaled(0);
        assert_eq!(&muted[..44], &super::CAPTURE[..44]);
        assert!(muted[44..].iter().all(|v| *v == 0));
    }
}

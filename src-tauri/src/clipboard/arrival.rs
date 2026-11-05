use std::collections::VecDeque;

/// A bounded session-only fingerprint cache, never clipboard contents or process titles.
/// Restoring a recently seen image still updates history, but is not a new capture alert.
#[derive(Default)]
pub struct ImageArrivals {
    recent: VecDeque<String>,
    previews: VecDeque<(String, Vec<u8>)>,
}
impl ImageArrivals {
    /// Similarity affects feedback only: a rewritten image is still stored intact.
    /// This prevents paste/dictation apps from replaying the Pad for the same screenshot.
    pub fn should_notify_preview(&mut self, hash:&str, source:Option<&str>, thumbnail:Option<&str>) -> bool {
        use base64::Engine;
        let preview=thumbnail.filter(|value|value.len()<=512*1024)
            .and_then(|value|value.strip_prefix("data:image/png;base64,"))
            .and_then(|value|base64::engine::general_purpose::STANDARD.decode(value).ok())
            .and_then(|bytes|crate::storage::blob::decode_image(&bytes).ok());
        let fingerprint=preview.map(|image| {
            let ratio=format!("{}x{}",image.width(),image.height());
            (ratio,image.resize_exact(16,16,image::imageops::FilterType::Triangle).into_rgb8().into_raw())
        });
        let restored=fingerprint.as_ref().is_some_and(|(ratio,pixels)|self.previews.iter().any(|(size,previous)|{
            size==ratio && pixels.iter().zip(previous).map(|(a,b)|a.abs_diff(*b) as usize).sum::<usize>()<=pixels.len()*2
        }));
        if let Some(fingerprint)=fingerprint {
            if self.previews.len()>=16 {self.previews.pop_front();}
            self.previews.push_back(fingerprint);
        }
        let explicit=source.is_some_and(|name|["SnippingTool.exe","ScreenClippingHost.exe","Lightshot.exe","prtscr.exe"].iter().any(|capture|name.eq_ignore_ascii_case(capture)));
        (self.should_notify(hash,source) || explicit) && (!restored || explicit)
    }
    pub fn should_notify(&mut self, hash: &str, source: Option<&str>) -> bool {
        let seen = self.recent.iter().any(|value| value == hash);
        self.recent.retain(|value| value != hash);
        self.recent.push_back(hash.to_owned());
        if self.recent.len() > 64 {
            self.recent.pop_front();
        }
        // A deliberate Windows snip may have identical pixels to the previous snip.
        let snip = source.is_some_and(|name| {
            name.eq_ignore_ascii_case("SnippingTool.exe")
                || name.eq_ignore_ascii_case("ScreenClippingHost.exe")
        });
        !seen || snip
    }
}

/// Coalesce duplicate Windows messages and retry a temporarily unavailable snapshot.
/// Sequence equality (not ordering) also handles the Windows counter wrapping.
pub struct SequenceGate {
    sequence: u32,
    attempts: u8,
    done: bool,
    next_retry: Option<std::time::Instant>,
}
impl SequenceGate {
    pub fn new(sequence: u32) -> Self {
        Self {
            sequence,
            attempts: 0,
            done: true,
            next_retry: None,
        }
    }
    pub fn attempt(&mut self, sequence: u32, paused: bool) -> bool {
        self.attempt_at(sequence, paused, std::time::Instant::now())
    }
    fn attempt_at(&mut self, sequence: u32, paused: bool, now: std::time::Instant) -> bool {
        // Windows may briefly report no accessible sequence. Do not turn that
        // into a new clipboard event or replay previously completed contents.
        if sequence == 0 {
            if paused {
                self.done = true;
            }
            return false;
        }
        if self.sequence != sequence {
            self.sequence = sequence;
            self.attempts = 0;
            self.done = false;
            self.next_retry = None;
        }
        if paused {
            self.done = true;
        }
        if self.done || self.attempts >= 17 || self.next_retry.is_some_and(|retry| now < retry) {
            return false;
        }
        self.attempts += 1;
        if self.attempts >= 5 {
            self.next_retry = Some(now + std::time::Duration::from_secs(5));
        }
        true
    }
    /// Resume only re-arms a failed read. Completed, startup and paused contents stay quiet.
    pub fn resume(&mut self) {
        if !self.done {
            self.attempts = 0;
            self.next_retry = None;
        }
    }
    pub fn completed(&mut self) {
        self.done = true;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn restored_image_is_quiet_but_new_image_and_explicit_snip_notify() {
        let mut arrivals = ImageArrivals::default();
        assert!(arrivals.should_notify("image-a", Some("brave.exe")));
        assert!(!arrivals.should_notify("image-a", Some("dictation.exe")));
        assert!(!arrivals.should_notify("image-a", None));
        assert!(arrivals.should_notify("image-a", Some("SnippingTool.exe")));
        assert!(arrivals.should_notify("image-b", Some("brave.exe")));
        assert!(!arrivals.should_notify("image-a", Some("dictation.exe")));
    }
    #[test]
    fn fingerprints_are_bounded() {
        let mut arrivals = ImageArrivals::default();
        for n in 0..1000 {
            arrivals.should_notify(&n.to_string(), None);
        }
        assert_eq!(arrivals.recent.len(), 64);
    }
    #[test]
    fn recompressed_paste_restore_is_quiet_but_deliberate_capture_still_notifies() {
        use base64::Engine;
        let preview=|value|{
            let image=image::RgbImage::from_pixel(50,30,image::Rgb([value,80,110]));
            let mut bytes=std::io::Cursor::new(Vec::new());image.write_to(&mut bytes,image::ImageFormat::Png).unwrap();
            format!("data:image/png;base64,{}",base64::engine::general_purpose::STANDARD.encode(bytes.get_ref()))
        };
        let mut arrivals=ImageArrivals::default();
        assert!(arrivals.should_notify_preview("original",Some("Lightshot.exe"),Some(&preview(50))));
        assert!(!arrivals.should_notify_preview("rewritten",Some("Notion.exe"),Some(&preview(51))));
        assert!(arrivals.should_notify_preview("deliberate",Some("Lightshot.exe"),Some(&preview(51))));
        assert!(arrivals.should_notify_preview("deliberate",Some("Lightshot.exe"),Some(&preview(51))));
        assert!(arrivals.should_notify_preview("different",Some("Notion.exe"),Some(&preview(200))));
        for i in 0..50 {arrivals.should_notify_preview(&i.to_string(),None,Some(&preview(i)));}
        assert!(arrivals.previews.len()<=16);
    }
    #[test]
    fn duplicate_events_do_not_decode_again_and_timer_recovers_missed_events() {
        let mut gate = SequenceGate::new(5);
        assert!(!gate.attempt(5, false)); // no startup replay
        assert!(gate.attempt(6, false));
        gate.completed();
        for _ in 0..10000 {
            assert!(!gate.attempt(6, false));
        }
        assert!(gate.attempt(7, false)); // timer sees a new sequence without a message
    }
    #[test]
    fn clipboard_contention_gets_bounded_slow_recovery_after_fast_retries() {
        let now = std::time::Instant::now();
        let mut gate = SequenceGate::new(10);
        for _ in 0..5 {
            assert!(gate.attempt_at(11, false, now));
        }
        assert!(!gate.attempt_at(11, false, now));
        assert!(
            gate.attempt_at(11, false, now + std::time::Duration::from_secs(5)),
            "temporarily locked screenshot must not be abandoned permanently after five reads"
        );
    }
    #[test]
    fn slow_retries_stop_and_resume_does_not_replay_completed_or_private_content() {
        let now = std::time::Instant::now();
        let mut gate = SequenceGate::new(10);
        assert!(!gate.attempt_at(10, false, now));
        gate.resume();
        assert!(!gate.attempt_at(10, false, now));
        for tick in 0..17 {
            assert!(gate.attempt_at(11, false, now + std::time::Duration::from_secs(tick * 5)));
        }
        assert!(!gate.attempt_at(11, false, now + std::time::Duration::from_secs(200)));
        gate.resume();
        assert!(gate.attempt_at(11, false, now));
        gate.completed();
        gate.resume();
        assert!(!gate.attempt_at(11, false, now));
        assert!(!gate.attempt_at(12, true, now));
        gate.resume();
        assert!(!gate.attempt_at(12, false, now));
    }
    #[test]
    fn repeated_long_suspend_cycles_accept_new_captures_without_replay() {
        let start = std::time::Instant::now();
        let mut gate = SequenceGate::new(10);
        for cycle in 1..=50u32 {
            let now = start + std::time::Duration::from_secs(cycle as u64 * 12 * 60 * 60);
            gate.resume();
            assert!(!gate.attempt_at(9 + cycle, false, now));
            assert!(gate.attempt_at(10 + cycle, false, now));
            gate.completed();
            assert!(!gate.attempt_at(10 + cycle, false, now));
        }
    }
    #[test]
    fn inaccessible_sequence_does_not_replay_completed_or_paused_contents() {
        let mut gate = SequenceGate::new(10);
        assert!(!gate.attempt(0, false));
        assert!(!gate.attempt(10, false));
        assert!(!gate.attempt(11, true));
        assert!(!gate.attempt(0, false));
        assert!(!gate.attempt(11, false));
    }
    #[test]
    fn pausing_while_sequence_is_inaccessible_retires_pending_content() {
        let mut gate = SequenceGate::new(10);
        assert!(gate.attempt(11, false));
        assert!(!gate.attempt(0, true));
        assert!(!gate.attempt(11, false));
    }
    #[test]
    fn busy_clipboard_retries_are_bounded_and_new_sequence_recovers() {
        let mut gate = SequenceGate::new(u32::MAX);
        for _ in 0..5 {
            assert!(gate.attempt(1, false));
        }
        assert!(!gate.attempt(1, false));
        assert!(gate.attempt(2, false));
        assert!(!gate.attempt(3, true));
        assert!(!gate.attempt(3, false)); // unpause does not replay private paused content
        assert!(gate.attempt(4, false));
    }
}

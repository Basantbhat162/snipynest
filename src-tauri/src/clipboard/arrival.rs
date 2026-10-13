use std::collections::VecDeque;

/// A bounded session-only fingerprint cache, never clipboard contents or process titles.
/// Restoring a recently seen image still updates history, but is not a new capture alert.
#[derive(Default)]
pub struct ImageArrivals {
    recent: VecDeque<String>,
}
impl ImageArrivals {
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
}
impl SequenceGate {
    pub fn new(sequence: u32) -> Self {
        Self {
            sequence,
            attempts: 0,
            done: true,
        }
    }
    pub fn attempt(&mut self, sequence: u32, paused: bool) -> bool {
        if self.sequence != sequence {
            self.sequence = sequence;
            self.attempts = 0;
            self.done = false;
        }
        if paused {
            self.done = true;
        }
        if sequence == 0 || self.done || self.attempts >= 5 {
            return false;
        }
        self.attempts += 1;
        true
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

# Bounded editing and clipboard-based Companion delivery

For the 1.2.0 Capture Pad, expanded editing, bounded drafts and selected-panel capture changes, see ADR 0006. The clipboard delivery and original-preservation decisions below remain in force.

The existing companion has no installed Native Messaging host. Keep its explicit PNG clipboard delivery, consumed by the desktop listener, rather than claiming direct IPC or immediate editor launch. This supersedes ADR0003's description of the current delivery mechanism; Native Messaging and arbitrary native scrolling capture remain future capabilities.

Full-page frames are streamed into a bounded offscreen canvas with pacing and cleanup. Reject incompatible viewports, unsupported inner scrollers and oversized pages rather than silently delivering incomplete output.

The Annotator keeps a full-resolution baseline and committed canvas plus a bounded operation history. Older operations bake into the baseline; crops replay as operations and export excludes preview guides. Redaction is opaque, because pixelation preserves recoverable information. The saved result is a new Clip; retained operations are session-only and are not a persistent vector project format.

Native Multi-Drop uses materialized PNG/TXT files through CF_HDROP plus Unicode text, with CF_DIBV5 and registered PNG data for single-image drags, rather than HTML paths or an unimplemented virtual-file stream. This narrows ADR0004's payload claim to the formats actually supplied; interoperability still requires Windows target testing.

# ADR 0015: History navigation, extended snips and restored-image feedback

Date: 2026-11-05
Status: implemented in 1.6.5 development source; native acceptance recorded separately.

## History

Search-result cards expose **Show in history**. A native COUNT query locates the Clip in the same pinned/date/ID order as unfiltered history, without transferring preceding Clips. The Sidebar clears search and category filters, loads the bounded destination page, scrolls to the Clip and outlines it. Trash results stay in Trash. Filter changes invalidate pending navigation. Loaded results carry their query identity so stale search results cannot complete a reveal or remain actionable during debounce.

Checkbox Shift-click applies the target checkbox state to the inclusive range between the anchor and target in the displayed page order. Ordinary clicks toggle one checkbox and set the anchor. Navigation resets the anchor. Copy text validates every selected Clip and copies full stored text, separated by blank lines in displayed order. Mixed image/file selections use Export or Multi-Drop. Copy is bounded to 200 Clips and 4 MiB and does not write partial output on a validation failure.

Composite history indexes avoid per-request temporary sorting. History and statistics queries run on blocking workers; new-arrival statistics updates are coalesced. Legacy image decoding releases the history connection while reading files. Exact image restores use their recorded identity before encoding another PNG or thumbnail. Originals and legacy identifiers remain unchanged.

## Extended desktop

Screen snip freezes the physical Windows virtual-screen rectangle, including negative display origins. A single overlay/document can select within or across its displays. Individual display rectangles constrain tool strips to a real display instead of a gap in the layout. Empty desktop gaps are initialized to black. The existing 32-megapixel capture/import limit remains; larger arrangements are refused with an error rather than allocating unbounded image memory. Quick snapshot still captures only the monitor under the pointer.

Windows defines these bounds through its [virtual-screen metrics](https://learn.microsoft.com/en-us/windows/win32/gdi/multiple-monitor-system-metrics).

Right-click during Screen snip offers Cancel capture. Escape closes that menu first; Escape outside a popup cancels capture. Existing close, focus-loss and session-reservation behavior remains.

## Clipboard restores

The clipboard reader validates the Windows sequence after opening the clipboard. A changed sequence is retried by the listener instead of reading a newer payload under the previous sequence. Packed DIB decoding accounts for bitfield masks following a 40-byte header; V4/V5 masks already belong to the header. Parsing and encoding happen after releasing the global clipboard.

Exact identity remains the only rule for merging stored images. Paste/dictation apps can recompress an image and change pixels. To suppress repeated feedback without discarding that data, a session-only cache keeps sixteen 16 × 16 RGB preview fingerprints. A same-preview-size restore with average channel difference at most two does not replay sound or Capture Pad. Deliberate Lightshot and Windows Snipping Tool captures retain feedback. This feedback heuristic can silence a very similar non-capture image; the image is still stored. It is not fuzzy deduplication of history and does not delete existing duplicates.

Capture Pad uses an explicitly bounded grid row, independent control-column background/stacking and a movement edge that does not overlap controls. Browser stress fixtures are separate from certification of native WebView rendering under memory pressure.

## Evidence

See [VERIFICATION.md](../VERIFICATION.md). Automated fixtures do not certify Notion/Wispr Flow, four physical monitors or low-memory Windows behavior.

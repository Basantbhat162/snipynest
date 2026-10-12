# ADR 0001: Hybrid Storage Architecture (SQLite Metadata + Content-Addressable Blob Store)

## Context
Copy Tool must support an effectively unlimited Clip History containing hundreds of thousands of text snippets, rich text, code, and high-resolution images/screenshots. Storing large raw image payloads directly inside SQLite as BLOB columns causes severe database file fragmentation, slow WAL checkpoints, memory spikes during list queries, and database lock contention.

## Decision
We separate Clip metadata from binary image payloads:
1. **SQLite Database (`clips.db`):** Stores structured metadata (id, hash, type, text content, character count, dimensions, source application name, window title, creation timestamp, pinned flag, trash flag, and a downscaled 120px WebP thumbnail blob for instant UI rendering).
2. **Blob Store (`blobs/<sha256>.png`):** Stores the full-resolution raw image payloads on the local filesystem, keyed content-addressably by their SHA-256 hash.

## Consequences
- Deduplication is automatic: identical copied images or repeated screenshots share the exact same blob file on disk.
- SQLite queries remain sub-millisecond even with 100,000+ clips in history.
- Image cleanup and retention sweeps are straightforward: deleting a Clip removes the SQLite record, and an asynchronous orphan garbage collector purges unreferenced blobs.

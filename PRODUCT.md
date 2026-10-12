# SnipyNest

<!-- impeccable:product-schema:1 -->

## Product

A local Windows clipboard workspace for people who repeatedly move text and images between applications. The user requested a complete usability and reliability revamp of the existing implementation, including its browser companion.

## Platform

Windows 10/11 desktop utility using Tauri WebView2. The sidebar is commonly 380 logical pixels wide and must remain usable at 320 pixels and mixed display scaling. Chrome/Edge companion extension is a separate surface of the same workflow.

## Core workflows

Capture copied content, find it later, copy or drag it into another app, annotate/crop full-resolution images, recover deleted clips, and capture browser pages into history.

## Constraints

Local data, no cloud account. Event-driven background work. Bounded visible history and annotation allocations. Preserve originals when saving edited images. Errors must remain visible and recoverable. Native clipboard/drop behavior requires live Windows acceptance checks in addition to automated tests.

## Stack

Rust, SQLite and on-disk PNG storage; React/TypeScript; Chromium Manifest V3 companion. Source configuration is authoritative for dependency versions.

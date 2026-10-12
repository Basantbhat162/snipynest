# SnipyNest interface

Operate mode: precise controls in a compact Windows workspace. The user delegated visual decisions for this revamp; this direction is derived from that brief and the existing desktop workflow.

Use charcoal surfaces, a restrained blue accent for selection and primary actions, Segoe UI, and Lucide line icons. Content is the emphasis; avoid nested decorative cards and promotional copy.

Sidebar: compact titlebar, labelled search, wrapping category controls, virtualized clip page, in-flow selection actions, persistent page navigation. Keep image edit/copy/drop actions visible. Numeric shortcuts refer to the current page. Image previews are contained without distortion.

Editor: full-height workspace with wrapping labelled tools, explicit crop application, fit/native zoom and pan, visible original dimensions, and persistent copy/save/cancel actions. Preview guides never enter the exported image.

All icon controls have accessible names. Keyboard focus is visible; destructive actions require confirmation; async completion is reported only after success. Motion is 160ms and respects reduced motion. Semantic values live in src/App.css; editor styles are scoped in Annotator.css.

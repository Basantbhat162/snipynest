# SnipyNest capture workbench

A small Windows utility should let the capture lead. This redesign replaces the dark stacked-card interface with a light, quiet workspace and a thumbnail-first Capture Pad.

## Direction and tokens

Paper `#f6f8fb` is the workspace, white `#ffffff` is an active surface, ink `#172b3a` carries text, slate `#526575` carries secondary information, teal `#116b66` identifies actions and selection, and mist `#e3f2ee` identifies selected areas. Borders use `#dce5eb`. Red is reserved for destructive actions and failures.

Segoe UI Variable is deliberate: this is a Windows utility that needs legible compact controls and immediate local font rendering. Use Segoe UI as fallback, no font downloads. Headings are 18–22px, body 13–14px, supporting information 11–12px. Sentence case, no decorative labels.

## Layout

History is a left-aligned workbench: compact app controls, a strong History heading, search, two clearly separated groups of filters, a capture action, then a quiet list of reusable content. Bulk tools are disclosed on demand instead of taking two rows from every view. Image actions stay visible. The list remains virtualized.

```
SnipyNest                       pin settings close
History
[ Search clips                             Ctrl K ]
All  Images  Text  Code  Links    |   Pinned  Trash
[ Screen snip ]                       shortcut
Recent clips                        Select  refresh
  source                               time
  image or text
  size                       drag edit trash Copy
```

The Pad is a miniature capture shelf. Most of its width belongs to the image; one narrow side rail holds move, history and dismiss controls. The image opens history on click and drags to another app. A small count badge replaces repeated New images / Open history / brand labels. There is one outer frame, no nested window appearance. Errors remain readable and dismissible.

```
[                         ][ move    ]
[   latest image     (2)   ][ history ]
[                         ][ close   ]
```

The editor uses a white tool surface around a slate canvas, distinct selected tools and a persistent action footer. Settings group capture, Pad, sound and shortcuts into labelled sections. Companion uses the same palette and prioritizes one capture action, followed by the actual result or actionable error.

## Critique and constraints

A decorative glass card and floating gradients would compete with screenshots and obscure window bounds; omit them. Do not replace image pixels with colored decoration. The memorable element is the image-first Pad, not a decorative logo or animation. No hover lifts, looping shimmer, blur layers, external fonts or new UI dependency. Keep animation brief and respect reduced motion.

Keyboard focus, accessible names and disabled states are required. Keep all controls reachable at 320px width, and keep crop guides out of exported pixels. Preserve clipboard, native dragging, draft recovery and capture lifecycle logic. Native APIs remain separate from presentation. Browser fixtures verify layout and command dispatch, not actual Windows dragging, DPI or hibernate behavior.

Design guidance: Anthropic frontend-design skill, read October 16, 2026: https://github.com/anthropics/claude-code/tree/main/plugins/frontend-design

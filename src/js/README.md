# JavaScript Module Index

All files are classic scripts loaded in order from `index.html`. They share the
global scope for `file://` compatibility; keep definitions and load-time calls
ordered according to the groups below.

## Core

- `core/stage-layout.js`: 480p stage width, track limits and clamping.
- `core/state.js`: canvas references, mutable runtime state and constants.
- `core/bootstrap.js`: exposes `window.APP_INFO` and loads core default skin assets before UI scripts finish.

## Skin

- `skin/skin-ini.js`: `skin.ini` parser and font-prefix rules.
- `skin/mania-config.js`: Mania config defaults, reads and per-column lookups.
- `skin/parameter-schema.js`: parameter panel metadata.
- `skin/texture-lookup-map.js`: parameter key to skin lookup mapping.

## Parser

- `parser/beatmap-format.js`: `BeatmapDecoder` and native `.osu` parser.
- `parser/storyboard.js`: stable `.osu` / `.osb` storyboard and video event parsing.
- `parser/zip-timing.js`: zip lookup, background and TimingPoints/barlines.
- `parser/beatmap-load.js`: difficulty loading and active note construction.
- `parser/beatmap-import.js`: `.osz` / `.osu` import events.
- `parser/skin-assets.js`: image stores, default skin and frame lookup.
- `parser/tiff.js`: TIFF compatibility decoding.
- `parser/skin-import.js`: `.osk` import and texture registration.

## Render

- `render/effects.js`: combo-break render entry.
- `render/fonts.js`: skin digit lookup and text rendering.
- `render/textures.js`: note, key and lighting texture resolution.
- `render/combo.js`: combo rendering.
- `render/storyboard-assets.js`: storyboard image/video loading and playback lifecycle.
- `render/storyboard.js`: storyboard command evaluation and Canvas rendering.
- `render/storyboard-composite.js`: throttled offscreen composition for video and heavy storyboards.
- `render/frame.js`: main Canvas frame.
- `render/judgements.js`: judgement preview and animations.
- `render/hud.js`: score, accuracy and health display.
- `render/diagnostics.js`: debug rendering, state sync and canvas sizing.

## UI

- `ui/feedback.js`: loading overlay, toasts and slider feedback.
- `ui/layout.js`: sidebar and beatmap statistics layout.
- `ui/transport.js`: playback, seeking, volume and speed.
- `ui/canvas-editor.js`: selectable canvas element index.
- `ui/ini-export.js`: generated `skin.ini` text.
- `ui/param-core.js`: parameter mutation and editor tabs.
- `ui/texture-resolve.js`: texture aliases and fallback candidates.
- `ui/texture-controls.js`: thumbnails and texture parameter controls.
- `ui/param-render.js`: parameter panel renderer.
- `ui/export.js`: texture upload entry and skin export.
- `ui/history.js`: snapshots, undo and redo.
- `ui/editor-dialog.js`: editor shell and initialization coordinator.
- `ui/animation-editor.js`: multi-frame texture editor.
- `ui/texture-upload.js`: single texture upload flow.
- `ui/canvas-interactions.js`: canvas selection and drag behavior.
- `ui/shortcuts.js`: keyboard shortcuts.
- `ui/app-shell.js`: final startup wiring.

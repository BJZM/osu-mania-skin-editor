# Architecture

## Runtime Loading

`index.html` loads the runtime as ordered classic scripts. `defer` keeps network
requests parallel while preserving execution order. The complete module map is
maintained in `src/js/README.md`.

`index.html` is generated from `src/html/index.template.html` and the fragments
under `src/html/partials/`. Edit those source files and run `npm run build:html`;
do not edit the generated entry point directly. The build expands includes,
checks for include cycles, rejects duplicate DOM ids and supports
`npm run check:html` for stale-output verification.

The dependency groups are:

1. CSS: edit the modules documented in `src/css/README.md`, then run
   `npm run build:css`. The generated `style.css` remains the single runtime
   entry.
2. `core/`: DOM/canvas state, shared constants, 480p stage layout.
3. `skin/`: `skin.ini`, Mania configuration, parameter schema and lookup map.
4. `parser/`: beatmap parsing/import, skin assets/import, TIFF and timing data.
5. `render/`: Canvas frame, fonts, textures, combo, judgements, HUD, diagnostics.
6. `core/bootstrap.js`: loads core default skin assets while UI scripts continue.
7. `cursor.js`: skin cursor overlay.
8. `ui/`: feedback, player controls, parameter panel, texture workflows,
   history, shortcuts and startup.

Classic scripts intentionally share the global lexical environment. This keeps
`file://` compatibility and preserves the public globals used by existing tests.
Do not move a declaration to another file unless its initialization and all
load-time access remain ordered correctly.

## Module Responsibilities

- `src/css/style.css`: generated bundle; edit source modules instead.
- `src/css/tokens.css` through `cursor.css`: UI-domain styles split from the former
  single stylesheet.
- `core/stage-layout.js`: track width limits, stage split and layout clamping.
- `core/state.js`: canvas references, mutable application state and shared consts.
- `skin/skin-ini.js`: parse `skin.ini` into Mania configurations.
- `skin/mania-config.js`: default/fallback Mania config and per-column lookup.
- `skin/parameter-schema.js`: metadata for the visual parameter editor.
- `skin/texture-lookup-map.js`: parameter key to skin lookup mapping.
- `parser/beatmap-format.js`: `.osu` decoding and native text parsing.
- `parser/storyboard.js`: stable `.osu` / `.osb` storyboard and video event parsing.
- `parser/beatmap-import.js`: `.osz` / `.osu` import workflow.
- `parser/beatmap-load.js`: difficulty loading, audio/background and note state.
- `parser/skin-assets.js`: image stores, default skin and animation lookup.
- `parser/skin-import.js`: `.osk` import and texture registration.
- `parser/tiff.js`: TIFF compatibility decoder.
- `parser/zip-timing.js`: zip lookup, background and timing/barline helpers.
- `render/frame.js`: main Canvas frame.
- `render/storyboard-assets.js`: lazy storyboard asset loading and video sync.
- `render/storyboard.js`: storyboard timeline evaluation and Canvas drawing.
- `render/storyboard-composite.js`: cached/offscreen composition for expensive backgrounds.
- `render/fonts.js`, `render/textures.js`, `render/combo.js`: shared draw assets.
- `render/judgements.js`, `render/hud.js`, `render/diagnostics.js`: overlays/HUD.
- `ui/editor-dialog.js`: editor shell and initialization coordinator.
- `ui/texture-upload.js`: single texture upload and `1x` / `@2x` selection.
- `ui/animation-editor.js`: multi-frame texture creation and application.
- `ui/canvas-interactions.js`: canvas hit testing and dragging.
- `ui/app-shell.js`: final DOM wiring and application startup.

## Non-Runtime Data

- `samples/`: test skins, beatmaps and other reusable fixtures.
- `test-results/`: Playwright-generated failure context and run metadata.
- `docs/lazer-reference/`: reference only for stable-compatible behavior.

## HTML Module Maintenance

- Keep `src/html/index.template.html` limited to document metadata, root
  containers and ordered includes.
- Keep one top-level UI region per partial under `src/html/partials/`.
- Preserve the generated DOM structure and script order when moving markup.
- Run `npm run build:html` after every source fragment change.

## Maintenance Rule

Add new behavior to the smallest matching domain module. If a JavaScript or CSS
file approaches roughly 800 lines, split by workflow or data boundary rather
than by arbitrary line ranges.

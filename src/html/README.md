# HTML Module Index

`index.template.html` is the source page shell. The build tool expands
`@include` markers and writes the single-file `index.html` entry point.

## Partials

- `partials/topbar.html`: imports, difficulty selector, export actions and view toggles.
- `partials/info-panel.html`: beatmap, skin and difficulty information sidebar.
- `partials/canvas-stage.html`: canvas stage, selection toolbar and nested texture modals.
- `partials/texture-upload-modal.html`: single texture specification dialog.
- `partials/animation-editor-modal.html`: multi-frame texture sequence editor.
- `partials/texture-image-editor-modal.html`: single/multi-frame crop and transparent padding editor.
- `partials/player-controls.html`: timeline, playback, volume and preview controls.
- `partials/skin-editor-modal.html`: skin.ini visual parameter editor shell.
- `partials/help-modal.html`: stable-compatible texture sizing reference.
- `partials/about-modal.html`: version, copyright and third-party licence notice.
- `partials/scripts.html`: dependency and ordered runtime script list.

Run `npm run build:html` after editing any source fragment. Run
`npm run check:html` to verify that the generated `index.html` is current.

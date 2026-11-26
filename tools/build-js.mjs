import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const toolsDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(toolsDir, '..');
const jsDir = path.join(root, 'src/js');
const outputPath = path.join(jsDir, 'bundle.js');

export const modules = [
  'default_skin.js',
  'core/i18n-dictionary.js',
  'core/i18n.js',
  'core/stage-layout.js',
  'core/state.js',
  'skin/skin-ini-keys.js',
  'skin/skin-ini.js',
  'skin/mania-config.js',
  'skin/parameter-schema-mania.js',
  'skin/parameter-schema-textures.js',
  'skin/parameter-schema-fonts.js',
  'skin/parameter-schema-general.js',
  'skin/parameter-schema.js',
  'skin/texture-lookup-map.js',
  'parser/beatmap-format.js',
  'parser/storyboard.js',
  'parser/zip-timing.js',
  'parser/beatmap-load.js',
  'parser/beatmap-import.js',
  'parser/skin-assets.js',
  'parser/skin-hitsound-assets.js',
  'parser/default-skin-hitsounds.js',
  'parser/tiff.js',
  'parser/skin-import.js',
  'render/effects.js',
  'render/fonts.js',
  'render/textures.js',
  'render/combo.js',
  'render/comboburst-assets.js',
  'render/comboburst.js',
  'render/video-transcoder.js',
  'render/storyboard-assets.js',
  'render/storyboard.js',
  'render/storyboard-composite.js',
  'render/hold-note-geometry.js',
  'render/frame-judgement.js',
  'render/frame-key-images.js',
  'render/frame-notes.js',
  'render/frame-stage-light.js',
  'render/frame-lighting.js',
  'render/frame-playfield.js',
  'render/frame.js',
  'render/judgements.js',
  'render/hud.js',
  'render/diagnostics.js',
  'core/bootstrap.js',
  'cursor.js',
  'ui/feedback.js',
  'ui/startup-actions.js',
  'ui/layout.js',
  'ui/transport.js',
  'ui/hitsound-playback.js',
  'ui/canvas-element-index.js',
  'ui/canvas-editor.js',
  'ui/ini-export.js',
  'ui/param-core.js',
  'ui/texture-resolve.js',
  'ui/texture-font-glyphs.js',
  'ui/texture-param-lookup.js',
  'ui/texture-solid-shape-geometry.js',
  'ui/texture-solid-shape-factory.js',
  'ui/texture-existing-sources.js',
  'ui/texture-existing-picker-view.js',
  'ui/texture-existing-picker.js',
  'ui/texture-library-operations.js',
  'ui/texture-replacement.js',
  'ui/texture-library-view.js',
  'ui/texture-library-tab.js',
  'ui/texture-control-thumbnails.js',
  'ui/texture-control-score-percent.js',
  'ui/texture-control-param.js',
  'ui/texture-control-track-group.js',
  'ui/texture-control-font-glyph.js',
  'ui/texture-control-colours.js',
  'ui/texture-controls.js',
  'ui/hitsound-editor.js',
  'ui/comboburst-editor.js',
  'ui/param-render-controls.js',
  'ui/param-render.js',
  'ui/texture-project-archive.js',
  'ui/skin-workspace-revision.js',
  'ui/export.js',
  'ui/history.js',
  'ui/editor-card-controls.js',
  'ui/editor-dialog.js',
  'ui/animation-editor.js',
  'ui/texture-upload.js',
  'ui/texture-image-editor-rgb-adjustment.js',
  'ui/texture-image-editor-state.js',
  'ui/texture-image-editor-tabs.js',
  'ui/texture-image-editor-create-state.js',
  'ui/texture-image-editor-create-inputs.js',
  'ui/texture-image-editor-create.js',
  'ui/texture-image-editor-recipes.js',
  'ui/texture-image-editor-preview-zoom.js',
  'ui/texture-image-editor-longbody-compose.js',
  'ui/texture-image-editor-longbody-apply.js',
  'ui/texture-image-editor-history.js',
  'ui/texture-image-editor-targets.js',
  'ui/texture-image-editor-preview-render.js',
  'ui/texture-image-editor-target-init.js',
  'ui/texture-image-editor-crop-math.js',
  'ui/texture-image-editor-crop-pointers.js',
  'ui/texture-image-editor-crop-interactions.js',
  'ui/texture-image-editor-frame-edit.js',
  'ui/texture-image-editor-keyimage-groups.js',
  'ui/texture-image-editor-store-serialize.js',
  'ui/texture-image-editor-save-close.js',
  'ui/texture-image-editor-window.js',
  'ui/texture-image-editor.js',
  'ui/canvas-key-image-height.js',
  'ui/canvas-interactions.js',
  'ui/shortcuts.js',
  'ui/app-shell.js',
  'ui/unsaved-exit-prompt.js',
  'ui/agent-session-config-hitsounds.js',
  'ui/agent-session-textures.js',
  'ui/agent-session-preview-export.js',
  'ui/agent-session.js'
];

export async function runBuildJs({ checkOnly = false } = {}) {
  let eol = '\n';
  const bundledLines = [
    '// ============================================================================',
    '// bundle.js - GENERATED JAVASCRIPT BUNDLE',
    '// Source modules and order: see tools/build-js.mjs.',
    '// Rebuild with: npm run build:js',
    '// ============================================================================',
    ''
  ];

  for (const relPath of modules) {
    const filePath = path.join(jsDir, relPath);
    const content = await readFile(filePath, 'utf8');
    eol = content.includes('\r\n') ? '\r\n' : eol;
    bundledLines.push(
      `// --- BEGIN ${relPath} ---`,
      content.replace(/\r?\n$/, ''),
      `// --- END ${relPath} ---`,
      ''
    );
  }

  const bundle = bundledLines.join(eol);

  if (checkOnly) {
    let existing = '';
    try {
      existing = await readFile(outputPath, 'utf8');
    } catch {
      console.error('bundle.js is missing. Run "npm run build:js".');
      process.exit(1);
    }

    if (existing !== bundle) {
      console.error('bundle.js is out of sync with src/js modules. Run "npm run build:js".');
      process.exit(1);
    }

    console.log('JS modules and generated bundle.js are in sync.');
    process.exit(0);
  }

  await writeFile(outputPath, bundle, 'utf8');
  console.log(`Built bundle.js from ${modules.length} JS modules.`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  await runBuildJs({ checkOnly: process.argv.includes('--check') });
}

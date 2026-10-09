import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const cssDir = path.join(root, 'src/css');
const outputPath = path.join(cssDir, 'style.css');
const modules = [
  'tokens.css',
  'player.css',
  'shell.css',
  'skin-editor.css',
  'canvas-tools.css',
  'texture-editor.css',
  'help.css',
  'cursor.css'
];
const checkOnly = process.argv.includes('--check');

let eol = '\n';
const bundledLines = [
  '/* ============================================================================',
  ' * style.css - GENERATED CSS BUNDLE',
  ' * Source modules and order: see src/css/README.md.',
  ' * Rebuild with: npm run build:css',
  ' * ========================================================================== */',
  ''
];

for (const filename of modules) {
  const content = await readFile(path.join(cssDir, filename), 'utf8');
  eol = content.includes('\r\n') ? '\r\n' : eol;
  bundledLines.push(...content.split(/\r?\n/).slice(5), '');
}

const bundle = bundledLines.join(eol);

if (checkOnly) {
  let existing = '';
  try {
    existing = await readFile(outputPath, 'utf8');
  } catch {
    console.error('style.css is missing. Run "npm run build:css".');
    process.exit(1);
  }

  if (existing !== bundle) {
    console.error('style.css is out of sync with src/css modules. Run "npm run build:css".');
    process.exit(1);
  }

  console.log('CSS modules and generated style.css are in sync.');
  process.exit(0);
}

await writeFile(outputPath, bundle, 'utf8');
console.log(`Built style.css from ${modules.length} CSS modules.`);

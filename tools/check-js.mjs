import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { modules } from './build-js.mjs';

const toolsDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(toolsDir, '..');
const jsRoot = path.join(root, 'src', 'js');
const electronRoot = path.join(root, 'electron');

function collectFiles(dir, extensions, recursive = true) {
  const collected = [];
  if (!existsSync(dir)) return collected;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (recursive) collected.push(...collectFiles(fullPath, extensions, true));
    } else if (entry.isFile() && extensions.some((ext) => entry.name.endsWith(ext))) {
      collected.push(fullPath);
    }
  }
  return collected;
}

const srcJsFiles = collectFiles(jsRoot, ['.js'], true).sort();
const electronFiles = collectFiles(electronRoot, ['.cjs'], false).sort();
const toolFiles = collectFiles(toolsDir, ['.mjs', '.cjs'], false).sort();
const allSyntaxFiles = [...srcJsFiles, ...electronFiles, ...toolFiles];

for (const file of allSyntaxFiles) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}

const registeredSet = new Set();
const duplicates = [];
for (const relPath of modules) {
  const normalized = relPath.replace(/\\/g, '/');
  if (registeredSet.has(normalized)) duplicates.push(normalized);
  registeredSet.add(normalized);
}

if (duplicates.length > 0) {
  console.error(`Duplicate entries in tools/build-js.mjs modules: ${duplicates.join(', ')}`);
  process.exit(1);
}

const missingOnDisk = modules.filter((relPath) => !existsSync(path.join(jsRoot, relPath)));
if (missingOnDisk.length > 0) {
  console.error(`Missing files referenced in tools/build-js.mjs: ${missingOnDisk.join(', ')}`);
  process.exit(1);
}

const unregistered = srcJsFiles
  .map((filePath) => path.relative(jsRoot, filePath).split(path.sep).join('/'))
  .filter((relPath) => relPath !== 'bundle.js' && !registeredSet.has(relPath));

if (unregistered.length > 0) {
  console.error(
    `Unregistered JS modules under src/js (add to tools/build-js.mjs or remove): ${unregistered.join(', ')}`
  );
  process.exit(1);
}

console.log(
  `Checked ${allSyntaxFiles.length} JS/CJS/MJS files (${srcJsFiles.length} src/js, ${electronFiles.length} electron, ${toolFiles.length} tools); all ${modules.length} modules registered.`
);

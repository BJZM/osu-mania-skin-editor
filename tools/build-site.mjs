import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const toolsDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(toolsDir, '..');
const outputDir = path.join(root, 'site');

const files = [
  'index.html',
  'googled9f619fe06c64c49.html',
  'LICENSE',
  'THIRD_PARTY_NOTICES.md',
  'src/css/style.css',
  'src/js/bundle.js',
  'vendor/jszip.min.js',
  'vendor/utif.min.js',
  'vendor/README.md'
];

const directories = [
  ['assets', 'assets']
];

function runSyncChecks() {
  const checks = [
    path.join(toolsDir, 'build-css.mjs'),
    path.join(toolsDir, 'build-js.mjs'),
    path.join(toolsDir, 'build-html.mjs')
  ];
  for (const script of checks) {
    const result = spawnSync(process.execPath, [script, '--check'], {
      cwd: root,
      stdio: 'inherit'
    });
    if (result.status !== 0) {
      throw new Error(
        `Runtime artifact check failed (${path.basename(script)} --check). Run "npm run build:site" or rebuild CSS/JS/HTML first.`
      );
    }
  }
}

async function assertExists(filePath) {
  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error('not a file');
  } catch (error) {
    throw new Error(`Missing static build input: ${path.relative(root, filePath)} (${error.message})`);
  }
}

async function shortContentHash(filePath) {
  const content = await readFile(filePath);
  return createHash('sha256').update(content).digest('hex').slice(0, 10);
}

async function directoryStats(directory) {
  let bytes = 0;
  let fileCount = 0;

  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const nested = await directoryStats(entryPath);
      bytes += nested.bytes;
      fileCount += nested.fileCount;
    } else if (entry.isFile()) {
      bytes += (await stat(entryPath)).size;
      fileCount += 1;
    }
  }

  return { bytes, fileCount };
}

runSyncChecks();

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

for (const relativePath of files) {
  const sourcePath = path.join(root, relativePath);
  const targetPath = path.join(outputDir, relativePath);
  await assertExists(sourcePath);
  await mkdir(path.dirname(targetPath), { recursive: true });
  await cp(sourcePath, targetPath);
}

for (const [sourceRelative, targetRelative] of directories) {
  const sourcePath = path.join(root, sourceRelative);
  const targetPath = path.join(outputDir, targetRelative);
  await cp(sourcePath, targetPath, { recursive: true });
}

const [cssHash, jsHash] = await Promise.all([
  shortContentHash(path.join(outputDir, 'src/css/style.css')),
  shortContentHash(path.join(outputDir, 'src/js/bundle.js'))
]);

const indexTargetPath = path.join(outputDir, 'index.html');
const indexHtml = await readFile(indexTargetPath, 'utf8');
const versionedHtml = indexHtml
  .replace(/src\/css\/style\.css(?:\?v=[^"']*)?/, `src/css/style.css?v=${cssHash}`)
  .replace(/src\/js\/bundle\.js(?:\?v=[^"']*)?/, `src/js/bundle.js?v=${jsHash}`);
await writeFile(indexTargetPath, versionedHtml, 'utf8');

await writeFile(path.join(outputDir, '_headers'), [
  '/*',
  '  X-Content-Type-Options: nosniff',
  '  Referrer-Policy: strict-origin-when-cross-origin',
  '  X-Frame-Options: SAMEORIGIN',
  '  Permissions-Policy: camera=(), geolocation=(), microphone=(), payment=()',
  '',
  '/',
  '  Cache-Control: no-cache',
  '',
  '/index.html',
  '  Cache-Control: no-cache',
  '',
  '/src/*',
  '  Cache-Control: public, max-age=604800',
  '',
  '/assets/*',
  '  Cache-Control: public, max-age=604800',
  '',
  '/vendor/*',
  '  Cache-Control: public, max-age=604800, must-revalidate',
  ''
].join('\n'), 'utf8');

const { bytes, fileCount } = await directoryStats(outputDir);
console.log(`Built ${path.relative(root, outputDir)} with ${fileCount} files (${(bytes / 1024 / 1024).toFixed(2)} MiB).`);

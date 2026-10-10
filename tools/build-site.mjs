import { cp, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const outputDir = path.join(root, 'site');

const files = [
  'index.html',
  'LICENSE',
  'THIRD_PARTY_NOTICES.md',
  'src/css/style.css',
  'vendor/jszip.min.js',
  'vendor/utif.min.js',
  'vendor/README.md'
];

const directories = [
  ['src/js', 'src/js'],
  ['assets', 'assets']
];

async function assertExists(filePath) {
  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error('not a file');
  } catch (error) {
    throw new Error(`Missing static build input: ${path.relative(root, filePath)} (${error.message})`);
  }
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

await writeFile(path.join(outputDir, '_headers'), [
  '/*',
  '  X-Content-Type-Options: nosniff',
  '  Referrer-Policy: strict-origin-when-cross-origin',
  '  X-Frame-Options: SAMEORIGIN',
  '  Permissions-Policy: camera=(), geolocation=(), microphone=(), payment=()',
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
  '  Cache-Control: public, max-age=31536000',
  ''
].join('\n'), 'utf8');

const { bytes, fileCount } = await directoryStats(outputDir);
console.log(`Built ${path.relative(root, outputDir)} with ${fileCount} files (${(bytes / 1024 / 1024).toFixed(2)} MiB).`);

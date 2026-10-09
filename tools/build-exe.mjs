import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createPackage } from '@electron/asar';
import { downloadArtifact } from '@electron/get';
import extractZip from 'extract-zip';

const toolsDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(toolsDir, '..');
const require = createRequire(import.meta.url);
const electronExecutable = require('electron');
const distDir = path.join(root, 'dist');
const stageDir = path.join(distDir, 'app-package');
const unpackedDir = path.join(distDir, 'win-unpacked');
const resourcesDir = path.join(unpackedDir, 'resources');
const appAsarPath = path.join(resourcesDir, 'app.asar');
const packageJsonPath = path.join(root, 'package.json');

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      shell: false,
      stdio: 'inherit'
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${path.basename(command)} exited with ${signal || code}`));
    });
  });
}

async function copyRuntimeFiles() {
  const entries = ['index.html', 'electron', 'src', 'vendor', 'assets'];
  for (const entry of entries) {
    await fs.cp(path.join(root, entry), path.join(stageDir, entry), { recursive: true });
  }
}

async function cleanBuildFiles() {
  await Promise.all([
    fs.rm(stageDir, { recursive: true, force: true }),
    fs.rm(unpackedDir, { recursive: true, force: true }),
    fs.rm(path.join(distDir, 'builder-debug.yml'), { force: true }),
    fs.rm(path.join(distDir, 'builder-effective-config.yaml'), { force: true })
  ]);
}

async function main() {
  if (process.platform !== 'win32') {
    throw new Error('The portable Windows build must be created on Windows.');
  }

  const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
  const electronVersion = packageJson.devDependencies.electron;

  await fs.rm(distDir, { recursive: true, force: true });
  await fs.mkdir(stageDir, { recursive: true });

  await run(process.execPath, [path.join(root, 'tools', 'build-css.mjs')]);
  await run(process.execPath, [path.join(root, 'tools', 'build-html.mjs')]);
  await run(electronExecutable, [path.join(root, 'tools', 'build-icon.cjs')]);

  console.log(`Preparing Electron ${electronVersion} for win32-x64...`);
  const electronZip = await downloadArtifact({
    version: electronVersion,
    platform: 'win32',
    arch: 'x64',
    artifactName: 'electron'
  });
  await extractZip(electronZip, { dir: unpackedDir });

  await copyRuntimeFiles();
  const runtimePackageJson = {
    name: packageJson.name,
    version: packageJson.version,
    description: packageJson.description,
    main: packageJson.main,
    private: true
  };
  await fs.writeFile(path.join(stageDir, 'package.json'), `${JSON.stringify(runtimePackageJson, null, 2)}\n`);
  await createPackage(stageDir, appAsarPath);

  const electronExe = path.join(unpackedDir, 'electron.exe');
  const productExe = path.join(unpackedDir, `${packageJson.build.productName}.exe`);
  await fs.rename(electronExe, productExe);

  const builderCli = path.join(root, 'node_modules', 'electron-builder', 'cli.js');
  await run(process.execPath, [
    builderCli,
    '--win',
    'portable',
    '--x64',
    '--prepackaged',
    unpackedDir
  ]);

  await cleanBuildFiles();
  console.log(`Built ${path.join('dist', `${packageJson.build.productName}-${packageJson.version}-x64.exe`)}`);
}

main().catch((error) => {
  console.error(`Build failed: ${error.message}`);
  process.exit(1);
});

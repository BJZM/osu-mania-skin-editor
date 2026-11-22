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
  const entries = ['index.html', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'electron', 'src', 'vendor', 'assets'];
  for (const entry of entries) {
    await fs.cp(path.join(root, entry), path.join(stageDir, entry), { recursive: true });
  }

  // Native executables cannot run from inside app.asar, so keep the LGPL
  // FFmpeg build beside app.asar in the Electron resources directory.
  await fs.rm(path.join(stageDir, 'vendor', 'ffmpeg-lgpl-win64'), { recursive: true, force: true });
  await fs.cp(
    path.join(root, 'vendor', 'ffmpeg-lgpl-win64'),
    path.join(resourcesDir, 'ffmpeg-lgpl-win64'),
    { recursive: true }
  );
  await fs.access(path.join(resourcesDir, 'ffmpeg-lgpl-win64', 'bin', 'ffmpeg.exe'));
}

async function stampExecutableResources(targetExe, iconPath, packageJson) {
  const rceditExe = path.join(root, 'node_modules', 'electron-winstaller', 'vendor', 'rcedit.exe');
  try {
    await fs.access(rceditExe);
  } catch {
    console.warn('rcedit.exe not found, skipping exe resource stamping.');
    return;
  }

  const args = [
    path.relative(root, targetExe),
    '--set-icon', path.relative(root, iconPath),
    '--set-version-string', 'FileDescription', 'osu!mania 可视化皮肤编辑器',
    '--set-version-string', 'ProductName', packageJson.build.productName,
    '--set-version-string', 'CompanyName', packageJson.author || 'BJZM',
    '--set-version-string', 'LegalCopyright', `Copyright (C) ${packageJson.author || 'BJZM'}`,
    '--set-file-version', packageJson.version,
    '--set-product-version', packageJson.version
  ];

  let lastError = null;
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      await new Promise((resolve) => setTimeout(resolve, attempt * 500));
      await run(rceditExe, args);
      console.log(`Successfully stamped icon and resources on ${path.basename(targetExe)}.`);
      return;
    } catch (err) {
      lastError = err;
    }
  }
  console.warn(`Warning: Could not stamp executable resources on ${path.basename(targetExe)}: ${lastError.message}`);
}

async function preparePortableMetadata() {
  await fs.writeFile(
    path.join(unpackedDir, '.portable'),
    '# osu!mania skin editor portable flag\r\n# All user settings, caches, and offline projects will be stored in ./data\r\n'
  );
  await fs.mkdir(path.join(unpackedDir, 'data'), { recursive: true });
  await fs.writeFile(
    path.join(unpackedDir, 'README_便携说明.txt'),
    [
      'osu!mania 可视化皮肤编辑器 - 绿色免安装便携版',
      '================================================================',
      '',
      '【秒开运行（推荐）】',
      '直接双击目录中的 osu-mania-skin-editor.exe 即可秒开启动。',
      '免安装绿色版无需每次启动解压数百兆临时文件，彻底免除 CPU、磁盘 IO 与杀软扫描等待。',
      '',
      '【完全便携】',
      '软件的所有设置、缓存及皮肤项目均自动保存在同级的 data/ 文件夹中。',
      '将整个文件夹复制或移动至其他电脑或 U 盘，您的配置与数据均会完整随身保留，不会向系统写入残留。',
      ''
    ].join('\r\n'),
    'utf8'
  );
}

async function cleanBuildFiles() {
  await Promise.all([
    fs.rm(stageDir, { recursive: true, force: true }),
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
  await run(process.execPath, [path.join(root, 'tools', 'build-js.mjs')]);
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

  const iconPath = path.join(root, 'assets', 'app-icon.ico');
  await stampExecutableResources(productExe, iconPath, packageJson);

  await preparePortableMetadata();

  const builderCli = path.join(root, 'node_modules', 'electron-builder', 'cli.js');
  await run(process.execPath, [
    builderCli,
    '--win',
    'portable',
    'zip',
    '--x64',
    '--prepackaged',
    unpackedDir
  ]);

  await cleanBuildFiles();

  const portableDirName = `${packageJson.build.productName}-${packageJson.version}-win64-portable`;
  const finalPortableDir = path.join(distDir, portableDirName);
  await fs.rm(finalPortableDir, { recursive: true, force: true });
  await fs.rename(unpackedDir, finalPortableDir);

  const finalExe = path.join(finalPortableDir, `${packageJson.build.productName}.exe`);
  await stampExecutableResources(finalExe, iconPath, packageJson);

  const zipArtifact = `${packageJson.build.productName}-${packageJson.version}-x64.zip`;
  const exeArtifact = `${packageJson.build.productName}-${packageJson.version}-x64.exe`;

  console.log('\n======================================================');
  console.log('Build completed successfully! Generated distribution artifacts:');
  console.log(`  1. 绿色免安装便携包 (秒开推荐): dist/${zipArtifact}`);
  console.log(`  2. 单文件便携版 (带启动闪屏):   dist/${exeArtifact}`);
  console.log(`  3. 免安装已解压目录 (直接运行): dist/${portableDirName}`);
  console.log('======================================================\n');
}

main().catch((error) => {
  console.error(`Build failed: ${error.message}`);
  process.exit(1);
});

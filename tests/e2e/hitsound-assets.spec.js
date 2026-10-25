const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, expect } = require('@playwright/test');
const JSZip = require('../../vendor/jszip.min.js');

const ROOT = path.resolve(__dirname, '../..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mania-hitsound-e2e-'));
const archivePath = path.join(tmpDir, 'hitsound-compat.osk');

const AUDIO_FILES = {
  'normal-hitnormal.wav': 'normal-wav',
  'normal-hitnormal.ogg': 'normal-ogg-fallback',
  'normal-hitclap2.MP3': 'normal-clap-index-2',
  'hitnormal.wav': 'generic-hitnormal',
  'soft-hitfinish.ogg': 'soft-finish',
  'drum-hitwhistle.WAV': 'drum-whistle',
  'normal-hitnormal1.wav': 'invalid-index-1',
  'normal-slidertick.wav': 'not-a-hit-sound',
  'drum--hitwhistle.wav': 'malformed-name',
  'applause.wav': 'other-audio',
  'nested/soft-hitnormal.wav': 'nested-not-read-by-stable'
};

test.beforeAll(async () => {
  const zip = new JSZip();
  zip.file('skin.ini', [
    '[General]',
    'Name: Hitsound Compatibility',
    'Version: latest',
    '',
    '[Mania]',
    'Keys: 4'
  ].join('\r\n'));
  zip.file(
    'mania-note1.png',
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64'
    )
  );
  for (const [name, contents] of Object.entries(AUDIO_FILES)) {
    zip.file(name, Buffer.from(contents, 'utf8'));
  }
  fs.writeFileSync(archivePath, await zip.generateAsync({ type: 'nodebuffer' }));
});

test.afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function boot(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  await page.goto('/index.html');
  await page.waitForFunction(
    () => typeof readSkinHitsoundAssets === 'function' &&
      typeof getSkinHitsoundSummary === 'function'
  );
  await page.setInputFiles('#oskInput', archivePath);
  await page.waitForFunction(() => isSkinLoading === false, null, { timeout: 60000 });
  await page.waitForTimeout(300);
  return errors;
}

test('读取 stable 打击音效并按扩展名选择当前文件', async ({ page }) => {
  const errors = await boot(page);

  const state = await page.evaluate(() => ({
    summary: getSkinHitsoundSummary(),
    groups: Array.from(skinHitsoundCatalog.values()).map((group) => ({
      key: group.key,
      sampleSet: group.sampleSet,
      sound: group.sound,
      customIndex: group.customIndex,
      selectedPath: group.selectedPath,
      variants: group.variants.map((variant) => variant.path)
    })),
    normal: getSkinHitsoundAsset('normal', 'hitnormal', 0),
    genericFallback: getSkinHitsoundAsset('soft', 'hitnormal', 0),
    infoText: document.getElementById('infoSkinHitsounds').textContent.trim(),
    infoVisible: document.getElementById('infoSkinHitsounds').style.display !== 'none'
  }));

  expect(state.summary).toEqual({
    groupCount: 5,
    fileCount: 6,
    selectedFileCount: 5
  });
  expect(state.groups.map((group) => group.key).sort()).toEqual([
    'drum-hitwhistle',
    'hitnormal',
    'normal-hitclap2',
    'normal-hitnormal',
    'soft-hitfinish'
  ]);

  const normal = state.groups.find((group) => group.key === 'normal-hitnormal');
  expect(normal.selectedPath).toBe('normal-hitnormal.wav');
  expect(normal.variants).toEqual(['normal-hitnormal.wav', 'normal-hitnormal.ogg']);

  const indexed = state.groups.find((group) => group.key === 'normal-hitclap2');
  expect(indexed.sampleSet).toBe('normal');
  expect(indexed.sound).toBe('hitclap');
  expect(indexed.customIndex).toBe(2);

  expect(state.normal.selectedPath).toBe('normal-hitnormal.wav');
  expect(state.genericFallback.selectedPath).toBe('hitnormal.wav');
  expect(state.infoVisible).toBe(true);
  expect(state.infoText).toBe('打击音效: 5 组 / 6 个文件');
  expect(errors).toEqual([]);
});

test('可编辑与发布导出都原样保留打击音效和其他音频', async ({ page }) => {
  const errors = await boot(page);

  for (const mode of ['editable', 'release']) {
    const exportedBytes = await page.evaluate(async (exportMode) => {
      const { blob } = await buildSkinArchiveBlob('osk', { mode: exportMode });
      return Array.from(new Uint8Array(await blob.arrayBuffer()));
    }, mode);
    const exportedZip = await JSZip.loadAsync(Buffer.from(exportedBytes));
    const exportedNames = Object.keys(exportedZip.files).filter((name) => !exportedZip.files[name].dir);

    for (const [name, contents] of Object.entries(AUDIO_FILES)) {
      expect(exportedNames).toContain(name);
      expect(await exportedZip.file(name).async('string')).toBe(contents);
    }
    if (mode === 'editable') {
      expect(exportedNames).toContain('_skin-editor/texture-project.json');
    } else {
      expect(exportedNames.some((name) => name.startsWith('_skin-editor/'))).toBe(false);
    }
  }

  expect(errors).toEqual([]);
});

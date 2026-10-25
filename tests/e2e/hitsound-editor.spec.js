const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, expect } = require('@playwright/test');
const JSZip = require('../../vendor/jszip.min.js');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mania-hitsound-editor-'));
const skinPath = path.join(tmpDir, 'hitsound-editor.osk');
const beatmapPath = path.join(tmpDir, 'hitsound-editor.osz');

const ORIGINAL_OGG = 'original-normal-hitnormal-ogg';
const REPLACEMENT_WAV = Buffer.from('replacement-normal-hitnormal-wav');

function createSilentWav() {
  const sampleRate = 8000;
  const sampleCount = 800;
  const dataSize = sampleCount * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  return buffer;
}

test.beforeAll(async () => {
  const skinZip = new JSZip();
  skinZip.file('skin.ini', [
    '[General]',
    'Name: Hitsound Editor',
    'Version: latest',
    '',
    '[Mania]',
    'Keys: 4',
    'ColumnWidth: 65,65,65,65'
  ].join('\r\n'));
  skinZip.file('normal-hitnormal.ogg', Buffer.from(ORIGINAL_OGG, 'utf8'));
  skinZip.file('normal-hitclap.wav', createSilentWav());
  fs.writeFileSync(skinPath, await skinZip.generateAsync({ type: 'nodebuffer' }));

  const beatmapZip = new JSZip();
  beatmapZip.file('hitsound-editor.osu', [
    'osu file format v14',
    '',
    '[General]',
    'Mode: 3',
    '',
    '[Metadata]',
    'Title: Hitsound Editor',
    'Artist: Test',
    'Version: Normal',
    '',
    '[Difficulty]',
    'CircleSize: 4',
    'OverallDifficulty: 8',
    'ApproachRate: 9',
    'HPDrainRate: 8',
    '',
    '[TimingPoints]',
    '0,500,4,1,0,50,1,0',
    '',
    '[HitObjects]',
    '64,192,1000,1,0,1:1:0:50:map-hit.wav',
    '192,192,1500,1,0,1:1:0:50:map-hit.wav'
  ].join('\n'));
  beatmapZip.file('map-hit.wav', Buffer.from('beatmap-only-hit-sound', 'utf8'));
  fs.writeFileSync(beatmapPath, await beatmapZip.generateAsync({ type: 'nodebuffer' }));
});

test.afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function importWorkspace(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });

  await page.goto('/index.html');
  await page.waitForFunction(
    () => typeof renderHitsoundEditor === 'function' &&
      typeof replaceSkinHitsound === 'function'
  );
  await page.setInputFiles('#oszInput', beatmapPath);
  await page.waitForFunction(
    () => beatmaps.length > 0 && currentBeatmap && isStartupBeatmapReady(),
    null,
    { timeout: 60000 }
  );
  await page.setInputFiles('#oskInput', skinPath);
  await page.waitForFunction(() => isSkinLoading === false, null, { timeout: 60000 });
  await page.waitForFunction(() => isStartupSkinReady() && isStartupBeatmapReady(), null, { timeout: 60000 });
  await page.click('#openSkinEditorBtn');
  await page.click('#hitsoundEditorTabBtn');
  await expect(page.locator('#paramListContainer')).toBeVisible();
  return errors;
}

async function importDefaultWorkspace(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });

  await page.goto('/index.html');
  await page.waitForFunction(
    () => typeof renderHitsoundEditor === 'function' &&
      typeof ensureDefaultSkinHitsoundsLoaded === 'function'
  );
  await page.setInputFiles('#oszInput', beatmapPath);
  await page.waitForFunction(
    () => beatmaps.length > 0 && currentBeatmap && isStartupBeatmapReady(),
    null,
    { timeout: 60000 }
  );
  await page.click('#startupUseDefaultSkinBtn');
  await page.waitForFunction(
    () => isStartupWorkspaceReady() &&
      isEditableDefaultSkinWorkspaceActive() &&
      skinHitsoundCatalog.size === 12,
    null,
    { timeout: 60000 }
  );
  await page.click('#openSkinEditorBtn');
  await page.click('#hitsoundEditorTabBtn');
  await expect(page.locator('#paramListContainer')).toBeVisible();
  return errors;
}

async function replaceNormalHitsound(page) {
  await page.locator(
    '[data-hitsound-category="skin"][data-hitsound-key="normal-hitnormal"] [data-hitsound-action="replace"]'
  ).click();
  await page.setInputFiles('#hitsoundReplaceInput', {
    name: 'replacement.wav',
    mimeType: 'audio/wav',
    buffer: REPLACEMENT_WAV
  });
  await page.waitForFunction(() =>
    skinHitsoundReplacements.get('normal-hitnormal')?.path === 'normal-hitnormal.wav'
  );
}

test('音效窗口分成可编辑皮肤音效与只读谱面音效', async ({ page }) => {
  const errors = await importWorkspace(page);

  await expect(page.locator('.hitsound-category-block')).toHaveCount(2);
  await expect(page.locator('.hitsound-category-title')).toContainText(['皮肤音效', '谱面音效']);
  await expect(page.locator('.hitsound-category-description')).toHaveCount(0);
  await expect(page.locator('.hitsound-category-title .hitsound-badge')).toHaveCount(0);

  const skinCard = page.locator('[data-hitsound-category="skin"][data-hitsound-key="normal-hitnormal"]');
  await expect(skinCard).toHaveCount(1);
  await expect(skinCard).toContainText('可编辑');
  await expect(skinCard.locator('[data-hitsound-action="replace"]')).toHaveCount(1);

  const beatmapCard = page.locator('[data-hitsound-category="beatmap"]').filter({ hasText: 'map-hit.wav' });
  await expect(beatmapCard).toHaveCount(1);
  await expect(beatmapCard).toContainText('谱面只读');
  await expect(beatmapCard).toContainText('被 2 个音符使用');
  await expect(beatmapCard.locator('[data-hitsound-action="replace"]')).toHaveCount(0);
  await expect(beatmapCard.locator('[data-hitsound-action="preview"]')).toHaveCount(1);

  const summary = await page.evaluate(() => ({
    groups: getSkinHitsoundSummary().groupCount,
    beatmapEntries: collectBeatmapHitsoundEntries().size
  }));
  expect(summary).toEqual({ groups: 2, beatmapEntries: 1 });
  expect(errors).toEqual([]);
});

test('音效替换支持跨页签撤回重做，导出不破坏导入包', async ({ page }) => {
  const errors = await importWorkspace(page);

  await replaceNormalHitsound(page);

  expect(await page.evaluate(() =>
    skinHitsoundCatalog.get('normal-hitnormal').selectedPath
  )).toBe('normal-hitnormal.wav');
  await expect(page.locator(
    '[data-hitsound-category="skin"][data-hitsound-key="normal-hitnormal"]'
  )).toContainText('已替换');
  await expect(page.locator(
    '[data-hitsound-category="skin"][data-hitsound-key="normal-hitnormal"] [data-hitsound-action="reset"]'
  )).toHaveCount(1);

  // 连续操作分属两个页签：先撤参数时应保留音效，再撤才恢复原音效。
  await page.click('[data-tab="mania"]');
  await page.evaluate(() => onParamChange('HitPosition', 333));
  await page.evaluate(() => performSkinUndo());
  expect(await page.evaluate(() => ({
    hitPosition: maniaSkinConfigurations.get(4).HitPosition,
    hasReplacement: skinHitsoundReplacements.has('normal-hitnormal'),
    selectedPath: skinHitsoundCatalog.get('normal-hitnormal').selectedPath
  }))).toEqual({
    hitPosition: 402,
    hasReplacement: true,
    selectedPath: 'normal-hitnormal.wav'
  });

  await page.evaluate(() => performSkinUndo());
  expect(await page.evaluate(() => ({
    hasReplacement: skinHitsoundReplacements.has('normal-hitnormal'),
    selectedPath: skinHitsoundCatalog.get('normal-hitnormal').selectedPath
  }))).toEqual({
    hasReplacement: false,
    selectedPath: 'normal-hitnormal.ogg'
  });

  await page.evaluate(() => performSkinRedo());
  const exported = await page.evaluate(async () => {
    const { blob } = await buildSkinArchiveBlob('osk', { mode: 'release' });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const names = Object.keys(zip.files).filter((name) => !zip.files[name].dir);
    const replacement = zip.file('normal-hitnormal.wav');
    return {
      names,
      replacementText: replacement ? await replacement.async('string') : null,
      originalInExport: !!zip.file('normal-hitnormal.ogg'),
      originalStillInMemory: !!currentSkinZip.file('normal-hitnormal.ogg')
    };
  });

  expect(exported.names).toContain('normal-hitnormal.wav');
  expect(exported.replacementText).toBe(REPLACEMENT_WAV.toString('utf8'));
  expect(exported.originalInExport).toBe(false);
  expect(exported.originalStillInMemory).toBe(true);

  await page.evaluate(() => performSkinUndo());
  expect(await page.evaluate(() =>
    skinHitsoundCatalog.get('normal-hitnormal').selectedPath
  )).toBe('normal-hitnormal.ogg');
  expect(errors).toEqual([]);
});

test('恢复原音效同样进入撤回历史', async ({ page }) => {
  const errors = await importWorkspace(page);
  await replaceNormalHitsound(page);

  await page.click(
    '[data-hitsound-category="skin"][data-hitsound-key="normal-hitnormal"] [data-hitsound-action="reset"]'
  );
  expect(await page.evaluate(() =>
    skinHitsoundReplacements.has('normal-hitnormal')
  )).toBe(false);
  expect(await page.evaluate(() =>
    skinHitsoundCatalog.get('normal-hitnormal').selectedPath
  )).toBe('normal-hitnormal.ogg');

  await page.evaluate(() => performSkinUndo());
  expect(await page.evaluate(() => ({
    hasReplacement: skinHitsoundReplacements.has('normal-hitnormal'),
    selectedPath: skinHitsoundCatalog.get('normal-hitnormal').selectedPath
  }))).toEqual({
    hasReplacement: true,
    selectedPath: 'normal-hitnormal.wav'
  });

  await page.evaluate(() => performSkinRedo());
  expect(await page.evaluate(() =>
    skinHitsoundReplacements.has('normal-hitnormal')
  )).toBe(false);
  expect(errors).toEqual([]);
});

test('默认皮肤音效可编辑、撤回并作为增量导出', async ({ page }) => {
  const errors = await importDefaultWorkspace(page);

  await expect(page.locator('[data-hitsound-category="skin"]')).toHaveCount(12);
  const normalCard = page.locator(
    '[data-hitsound-category="skin"][data-hitsound-key="normal-hitnormal"]'
  );
  await expect(normalCard).toContainText('默认回退');
  await expect(normalCard).toContainText('normal-hitnormal.wav');

  await normalCard.locator('[data-hitsound-action="replace"]').click();
  await page.setInputFiles('#hitsoundReplaceInput', {
    name: 'replacement.ogg',
    mimeType: 'audio/ogg',
    buffer: REPLACEMENT_WAV
  });
  await page.waitForFunction(() =>
    skinHitsoundReplacements.get('normal-hitnormal')?.path === 'normal-hitnormal.ogg'
  );

  expect(await page.evaluate(() => ({
    source: skinHitsoundCatalog.get('normal-hitnormal').source,
    path: skinHitsoundCatalog.get('normal-hitnormal').selectedPath
  }))).toEqual({
    source: 'replacement',
    path: 'normal-hitnormal.ogg'
  });

  await page.evaluate(() => performSkinUndo());
  expect(await page.evaluate(() => ({
    hasReplacement: skinHitsoundReplacements.has('normal-hitnormal'),
    source: skinHitsoundCatalog.get('normal-hitnormal').source,
    path: skinHitsoundCatalog.get('normal-hitnormal').selectedPath
  }))).toEqual({
    hasReplacement: false,
    source: 'default',
    path: 'normal-hitnormal.wav'
  });

  await page.evaluate(() => performSkinRedo());
  const exported = await page.evaluate(async () => {
    const { blob } = await buildSkinArchiveBlob('osk', { mode: 'release' });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const names = Object.keys(zip.files).filter((name) => !zip.files[name].dir);
    const replacement = zip.file('normal-hitnormal.ogg');
    return {
      names,
      replacementText: replacement ? await replacement.async('string') : null
    };
  });

  expect(exported.names).toContain('normal-hitnormal.ogg');
  expect(exported.names).not.toContain('normal-hitnormal.wav');
  expect(exported.names).not.toContain('soft-hitnormal.wav');
  expect(exported.replacementText).toBe(REPLACEMENT_WAV.toString('utf8'));
  expect(errors).toEqual([]);
});

test('停止试听或自然播完不会误报解码失败', async ({ page }) => {
  const errors = await importWorkspace(page);
  await page.evaluate(() => document.getElementById('toastContainer').replaceChildren());

  const previewButton = page.locator(
    '[data-hitsound-category="skin"][data-hitsound-key="normal-hitclap"] [data-hitsound-action="preview"]'
  );
  await previewButton.click();
  await page.waitForFunction(() => hitsoundPreviewAudio && !hitsoundPreviewAudio.paused);
  await page.waitForFunction(() => hitsoundPreviewAudio === null, null, { timeout: 5000 });
  await page.waitForTimeout(300);
  await expect(page.locator('#toastContainer .toast').filter({ hasText: '试听失败' })).toHaveCount(0);

  await previewButton.click();
  await page.waitForFunction(() => hitsoundPreviewAudio && !hitsoundPreviewAudio.paused);
  await page.evaluate(() => stopHitsoundPreview());
  await page.waitForTimeout(300);
  await expect(page.locator('#toastContainer .toast').filter({ hasText: '试听失败' })).toHaveCount(0);
  expect(errors).toEqual([]);
});

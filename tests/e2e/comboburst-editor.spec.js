const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, expect } = require('@playwright/test');
const JSZip = require('../../vendor/jszip.min.js');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mania-comboburst-editor-'));
const emptySkinPath = path.join(tmpDir, 'empty-comboburst.osk');
const numberedSkinPath = path.join(tmpDir, 'numbered-comboburst.osk');
const beatmapPath = path.join(tmpDir, 'comboburst-editor.osz');
const COMBOBURST_MASTER_SWITCH_NOTICE = '总开关在游戏内，需要在游戏内开启或关闭';
const comboburstPng = fs.readFileSync(
  path.join(__dirname, '../../assets/default_skin/comboburst-mania.png')
);

function beatmapText() {
  return [
    'osu file format v14',
    '',
    '[General]',
    'Mode: 3',
    '',
    '[Metadata]',
    'Title: Comboburst Editor',
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
    '64,192,1000,1,0,1:1:0:50:',
    '192,192,1250,1,0,1:1:0:50:',
    '320,192,1500,1,0,1:1:0:50:',
    '448,192,1750,1,0,1:1:0:50:'
  ].join('\n');
}

test.beforeAll(async () => {
  const emptyZip = new JSZip();
  emptyZip.file('skin.ini', [
    '[General]',
    'Name: Empty Comboburst',
    'Version: latest',
    '',
    '[Mania]',
    'Keys: 4',
    'ColumnWidth: 65,65,65,65'
  ].join('\r\n'));
  fs.writeFileSync(emptySkinPath, await emptyZip.generateAsync({ type: 'nodebuffer' }));

  const numberedZip = new JSZip();
  numberedZip.file('skin.ini', [
    '[General]',
    'Name: Numbered Comboburst',
    'Version: latest',
    'ComboBurstRandom: 1',
    '',
    '[Mania]',
    'Keys: 4',
    'ColumnWidth: 65,65,65,65',
    'ComboBurstStyle: 0',
    '',
    '[Mania]',
    'Keys: 7',
    'ColumnWidth: 45,45,45,45,45,45,45',
    'ComboBurstStyle: 1'
  ].join('\r\n'));
  numberedZip.file('comboburst-mania.png', comboburstPng);
  numberedZip.file('comboburst-mania-0.png', comboburstPng);
  numberedZip.file('comboburst-mania-1.png', comboburstPng);
  fs.writeFileSync(numberedSkinPath, await numberedZip.generateAsync({ type: 'nodebuffer' }));

  const beatmapZip = new JSZip();
  beatmapZip.file('comboburst-editor.osu', beatmapText());
  fs.writeFileSync(beatmapPath, await beatmapZip.generateAsync({ type: 'nodebuffer' }));
});

test.afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function importWorkspace(page, skinPath) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });

  await page.goto('/index.html');
  await page.waitForFunction(
    () => typeof openComboburstGroupEditor === 'function' &&
      typeof applyComboburstGroupFrames === 'function'
  );
  await page.setInputFiles('#oszInput', beatmapPath);
  await page.waitForFunction(
    () => beatmaps.length > 0 && currentBeatmap && isStartupBeatmapReady(),
    null,
    { timeout: 60000 }
  );
  await page.setInputFiles('#oskInput', skinPath);
  await page.waitForFunction(() => isSkinLoading === false, null, { timeout: 60000 });
  await page.waitForFunction(
    () => isStartupSkinReady() && isStartupBeatmapReady(),
    null,
    { timeout: 60000 }
  );
  return errors;
}

async function openTextureGroupEditor(page, skinPath) {
  const errors = await importWorkspace(page, skinPath);
  await page.click('#openTextureImageEditorBtn');
  await page.waitForFunction(
    () => document.getElementById('textureImageEditorModal').classList.contains('active')
  );
  const textureMapping = page.locator('.param-category-block').filter({ hasText: '贴图映射' });
  await expect(textureMapping.locator('#param-card-Comboburst')).toBeVisible();
  await page.hover('#param-card-Comboburst .texture-upload-dropdown');
  await expect(
    page.locator('#param-card-Comboburst [data-upload-mode="multi"] .upload-menu-tag')
  ).toHaveText('批量');
  await page.click('#param-card-Comboburst [data-upload-mode="multi"]');
  await page.waitForFunction(
    () => document.getElementById('comboburstGroupModal').style.display === 'flex'
  );
  return errors;
}

test('参数只出现在 Mania 不常用设置，样式按 K 独立而随机设置全局', async ({ page }) => {
  const errors = await importWorkspace(page, numberedSkinPath);
  await page.click('#openSkinEditorBtn');

  await expect(page.locator('#skinEditorTabs .tab-btn[data-tab="comboburst"]')).toHaveCount(0);
  const category = page.locator('.param-category-block').filter({ hasText: '其他不常用选项' });
  await expect(category.locator('#param-card-ComboBurstStyle')).toBeVisible();
  await expect(category.locator('#param-card-ComboBurstRandom')).toBeVisible();

  await expect(page.locator('#param-card-ComboBurstStyle select')).toHaveValue('0');
  await page.selectOption('#param-card-ComboBurstStyle select', '2');
  await page.locator('#keyPillsContainer .key-pill').filter({ hasText: '7K' }).click();
  await expect(page.locator('#param-card-ComboBurstStyle select')).toHaveValue('1');
  await page.selectOption('#param-card-ComboBurstStyle select', '0');
  await page.locator('#param-card-ComboBurstRandom .ios-switch').click();

  expect(await page.evaluate(() => ({
    style4k: maniaSkinConfigurations.get(4).ComboBurstStyle,
    style7k: maniaSkinConfigurations.get(7).ComboBurstStyle,
    random: Number(currentSkinMetadata.general.ComboBurstRandom)
  }))).toEqual({ style4k: 2, style7k: 0, random: 0 });

  await page.evaluate(() => performSkinUndo());
  expect(await page.evaluate(() => Number(currentSkinMetadata.general.ComboBurstRandom))).toBe(1);
  await page.evaluate(() => performSkinUndo());
  expect(await page.evaluate(() => maniaSkinConfigurations.get(7).ComboBurstStyle)).toBe(1);
  await page.evaluate(() => performSkinUndo());
  expect(await page.evaluate(() => maniaSkinConfigurations.get(4).ComboBurstStyle)).toBe(0);
  await page.evaluate(() => performSkinRedo());
  expect(await page.evaluate(() => maniaSkinConfigurations.get(4).ComboBurstStyle)).toBe(2);
  expect(errors).toEqual([]);
});

test('底栏连击提示图预览默认关闭，开启后才触发并在关闭时清理演出', async ({ page }) => {
  const errors = await importWorkspace(page, numberedSkinPath);
  const toggle = page.locator('#comboburstPreviewToggle');

  await expect(toggle).not.toBeChecked();
  expect(await page.evaluate(() => ({
    enabled: isComboburstPreviewEnabled,
    triggered: triggerComboburstPreview(100)
  }))).toEqual({ enabled: false, triggered: false });

  await page.evaluate(() => document.getElementById('comboburstPreviewToggle').click());
  await expect(toggle).toBeChecked();
  expect(await page.evaluate(() => ({
    enabled: isComboburstPreviewEnabled,
    triggered: triggerComboburstPreview(100),
    active: comboburstRuntimeState.active.length
  }))).toEqual({ enabled: true, triggered: true, active: 1 });

  await page.evaluate(() => document.getElementById('comboburstPreviewToggle').click());
  await expect(toggle).not.toBeChecked();
  expect(await page.evaluate(() => ({
    enabled: isComboburstPreviewEnabled,
    active: comboburstRuntimeState.active.length
  }))).toEqual({ enabled: false, active: 0 });
  expect(errors).toEqual([]);
});

test('连击提示图贴图项与两个参数项直接显示游戏内总开关说明', async ({ page }) => {
  const errors = await importWorkspace(page, numberedSkinPath);
  await page.click('#openSkinEditorBtn');

  for (const id of ['ComboBurstRandom', 'ComboBurstStyle']) {
    await expect(page.locator(`#param-card-${id} .param-inline-notice`))
      .toHaveText(COMBOBURST_MASTER_SWITCH_NOTICE);
  }

  await page.click('#closeSkinEditorBtn');
  await page.click('#openTextureImageEditorBtn');
  await expect(page.locator('#param-card-Comboburst .param-inline-notice'))
    .toHaveText(COMBOBURST_MASTER_SWITCH_NOTICE);
  expect(errors).toEqual([]);
});

test('主画布左右连击图以对应舞台边缘为锚点，右侧不会按整图宽度向内偏移', async ({ page }) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof getComboburstHorizontalPosition === 'function');

  expect(await page.evaluate(() => {
    const segment = { x: 100, width: 300 };
    const drawWidth = 200;
    const edgeInset = 8;
    return {
      leftStart: getComboburstHorizontalPosition(segment, 'left', drawWidth, edgeInset, 0),
      leftMoved: getComboburstHorizontalPosition(segment, 'left', drawWidth, edgeInset, 36),
      rightStart: getComboburstHorizontalPosition(segment, 'right', drawWidth, edgeInset, 0),
      rightMoved: getComboburstHorizontalPosition(segment, 'right', drawWidth, edgeInset, 36)
    };
  })).toEqual({
    leftStart: -92,
    leftMoved: -56,
    rightStart: 392,
    rightMoved: 356
  });
});

test('空皮肤的多图编辑器为空，且不会借用默认连击提示图', async ({ page }) => {
  const errors = await openTextureGroupEditor(page, emptySkinPath);

  await expect(page.locator('#comboburstGroupEmptyState')).toBeVisible();
  await expect(page.locator('#textureImageComboburstGroupBtn')).toHaveCount(0);
  expect(await page.evaluate(() => getComboburstAssetState())).toMatchObject({
    mode: 'none',
    count: 0,
    source: null
  });
  expect(await page.evaluate(() => comboburstGroupEditorUi.getState().frameCount)).toBe(0);
  expect(await page.evaluate(() => triggerComboburstPreview(100))).toBe(false);
  await expect(page.locator('#comboburstGroupConfirmBtn')).toBeDisabled();
  expect(errors).toEqual([]);
});

test('批量上传后按文件顺序保存，预览依次向左、向右、下一张并循环', async ({ page }) => {
  const errors = await openTextureGroupEditor(page, emptySkinPath);
  await page.setInputFiles('#comboburstGroupBatchInput', [
    { name: '20-second.png', mimeType: 'image/png', buffer: comboburstPng },
    { name: '3-first.png', mimeType: 'image/png', buffer: comboburstPng }
  ]);
  await page.waitForFunction(() => comboburstGroupEditorUi.getState().frameCount === 2);

  expect(await page.evaluate(() =>
    comboburstGroupState.frames.map((frame) => frame.name)
  )).toEqual(['3-first.png', '20-second.png']);
  expect(await page.evaluate(() => comboburstGroupEditorUi.getState().timeline)).toMatchObject({
    index: 0,
    side: 'left'
  });
  const leftPreview = await page.evaluate(() =>
    document.getElementById('comboburstGroupPreviewCanvas').toDataURL()
  );

  await page.evaluate(() => {
    comboburstGroupState.previewStartedAt = performance.now() - COMBOBURST_PREVIEW_PHASE_MS - 80;
    drawComboburstGroupPreview();
  });
  expect(await page.evaluate(() => comboburstGroupEditorUi.getState().timeline)).toMatchObject({
    index: 0,
    side: 'right'
  });
  const rightPreview = await page.evaluate(() =>
    document.getElementById('comboburstGroupPreviewCanvas').toDataURL()
  );
  expect(rightPreview).not.toBe(leftPreview);
  await page.evaluate(() => {
    comboburstGroupState.previewStartedAt = performance.now() - COMBOBURST_PREVIEW_PHASE_MS * 2 - 80;
    drawComboburstGroupPreview();
  });
  expect(await page.evaluate(() => comboburstGroupEditorUi.getState().timeline)).toMatchObject({
    index: 1,
    side: 'left'
  });

  await page.click('#comboburstGroupConfirmBtn');
  await page.waitForFunction(() => getComboburstAssetState().mode === 'numbered' &&
    getComboburstAssetState().count === 2);
  expect(await page.evaluate(() => getComboburstAssetState().images.map((item) => item.path)))
    .toEqual(['comboburst-mania-0', 'comboburst-mania-1']);

  const exported = await page.evaluate(async () => {
    const { blob } = await buildSkinArchiveBlob('osk', { mode: 'release' });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    return Object.keys(zip.files);
  });
  expect(exported).toContain('comboburst-mania-0.png');
  expect(exported).toContain('comboburst-mania-1.png');
  expect(exported).not.toContain('comboburst-mania.png');

  await page.evaluate(() => performSkinUndo());
  await page.waitForFunction(() => getComboburstAssetState().mode === 'none');
  await page.evaluate(() => performSkinRedo());
  await page.waitForFunction(() => getComboburstAssetState().count === 2);
  expect(errors).toEqual([]);
});

test('已有编号组会载入多图编辑器，清空后主图与编号图全部移除并可撤回', async ({ page }) => {
  const errors = await openTextureGroupEditor(page, numberedSkinPath);

  expect(await page.evaluate(() => getComboburstAssetState())).toMatchObject({
    mode: 'numbered',
    count: 2
  });
  expect(await page.evaluate(() => comboburstGroupEditorUi.getState().frameCount)).toBe(2);
  await expect(page.locator('#comboburstGroupPreviewBadge')).toContainText('/ 2');
  await page.click('#comboburstGroupClearAllBtn');
  await expect(page.locator('#comboburstGroupConfirmBtn')).toContainText('清空连击提示图组');
  await page.click('#comboburstGroupConfirmBtn');
  await page.waitForFunction(() => getComboburstAssetState().mode === 'none');

  const exported = await page.evaluate(async () => {
    const { blob } = await buildSkinArchiveBlob('osk', { mode: 'release' });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    return Object.keys(zip.files).filter((name) => name.startsWith('comboburst-mania'));
  });
  expect(exported).toEqual([]);

  await page.evaluate(() => performSkinUndo());
  await page.waitForFunction(() => getComboburstAssetState().count === 2);
  expect(errors).toEqual([]);
});

test('默认皮肤工作区把内置图作为显式素材载入多图编辑器，清空后仍不回退', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof openComboburstGroupEditor === 'function');
  await page.setInputFiles('#oszInput', beatmapPath);
  await page.waitForFunction(() => isStartupBeatmapReady(), null, { timeout: 60000 });
  await page.click('#startupUseDefaultSkinBtn');
  await page.waitForFunction(
    () => isStartupWorkspaceReady() && isEditableDefaultSkinWorkspaceActive(),
    null,
    { timeout: 60000 }
  );
  await page.click('#openTextureImageEditorBtn');
  await page.evaluate(() => {
    document.querySelector(
      '#param-card-Comboburst [data-upload-mode="multi"]'
    ).click();
  });
  expect(await page.evaluate(() => comboburstGroupEditorUi.getState().frameCount)).toBe(1);
  expect(await page.evaluate(() => getComboburstAssetState())).toMatchObject({
    mode: 'single',
    source: 'default-workspace'
  });

  await page.click('#comboburstGroupClearAllBtn');
  await page.click('#comboburstGroupConfirmBtn');
  await page.waitForFunction(() => getComboburstAssetState().mode === 'none');
  expect(await page.evaluate(() => triggerComboburstPreview(100))).toBe(false);
  await page.evaluate(() => performSkinUndo());
  await page.waitForFunction(() => getComboburstAssetState().source === 'default-workspace');
  expect(errors).toEqual([]);
});

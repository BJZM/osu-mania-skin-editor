const path = require('path');
const { test, expect } = require('@playwright/test');

const ROOT = path.resolve(__dirname, '../..');
const SKIN = path.join(ROOT, 'samples', 'skins', 'Kumakalerki.osk');
const MINIMAL_BEATMAP = path.join(ROOT, 'samples', 'beatmaps', 'minimal-4k.osu');
const UPLOAD_IMAGE = path.join(ROOT, 'assets', 'app-icon.png');

test('从已有贴图导入会改写路径且不复制图片', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });

  await page.goto('/index.html');
  await page.waitForFunction(
    () => typeof textureImageEditorUi !== 'undefined' && typeof textureExistingPickerUi !== 'undefined',
    null,
    { timeout: 30000 }
  );
  await page.setInputFiles('#oskInput', SKIN);
  await page.waitForFunction(() => isSkinLoading === false && skinImageStore.size > 0, null, { timeout: 60000 });
  await page.setInputFiles('#oszInput', MINIMAL_BEATMAP);
  await page.waitForFunction(() => isStartupWorkspaceReady(), null, { timeout: 60000 });

  await page.click('#openTextureImageEditorBtn');
  await page.waitForFunction(() => document.getElementById('textureImageEditorModal').classList.contains('active'));

  const targetRow = page.locator('#param-card-NoteImage0');
  await expect(targetRow).toBeVisible();
  await targetRow.locator('.texture-upload-dropdown').hover();
  const existingItem = targetRow.locator('.texture-upload-menu-item.item-existing');
  await expect(existingItem).toBeVisible();
  await existingItem.click();

  await expect(page.locator('#textureExistingPickerModal')).toHaveCSS('display', 'flex');
  expect(await page.evaluate(() => textureExistingPickerUi.getState().sourceCount)).toBeGreaterThan(1);

  const candidatePath = await page.evaluate(() => {
    const current = normalizeTextureLookupPath(getTextureParamIniValue(getActiveKeyCount(), {
      key: 'NoteImage0',
      _trackLookup: LML.NoteImage,
      _trackCol: 0
    }));
    const sources = collectExistingTextureSources();
    const nested = sources.find((source) => source.path.includes('/') &&
      normalizeTextureLookupPath(source.path) !== current);
    return (nested || sources.find((source) => normalizeTextureLookupPath(source.path) !== current)).path;
  });

  await page.fill('#textureExistingPickerSearch', candidatePath);
  const firstCard = page.locator('#textureExistingPickerGrid .texture-existing-card').first();
  await expect(firstCard).toBeVisible();
  await firstCard.click();
  const selectedPath = await firstCard.getAttribute('data-texture-path');
  expect(selectedPath).toBeTruthy();
  expect(await page.evaluate(() => textureExistingPickerUi.getState().selectedPath)).toBe(selectedPath);

  const exportCountBefore = await page.evaluate(() => userReplacedTextures.size);
  await page.click('#textureExistingPickerConfirmBtn');
  await expect(page.locator('#textureExistingPickerModal')).toHaveCSS('display', 'none');

  const result = await page.evaluate((expectedPath) => {
    const p = {
      key: 'NoteImage0',
      _trackLookup: LML.NoteImage,
      _trackCol: 0
    };
    const cfg = maniaSkinConfigurations.get(getActiveKeyCount());
    const input = document.querySelector('#param-card-NoteImage0 .texture-path-input');
    return {
      lookup: cfg.ImageLookups.get('NoteImage0'),
      lowerLookup: cfg.ImageLookups.get('noteimage0'),
      direct: cfg.NoteImage0,
      inputValue: input ? input.value : null,
      resolved: resolveTextureParam(getActiveKeyCount(), p).state,
      expectedPath,
      exportCount: userReplacedTextures.size
    };
  }, selectedPath);

  expect(result.lookup).toBe(selectedPath);
  expect(result.lowerLookup).toBe(selectedPath);
  expect(result.direct).toBe(selectedPath);
  expect(result.inputValue).toBe(selectedPath);
  expect(result.resolved).toBe('ok');
  expect(result.exportCount).toBe(exportCountBefore);
  expect(errors).toEqual([]);
});

test('从已有贴图导入站内自建贴图后可撤回路径', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });

  await page.goto('/index.html');
  await page.waitForFunction(
    () => typeof textureImageEditorUi !== 'undefined' &&
      typeof textureExistingPickerUi !== 'undefined' &&
      typeof createSolidShapeTexture === 'function',
    null,
    { timeout: 30000 }
  );
  await page.setInputFiles('#oskInput', SKIN);
  await page.waitForFunction(() => isSkinLoading === false && skinImageStore.size > 0, null, { timeout: 60000 });
  await page.setInputFiles('#oszInput', MINIMAL_BEATMAP);
  await page.waitForFunction(() => isStartupWorkspaceReady(), null, { timeout: 60000 });

  const targetParam = {
    key: 'NoteImage0',
    _trackLookup: 'NoteImage',
    _trackCol: 0
  };
  const previousPath = await page.evaluate((p) => {
    return getTextureParamIniValue(getActiveKeyCount(), p) ||
      resolveTextureParam(getActiveKeyCount(), p).name;
  }, targetParam);
  expect(previousPath).toBeTruthy();

  await page.click('#openTextureImageEditorBtn');
  await page.waitForFunction(() => document.getElementById('textureImageEditorModal').classList.contains('active'));

  const createdPath = 'station-created-undo-target';
  await page.click('#textureImageCreateOpenBtn');
  await page.fill('#textureImageCreateName', createdPath);
  await page.fill('#textureImageCreateWidth', '32');
  await page.fill('#textureImageCreateHeight', '32');
  await page.click('#textureImageCreateConfirmBtn');
  await page.waitForFunction((path) => {
    return collectExistingTextureSources().some((source) => source.path === path);
  }, createdPath);

  await page.click('.texture-image-tab[data-tab-id="menu"]');

  const targetRow = page.locator('#param-card-NoteImage0');
  await expect(targetRow).toBeVisible();
  await targetRow.locator('.texture-upload-dropdown').hover();
  // Hover already exercises the dropdown interaction; force the click because
  // adjacent cards can transiently overlap the animated menu after scrolling.
  await targetRow.locator('.texture-upload-menu-item.item-existing').click({ force: true });

  await expect(page.locator('#textureExistingPickerModal')).toHaveCSS('display', 'flex');
  await page.fill('#textureExistingPickerSearch', createdPath);
  const createdCard = page.locator('#textureExistingPickerGrid .texture-existing-card').first();
  await expect(createdCard).toHaveAttribute('data-texture-path', createdPath);
  await createdCard.click();

  const undoCountBeforeImport = await page.evaluate(() => undoStack.length);
  await page.click('#textureExistingPickerConfirmBtn');
  await page.waitForFunction(({ p, path }) => {
    return getTextureParamIniValue(getActiveKeyCount(), p) === path;
  }, { p: targetParam, path: createdPath });
  expect(await page.evaluate(() => undoStack.length)).toBe(undoCountBeforeImport + 1);

  await expect(page.locator('#textureImageUndoBtn')).toBeEnabled();
  await page.click('#textureImageUndoBtn');
  const restoredPath = await page.evaluate((p) => {
    return getTextureParamIniValue(getActiveKeyCount(), p) ||
      resolveTextureParam(getActiveKeyCount(), p).name;
  }, targetParam);
  expect(restoredPath).toBe(previousPath);

  expect(await page.evaluate(() => textureImageEditorUi.getState().dirtyTabCount)).toBe(0);
  expect(await page.evaluate(() => textureImageEditorUi.close())).toBe(true);
  await expect(page.locator('#textureImageEditorModal')).toHaveCSS('display', 'none');
  const pathAfterClose = await page.evaluate((p) => {
    return getTextureParamIniValue(getActiveKeyCount(), p) ||
      resolveTextureParam(getActiveKeyCount(), p).name;
  }, targetParam);
  expect(pathAfterClose).toBe(previousPath);
  expect(errors).toEqual([]);
});

test('菜单缩略图导入图片后可用贴图编辑器撤回按钮恢复', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });

  await page.goto('/index.html');
  await page.waitForFunction(
    () => typeof textureImageEditorUi !== 'undefined' && typeof triggerTextureUpload === 'function',
    null,
    { timeout: 30000 }
  );
  await page.setInputFiles('#oskInput', SKIN);
  await page.waitForFunction(() => isSkinLoading === false && skinImageStore.size > 0, null, { timeout: 60000 });
  await page.setInputFiles('#oszInput', MINIMAL_BEATMAP);
  await page.waitForFunction(() => isStartupWorkspaceReady(), null, { timeout: 60000 });

  await page.click('#openTextureImageEditorBtn');
  await page.waitForFunction(() => document.getElementById('textureImageEditorModal').classList.contains('active'));

  const targetRow = page.locator('#param-card-NoteImage0');
  await expect(targetRow).toBeVisible();
  const exportCountBefore = await page.evaluate(() => userReplacedTextures.size);

  await targetRow.locator('.texture-upload-dropdown > .texture-upload-main-btn').click();
  await page.setInputFiles('#textureReplaceInput', UPLOAD_IMAGE);
  await page.waitForFunction((count) => userReplacedTextures.size > count, exportCountBefore);

  await expect(page.locator('#textureImageUndoBtn')).toBeEnabled();
  await page.click('#textureImageUndoBtn');
  await page.waitForFunction((count) => userReplacedTextures.size === count, exportCountBefore);
  await expect(page.locator('#textureImageUndoBtn')).toBeDisabled();
  expect(errors).toEqual([]);
});

test('关闭贴图编辑窗口后引用已有贴图仍然生效', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });

  await page.goto('/index.html');
  await page.waitForFunction(
    () => typeof textureImageEditorUi !== 'undefined' && typeof textureExistingPickerUi !== 'undefined',
    null,
    { timeout: 30000 }
  );
  await page.setInputFiles('#oskInput', SKIN);
  await page.waitForFunction(() => isSkinLoading === false && skinImageStore.size > 0, null, { timeout: 60000 });
  await page.setInputFiles('#oszInput', MINIMAL_BEATMAP);
  await page.waitForFunction(() => isStartupWorkspaceReady(), null, { timeout: 60000 });

  await page.click('#openTextureImageEditorBtn');
  await page.waitForFunction(() => document.getElementById('textureImageEditorModal').classList.contains('active'));

  const targetRow = page.locator('#param-card-NoteImage0');
  await expect(targetRow).toBeVisible();
  await targetRow.locator('.texture-upload-dropdown').hover();
  await targetRow.locator('.texture-upload-menu-item.item-existing').click();

  await expect(page.locator('#textureExistingPickerModal')).toHaveCSS('display', 'flex');
  const candidatePath = await page.evaluate(() => {
    const current = normalizeTextureLookupPath(getTextureParamIniValue(getActiveKeyCount(), {
      key: 'NoteImage0',
      _trackLookup: LML.NoteImage,
      _trackCol: 0
    }));
    const sources = collectExistingTextureSources();
    const source = sources.find((item) => normalizeTextureLookupPath(item.path) !== current);
    return source ? source.path : null;
  });
  expect(candidatePath).toBeTruthy();

  await page.fill('#textureExistingPickerSearch', candidatePath);
  const firstCard = page.locator('#textureExistingPickerGrid .texture-existing-card').first();
  await expect(firstCard).toBeVisible();
  await firstCard.click();
  await page.click('#textureExistingPickerConfirmBtn');
  await expect(page.locator('#textureExistingPickerModal')).toHaveCSS('display', 'none');

  await page.evaluate((path) => {
    window.__referenceBeforeClose = {
      lookup: maniaSkinConfigurations.get(getActiveKeyCount()).ImageLookups.get('NoteImage0'),
      direct: maniaSkinConfigurations.get(getActiveKeyCount()).NoteImage0
    };
  }, candidatePath);

  await page.click('#textureImageEditorCloseBtn');
  await expect(page.locator('#textureImageEditorModal')).toHaveCSS('display', 'none');

  const result = await page.evaluate((expectedPath) => {
    const p = {
      key: 'NoteImage0',
      _trackLookup: LML.NoteImage,
      _trackCol: 0
    };
    return {
      before: window.__referenceBeforeClose,
      lookup: maniaSkinConfigurations.get(getActiveKeyCount()).ImageLookups.get('NoteImage0'),
      direct: maniaSkinConfigurations.get(getActiveKeyCount()).NoteImage0,
      inputValue: document.querySelector('#param-card-NoteImage0 .texture-path-input')?.value ?? null,
      resolved: resolveTextureParam(getActiveKeyCount(), p).state,
      expectedPath
    };
  }, candidatePath);

  expect(result.before.lookup).toBe(candidatePath);
  expect(result.lookup).toBe(candidatePath);
  expect(result.direct).toBe(candidatePath);
  expect(result.inputValue).toBe(candidatePath);
  expect(result.resolved).toBe('ok');
  expect(errors).toEqual([]);
});

test('从默认皮肤开始时引用和全部贴图能正确列出默认皮肤资源', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });

  await page.goto('/index.html');
  await page.waitForFunction(
    () => typeof textureImageEditorUi !== 'undefined' && typeof textureExistingPickerUi !== 'undefined',
    null,
    { timeout: 30000 }
  );

  await page.setInputFiles('#oszInput', MINIMAL_BEATMAP);
  await page.waitForFunction(() => isStartupBeatmapReady(), null, { timeout: 60000 });

  await page.click('#startupUseDefaultSkinBtn');
  await page.waitForFunction(() => isStartupWorkspaceReady(), null, { timeout: 60000 });

  const counts = await page.evaluate(() => ({
    picker: collectExistingTextureSources().length,
    library: collectExistingTextureSources(null, currentSkinZip, {
      expandAnimationFrames: true
    }).length
  }));
  expect(counts.picker).toBeGreaterThan(10);
  expect(counts.library).toBeGreaterThan(counts.picker);

  await page.click('#openTextureImageEditorBtn');
  await page.waitForFunction(() => document.getElementById('textureImageEditorModal').classList.contains('active'));

  const libraryTab = page.locator('.texture-image-tab[data-tab-id="texture-library"]');
  await libraryTab.click();
  await expect(page.locator('#textureImageLibraryView')).toBeVisible();
  const libraryCardsCount = await page.locator('#textureImageLibraryGrid .texture-existing-card').count();
  expect(libraryCardsCount).toBe(counts.library);
  await expect(page.locator('#textureImageLibraryEmpty')).toBeHidden();

  const menuTab = page.locator('.texture-image-tab[data-tab-id="menu"]');
  await menuTab.click();

  const targetRow = page.locator('#param-card-NoteImage0');
  await expect(targetRow).toBeVisible();
  await targetRow.scrollIntoViewIfNeeded();
  await targetRow.locator('.texture-upload-dropdown').first().hover();
  const existingItem = targetRow.locator('.texture-upload-menu-item.item-existing').first();
  await expect(existingItem).toBeVisible();
  await existingItem.click();

  await expect(page.locator('#textureExistingPickerModal')).toHaveCSS('display', 'flex');
  expect(await page.evaluate(() => textureExistingPickerUi.getState().sourceCount)).toBe(counts.picker);
  await expect(page.locator('#textureExistingPickerEmpty')).toBeHidden();

  await page.fill('#textureExistingPickerSearch', 'mania-note2');
  const firstCard = page.locator('#textureExistingPickerGrid .texture-existing-card').first();
  await expect(firstCard).toBeVisible();
  await firstCard.click();
  expect(await page.evaluate(() => textureExistingPickerUi.getState().selectedPath)).toBe('mania-note2');

  await page.click('#textureExistingPickerConfirmBtn');
  await expect(page.locator('#textureExistingPickerModal')).toHaveCSS('display', 'none');

  const assignedValue = await page.evaluate(() => {
    return maniaSkinConfigurations.get(getActiveKeyCount()).NoteImage0;
  });
  expect(assignedValue).toBe('mania-note2');
  expect(errors).toEqual([]);
});

test('默认皮肤引用已有 KeyImage 不会同步替换 KeyImageD', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });

  await page.goto('/index.html');
  await page.waitForFunction(
    () => typeof textureImageEditorUi !== 'undefined' && typeof textureExistingPickerUi !== 'undefined',
    null,
    { timeout: 30000 }
  );
  await page.setInputFiles('#oszInput', MINIMAL_BEATMAP);
  await page.waitForFunction(() => isStartupBeatmapReady(), null, { timeout: 60000 });
  await page.click('#startupUseDefaultSkinBtn');
  await page.waitForFunction(() => isStartupWorkspaceReady(), null, { timeout: 60000 });

  const before = await page.evaluate(() => {
    const keys = getActiveKeyCount();
    const info = {};
    const downName = getManiaNoteTextureName(keys, LML.KeyImageDown, 0, info);
    const downImage = getManiaSkinImage(keys, LML.KeyImageDown, 0);
    return {
      normalName: getManiaNoteTextureName(keys, LML.KeyImage, 0),
      downName,
      downExplicit: info.explicit,
      downWidth: downImage ? downImage.width : 0,
      downHeight: downImage ? downImage.height : 0
    };
  });

  await page.click('#openTextureImageEditorBtn');
  await page.waitForFunction(() => document.getElementById('textureImageEditorModal').classList.contains('active'));

  const targetRow = page.locator('#param-card-KeyImage0');
  await expect(targetRow).toBeVisible();
  await targetRow.locator('.texture-upload-dropdown').first().hover();
  await targetRow.locator('.texture-upload-menu-item.item-existing').first().click();
  await expect(page.locator('#textureExistingPickerModal')).toHaveCSS('display', 'flex');

  await page.fill('#textureExistingPickerSearch', 'mania-key2');
  const firstCard = page.locator('#textureExistingPickerGrid .texture-existing-card').first();
  await expect(firstCard).toBeVisible();
  await firstCard.click();
  await page.click('#textureExistingPickerConfirmBtn');
  await expect(page.locator('#textureExistingPickerModal')).toHaveCSS('display', 'none');

  const after = await page.evaluate(() => {
    const keys = getActiveKeyCount();
    const cfg = maniaSkinConfigurations.get(keys);
    const info = {};
    const downName = getManiaNoteTextureName(keys, LML.KeyImageDown, 0, info);
    const downImage = getManiaSkinImage(keys, LML.KeyImageDown, 0);
    return {
      normalLookup: cfg.ImageLookups.get('KeyImage0'),
      normalName: getManiaNoteTextureName(keys, LML.KeyImage, 0),
      downName,
      downExplicit: info.explicit,
      downWidth: downImage ? downImage.width : 0,
      downHeight: downImage ? downImage.height : 0
    };
  });

  expect(after.normalLookup).toBe('mania-key2');
  expect(after.normalName).not.toBe(before.normalName);
  expect(after.downName).toBe(before.downName);
  expect(after.downWidth).toBe(before.downWidth);
  expect(after.downHeight).toBe(before.downHeight);
  expect(after.downExplicit).toBe(true);
  expect(errors).toEqual([]);
});

const path = require('path');
const { test, expect } = require('@playwright/test');

const ROOT = path.resolve(__dirname, '../..');
const SKIN = path.join(ROOT, 'samples', 'skins', 'Kumakalerki.osk');
const BEATMAP = path.join(ROOT, 'samples', 'beatmaps', '1790742 MIMI - Kuu ni Naru.osz');

async function boot(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof textureImageEditorUi !== 'undefined');
  await page.setInputFiles('#oszInput', BEATMAP);
  await page.waitForFunction(
    () => isStartupBeatmapReady() && beatmaps.length > 0,
    null,
    { timeout: 60000 }
  );
  await page.setInputFiles('#oskInput', SKIN);
  await page.waitForFunction(
    () => isSkinLoading === false && isStartupWorkspaceReady(),
    null,
    { timeout: 60000 }
  );
  return errors;
}

async function installSharedNoteReference(page, name, columns) {
  await page.evaluate(({ name, columns }) => {
    const keys = getActiveKeyCount();
    const cfg = getManiaConfigForKeys(keys);
    if (!cfg.ImageLookups) cfg.ImageLookups = new Map();
    const frame = document.createElement('canvas');
    frame.width = 30;
    frame.height = 60;
    const ctx = frame.getContext('2d');
    ctx.fillStyle = '#d557a3';
    ctx.fillRect(0, 0, frame.width, frame.height);
    saveSkinAssetToStore(skinImageStore, name, frame, false, true, true);
    saveSkinAssetToStore(skinFallbackImageStore, name, frame, false, true, true);
    for (const column of columns) {
      cfg[`NoteImage${column}`] = name;
      cfg.ImageLookups.set(`NoteImage${column}`, name);
      cfg.ImageLookups.set(`NoteImage${column}`.toLowerCase(), name);
    }
    drawFrame();
  }, { name, columns });
}

async function openNoteEditor(page, paramKey = 'NoteImage0') {
  await page.click('#openTextureImageEditorBtn');
  await page.click(`#textureImagePickerGrid [data-param-key="${paramKey}"]`);
  await page.waitForFunction((key) => textureImageEditorUi.getState().selectedKey === key, paramKey);
  await page.fill('#textureImageCropRight', '4');
  await page.waitForFunction(() => textureImageEditorUi.getState().previewSize.width === 34);
}

function readNoteState(page) {
  return page.evaluate(() => {
    const keys = getActiveKeyCount();
    return {
      names: [0, 1].map((column) =>
        getManiaNoteTextureName(keys, LML.NoteImage, column)
      ),
      sizes: [0, 1].map((column) => {
        const image = getManiaSkinImage(keys, LML.NoteImage, column);
        return image ? { width: image.width, height: image.height } : null;
      })
    };
  });
}

test('generic shared texture save can overwrite the original path', async ({ page }) => {
  const errors = await boot(page);
  await installSharedNoteReference(page, 'shared-note-save', [0, 1]);
  const before = await readNoteState(page);

  await openNoteEditor(page);
  await page.click('#textureImageApplyBtn');
  await expect(page.locator('#textureImageApplyScopeModal')).toBeVisible();
  await page.click('#textureImageApplyScopeAllBtn');
  await page.waitForFunction(() => textureImageEditorUi.getState().dirtyTabCount === 0);
  const after = await readNoteState(page);

  expect(after.names).toEqual(before.names);
  expect(after.sizes).toEqual([
    { width: 34, height: 60 },
    { width: 34, height: 60 }
  ]);
  expect(errors).toEqual([]);
});
test('generic shared texture save can create an independent copy', async ({ page }) => {
  const errors = await boot(page);
  await installSharedNoteReference(page, 'shared-note-copy', [0, 1]);
  const before = await readNoteState(page);

  await openNoteEditor(page);
  await page.click('#textureImageApplyBtn');
  await expect(page.locator('#textureImageApplyScopeModal')).toBeVisible();
  await page.click('#textureImageApplyScopeCurrentBtn');
  await page.waitForFunction(() => textureImageEditorUi.getState().dirtyTabCount === 0);
  const after = await readNoteState(page);

  expect(after.names[0]).not.toBe(before.names[0]);
  expect(after.names[0]).toContain('shared-note-copy');
  expect(after.names[1]).toBe(before.names[1]);
  expect(after.sizes).toEqual([
    { width: 34, height: 60 },
    { width: 30, height: 60 }
  ]);
  expect(errors).toEqual([]);
});

test('unshared texture saves without a scope prompt', async ({ page }) => {
  const errors = await boot(page);
  await installSharedNoteReference(page, 'single-note-save', [0]);
  const before = await readNoteState(page);

  await openNoteEditor(page);
  await page.click('#textureImageApplyBtn');
  await expect(page.locator('#textureImageApplyScopeModal')).toBeHidden();
  await page.waitForFunction(() => textureImageEditorUi.getState().dirtyTabCount === 0);
  const after = await readNoteState(page);

  expect(after.names[0]).toBe(before.names[0]);
  expect(after.sizes[0]).toEqual({ width: 34, height: 60 });
  expect(errors).toEqual([]);
});

test('自建贴图被多轨共享时，在生成设置修改后选择同步替换，所有引用轨道同步更新', async ({ page }) => {
  const errors = await boot(page);
  await page.evaluate(() => {
    const keys = getActiveKeyCount();
    const cfg = getManiaConfigForKeys(keys);
    if (!cfg.ImageLookups) cfg.ImageLookups = new Map();
    const createdParams = {
      shape: 'rectangle',
      spec: '1x',
      width: 40,
      height: 40,
      color: '#33ccff',
      alpha: 100,
      cornerRadius: 0,
      arrowThickness: 20,
      arrowRoundness: 50,
      stripped: false,
      name: 'shared-created-box'
    };
    saveCreatedTextureParams('shared-created-box', createdParams);
    const canvas = createSolidShapeTexture(createdParams);
    saveSkinAssetToStore(skinImageStore, 'shared-created-box', canvas, false, true, true);
    saveSkinAssetToStore(skinFallbackImageStore, 'shared-created-box', canvas, false, true, true);
    for (const col of [0, 1]) {
      cfg[`NoteImage${col}`] = 'shared-created-box';
      cfg.ImageLookups.set(`NoteImage${col}`, 'shared-created-box');
      cfg.ImageLookups.set(`NoteImage${col}`.toLowerCase(), 'shared-created-box');
    }
    drawFrame();
  });

  await page.click('#openTextureImageEditorBtn');
  // 打开生成设置菜单
  const card = page.locator('#param-card-NoteImage0');
  const editBtn = card.locator('.texture-edit-main-btn');
  await expect(editBtn).toHaveClass(/has-modes/);
  await editBtn.hover();
  const modeMenu = card.locator('.texture-edit-mode-menu');
  await expect(modeMenu).toBeVisible();
  await modeMenu.locator('[data-edit-mode="generation"]').click();

  await expect(page.locator('#textureImageCreatorView')).toBeVisible();
  await page.fill('#textureImageCreateWidth', '60');
  await page.click('#textureImageCreateConfirmBtn');

  // 多轨引用提示弹窗
  const scopeModal = page.locator('#textureImageApplyScopeModal');
  await expect(scopeModal).toBeVisible();
  await page.click('#textureImageApplyScopeAllBtn'); // 同步替换
  await expect(scopeModal).toBeHidden();
  await expect(page.locator('#textureImageCreatorView')).toBeHidden();

  const state = await readNoteState(page);
  expect(state.names).toEqual(['shared-created-box', 'shared-created-box']);
  expect(state.sizes).toEqual([
    { width: 60, height: 40 },
    { width: 60, height: 40 }
  ]);
  const createdParams = await page.evaluate(() => getCreatedTextureParams('shared-created-box'));
  expect(createdParams.width).toBe(60);
  expect(errors).toEqual([]);
});

test('自建贴图被多轨共享时，在生成设置修改后选择独立创建，为当前轨独立创建贴图并保留参数及支持撤回重做', async ({ page }) => {
  const errors = await boot(page);
  await page.evaluate(() => {
    const keys = getActiveKeyCount();
    const cfg = getManiaConfigForKeys(keys);
    if (!cfg.ImageLookups) cfg.ImageLookups = new Map();
    const createdParams = {
      shape: 'rectangle',
      spec: '1x',
      width: 40,
      height: 40,
      color: '#ffaa33',
      alpha: 100,
      cornerRadius: 0,
      arrowThickness: 20,
      arrowRoundness: 50,
      stripped: false,
      name: 'shared-created-split'
    };
    saveCreatedTextureParams('shared-created-split', createdParams);
    const canvas = createSolidShapeTexture(createdParams);
    saveSkinAssetToStore(skinImageStore, 'shared-created-split', canvas, false, true, true);
    saveSkinAssetToStore(skinFallbackImageStore, 'shared-created-split', canvas, false, true, true);
    for (const col of [0, 1]) {
      cfg[`NoteImage${col}`] = 'shared-created-split';
      cfg.ImageLookups.set(`NoteImage${col}`, 'shared-created-split');
      cfg.ImageLookups.set(`NoteImage${col}`.toLowerCase(), 'shared-created-split');
    }
    drawFrame();
  });

  await page.click('#openTextureImageEditorBtn');
  const card = page.locator('#param-card-NoteImage0');
  const editBtn = card.locator('.texture-edit-main-btn');
  await expect(editBtn).toHaveClass(/has-modes/);
  await editBtn.hover();
  const modeMenu = card.locator('.texture-edit-mode-menu');
  await expect(modeMenu).toBeVisible();
  await modeMenu.locator('[data-edit-mode="generation"]').click();

  await expect(page.locator('#textureImageCreatorView')).toBeVisible();
  await page.fill('#textureImageCreateWidth', '70');
  await page.click('#textureImageCreateConfirmBtn');

  // 多轨引用提示弹窗
  const scopeModal = page.locator('#textureImageApplyScopeModal');
  await expect(scopeModal).toBeVisible();
  await page.click('#textureImageApplyScopeCurrentBtn'); // 独立创建
  await expect(scopeModal).toBeHidden();
  await expect(page.locator('#textureImageCreatorView')).toBeHidden();

  const stateAfter = await readNoteState(page);
  expect(stateAfter.names[0]).not.toBe('shared-created-split');
  expect(stateAfter.names[0]).toContain('shared-created-split');
  expect(stateAfter.names[1]).toBe('shared-created-split');
  expect(stateAfter.sizes[0]).toEqual({ width: 70, height: 40 });
  expect(stateAfter.sizes[1]).toEqual({ width: 40, height: 40 });

  // 验证原自建贴图和新独立贴图都完整保留了生成设置参数
  const originalParams = await page.evaluate(() => getCreatedTextureParams('shared-created-split'));
  const newParams = await page.evaluate((key) => getCreatedTextureParams(key), stateAfter.names[0]);
  expect(originalParams.width).toBe(40);
  expect(newParams.width).toBe(70);

  // 验证撤回
  await page.evaluate(() => performSkinUndo());
  const undone = await readNoteState(page);
  expect(undone.names).toEqual(['shared-created-split', 'shared-created-split']);
  expect(undone.sizes).toEqual([
    { width: 40, height: 40 },
    { width: 40, height: 40 }
  ]);

  // 验证重做
  await page.evaluate(() => performSkinRedo());
  const redone = await readNoteState(page);
  expect(redone.names).toEqual(stateAfter.names);
  expect(redone.sizes).toEqual(stateAfter.sizes);
  expect(errors).toEqual([]);
});

test('KeyImage 多轨共享时主保存弹窗支持同步替换与独立创建', async ({ page }) => {
  const errors = await boot(page);
  await page.evaluate(() => {
    const keys = getActiveKeyCount();
    const cfg = getManiaConfigForKeys(keys);
    if (!cfg.ImageLookups) cfg.ImageLookups = new Map();
    const frame = document.createElement('canvas');
    frame.width = 30;
    frame.height = 60;
    const ctx = frame.getContext('2d');
    ctx.fillStyle = '#66cc88';
    ctx.fillRect(0, 0, frame.width, frame.height);
    saveSkinAssetToStore(skinImageStore, 'shared-key-test', frame, false, true, true);
    saveSkinAssetToStore(skinFallbackImageStore, 'shared-key-test', frame, false, true, true);
    for (let col = 0; col < 4; col++) {
      cfg[`KeyImage${col}`] = 'shared-key-test';
      cfg[`KeyImage${col}D`] = `key-down-${col}`;
      cfg.ImageLookups.set(`KeyImage${col}`, 'shared-key-test');
      cfg.ImageLookups.set(`KeyImage${col}D`, `key-down-${col}`);
    }
    drawFrame();
  });

  await page.click('#openTextureImageEditorBtn');
  await page.click('#textureImagePickerGrid [data-param-key="KeyImage0"]');
  await page.waitForFunction(() => textureImageEditorUi.getState().selectedKey === 'KeyImage0');
  await page.fill('#textureImageCropBottom', '10');
  await page.waitForFunction(() => textureImageEditorUi.getState().previewSize.height === 70);

  await page.click('#textureImageApplyBtn');
  const scopeModal = page.locator('#textureImageApplyScopeModal');
  await expect(scopeModal).toBeVisible();
  await page.click('#textureImageApplyScopeCurrentBtn'); // 独立创建
  await expect(scopeModal).toBeHidden();
  await page.waitForFunction(() => textureImageEditorUi.getState().dirtyTabCount === 0);

  const afterIndependent = await page.evaluate(() => {
    const keys = getActiveKeyCount();
    return Array.from({ length: keys }, (_, col) => getManiaNoteTextureName(keys, LML.KeyImage, col));
  });
  expect(afterIndependent[0]).not.toBe('shared-key-test');
  expect(afterIndependent[0]).toContain('shared-key-test');
  expect(afterIndependent[1]).toBe('shared-key-test');
  expect(afterIndependent[2]).toBe('shared-key-test');
  expect(afterIndependent[3]).toBe('shared-key-test');
  expect(errors).toEqual([]);
});

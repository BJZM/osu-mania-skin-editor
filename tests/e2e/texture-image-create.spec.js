const path = require('path');
const { test, expect } = require('@playwright/test');

const ROOT = path.resolve(__dirname, '../..');
const SKIN = path.join(ROOT, 'samples', 'skins', 'Kumakalerki.osk');
const OPAQUE_TAIL_SKIN = path.join(ROOT, 'samples', 'skins', 'Gyoo.osk');
const MINIMAL_BEATMAP = path.join(ROOT, 'samples', 'beatmaps', 'minimal-4k.osu');

async function boot(page, skinPath = SKIN) {
  const errors = [];
  page.on('pageerror', (error) => {
    console.log('BROWSER PAGEERROR:', error);
    errors.push(`pageerror: ${error.message}`);
  });
  page.on('console', (message) => {
    console.log(`[${message.type()}]`, message.text());
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  await page.goto('/index.html');
  await page.waitForFunction(
    () => typeof textureImageEditorUi !== 'undefined' && typeof createSolidShapeTexture === 'function',
    null,
    { timeout: 30000 }
  );
  await page.setInputFiles('#oskInput', skinPath);
  await page.waitForFunction(() => isSkinLoading === false, null, { timeout: 60000 });
  await page.setInputFiles('#oszInput', MINIMAL_BEATMAP);
  await page.waitForFunction(() => isStartupWorkspaceReady(), null, { timeout: 60000 });
  await page.waitForTimeout(250);
  return errors;
}

async function referenceCreatedTextureInMenu(page, texturePath, paramKey = 'StageLeft') {
  await page.click('.texture-image-tab[data-tab-id="menu"]');
  const pathInput = page.locator(`#param-card-${paramKey} .texture-path-input`);
  await pathInput.fill(texturePath);
  await pathInput.press('Tab');
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await page.mouse.move(8, 8);
  await page.waitForTimeout(280);
  await page.waitForFunction(({ key }) => {
    const card = document.getElementById(`param-card-${key}`);
    const button = card && card.querySelector('.texture-edit-main-btn');
    return button && button.classList.contains('has-modes');
  }, { key: paramKey });
}

async function openCreatedTextureEditMenu(page, paramKey = 'StageLeft') {
  const button = page.locator(`#param-card-${paramKey} .texture-edit-main-btn`);
  await expect(button).toHaveClass(/has-modes/);
  const menu = page.locator(`#param-card-${paramKey} .texture-edit-mode-menu`);
  await button.hover();
  await expect(menu).toBeVisible();
  return menu;
}

test('创建贴图作为独立标签展示、保留草稿并可单独关闭', async ({ page }) => {
  const errors = await boot(page);
  await page.click('#openTextureImageEditorBtn');
  await page.click('#textureImageCreateOpenBtn');

  const creatorTab = page.locator('.texture-image-tab[data-tab-id="texture-creator"]');
  await expect(creatorTab).toHaveCount(1);
  await expect(creatorTab).toHaveClass(/is-active/);
  await expect(creatorTab.locator('.texture-image-tab-label')).toHaveText(/^创建 · texture-\d+$/);
  await expect(creatorTab.locator('.texture-image-tab-close')).toHaveCount(1);
  await expect(page.locator('.texture-image-tab[data-tab-id="menu"] .texture-image-tab-close')).toHaveCount(0);
  await expect(page.locator('.texture-image-tabs > #textureImageCreateOpenBtn')).toBeVisible();
  await expect(page.locator('#textureImageCreateOpenBtn')).toHaveCount(1);
  await expect(page.locator('#textureImageLibraryCreateBtn')).toHaveCount(0);

  await page.fill('#textureImageCreateWidth', '180');
  await page.fill('#textureImageCreateHeight', '120');
  await page.click('#textureImageCreateShapeGrid [data-shape="circle"]');
  await page.click('.texture-image-tab[data-tab-id="menu"]');
  await expect(page.locator('#textureImagePickerView')).toBeVisible();
  await expect(creatorTab).toHaveCount(1);
  expect(await page.evaluate(() => textureImageEditorUi.getState().creator.active)).toBe(false);

  await creatorTab.click();
  await expect(page.locator('#textureImageCreatorView')).toBeVisible();
  expect(await page.evaluate(() => textureImageEditorUi.getState().creator)).toMatchObject({
    active: true,
    width: 180,
    height: 120,
    shape: 'circle'
  });

  await creatorTab.locator('.texture-image-tab-close').click();
  await expect(creatorTab).toHaveCount(0);
  await expect(page.locator('.texture-image-tab[data-tab-id="menu"]')).toHaveClass(/is-active/);
  expect(errors).toEqual([]);
});

test('箭头标签提供独立的粗细与圆角程度调节', async ({ page }) => {
  const errors = await boot(page);
  await page.click('#openTextureImageEditorBtn');
  await page.click('#textureImageCreateOpenBtn');
  await page.click('#textureImageCreateShapeGrid [data-shape="arrow-up"]');

  await expect(page.locator('#textureImageCreateArrowThicknessRow')).toBeVisible();
  await expect(page.locator('#textureImageCreateArrowRoundnessRow')).toBeVisible();
  expect(await page.inputValue('#textureImageCreateArrowThicknessValue')).toBe('20');
  expect(await page.inputValue('#textureImageCreateArrowRoundnessValue')).toBe('50');

  await page.fill('#textureImageCreateArrowThicknessValue', '55');
  await page.fill('#textureImageCreateArrowRoundnessValue', '25');
  expect(await page.evaluate(() => textureImageEditorUi.getState().creator)).toMatchObject({
    shape: 'arrow-up',
    arrowThickness: 50,
    arrowRoundness: 25
  });

  await page.click('#textureImageCreateShapeGrid [data-shape="circle"]');
  await expect(page.locator('#textureImageCreateArrowThicknessRow')).toBeHidden();
  await expect(page.locator('#textureImageCreateArrowRoundnessRow')).toBeHidden();
  expect(errors).toEqual([]);
});

test('创建贴图提供名称输入与同名校验，可从标签栏加号快速打开', async ({ page }) => {
  const errors = await boot(page);
  await page.click('#openTextureImageEditorBtn');
  await page.click('#textureImageCreateOpenBtn');

  await expect(page.locator('#textureImageCreateNameSection')).toBeVisible();
  const nameInput = page.locator('#textureImageCreateName');
  await expect(nameInput).toBeVisible();
  expect(await nameInput.inputValue()).toMatch(/^texture-\d+$/);

  // 同名校验
  const existingSource = await page.evaluate(() => collectExistingTextureSources()[0].basename);
  await nameInput.fill(existingSource);
  await page.click('#textureImageCreateConfirmBtn');
  await expect(page.locator('#textureImageCreateNameError')).toBeVisible();
  await expect(page.locator('#textureImageCreateNameError')).toContainText('已存在同名贴图');

  // 取消并关闭
  await page.click('#textureImageCreateCancelBtn');
  await expect(page.locator('.texture-image-tab[data-tab-id="texture-creator"]')).toHaveCount(0);

  // 从全部贴图标签下通过同一个加号打开创建
  await page.click('.texture-image-tab[data-tab-id="texture-library"]');
  await page.click('#textureImageCreateOpenBtn');
  await expect(page.locator('.texture-image-tab[data-tab-id="texture-creator"]')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('标签栏加号可连续创建多个独立草稿并分别保留设置', async ({ page }) => {
  const errors = await boot(page);
  await page.click('#openTextureImageEditorBtn');

  await page.click('#textureImageCreateOpenBtn');
  const firstName = await page.inputValue('#textureImageCreateName');
  await page.fill('#textureImageCreateWidth', '180');
  await page.fill('#textureImageCreateHeight', '120');
  await page.click('#textureImageCreateShapeGrid [data-shape="circle"]');

  await page.click('#textureImageCreateOpenBtn');
  const secondTab = page.locator('.texture-image-tab[data-tab-id="texture-creator-2"]');
  await expect(page.locator('.texture-image-tab[data-tab-id^="texture-creator"]')).toHaveCount(2);
  await expect(secondTab).toHaveClass(/is-active/);
  expect(await page.inputValue('#textureImageCreateName')).not.toBe(firstName);
  await page.click('.texture-image-tab[data-tab-id="texture-creator"]');
  await page.fill('#textureImageCreateName', 'draft-one');
  await secondTab.click();
  await page.fill('#textureImageCreateName', 'draft-two');
  await page.fill('#textureImageCreateWidth', '96');
  await page.fill('#textureImageCreateHeight', '64');
  await page.click('#textureImageCreateShapeGrid [data-shape="arrow-right"]');

  await page.click('.texture-image-tab[data-tab-id="texture-creator"]');
  expect(await page.inputValue('#textureImageCreateName')).toBe('draft-one');
  expect(await page.inputValue('#textureImageCreateWidth')).toBe('180');
  expect(await page.inputValue('#textureImageCreateHeight')).toBe('120');
  expect(await page.evaluate(() => textureImageEditorUi.getState().creator.shape)).toBe('circle');

  await secondTab.click();
  expect(await page.inputValue('#textureImageCreateName')).toBe('draft-two');
  expect(await page.inputValue('#textureImageCreateWidth')).toBe('96');
  expect(await page.inputValue('#textureImageCreateHeight')).toBe('64');
  expect(await page.evaluate(() => textureImageEditorUi.getState().creator.shape)).toBe('arrow-right');

  await secondTab.locator('.texture-image-tab-close').click();
  await expect(secondTab).toHaveCount(0);
  await expect(page.locator('.texture-image-tab[data-tab-id="texture-creator"]')).toHaveClass(/is-active/);
  expect(await page.inputValue('#textureImageCreateName')).toBe('draft-one');
  expect(errors).toEqual([]);
});

test('多个创建标签会自动缩窄，确认一张后继续下一个草稿', async ({ page }) => {
  const errors = await boot(page);
  await page.click('#openTextureImageEditorBtn');

  for (let index = 1; index <= 6; index++) {
    await page.click('#textureImageCreateOpenBtn');
    await page.fill('#textureImageCreateName', `batch-${index}`);
    await page.fill('#textureImageCreateWidth', '8');
    await page.fill('#textureImageCreateHeight', '8');
  }

  const creatorTabs = page.locator('.texture-image-tab[data-tab-id^="texture-creator"]');
  await expect(creatorTabs).toHaveCount(6);
  const tabWidths = await creatorTabs.evaluateAll((elements) =>
    elements.map((element) => element.getBoundingClientRect().width)
  );
  expect(Math.min(...tabWidths)).toBeGreaterThanOrEqual(107.5);
  expect(Math.max(...tabWidths)).toBeLessThan(220);
  await expect(page.locator('#textureImageCreateOpenBtn')).toBeVisible();

  await page.click('.texture-image-tab[data-tab-id="texture-creator"]');
  await page.click('#textureImageCreateConfirmBtn');
  await expect(page.locator('.texture-image-tab[data-tab-id="texture-creator"]')).toHaveCount(0);
  await expect(page.locator('.texture-image-tab[data-tab-id="texture-creator-2"]')).toHaveClass(/is-active/);
  await expect(page.locator('#textureImageCreatorView')).toBeVisible();

  await page.click('#textureImageCreateConfirmBtn');
  await expect(page.locator('.texture-image-tab[data-tab-id^="texture-creator"]')).toHaveCount(4);
  await expect(page.locator('.texture-image-tab[data-tab-id="texture-creator-3"]')).toHaveClass(/is-active/);
  expect(errors).toEqual([]);
});

test('创建贴图在全部贴图中不提供编辑入口，并可在菜单引用后进入生成设置', async ({ page }) => {
  const errors = await boot(page);
  await page.click('#openTextureImageEditorBtn');
  await page.click('#textureImageCreateOpenBtn');

  // 读取默认生成的名称（例如 texture-1）
  const defaultName = await page.inputValue('#textureImageCreateName');
  expect(defaultName).toMatch(/^texture-\d+$/);

  // 直接保存默认名称
  await page.click('#textureImageCreateConfirmBtn');

  await page.waitForFunction(() => {
    return document.getElementById('textureImageLibraryView').style.display !== 'none';
  });

  // 验证在全部贴图区域能找到该贴图卡片
  const card = page.locator(`#textureImageLibraryGrid .texture-library-card[data-texture-path="${defaultName}"]`);
  await expect(card).toBeVisible();

  // 验证 sources 数据集合中确实包含该贴图
  const foundInSources = await page.evaluate((name) => {
    const list = collectExistingTextureSources();
    return list.some((item) => item.path === name);
  }, defaultName);
  expect(foundInSources).toBe(true);

  await expect(card.locator('button')).toHaveCount(0);

  await referenceCreatedTextureInMenu(page, defaultName);
  const modeMenu = await openCreatedTextureEditMenu(page);
  await modeMenu.locator('[data-edit-mode="generation"]').click();

  await expect(page.locator('#textureImageCreatorView')).toBeVisible();
  const creatorState = await page.evaluate(() => textureImageEditorUi.getState().creator);
  expect(creatorState).toMatchObject({
    active: true,
    editPath: defaultName,
    name: defaultName
  });

  expect(errors).toEqual([]);
});

test('默认名称 texture-1 保存通用设置后仍保留完整名称和生成设置', async ({ page }) => {
  const errors = await boot(page);
  await page.click('#openTextureImageEditorBtn');
  await page.click('#textureImageCreateOpenBtn');
  const defaultName = await page.inputValue('#textureImageCreateName');
  expect(defaultName).toMatch(/^texture-\d+$/);
  await page.click('#textureImageCreateConfirmBtn');
  await page.waitForFunction(() => {
    return document.getElementById('textureImageLibraryView').style.display !== 'none';
  });

  await referenceCreatedTextureInMenu(page, defaultName);
  let modeMenu = await openCreatedTextureEditMenu(page);
  await modeMenu.locator('[data-edit-mode="general"]').click();
  await page.fill('#textureImageCropRight', '4');
  await page.click('#textureImageApplyBtn');
  await page.waitForFunction(() => textureImageEditorUi.getState().dirtyTabCount === 0);

  await page.click('.texture-image-tab[data-tab-id="menu"]');
  await expect(
    page.locator('#param-card-StageLeft .texture-path-input')
  ).toHaveValue(defaultName);
  await expect(
    page.locator('#param-card-StageLeft .texture-edit-main-btn')
  ).toHaveClass(/has-modes/);
  modeMenu = await openCreatedTextureEditMenu(page);
  await expect(modeMenu.locator('[data-edit-mode="generation"]')).toBeVisible();
  const createdParams = await page.evaluate((name) => ({
    full: hasCreatedTextureParams(name),
    stripped: hasCreatedTextureParams(name.replace(/-\d+$/, '')),
    params: getCreatedTextureParams(name)
  }), defaultName);
  expect(createdParams).toMatchObject({
    full: true,
    stripped: false
  });
  expect(createdParams.params.name).toBe(defaultName);
  expect(errors).toEqual([]);
});

test('菜单中引用创建贴图后可选择通用编辑并按路径保存裁剪结果', async ({ page }) => {
  const errors = await boot(page);
  await page.click('#openTextureImageEditorBtn');
  await page.click('#textureImageCreateOpenBtn');
  await page.fill('#textureImageCreateName', 'general-edit-texture');
  await page.fill('#textureImageCreateWidth', '40');
  await page.fill('#textureImageCreateHeight', '40');
  await page.fill('#textureImageCreateColorHex', '#00ff00');
  await page.click('#textureImageCreateConfirmBtn');

  await page.waitForFunction(() => {
    return document.getElementById('textureImageLibraryView').style.display !== 'none';
  });

  await referenceCreatedTextureInMenu(page, 'general-edit-texture');
  const modeMenu = await openCreatedTextureEditMenu(page);
  await modeMenu.locator('[data-edit-mode="general"]').click();

  await expect(page.locator('#textureImageEditorView')).toBeVisible();
  await expect(page.locator('#textureImageCreatorView')).toBeHidden();
  expect(await page.evaluate(() => textureImageEditorUi.getState())).toMatchObject({
    selectedKind: 'library',
    selectedLibraryPath: 'general-edit-texture',
    sourceSize: { width: 40, height: 40 }
  });

  await page.fill('#textureImageCropLeft', '-10');
  await page.fill('#textureImageCropRight', '-10');
  await page.waitForFunction(() => {
    return textureImageEditorUi.getState().previewSize.width === 20;
  });
  await page.click('#textureImageApplyBtn');
  await page.waitForFunction(() => {
    const source = collectExistingTextureSources()
      .find((item) => item.path === 'general-edit-texture');
    return source && source.width === 20 && source.height === 40;
  });

  expect(await page.evaluate(() => getCreatedTextureParams('general-edit-texture'))).toMatchObject({
    width: 40,
    height: 40
  });

  await page.click('.texture-image-tab.is-active .texture-image-tab-close');
  await page.click('.texture-image-tab[data-tab-id="menu"]');
  const reopenedMenu = await openCreatedTextureEditMenu(page);
  await reopenedMenu.locator('[data-edit-mode="general"]').click();

  expect(await page.evaluate(() => textureImageEditorUi.getState())).toMatchObject({
    selectedKind: 'library',
    sourceSize: { width: 40, height: 40 },
    previewSize: { width: 20, height: 40 },
    inputValues: { left: -10, right: -10 }
  });
  expect(errors).toEqual([]);
});

test('生成设置重命名创建贴图会同步菜单中的引用路径', async ({ page }) => {
  const errors = await boot(page);
  await page.click('#openTextureImageEditorBtn');
  await page.click('#textureImageCreateOpenBtn');
  await page.fill('#textureImageCreateName', 'rename-before');
  await page.fill('#textureImageCreateWidth', '32');
  await page.fill('#textureImageCreateHeight', '32');
  await page.click('#textureImageCreateConfirmBtn');

  await page.waitForFunction(() => {
    return document.getElementById('textureImageLibraryView').style.display !== 'none';
  });
  await referenceCreatedTextureInMenu(page, 'rename-before');
  const modeMenu = await openCreatedTextureEditMenu(page);
  await modeMenu.locator('[data-edit-mode="generation"]').click();

  await expect(page.locator('#textureImageCreatorView')).toBeVisible();
  await page.fill('#textureImageCreateName', 'rename-after');
  await page.click('#textureImageCreateConfirmBtn');
  await page.waitForFunction(() => {
    return document.getElementById('textureImageLibraryView').style.display !== 'none';
  });

  await page.click('.texture-image-tab[data-tab-id="menu"]');
  const pathInput = page.locator('#param-card-StageLeft .texture-path-input');
  await expect(pathInput).toHaveValue('rename-after');
  expect(await page.evaluate(() => {
    const p = getTextureTabParams().find((item) => item.key === 'StageLeft');
    const resolved = resolveTextureParam(getActiveKeyCount(), p);
    return {
      state: resolved.state,
      name: resolved.name,
      oldParams: getCreatedTextureParams('rename-before'),
      newParams: getCreatedTextureParams('rename-after')
    };
  })).toMatchObject({
    state: 'ok',
    name: 'rename-after',
    oldParams: null,
    newParams: { width: 32, height: 32 }
  });
  await expect(
    page.locator('#param-card-StageLeft .texture-edit-main-btn')
  ).toHaveClass(/has-modes/);
  expect(errors).toEqual([]);
});

test('自建贴图的生成设置与通用设置彼此独立并可重复编辑', async ({ page }) => {
  const errors = await boot(page);
  await page.click('#openTextureImageEditorBtn');
  await page.click('#textureImageCreateOpenBtn');
  await page.fill('#textureImageCreateName', 'layered-created-texture');
  await page.fill('#textureImageCreateWidth', '40');
  await page.fill('#textureImageCreateHeight', '40');
  await page.fill('#textureImageCreateColorHex', '#00ff00');
  await page.click('#textureImageCreateConfirmBtn');

  await page.waitForFunction(() => {
    return document.getElementById('textureImageLibraryView').style.display !== 'none';
  });
  await referenceCreatedTextureInMenu(page, 'layered-created-texture');
  let modeMenu = await openCreatedTextureEditMenu(page);
  await modeMenu.locator('[data-edit-mode="general"]').click();
  await page.fill('#textureImageCropLeft', '-10');
  await page.fill('#textureImageCropRight', '-10');
  await page.waitForFunction(() => textureImageEditorUi.getState().previewSize.width === 20);
  await page.click('#textureImageApplyBtn');
  await page.waitForFunction(() => textureImageEditorUi.getState().dirtyTabCount === 0);

  expect(await page.evaluate(() => getCreatedTextureParams('layered-created-texture')))
    .toMatchObject({
      width: 40,
      height: 40,
      generalEditParams: {
        cropLeft: -10,
        cropRight: -10
      }
    });

  await page.click('.texture-image-tab.is-active .texture-image-tab-close');
  await page.click('.texture-image-tab[data-tab-id="menu"]');
  modeMenu = await openCreatedTextureEditMenu(page);
  await modeMenu.locator('[data-edit-mode="generation"]').click();
  await page.fill('#textureImageCreateColorHex', '#ff0000');
  await page.click('#textureImageCreateShapeGrid [data-shape="circle"]');
  await page.click('#textureImageCreateConfirmBtn');
  await page.waitForFunction(() => {
    return document.getElementById('textureImageLibraryView').style.display !== 'none';
  });

  await page.click('.texture-image-tab[data-tab-id="menu"]');
  modeMenu = await openCreatedTextureEditMenu(page);
  await modeMenu.locator('[data-edit-mode="general"]').click();
  expect(await page.evaluate(() => textureImageEditorUi.getState())).toMatchObject({
    selectedKind: 'library',
    selectedLibraryPath: 'layered-created-texture',
    sourceSize: { width: 40, height: 40 },
    previewSize: { width: 20, height: 40 },
    inputValues: { left: -10, right: -10 }
  });
  const rendered = await page.evaluate(() => {
    const p = getTextureTabParams().find((item) => item.key === 'StageLeft');
    const resolved = resolveTextureParam(getActiveKeyCount(), p);
    const canvas = document.createElement('canvas');
    canvas.width = resolved.img.width;
    canvas.height = resolved.img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(resolved.img, 0, 0);
    return {
      name: resolved.name,
      size: { width: canvas.width, height: canvas.height },
      center: Array.from(ctx.getImageData(
        Math.floor(canvas.width / 2),
        Math.floor(canvas.height / 2),
        1,
        1
      ).data)
    };
  });
  expect(rendered.name).toBe('layered-created-texture');
  expect(rendered.size).toEqual({ width: 20, height: 40 });
  expect(rendered.center[0]).toBeGreaterThan(240);
  expect(rendered.center[1]).toBeLessThan(20);
  expect(rendered.center[3]).toBe(255);
  expect(errors).toEqual([]);
});

test('生成设置修改会实时更新画布，取消后恢复原贴图', async ({ page }) => {
  const errors = await boot(page);
  await page.click('#openTextureImageEditorBtn');
  await page.click('#textureImageCreateOpenBtn');
  await page.fill('#textureImageCreateName', 'live-preview-created');
  await page.fill('#textureImageCreateWidth', '40');
  await page.fill('#textureImageCreateHeight', '40');
  await page.fill('#textureImageCreateColorHex', '#00ff00');
  await page.click('#textureImageCreateConfirmBtn');
  await page.waitForFunction(() => {
    return document.getElementById('textureImageLibraryView').style.display !== 'none';
  });
  await referenceCreatedTextureInMenu(page, 'live-preview-created');

  const readCanvasTextureCenter = () => page.evaluate(() => {
    const p = getTextureTabParams().find((item) => item.key === 'StageLeft');
    const resolved = resolveTextureParam(getActiveKeyCount(), p);
    const canvas = document.createElement('canvas');
    canvas.width = resolved.img.width;
    canvas.height = resolved.img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(resolved.img, 0, 0);
    return Array.from(ctx.getImageData(
      Math.floor(canvas.width / 2),
      Math.floor(canvas.height / 2),
      1,
      1
    ).data);
  });
  expect(await readCanvasTextureCenter()).toMatchObject({
    0: 0,
    1: expect.any(Number),
    2: 0,
    3: 255
  });

  let modeMenu = await openCreatedTextureEditMenu(page);
  await modeMenu.locator('[data-edit-mode="generation"]').click();
  await page.fill('#textureImageCreateColorHex', '#ff0000');
  await page.waitForFunction(() => {
    const p = getTextureTabParams().find((item) => item.key === 'StageLeft');
    const resolved = resolveTextureParam(getActiveKeyCount(), p);
    const canvas = document.createElement('canvas');
    canvas.width = resolved.img.width;
    canvas.height = resolved.img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(resolved.img, 0, 0);
    const pixel = ctx.getImageData(
      Math.floor(canvas.width / 2),
      Math.floor(canvas.height / 2),
      1,
      1
    ).data;
    return pixel[0] > 240 && pixel[1] < 20 && pixel[3] === 255;
  });

  await page.click('#textureImageCreateCancelBtn');
  await page.waitForFunction(() => {
    const p = getTextureTabParams().find((item) => item.key === 'StageLeft');
    const resolved = resolveTextureParam(getActiveKeyCount(), p);
    const canvas = document.createElement('canvas');
    canvas.width = resolved.img.width;
    canvas.height = resolved.img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(resolved.img, 0, 0);
    const pixel = ctx.getImageData(
      Math.floor(canvas.width / 2),
      Math.floor(canvas.height / 2),
      1,
      1
    ).data;
    return pixel[0] < 20 && pixel[1] > 240 && pixel[3] === 255;
  });
  expect(errors).toEqual([]);
});

test('逐轨引用自建贴图保存通用设置后仍保留生成设置入口', async ({ page }) => {
  const errors = await boot(page);
  await page.click('#openTextureImageEditorBtn');
  await page.click('#textureImageCreateOpenBtn');
  await page.fill('#textureImageCreateName', 'per-track-created-texture');
  await page.fill('#textureImageCreateWidth', '40');
  await page.fill('#textureImageCreateHeight', '40');
  await page.click('#textureImageCreateConfirmBtn');
  await page.waitForFunction(() => {
    return document.getElementById('textureImageLibraryView').style.display !== 'none';
  });

  await referenceCreatedTextureInMenu(
    page,
    'per-track-created-texture',
    'KeyImage0'
  );
  let modeMenu = await openCreatedTextureEditMenu(page, 'KeyImage0');
  await modeMenu.locator('[data-edit-mode="general"]').click();
  await page.fill('#textureImageCropBottom', '-4');
  await page.click('#textureImageApplyBtn');
  await page.waitForFunction(() => textureImageEditorUi.getState().dirtyTabCount === 0);

  await page.click('.texture-image-tab[data-tab-id="menu"]');
  const editButton = page.locator(
    '#param-card-KeyImage0 .texture-edit-main-btn'
  );
  await expect(editButton).toHaveClass(/has-modes/);
  modeMenu = await openCreatedTextureEditMenu(page, 'KeyImage0');
  await expect(modeMenu.locator('[data-edit-mode="generation"]')).toBeVisible();
  expect(await page.evaluate(() =>
    getCreatedTextureParams('per-track-created-texture')
  )).toMatchObject({
    width: 40,
    height: 40,
    generalEditParams: { cropBottom: -4 }
  });
  expect(errors).toEqual([]);
});

test('共享自建贴图选择独立副本后副本仍可编辑生成设置', async ({ page }) => {
  const errors = await boot(page);
  await page.click('#openTextureImageEditorBtn');
  await page.click('#textureImageCreateOpenBtn');
  await page.fill('#textureImageCreateName', 'shared-created-texture');
  await page.fill('#textureImageCreateWidth', '40');
  await page.fill('#textureImageCreateHeight', '40');
  await page.click('#textureImageCreateConfirmBtn');
  await page.waitForFunction(() => {
    return document.getElementById('textureImageLibraryView').style.display !== 'none';
  });

  await referenceCreatedTextureInMenu(
    page,
    'shared-created-texture',
    'KeyImage0'
  );
  await referenceCreatedTextureInMenu(
    page,
    'shared-created-texture',
    'KeyImage1'
  );
  let modeMenu = await openCreatedTextureEditMenu(page, 'KeyImage0');
  await modeMenu.locator('[data-edit-mode="general"]').click();
  await page.fill('#textureImageCropBottom', '-4');
  await page.click('#textureImageApplyBtn');
  await page.waitForFunction(() =>
    document.getElementById('textureImageApplyScopeModal').style.display === 'flex'
  );
  await page.click('#textureImageApplyScopeCurrentBtn');
  await page.waitForFunction(() =>
    document.getElementById('textureImageApplyScopeModal').style.display !== 'flex'
  );
  await page.waitForFunction(() => textureImageEditorUi.getState().dirtyTabCount === 0);

  await page.click('.texture-image-tab[data-tab-id="menu"]');
  await expect(
    page.locator('#param-card-KeyImage0 .texture-edit-main-btn')
  ).toHaveClass(/has-modes/);
  modeMenu = await openCreatedTextureEditMenu(page, 'KeyImage0');
  await expect(modeMenu.locator('[data-edit-mode="generation"]')).toBeVisible();
  expect(await page.evaluate(() => {
    const keys = getActiveKeyCount();
    const normal0 = getManiaNoteTextureName(keys, LML.KeyImage, 0);
    const normal1 = getManiaNoteTextureName(keys, LML.KeyImage, 1);
    return {
      normal0,
      normal1,
      created0: hasCreatedTextureParams(normal0),
      created1: hasCreatedTextureParams(normal1),
      params0: getCreatedTextureParams(normal0)
    };
  })).toMatchObject({
    created0: true,
    created1: true
  });
  expect(errors).toEqual([]);
});

test('圆角矩形和菱形均可通过拖动条调节圆角', async ({ page }) => {
  const errors = await boot(page);
  await page.click('#openTextureImageEditorBtn');
  await page.click('#textureImageCreateOpenBtn');
  await page.click('#textureImageCreateShapeGrid [data-shape="rounded-rectangle"]');

  await expect(page.locator('#textureImageCreateCornerRow')).toBeVisible();
  expect(await page.getAttribute('#textureImageCreateCornerRadiusRange', 'max')).toBe('128');
  await page.locator('#textureImageCreateCornerRadiusRange').evaluate((input) => {
    input.value = '40';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(await page.evaluate(() => textureImageEditorUi.getState().creator)).toMatchObject({
    shape: 'rounded-rectangle',
    cornerRadius: 40
  });
  expect(await page.inputValue('#textureImageCreateCornerRadius')).toBe('40');

  await page.click('#textureImageCreateShapeGrid [data-shape="rotated-square"]');

  await expect(page.locator('#textureImageCreateCornerRow')).toBeVisible();
  expect(await page.getAttribute('#textureImageCreateCornerRadiusRange', 'max')).toBe('90');
  await page.locator('#textureImageCreateCornerRadiusRange').evaluate((input) => {
    input.value = '48';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(await page.evaluate(() => textureImageEditorUi.getState().creator)).toMatchObject({
    shape: 'rotated-square',
    cornerRadius: 48
  });
  expect(await page.inputValue('#textureImageCreateCornerRadius')).toBe('48');

  await page.click('#textureImageCreateShapeGrid [data-shape="rectangle"]');
  await expect(page.locator('#textureImageCreateCornerRow')).toBeHidden();
  expect(errors).toEqual([]);
});

test('向内描边沿像素边界生成且透明度与填充独立', async ({ page }) => {
  const errors = await boot(page);
  await page.click('#openTextureImageEditorBtn');
  await page.click('#textureImageCreateOpenBtn');
  await expect(page.locator('#textureImageCreateStrokeControls')).toBeVisible();
  expect(await page.inputValue('#textureImageCreateStrokeWidthValue')).toBe('0');
  await page.fill('#textureImageCreateWidth', '24');
  await page.fill('#textureImageCreateHeight', '24');
  await page.fill('#textureImageCreateColorHex', '#0000ff');
  await page.fill('#textureImageCreateAlphaValue', '25');
  await page.click('#textureImageCreateShapeGrid [data-shape="rectangle"]');
  await page.fill('#textureImageCreateStrokeColorHex', '#ff0000');
  await page.fill('#textureImageCreateStrokeWidthValue', '5');
  await page.fill('#textureImageCreateStrokeAlphaValue', '80');

  expect(await page.evaluate(() => textureImageEditorUi.getState().creator)).toMatchObject({
    width: 24,
    height: 24,
    color: '#0000ff',
    alpha: 25,
    strokeEnabled: true,
    strokeColor: '#ff0000',
    strokeWidth: 5,
    strokeAlpha: 80,
    shape: 'rectangle'
  });

  await page.fill('#textureImageCreateName', 'stroke-test-texture');
  await page.click('#textureImageCreateConfirmBtn');
  await page.waitForFunction(() => {
    return document.getElementById('textureImageLibraryView').style.display !== 'none';
  });
  const created = await page.evaluate(() => {
    const source = collectExistingTextureSources().find((s) => s.path === 'stroke-test-texture');
    const img = source ? source.image : null;
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    return {
      center: Array.from(ctx.getImageData(12, 12, 1, 1).data),
      outline: Array.from(ctx.getImageData(1, 1, 1, 1).data)
    };
  });
  expect(created.center[2]).toBeGreaterThan(200);
  expect(created.center[3]).toBeGreaterThan(50);
  expect(created.outline[0]).toBeGreaterThan(240);
  expect(created.outline[3]).toBeGreaterThan(190);

  const probes = await page.evaluate(() => {
    const readFrame = (fillAlpha) => {
      const frame = createSolidShapeTexture({
        width: 24,
        height: 24,
        color: '#0000ff',
        alpha: fillAlpha,
        shape: 'rectangle',
        strokeEnabled: true,
        strokeColor: '#ff0000',
        strokeWidth: 5,
        strokeAlpha: 80
      });
      const ctx = frame.getContext('2d');
      return {
        center: Array.from(ctx.getImageData(12, 12, 1, 1).data),
        outline: Array.from(ctx.getImageData(1, 1, 1, 1).data)
      };
    };
    return {
      transparentFill: readFrame(0),
      faintFill: readFrame(10),
      opaqueFill: readFrame(100)
    };
  });

  expect(probes.transparentFill.center[3]).toBe(0);
  expect(probes.transparentFill.outline[3]).toBeGreaterThan(190);
  expect(probes.faintFill.center[2]).toBeGreaterThan(200);
  expect(probes.faintFill.center[3]).toBeLessThan(probes.opaqueFill.center[3]);
  expect(probes.opaqueFill.center[3]).toBe(255);
  expect(probes.faintFill.outline[0]).toBeGreaterThan(240);
  expect(probes.faintFill.outline[2]).toBeLessThan(20);
  expect(Math.abs(
    probes.faintFill.outline[3] - probes.opaqueFill.outline[3]
  )).toBeLessThanOrEqual(1);
  expect(probes.faintFill.outline[3]).toBeGreaterThan(190);
  expect(errors).toEqual([]);
});

test('向内描边使用欧几里得距离，大数值下圆形与各方向保持几何均匀一致', async ({ page }) => {
  const errors = await boot(page);
  const result = await page.evaluate(() => {
    // 100x100 圆形，半径 50，描边宽度 20（理论内孔半径 30）
    const canvas = createSolidShapeTexture({
      width: 100,
      height: 100,
      color: '#0000ff',
      alpha: 0,
      shape: 'circle',
      strokeEnabled: true,
      strokeColor: '#ff0000',
      strokeWidth: 20,
      strokeAlpha: 100
    });
    const ctx = canvas.getContext('2d');
    const imgData = ctx.getImageData(0, 0, 100, 100).data;
    const getAlpha = (x, y) => imgData[(y * 100 + x) * 4 + 3];

    // 中心 (50, 50) 距离外边缘 50px，描边 20px，此处应为纯透明
    const centerAlpha = getAlpha(50, 50);

    // 距中心 24px（即距离边缘 26px > 20px）的各个方向，均应在内孔中（alpha == 0）
    // 0°, 90°, 180°, 270° 以及 45°, 135°, 225°, 315°
    const innerRadius = 24;
    const innerPoints = [
      getAlpha(50 + innerRadius, 50),
      getAlpha(50, 50 + innerRadius),
      getAlpha(50 - innerRadius, 50),
      getAlpha(50, 50 - innerRadius),
      getAlpha(50 + Math.round(innerRadius * 0.7071), 50 + Math.round(innerRadius * 0.7071)),
      getAlpha(50 - Math.round(innerRadius * 0.7071), 50 + Math.round(innerRadius * 0.7071)),
      getAlpha(50 - Math.round(innerRadius * 0.7071), 50 - Math.round(innerRadius * 0.7071)),
      getAlpha(50 + Math.round(innerRadius * 0.7071), 50 - Math.round(innerRadius * 0.7071))
    ];

    // 距中心 40px（即距离边缘 10px < 20px）的各个方向，均应处于描边核心区域（alpha > 200）
    const strokeRadius = 40;
    const strokePoints = [
      getAlpha(50 + strokeRadius, 50),
      getAlpha(50, 50 + strokeRadius),
      getAlpha(50 - strokeRadius, 50),
      getAlpha(50, 50 - strokeRadius),
      getAlpha(50 + Math.round(strokeRadius * 0.7071), 50 + Math.round(strokeRadius * 0.7071)),
      getAlpha(50 - Math.round(strokeRadius * 0.7071), 50 + Math.round(strokeRadius * 0.7071)),
      getAlpha(50 - Math.round(strokeRadius * 0.7071), 50 - Math.round(strokeRadius * 0.7071)),
      getAlpha(50 + Math.round(strokeRadius * 0.7071), 50 - Math.round(strokeRadius * 0.7071))
    ];

    return { centerAlpha, innerPoints, strokePoints };
  });

  expect(result.centerAlpha).toBe(0);
  // 内孔区域在各个离散方向（包括对角线 45°）透明度都为 0，没有被对角线菱形畸变吃进
  result.innerPoints.forEach((alpha) => expect(alpha).toBe(0));
  // 描边带在各个方向（包括对角线 45°）都是实心描边
  result.strokePoints.forEach((alpha) => expect(alpha).toBeGreaterThan(200));
  expect(errors).toEqual([]);
});

test('创建任意尺寸纯色圆形贴图生成在全部贴图区域，并支持二次编辑', async ({ page }) => {
  const errors = await boot(page);
  await page.click('#openTextureImageEditorBtn');
  await page.waitForFunction(() => textureImageEditorUi.getState().activeTabId === 'menu');

  await page.click('#textureImageCreateOpenBtn');
  await expect(page.locator('#textureImageCreatorView')).toBeVisible();
  await expect(page.locator('#textureImageCreatorFooter')).toBeVisible();

  await page.fill('#textureImageCreateName', 'custom-circle-note');
  await page.fill('#textureImageCreateWidth', '96');
  await page.fill('#textureImageCreateHeight', '64');
  await page.fill('#textureImageCreateColorHex', '#3366ff');
  await page.click('.texture-image-segmented label:has(input[value="2x"])');
  await page.click('#textureImageCreateShapeGrid [data-shape="circle"]');

  const creator = await page.evaluate(() => textureImageEditorUi.getState().creator);
  expect(creator).toMatchObject({
    active: true,
    name: 'custom-circle-note',
    width: 96,
    height: 64,
    spec: '2x',
    color: '#3366ff',
    shape: 'circle'
  });

  await page.click('#textureImageCreateConfirmBtn');
  await page.waitForFunction(() => {
    return document.getElementById('textureImageLibraryView').style.display !== 'none';
  });

  const card = page.locator('#textureImageLibraryGrid .texture-library-card[data-texture-path="custom-circle-note"]');
  await expect(card).toBeVisible();

  const pixels = await page.evaluate(() => {
    const source = collectExistingTextureSources().find((s) => s.path === 'custom-circle-note');
    const img = source ? source.image : null;
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const read = (x, y) => Array.from(ctx.getImageData(x, y, 1, 1).data);
    return {
      size: { width: img.width, height: img.height },
      is2x: !!img._is2x,
      center: read(48, 32),
      corner: read(1, 1)
    };
  });
  expect(pixels.size).toEqual({ width: 96, height: 64 });
  expect(pixels.is2x).toBe(true);
  expect(pixels.center).toEqual([51, 102, 255, 255]);
  expect(pixels.corner[3]).toBe(0);

  // 在菜单中引用该自建贴图后进入生成设置。
  await referenceCreatedTextureInMenu(page, 'custom-circle-note');
  const modeMenu = await openCreatedTextureEditMenu(page);
  await modeMenu.locator('[data-edit-mode="generation"]').click();

  await expect(page.locator('#textureImageCreatorView')).toBeVisible();
  const editCreator = await page.evaluate(() => textureImageEditorUi.getState().creator);
  expect(editCreator).toMatchObject({
    active: true,
    editPath: 'custom-circle-note',
    name: 'custom-circle-note',
    width: 96,
    height: 64,
    spec: '2x',
    color: '#3366ff',
    shape: 'circle'
  });
  expect(await page.locator('#textureImageCreateConfirmBtn').textContent()).toBe('保存修改');

  // 修改颜色为纯红
  await page.fill('#textureImageCreateColorHex', '#ff0000');
  await page.click('#textureImageCreateConfirmBtn');

  await page.waitForFunction(() => {
    return document.getElementById('textureImageLibraryView').style.display !== 'none';
  });

  const updatedPixels = await page.evaluate(() => {
    const source = collectExistingTextureSources().find((s) => s.path === 'custom-circle-note');
    const img = source ? source.image : null;
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const read = (x, y) => Array.from(ctx.getImageData(x, y, 1, 1).data);
    return {
      center: read(48, 32),
      corner: read(1, 1)
    };
  });
  expect(updatedPixels.center[0]).toBeGreaterThan(240);
  expect(updatedPixels.center[2]).toBeLessThan(20);
  expect(updatedPixels.corner[3]).toBe(0);

  expect(errors).toEqual([]);
});

test('形状蒙版预设生成圆角矩形、钻石与“个”字风格四向箭头轮廓', async ({ page }) => {
  const errors = await boot(page);
  const probes = await page.evaluate(() => {
    const alphaAt = (shape, x, y, cornerRadius = 0, width = 80, height = 60) => {
      const frame = createSolidShapeTexture({
        width,
        height,
        color: '#ff0000',
        alpha: 100,
        shape,
        cornerRadius
      });
      return frame.getContext('2d').getImageData(x, y, 1, 1).data[3];
    };
    const arrowAlpha = (options, x, y) => {
      const frame = createSolidShapeTexture({
        width: 150,
        height: 150,
        color: '#ff0000',
        alpha: 100,
        shape: 'arrow-up',
        ...options
      });
      return frame.getContext('2d').getImageData(x, y, 1, 1).data[3];
    };
    const arrowStats = (shape, options = {}) => {
      const size = options.size || 150;
      const frame = createSolidShapeTexture({
        width: size,
        height: size,
        color: '#ff0000',
        alpha: 100,
        shape,
        arrowThickness: options.arrowThickness,
        arrowRoundness: options.arrowRoundness
      });
      const pixels = frame.getContext('2d').getImageData(0, 0, size, size).data;
      let area = 0;
      const visited = new Uint8Array(size * size);
      let components = 0;

      for (let index = 0; index < size * size; index++) {
        if (pixels[index * 4 + 3] > 127) area++;
      }
      for (let index = 0; index < size * size; index++) {
        if (visited[index] || pixels[index * 4 + 3] < 32) continue;
        components++;
        const stack = [index];
        visited[index] = 1;
        while (stack.length > 0) {
          const current = stack.pop();
          const x = current % size;
          const y = Math.floor(current / size);
          for (const [nextX, nextY] of [
            [x - 1, y],
            [x + 1, y],
            [x, y - 1],
            [x, y + 1]
          ]) {
            if (nextX < 0 || nextY < 0 || nextX >= size || nextY >= size) continue;
            const next = nextY * size + nextX;
            if (!visited[next] && pixels[next * 4 + 3] >= 32) {
              visited[next] = 1;
              stack.push(next);
            }
          }
        }
      }
      return { area, components };
    };
    const centerTipGap = (shape) => {
      const size = 150;
      const frame = createSolidShapeTexture({
        width: size,
        height: size,
        color: '#ff0000',
        alpha: 100,
        shape,
        arrowThickness: 20,
        arrowRoundness: 32
      });
      const pixels = frame.getContext('2d').getImageData(0, 0, size, size).data;
      const center = Math.floor(size / 2);
      let minX = size;
      let maxX = -1;
      let minY = size;
      let maxY = -1;
      let centerMinX = size;
      let centerMaxX = -1;
      let centerMinY = size;
      let centerMaxY = -1;

      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          if (pixels[(y * size + x) * 4 + 3] < 32) continue;
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
          if (Math.abs(x - center) <= 1) {
            centerMinY = Math.min(centerMinY, y);
            centerMaxY = Math.max(centerMaxY, y);
          }
          if (Math.abs(y - center) <= 1) {
            centerMinX = Math.min(centerMinX, x);
            centerMaxX = Math.max(centerMaxX, x);
          }
        }
      }

      if (shape === 'arrow-up') return centerMinY - minY;
      if (shape === 'arrow-down') return maxY - centerMaxY;
      if (shape === 'arrow-left') return centerMinX - minX;
      return maxX - centerMaxX;
    };
    const arrowBounds = (shape, options = {}) => {
      const size = 120;
      const frame = createSolidShapeTexture({
        width: size,
        height: size,
        color: '#ff0000',
        alpha: 100,
        shape,
        arrowThickness: options.arrowThickness,
        arrowRoundness: options.arrowRoundness
      });
      const pixels = frame.getContext('2d').getImageData(0, 0, size, size).data;
      let minX = size;
      let maxX = -1;
      let minY = size;
      let maxY = -1;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          if (pixels[(y * size + x) * 4 + 3] < 16) continue;
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
        }
      }
      return minX > 0 && minY > 0 && maxX < size - 1 && maxY < size - 1;
    };
    const arrowTipWidth = (roundness) => {
      const size = 150;
      const frame = createSolidShapeTexture({
        width: size,
        height: size,
        color: '#ff0000',
        alpha: 100,
        shape: 'arrow-up',
        arrowThickness: 20,
        arrowRoundness: roundness
      });
      const pixels = frame.getContext('2d').getImageData(0, 0, size, size).data;
      const y = 32;
      let width = 0;
      for (let x = 0; x < size; x++) {
        if (pixels[(y * size + x) * 4 + 3] > 127) width++;
      }
      return width;
    };
    return {
      roundedCorner: alphaAt('rounded-rectangle', 1, 1, 18),
      roundedCenter: alphaAt('rounded-rectangle', 40, 30, 18),
      rotatedCorner: alphaAt('rotated-square', 1, 1),
      rotatedCenter: alphaAt('rotated-square', 40, 30),
      rotatedSharpTip: alphaAt('rotated-square', 40, 2, 0),
      rotatedRoundedTip: alphaAt('rotated-square', 40, 2, 18),
      rotatedRoundedSide: alphaAt('rotated-square', 25, 30, 18),
      arrowUpTip: alphaAt('arrow-up', 45, 14, 0, 90, 90),
      arrowUpOutside: alphaAt('arrow-up', 2, 70, 0, 90, 90),
      arrowUpShaft: alphaAt('arrow-up', 45, 65, 0, 90, 90),
      arrowDownTip: alphaAt('arrow-down', 45, 76, 0, 90, 90),
      arrowLeftTip: alphaAt('arrow-left', 14, 45, 0, 90, 90),
      arrowRightTip: alphaAt('arrow-right', 76, 45, 0, 90, 90),
      arrowThinShaftEdge: arrowAlpha({ arrowThickness: 20 }, 55, 115),
      arrowThickShaftEdge: arrowAlpha({ arrowThickness: 50 }, 55, 115),
      arrowSharp: arrowStats('arrow-up', {
        arrowThickness: 37,
        arrowRoundness: 0
      }),
      arrowRound: arrowStats('arrow-up', {
        arrowThickness: 37,
        arrowRoundness: 100
      }),
      arrowThin: arrowStats('arrow-up', {
        arrowThickness: 8,
        arrowRoundness: 0
      }),
      arrowThick: arrowStats('arrow-up', {
        arrowThickness: 50,
        arrowRoundness: 0
      }),
      lowThicknessComponents: [
        'arrow-up',
        'arrow-down',
        'arrow-left',
        'arrow-right'
      ].map((shape) => arrowStats(shape, {
        size: 24,
        arrowThickness: 8,
        arrowRoundness: 0
      }).components),
      centerTipGaps: [
        'arrow-up',
        'arrow-down',
        'arrow-left',
        'arrow-right'
      ].map(centerTipGap),
      tipWidthSharp: arrowTipWidth(0),
      tipWidthRound: arrowTipWidth(100),
      extremeBoundsSafe: [
        'arrow-up',
        'arrow-down',
        'arrow-left',
        'arrow-right'
      ].every((shape) => [
        { arrowThickness: 50, arrowRoundness: 0 },
        { arrowThickness: 50, arrowRoundness: 100 }
      ].every((options) => arrowBounds(shape, options)))
    };
  });

  expect(probes.roundedCorner).toBe(0);
  expect(probes.roundedCenter).toBe(255);
  expect(probes.rotatedCorner).toBe(0);
  expect(probes.rotatedCenter).toBe(255);
  expect(probes.rotatedSharpTip).toBeGreaterThan(200);
  expect(probes.rotatedRoundedTip).toBe(0);
  expect(probes.rotatedRoundedSide).toBe(255);
  expect(probes.arrowUpTip).toBeGreaterThan(200);
  expect(probes.arrowUpOutside).toBe(0);
  expect(probes.arrowUpShaft).toBe(255);
  expect(probes.arrowDownTip).toBeGreaterThan(200);
  expect(probes.arrowLeftTip).toBeGreaterThan(200);
  expect(probes.arrowRightTip).toBeGreaterThan(200);
  expect(probes.arrowThinShaftEdge).toBe(0);
  expect(probes.arrowThickShaftEdge).toBe(255);
  expect(probes.arrowSharp.area).toBeGreaterThan(probes.arrowRound.area);
  expect(probes.arrowThin.area).toBeLessThan(probes.arrowThick.area);
  expect(probes.arrowSharp.components).toBe(1);
  expect(probes.arrowRound.components).toBe(1);
  expect(probes.lowThicknessComponents).toEqual([1, 1, 1, 1]);
  expect(probes.centerTipGaps).toEqual([0, 0, 0, 0]);
  expect(probes.tipWidthRound).toBeGreaterThan(probes.tipWidthSharp);
  expect(probes.extremeBoundsSafe).toBe(true);
  expect(errors).toEqual([]);
});

test('撤销操作可恢复二次编辑前的贴图并在删除后恢复', async ({ page }) => {
  const errors = await boot(page);
  await page.click('#openTextureImageEditorBtn');
  await page.click('#textureImageCreateOpenBtn');
  await page.fill('#textureImageCreateName', 'undo-test-texture');
  await page.fill('#textureImageCreateWidth', '40');
  await page.fill('#textureImageCreateHeight', '40');
  await page.fill('#textureImageCreateColorHex', '#00ff00');
  await page.click('#textureImageCreateConfirmBtn');

  await page.waitForFunction(() => {
    return document.getElementById('textureImageLibraryGrid').querySelector('[data-texture-path="undo-test-texture"]') !== null;
  });

  const card = page.locator('#textureImageLibraryGrid [data-texture-path="undo-test-texture"]');
  await expect(card).toBeVisible();

  // 从菜单中引用该自建贴图后修改生成颜色
  await referenceCreatedTextureInMenu(page, 'undo-test-texture');
  const modeMenu = await openCreatedTextureEditMenu(page);
  await modeMenu.locator('[data-edit-mode="generation"]').click();
  await page.fill('#textureImageCreateColorHex', '#ffff00');
  await page.click('#textureImageCreateConfirmBtn');

  await page.waitForFunction(() => {
    return document.getElementById('textureImageLibraryView').style.display !== 'none';
  });

  // 撤销一次
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(200);

  const undoneColor = await page.evaluate(() => {
    const source = collectExistingTextureSources().find((s) => s.path === 'undo-test-texture');
    const canvas = document.createElement('canvas');
    canvas.width = source.image.width;
    canvas.height = source.image.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(source.image, 0, 0);
    return Array.from(ctx.getImageData(20, 20, 1, 1).data);
  });
  // 恢复为绿色（R低，G高）
  expect(undoneColor[0]).toBeLessThan(50);
  expect(undoneColor[1]).toBeGreaterThan(200);

  await page.keyboard.press('Control+y');
  await page.waitForFunction(() => {
    const source = collectExistingTextureSources()
      .find((item) => item.path === 'undo-test-texture');
    if (!source) return false;
    const canvas = document.createElement('canvas');
    canvas.width = source.image.width;
    canvas.height = source.image.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(source.image, 0, 0);
    const pixel = ctx.getImageData(20, 20, 1, 1).data;
    return pixel[0] > 200 && pixel[1] > 200;
  });

  await page.keyboard.press('Control+z');
  await page.waitForTimeout(150);
  await page.click('.texture-image-tab[data-tab-id="menu"]');
  await expect(
    page.locator('#param-card-StageLeft .texture-edit-main-btn')
  ).toHaveClass(/has-modes/);
  expect(errors).toEqual([]);
});

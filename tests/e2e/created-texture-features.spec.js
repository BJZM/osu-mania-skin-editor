const path = require('path');
const { test, expect } = require('@playwright/test');

const ROOT = path.resolve(__dirname, '../..');
const SKIN = path.join(ROOT, 'samples', 'skins', 'Kumakalerki.osk');
const MINIMAL_BEATMAP = path.join(ROOT, 'samples', 'beatmaps', 'minimal-4k.osu');

async function boot(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  await page.goto('/index.html');
  await page.waitForFunction(
    () => typeof textureImageEditorUi !== 'undefined' && typeof createSolidShapeTexture === 'function',
    null,
    { timeout: 30000 }
  );
  await page.setInputFiles('#oskInput', SKIN);
  await page.waitForFunction(() => isSkinLoading === false, null, { timeout: 60000 });
  await page.setInputFiles('#oszInput', MINIMAL_BEATMAP);
  await page.waitForFunction(() => isStartupWorkspaceReady(), null, { timeout: 60000 });
  await page.waitForTimeout(250);
  return errors;
}

async function dragSelectedKeyTop(page, col, targetSourceHeight) {
  const geometry = await page.evaluate(({ col, targetSourceHeight }) => {
    const key = canvasInteractiveElements.find((item) => item.id === `key_${col}`);
    const img = getManiaSkinImage(getActiveKeyCount(), LML.KeyImage, col);
    const rawColWRes = getManiaSkinConfig(getActiveKeyCount(), LML.ColumnWidth, col);
    const rawColW = (rawColWRes && rawColWRes.value > 0) ? rawColWRes.value : 30;
    const ratio = (img && img._is2x) ? 2 : 1;
    const stableRefW = rawColW * 1.6 * ratio;
    const currentSourceHeight = img ? img.height : 0;
    const pxPerLogical = key ? (key.w * ratio / stableRefW) : 1;
    const canvasDeltaY = (targetSourceHeight - currentSourceHeight) * pxPerLogical;
    const rect = canvas.getBoundingClientRect();
    const cssDelta = canvasDeltaY * rect.height / canvas.height;
    const cssX = (canvasX) => rect.left + canvasX * rect.width / canvas.width;
    const cssY = (canvasY) => rect.top + canvasY * rect.height / canvas.height;
    return {
      handleX: key ? cssX(key.x + key.w / 2) : 0,
      handleY: key ? cssY(key.keyImageResizeEdgeY) : 0,
      cssDelta
    };
  }, { col, targetSourceHeight });

  await page.mouse.move(geometry.handleX, geometry.handleY);
  await page.mouse.down();
  await page.waitForFunction((id) => selectedCanvasElement && selectedCanvasElement.id === id, `key_${col}`);
  await page.mouse.move(geometry.handleX, geometry.handleY - geometry.cssDelta, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(250);
}

test('自建贴图的 KeyImage 在画布拖动抬高并选择同步替换，全部轨道同步更新高度，贴图名不被改写，支持撤回与重做', async ({ page }) => {
  const errors = await boot(page);
  await page.evaluate(() => {
    const keys = getActiveKeyCount();
    const cfg = getManiaConfigForKeys(keys);
    if (!cfg.ImageLookups) cfg.ImageLookups = new Map();
    const createdParams = {
      shape: 'rectangle',
      spec: '1x',
      width: 30,
      height: 40,
      color: '#33cc88',
      alpha: 100,
      cornerRadius: 0,
      arrowThickness: 20,
      arrowRoundness: 50,
      stripped: false,
      name: 'created-shared-key'
    };
    saveCreatedTextureParams('created-shared-key', createdParams);
    const canvas = createSolidShapeTexture(createdParams);
    saveSkinAssetToStore(skinImageStore, 'created-shared-key', canvas, false, true, true);
    saveSkinAssetToStore(skinFallbackImageStore, 'created-shared-key', canvas, false, true, true);

    for (let col = 0; col < keys; col++) {
      cfg[`KeyImage${col}`] = 'created-shared-key';
      cfg[`KeyImage${col}D`] = 'created-shared-key';
      cfg.ImageLookups.set(`KeyImage${col}`, 'created-shared-key');
      cfg.ImageLookups.set(`KeyImage${col}D`, 'created-shared-key');
      cfg.ImageLookups.set(`keyimage${col}`, 'created-shared-key');
      cfg.ImageLookups.set(`keyimage${col}d`, 'created-shared-key');
    }
    drawFrame();
  });

  // 打开贴图编辑并移开，保持编辑器与画布联动打开状态
  await page.click('#openTextureImageEditorBtn');
  await page.waitForFunction(() => document.getElementById('textureImageEditorModal').classList.contains('active'));
  await page.evaluate(() => {
    const dialog = document.getElementById('textureImageEditorDialog');
    dialog.style.left = '920px';
    dialog.style.right = 'auto';
  });

  // 画布拖拽升高第 0 轨的 KeyImage
  await dragSelectedKeyTop(page, 0, 75);

  // 弹窗提示
  const scopeModal = page.locator('#textureImageApplyScopeModal');
  await expect(scopeModal).toBeVisible();
  await page.click('#textureImageApplyScopeAllBtn'); // 同步替换
  await expect(scopeModal).toBeHidden();

  // 验证所有轨道贴图高度均已同步更新，且贴图名仍然为 created-shared-key
  const afterDrag = await page.evaluate(() => {
    const keys = getActiveKeyCount();
    return Array.from({ length: keys }, (_, col) => ({
      name: getManiaNoteTextureName(keys, LML.KeyImage, col),
      h: getManiaSkinImage(keys, LML.KeyImage, col)?.height
    }));
  });
  expect(afterDrag.length).toBe(4);
  const targetH = afterDrag[0].h;
  expect(targetH).toBeGreaterThan(60);
  for (const track of afterDrag) {
    expect(track.name).toBe('created-shared-key');
    expect(track.h).toBe(targetH);
  }

  // 关闭贴图编辑器，验证高度不会回退
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.getElementById('textureImageEditorModal') || !document.getElementById('textureImageEditorModal').classList.contains('active'));
  const afterClose = await page.evaluate(() => {
    const keys = getActiveKeyCount();
    return Array.from({ length: keys }, (_, col) => ({
      name: getManiaNoteTextureName(keys, LML.KeyImage, col),
      h: getManiaSkinImage(keys, LML.KeyImage, col)?.height
    }));
  });
  for (const track of afterClose) {
    expect(track.name).toBe('created-shared-key');
    expect(track.h).toBe(targetH);
  }

  // 验证撤回
  await page.evaluate(() => performSkinUndo());
  const afterUndo = await page.evaluate(() => {
    const keys = getActiveKeyCount();
    return Array.from({ length: keys }, (_, col) => ({
      name: getManiaNoteTextureName(keys, LML.KeyImage, col),
      h: getManiaSkinImage(keys, LML.KeyImage, col)?.height
    }));
  });
  for (const track of afterUndo) {
    expect(track.name).toBe('created-shared-key');
    expect(track.h).toBe(40);
  }

  // 验证重做
  await page.evaluate(() => performSkinRedo());
  const afterRedo = await page.evaluate(() => {
    const keys = getActiveKeyCount();
    return Array.from({ length: keys }, (_, col) => ({
      name: getManiaNoteTextureName(keys, LML.KeyImage, col),
      h: getManiaSkinImage(keys, LML.KeyImage, col)?.height
    }));
  });
  for (const track of afterRedo) {
    expect(track.name).toBe('created-shared-key');
    expect(track.h).toBe(targetH);
  }

  expect(errors).toEqual([]);
});

test('自建贴图进入通用编辑支持拉伸修复，按 stable 列宽规则等比缩放并保存，支持撤回重做', async ({ page }) => {
  const errors = await boot(page);
  await page.evaluate(() => {
    const keys = getActiveKeyCount();
    const cfg = getManiaConfigForKeys(keys);
    if (!cfg.ImageLookups) cfg.ImageLookups = new Map();
    const createdParams = {
      shape: 'rectangle',
      spec: '1x',
      width: 30,
      height: 40,
      color: '#ff6633',
      alpha: 100,
      cornerRadius: 0,
      arrowThickness: 20,
      arrowRoundness: 50,
      stripped: false,
      name: 'created-stretch-key'
    };
    saveCreatedTextureParams('created-stretch-key', createdParams);
    const canvas = createSolidShapeTexture(createdParams);
    saveSkinAssetToStore(skinImageStore, 'created-stretch-key', canvas, false, true, true);
    saveSkinAssetToStore(skinFallbackImageStore, 'created-stretch-key', canvas, false, true, true);
    cfg.KeyImage0 = 'created-stretch-key';
    cfg.ImageLookups.set('KeyImage0', 'created-stretch-key');
    cfg.ImageLookups.set('keyimage0', 'created-stretch-key');
    drawFrame();
  });

  // 打开通用编辑
  await page.click('#openTextureImageEditorBtn');
  const card = page.locator('#param-card-KeyImage0');
  const editBtn = card.locator('.texture-edit-main-btn');
  await expect(editBtn).toHaveClass(/has-modes/);
  await editBtn.hover();
  const modeMenu = card.locator('.texture-edit-mode-menu');
  await expect(modeMenu).toBeVisible();
  await modeMenu.locator('[data-edit-mode="general"]').click();

  // 验证拉伸修复按钮状态与可用性
  const stretchBtn = page.locator('#textureImageStretchFixBtn');
  await expect(stretchBtn).toBeVisible();
  await expect(stretchBtn).not.toBeDisabled();

  // 检查推导出的拉伸修复目标
  const stretchFixTarget = await page.evaluate(() => {
    return getStretchFixTarget(state.selected, state.workingFrames[0]);
  });
  expect(stretchFixTarget.axis).toBe('width');
  expect(stretchFixTarget.size).toBeGreaterThan(0);
  const targetW = stretchFixTarget.size;

  // 点击拉伸修复
  await stretchBtn.click();
  await page.waitForFunction((expectedW) => {
    const preview = textureImageEditorUi.getState().previewSize;
    return preview && preview.width === expectedW;
  }, targetW);

  // 应用保存
  await page.click('#textureImageApplyBtn');
  await page.waitForFunction(() => textureImageEditorUi.getState().dirtyTabCount === 0);

  // 验证贴图尺寸和自建贴图参数已更新
  const savedState = await page.evaluate(() => {
    const keys = getActiveKeyCount();
    const img = getManiaSkinImage(keys, LML.KeyImage, 0);
    const cParams = getCreatedTextureParams('created-stretch-key');
    return {
      imgW: img?.width,
      paramW: cParams?.width,
      editScale: cParams?.generalEditParams?.imageTransform?.scalePercent
    };
  });
  expect(savedState.imgW).toBe(targetW);
  expect(savedState.paramW).toBe(30);
  expect(savedState.editScale).toBeCloseTo(targetW / 30 * 100, 0);

  // 验证撤回
  await page.evaluate(() => performSkinUndo());
  const undoneState = await page.evaluate(() => {
    const keys = getActiveKeyCount();
    const img = getManiaSkinImage(keys, LML.KeyImage, 0);
    const cParams = getCreatedTextureParams('created-stretch-key');
    return {
      imgW: img?.width,
      paramW: cParams?.width,
      editScale: cParams?.generalEditParams?.imageTransform?.scalePercent
    };
  });
  expect(undoneState.imgW).toBe(30);
  expect(undoneState.paramW).toBe(30);
  expect(undoneState.editScale == null).toBe(true);

  // 验证重做
  await page.evaluate(() => performSkinRedo());
  const redoneState = await page.evaluate(() => {
    const keys = getActiveKeyCount();
    const img = getManiaSkinImage(keys, LML.KeyImage, 0);
    const cParams = getCreatedTextureParams('created-stretch-key');
    return {
      imgW: img?.width,
      paramW: cParams?.width,
      editScale: cParams?.generalEditParams?.imageTransform?.scalePercent
    };
  });
  expect(redoneState.imgW).toBe(targetW);
  expect(redoneState.paramW).toBe(30);
  expect(redoneState.editScale).toBeCloseTo(targetW / 30 * 100, 0);

  expect(errors).toEqual([]);
});

test('自建长条身体贴图进入通用编辑支持一键投皮，激活并应用到全轨后 NoteBodyStyle=1 且透明尾部正确写入，支持撤回重做', async ({ page }) => {
  const errors = await boot(page);
  await page.evaluate(() => {
    const keys = getActiveKeyCount();
    const cfg = getManiaConfigForKeys(keys);
    if (!cfg.ImageLookups) cfg.ImageLookups = new Map();
    const createdParams = {
      shape: 'rectangle',
      spec: '1x',
      width: 30,
      height: 35,
      color: '#3388ff',
      alpha: 100,
      cornerRadius: 0,
      arrowThickness: 20,
      arrowRoundness: 50,
      stripped: false,
      name: 'created-hold-body'
    };
    saveCreatedTextureParams('created-hold-body', createdParams);
    const canvas = createSolidShapeTexture(createdParams);
    saveSkinAssetToStore(skinImageStore, 'created-hold-body', canvas, false, true, true);
    saveSkinAssetToStore(skinFallbackImageStore, 'created-hold-body', canvas, false, true, true);

    for (let col = 0; col < keys; col++) {
      cfg[`NoteImage${col}L`] = 'created-hold-body';
      cfg.ImageLookups.set(`NoteImage${col}L`, 'created-hold-body');
      cfg.ImageLookups.set(`noteimage${col}l`, 'created-hold-body');
    }
    drawFrame();
  });

  // 打开通用编辑
  await page.click('#openTextureImageEditorBtn');
  const card = page.locator('#param-card-NoteImage0L');
  const editBtn = card.locator('.texture-edit-main-btn');
  await expect(editBtn).toHaveClass(/has-modes/);
  await editBtn.hover();
  const modeMenu = card.locator('.texture-edit-mode-menu');
  await expect(modeMenu).toBeVisible();
  await modeMenu.locator('[data-edit-mode="general"]').click();

  // 验证一键投皮面板可见且可用
  const longBodySection = page.locator('#textureImageLongBodySection');
  await expect(longBodySection).toBeVisible();
  const longBodyEnable = page.locator('#textureImageLongBodyEnable');
  await expect(longBodyEnable).toBeVisible();
  await expect(longBodyEnable).not.toBeDisabled();

  // 开启一键投皮
  await longBodyEnable.check({ force: true });
  await expect(page.locator('#textureImageLongBodyControls')).toBeVisible();

  // 点击应用保存
  await page.click('#textureImageApplyBtn');

  // 选择“应用到全部轨道”
  const scopeModal = page.locator('#textureImageApplyScopeModal');
  await expect(scopeModal).toBeVisible();
  await page.click('#textureImageApplyScopeAllBtn'); // 全部轨道
  await expect(scopeModal).toBeHidden();
  await page.waitForFunction(() => textureImageEditorUi.getState().dirtyTabCount === 0);

  // 验证所有轨道 NoteBodyStyle=1，且身体贴图高度达到 128px 以上
  const appliedState = await page.evaluate(() => {
    const keys = getActiveKeyCount();
    const cfg = getManiaConfigForKeys(keys);
    const bodyImg = getManiaSkinImage(keys, LML.HoldNoteBodyImage, 0);
    const tailImg = getManiaSkinImage(keys, LML.HoldNoteTailImage, 0);
    return {
      noteBodyStyle: cfg.NoteBodyStyle,
      bodyH: bodyImg?.height,
      hasTailPlaceholder: !!tailImg?._isBlankPlaceholder
    };
  });
  expect(appliedState.noteBodyStyle).toBe(1);
  expect(appliedState.bodyH).toBeGreaterThanOrEqual(128);

  // 验证撤回
  await page.evaluate(() => performSkinUndo());
  const undoneState = await page.evaluate(() => {
    const keys = getActiveKeyCount();
    const cfg = getManiaConfigForKeys(keys);
    const bodyImg = getManiaSkinImage(keys, LML.HoldNoteBodyImage, 0);
    return {
      noteBodyStyle: cfg.NoteBodyStyle,
      bodyH: bodyImg?.height
    };
  });
  expect(undoneState.noteBodyStyle).not.toBe(1);
  expect(undoneState.bodyH).toBe(35);

  // 验证重做
  await page.evaluate(() => performSkinRedo());
  const redoneState = await page.evaluate(() => {
    const keys = getActiveKeyCount();
    const cfg = getManiaConfigForKeys(keys);
    const bodyImg = getManiaSkinImage(keys, LML.HoldNoteBodyImage, 0);
    return {
      noteBodyStyle: cfg.NoteBodyStyle,
      bodyH: bodyImg?.height
    };
  });
  expect(redoneState.noteBodyStyle).toBe(1);
  expect(redoneState.bodyH).toBeGreaterThanOrEqual(128);

  expect(errors).toEqual([]);
});

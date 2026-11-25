const path = require('path');
const { test, expect } = require('@playwright/test');

const ROOT = path.resolve(__dirname, '../..');
const SKIN = path.join(ROOT, 'samples', 'skins', 'Kumakalerki.osk');
const MINIMAL_BEATMAP = path.join(ROOT, 'samples', 'beatmaps', 'minimal-4k.osu');

async function boot(page, skinPath = SKIN) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  await page.goto('/index.html');
  await page.waitForFunction(
    () => typeof textureImageEditorUi !== 'undefined' && typeof performSkinUndo === 'function',
    null,
    { timeout: 30000 }
  );
  await page.setInputFiles('#oskInput', skinPath);
  await page.waitForFunction(() => isSkinLoading === false, null, { timeout: 60000 });
  await page.setInputFiles('#oszInput', MINIMAL_BEATMAP);
  await page.waitForFunction(() => isStartupWorkspaceReady(), null, { timeout: 60000 });
  await page.waitForTimeout(200);
  return errors;
}

test('ColourBarline 拖动与透明度调整支持 Ctrl+Z 撤回至拖动前初始值', async ({ page }) => {
  const errors = await boot(page);
  await page.click('#openSkinEditorBtn');
  await page.waitForFunction(() => document.getElementById('skinEditorModal').classList.contains('active'));

  const before = await page.evaluate(() => {
    const cfg = ensureManiaConfigForKeys(getActiveKeyCount());
    return cfg.ColourBarline ? { ...cfg.ColourBarline } : null;
  });

  const controls = page.locator('.colour-barline-controls');
  await controls.scrollIntoViewIfNeeded();
  const picker = controls.locator('.col-colour-picker');
  const alphaSlider = controls.locator('.col-colour-slider');

  // 仅触发 input，模拟拖动后停顿超过 600ms 再松手触发 change
  await picker.evaluate((el) => {
    el.value = '#112233';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(650);
  await picker.evaluate((el) => {
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });

  await alphaSlider.evaluate((el) => {
    el.value = '80';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });

  const modified = await page.evaluate(() => ensureManiaConfigForKeys(getActiveKeyCount()).ColourBarline);
  expect(modified).toEqual({ r: 17, g: 34, b: 51, a: 80 });

  await page.keyboard.press('Control+z');
  await page.waitForTimeout(100);
  const afterFirstUndo = await page.evaluate(() => ensureManiaConfigForKeys(getActiveKeyCount()).ColourBarline);
  expect(afterFirstUndo).toEqual({ r: 17, g: 34, b: 51, a: before ? before.a : 255 });

  await page.keyboard.press('Control+z');
  await page.waitForTimeout(100);
  const afterSecondUndo = await page.evaluate(() => ensureManiaConfigForKeys(getActiveKeyCount()).ColourBarline);
  expect(afterSecondUndo).toEqual(before);
  expect(errors).toEqual([]);
});

test('createTexturePixelBoundaryStrokeCanvas 在宽度超过 32767px 时不发生 Int16 溢出', async ({ page }) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof createTexturePixelBoundaryStrokeCanvas === 'function');

  const result = await page.evaluate(() => {
    const width = 34000;
    const height = 8;
    const fill = document.createElement('canvas');
    fill.width = width;
    fill.height = height;
    const ctx = fill.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    const stroke = createTexturePixelBoundaryStrokeCanvas(fill, {
      color: '#ff0000',
      width: 2,
      alpha: 1
    });
    const sCtx = stroke.getContext('2d');
    const center = sCtx.getImageData(width / 2, 4, 1, 1).data;
    const rightEdge = sCtx.getImageData(width - 1, 4, 1, 1).data;
    const rightInner = sCtx.getImageData(width - 4, 4, 1, 1).data;
    return {
      width: stroke.width,
      height: stroke.height,
      centerAlpha: center[3],
      rightEdgeRed: rightEdge[0],
      rightEdgeAlpha: rightEdge[3],
      rightInnerAlpha: rightInner[3]
    };
  });

  expect(result.width).toBe(34000);
  expect(result.height).toBe(8);
  expect(result.centerAlpha).toBe(0);
  expect(result.rightEdgeRed).toBe(255);
  expect(result.rightEdgeAlpha).toBeGreaterThan(200);
  expect(result.rightInnerAlpha).toBe(0);
});

test('history 快照深拷贝、初始快照完整字段与长条删除不破坏 currentSkinZip', async ({ page }) => {
  const errors = await boot(page);

  const checkResult = await page.evaluate(async () => {
    // 1. 验证 createdSkinTextureParams 快照深拷贝隔离 nested generalEditParams
    saveCreatedTextureParams('deep-clone-check', {
      name: 'deep-clone-check',
      width: 32,
      height: 32,
      spec: '1x',
      color: '#ffffff',
      alpha: 100,
      shape: 'rectangle',
      generalEditParams: {
        cropLeft: 1,
        imageTransform: { scalePercent: 100, stretchX: 0, stretchY: 0 },
        rgbAdjustment: { r: 100, g: 100, b: 100 }
      }
    });
    const snap = createSkinSnapshot('test-deep');
    createdSkinTextureParams.get('deep-clone-check').generalEditParams.imageTransform.scalePercent = 250;
    const snapScale = snap.createdSkinTextureParams.get('deep-clone-check').generalEditParams.imageTransform.scalePercent;

    // 2. 验证 saveInitialSkinSnapshot 包含完整状态字段
    const buf = new Uint8Array([1, 2, 3]).buffer;
    userReplacedTextures.set('custom-init.png', buf);
    textureEditRecipes.set('4|NoteImage0', {
      sourceFrames: [],
      originalReference: 'mania-note1',
      keyImageOriginalSources: {},
      params: { imageTransform: { scalePercent: 120 }, rgbAdjustment: { r: 100, g: 100, b: 100 } },
      outputFrames: []
    });
    saveInitialSkinSnapshot();
    const initHasAll = Boolean(
      initialSkinSnapshot &&
      initialSkinSnapshot.userReplacedTextures &&
      initialSkinSnapshot.userReplacedTextures.has('custom-init.png') &&
      initialSkinSnapshot.createdSkinTextureParams &&
      initialSkinSnapshot.createdSkinTextureParams.has('deep-clone-check') &&
      initialSkinSnapshot.textureEditRecipes &&
      initialSkinSnapshot.textureEditRecipes.has('4|NoteImage0') &&
      initialSkinSnapshot.longBodyComposerSessions instanceof Map &&
      initialSkinSnapshot.activeEditorKeyCount === activeEditorKeyCount
    );

    // 3. 验证 deleteLongBodyGeneratedTexture 不直接调用 currentSkinZip.remove
    currentSkinZip.file('longbody-body_col1l.png', new Uint8Array([137, 80, 78, 71]));
    recordSkinUndoBeforeChange('delete-longbody-test', { force: true });
    deleteLongBodyGeneratedTexture('longbody-body_col1l');
    const zipStillHasBeforeUndo = Boolean(currentSkinZip.file('longbody-body_col1l.png'));
    const markedDeletedBeforeUndo = deletedSkinTexturePaths.has('longbody-body_col1l.png');

    performSkinUndo();
    const zipStillHasAfterUndo = Boolean(currentSkinZip.file('longbody-body_col1l.png'));
    const markedDeletedAfterUndo = deletedSkinTexturePaths.has('longbody-body_col1l.png');

    return {
      snapScale,
      initHasAll,
      zipStillHasBeforeUndo,
      markedDeletedBeforeUndo,
      zipStillHasAfterUndo,
      markedDeletedAfterUndo
    };
  });

  expect(checkResult.snapScale).toBe(100);
  expect(checkResult.initHasAll).toBe(true);
  expect(checkResult.zipStillHasBeforeUndo).toBe(true);
  expect(checkResult.markedDeletedBeforeUndo).toBe(true);
  expect(checkResult.zipStillHasAfterUndo).toBe(true);
  expect(checkResult.markedDeletedAfterUndo).toBe(false);
  expect(errors).toEqual([]);
});

test('皮肤撤回同步刷新非 KeyImage 与后台贴图标签，纯色编辑关闭恢复原图，保存失败回滚撤回栈', async ({ page }) => {
  const errors = await boot(page);

  // A. 皮肤撤回同步刷新非 KeyImage 激活标签页与后台标签页
  await page.click('#openTextureImageEditorBtn');
  await page.waitForFunction(() => document.getElementById('textureImageEditorModal').classList.contains('active'));
  await page.click('#param-card-StageLeft .texture-edit-main-btn');
  await page.waitForFunction(() => textureImageEditorUi.getState().selectedKey === 'StageLeft');
  const stageLeftBefore = await page.evaluate(() => textureImageEditorUi.getState().sourceSize.width);

  await page.click('.texture-image-tab[data-tab-id="menu"]');
  await page.click('#param-card-NoteImage0 .texture-edit-main-btn');
  await page.waitForFunction(() => textureImageEditorUi.getState().selectedKey === 'NoteImage0');

  // 对 StageLeft (后台) 和 NoteImage0 (当前激活非 KeyImage) 写入可撤回的尺寸修改
  await page.evaluate(() => {
    const keys = getActiveKeyCount();
    const makeCanvas = (w, h) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      return c;
    };
    recordSkinUndoBeforeChange('测试非KeyImage同步', { force: true });
    const stageParam = getTextureTabParams().find((p) => p.key === 'StageLeft');
    const noteParam = getTextureTabParams().find((p) => p.key === 'NoteImage0');
    const stageTarget = buildEditorTarget(stageParam);
    const noteTarget = buildEditorTarget(noteParam);
    installFramesToStores([makeCanvas(11, 22)], stageTarget, { persist: false, draw: false });
    installFramesToStores([makeCanvas(33, 44)], noteTarget, { persist: false, draw: false });
    performSkinUndo();
  });

  const activeAfterUndo = await page.evaluate(() => textureImageEditorUi.getState());
  expect(activeAfterUndo.selectedKey).toBe('NoteImage0');
  expect(activeAfterUndo.sourceSize.width).not.toBe(33);

  await page.click('.texture-image-tab[data-param-key="StageLeft"]');
  const bgAfterUndo = await page.evaluate(() => textureImageEditorUi.getState());
  expect(bgAfterUndo.selectedKey).toBe('StageLeft');
  expect(bgAfterUndo.sourceSize.width).toBe(stageLeftBefore);

  // B. 异步保存失败回滚 undoStack 与 NoteBodyStyle
  await page.evaluate(() => {
    const keys = getActiveKeyCount();
    const cfg = ensureManiaConfigForKeys(keys);
    cfg.NoteBodyStyle = 0;
    cfg.NoteBodyStyles = Array.from({ length: keys }, () => 0);
  });
  await page.click('.texture-image-tab[data-tab-id="menu"]');
  await page.click('#param-card-NoteImage0L .texture-edit-main-btn');
  await page.waitForFunction(() => textureImageEditorUi.getState().selectedKey === 'NoteImage0L');
  await page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 40;
    c.height = 40;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 40, 40);
    const param = getTextureTabParams().find((p) => p.key === 'NoteImage0L');
    const target = buildEditorTarget(param);
    installFramesToStores([c], target, { persist: true, draw: false });
    refreshTextureImageEditorAfterSkinHistory();
  });
  await page.click('.texture-image-switch-track');
  await page.waitForFunction(() => textureImageEditorUi.getState().longBody.active);

  const failCheck = await page.evaluate(async () => {
    const undoBefore = undoStack.length;
    const origApply = applyLongBodyToTracks;
    applyLongBodyToTracks = async () => false;
    try {
      const ok = await applySelectedTexture({ longBodyScope: 'all' });
      const cfg = ensureManiaConfigForKeys(getActiveKeyCount());
      return {
        ok,
        undoAfter: undoStack.length,
        undoBefore,
        noteBodyStyle: cfg.NoteBodyStyle,
        noteBodyStyles: cfg.NoteBodyStyles ? cfg.NoteBodyStyles.slice() : []
      };
    } finally {
      applyLongBodyToTracks = origApply;
    }
  });
  expect(failCheck.ok).toBe(false);
  expect(failCheck.undoAfter).toBe(failCheck.undoBefore);
  expect(failCheck.noteBodyStyle).toBe(0);
  expect(failCheck.noteBodyStyles.every((v) => v === 0)).toBe(true);

  await textureImageEditorUiClose(page);

  // C. 编辑态纯色创建器实时预览后直接 close()，提示未保存且放弃后恢复原图
  await page.evaluate(() => {
    const cParams = {
      name: 'creator-close-restore',
      width: 40,
      height: 40,
      spec: '1x',
      color: '#00ff00',
      alpha: 100,
      shape: 'rectangle',
      cornerRadius: 0,
      arrowThickness: 20,
      arrowRoundness: 50
    };
    saveCreatedTextureParams('creator-close-restore', cParams);
    const canvas = createSolidShapeTexture(cParams);
    saveSkinAssetToStore(skinImageStore, 'creator-close-restore', canvas, false, true, true);
    saveSkinAssetToStore(skinFallbackImageStore, 'creator-close-restore', canvas, false, true, true);
  });

  await page.click('#openTextureImageEditorBtn');
  await page.waitForFunction(() => document.getElementById('textureImageEditorModal').classList.contains('active'));
  await page.evaluate(() => openTextureCreator({ editPath: 'creator-close-restore', paramKey: 'StageLeft' }));
  await expect(page.locator('#textureImageCreatorView')).toBeVisible();
  await page.fill('#textureImageCreateColorHex', '#ff0000');

  const dirtyCount = await page.evaluate(() => textureImageEditorUi.getState().dirtyTabCount);
  expect(dirtyCount).toBe(1);

  const closeResult = await page.evaluate(() => textureImageEditorUi.close({ unsavedDecision: 'discard' }));
  expect(closeResult).toBe(true);
  await page.waitForFunction(() => !document.getElementById('textureImageEditorModal').classList.contains('active'));

  const centerPixel = await page.evaluate(() => {
    const entry = skinImageStore.get('creator-close-restore');
    const img = entry && entry.static1x;
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    c.getContext('2d').drawImage(img, 0, 0);
    return Array.from(c.getContext('2d').getImageData(20, 20, 1, 1).data);
  });
  expect(centerPixel[0]).toBe(0);
  expect(centerPixel[1]).toBe(255);
  expect(centerPixel[2]).toBe(0);
  const unexpectedErrors = errors.filter((msg) => !msg.includes('贴图编辑应用失败'));
  expect(unexpectedErrors).toEqual([]);
});

async function textureImageEditorUiClose(page) {
  await page.evaluate(() => textureImageEditorUi.close({ unsavedDecision: 'discard' }));
  await page.waitForFunction(() => !document.getElementById('textureImageEditorModal').classList.contains('active'));
}

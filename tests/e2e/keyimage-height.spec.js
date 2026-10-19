const path = require('path');
const { test, expect } = require('@playwright/test');

const ROOT = path.resolve(__dirname, '../..');
const SKIN = path.join(ROOT, 'samples', 'skins', 'Kumakalerki.osk');
const KEY_IMAGE_CONTENT_HEIGHTS = [60, 90, 70, 80];
const KEY_IMAGE_DOWN_CONTENT_HEIGHTS = [50, 75, 65, 55];

const BEATMAP = path.join(ROOT, 'samples', 'beatmaps', '1790742 MIMI - Kuu ni Naru.osz');

async function boot(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof collectKeyImageHeightTarget === 'function');
  await page.setInputFiles('#oszInput', BEATMAP);
  await page.waitForFunction(
    () => isStartupBeatmapReady() && beatmaps.length > 0,
    null,
    { timeout: 60000 }
  );
  await page.setInputFiles('#oskInput', SKIN);
  await page.waitForFunction(() => isSkinLoading === false && isStartupWorkspaceReady(), null, { timeout: 60000 });
  await page.waitForTimeout(300);
  return errors;
}

function keyImageSizes(page) {
  return page.evaluate(() => {
    const keys = getActiveKeyCount();
    const sizes = [];
    for (let col = 0; col < keys; col++) {
      const normal = getManiaSkinImage(keys, LML.KeyImage, col);
      const down = getManiaSkinImage(keys, LML.KeyImageDown, col);
      sizes.push({
        col,
        normal: normal ? { width: normal.width, height: normal.height } : null,
        down: down ? { width: down.width, height: down.height } : null
      });
    }
    return sizes;
  });
}

async function installPerTrackKeyImages(page) {
  await page.evaluate(({ normalHeights, downHeights }) => {
    const keys = getActiveKeyCount();
    const cfg = maniaSkinConfigurations.get(keys);
    if (!cfg.ImageLookups) cfg.ImageLookups = new Map();

    for (let col = 0; col < keys; col++) {
      for (const isDown of [false, true]) {
        const base = `test-key-${col + 1}${isDown ? 'd' : ''}`;
        const frame = document.createElement('canvas');
        frame.width = 30;
        frame.height = isDown ? downHeights[col] : normalHeights[col];
        frame._is2x = false;
        const ctx = frame.getContext('2d');
        ctx.fillStyle = isDown ? '#ff66aa' : '#66ccff';
        ctx.fillRect(0, 0, frame.width, frame.height);

        saveSkinAssetToStore(skinImageStore, base, frame, false, true, true);
        saveSkinAssetToStore(skinFallbackImageStore, base, frame, false, true, true);

        const paramKey = `KeyImage${col}${isDown ? 'D' : ''}`;
        cfg[paramKey] = base;
        cfg.ImageLookups.set(paramKey, base);
        cfg.ImageLookups.set(paramKey.toLowerCase(), base);
      }
    }
    drawFrame();
  }, {
    normalHeights: KEY_IMAGE_CONTENT_HEIGHTS,
    downHeights: KEY_IMAGE_DOWN_CONTENT_HEIGHTS
  });
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

test('KeyImage 可独立增减高度，并在接近其他轨道高度时磁吸', async ({ page }) => {
  const errors = await boot(page);
  await installPerTrackKeyImages(page);
  const before = await keyImageSizes(page);
  // 目标高度略低于第 2 轨，但仍在磁吸阈值内，应吸附为完全相同的高度。
  const nearSecondHeight = before[1].normal.height - 3;
  await dragSelectedKeyTop(page, 0, nearSecondHeight);
  await page.waitForFunction(() => userReplacedTextures.size >= 1);
  const magnetized = await keyImageSizes(page);

  expect(magnetized[0].normal.height).toBeCloseTo(magnetized[1].normal.height, 5);
  expect(magnetized[0].down.height).toBeCloseTo(magnetized[0].normal.height, 5);
  expect(magnetized[1]).toEqual(before[1]);
  expect(magnetized[2]).toEqual(before[2]);
  expect(magnetized[3]).toEqual(before[3]);
  for (let i = 1; i < before.length; i++) {
    expect(magnetized[i].down).toEqual(before[i].down);
  }

  const exportKeysAfterIncrease = await page.evaluate(() => Array.from(userReplacedTextures.keys()));
  expect(exportKeysAfterIncrease).toEqual([
    'test-key-1.png',
    'test-key-1d.png'
  ]);

  // 拖到低于原始高度，验证可以向下裁短，而不是只能回到 0 偏移。
  const belowOriginalHeight = before[0].normal.height - 8;
  await dragSelectedKeyTop(page, 0, belowOriginalHeight);
  await page.waitForFunction(
    (height) => getManiaSkinImage(getActiveKeyCount(), LML.KeyImage, 0).height < height,
    before[0].normal.height
  );
  const shortened = await keyImageSizes(page);

  expect(shortened[0].normal.height).toBeLessThan(before[0].normal.height);
  expect(shortened[0].down.height).toBeCloseTo(shortened[0].normal.height, 5);
  expect(shortened[1]).toEqual(before[1]);
  expect(shortened[2]).toEqual(before[2]);
  expect(shortened[3]).toEqual(before[3]);
  for (let i = 1; i < before.length; i++) {
    expect(shortened[i].down).toEqual(before[i].down);
  }

  await page.keyboard.press('Control+z');
  await page.waitForFunction(() => userReplacedTextures.size >= 1);
  const beforeUndo = await keyImageSizes(page);
  expect(beforeUndo[0].normal.height).toBeCloseTo(magnetized[0].normal.height, 5);

  await page.keyboard.press('Control+z');
  await page.waitForFunction(() => userReplacedTextures.size === 0);
  expect(await keyImageSizes(page)).toEqual(before);
  expect(errors).toEqual([]);
});

test('选中 KeyImage 后点击更换贴图会定位并高亮同轨 KeyImage 与 KeyImageD', async ({ page }) => {
  const errors = await boot(page);
  await installPerTrackKeyImages(page);

  const handle = await page.evaluate(() => {
    const key = canvasInteractiveElements.find((item) => item.id === 'key_0');
    const rect = canvas.getBoundingClientRect();
    return {
      x: rect.left + (key.x + key.w / 2) * rect.width / canvas.width,
      y: rect.top + key.keyImageResizeEdgeY * rect.height / canvas.height
    };
  });

  await page.mouse.click(handle.x, handle.y);
  await page.waitForFunction(() => selectedCanvasElement && selectedCanvasElement.id === 'key_0');
  await page.waitForFunction(() =>
    document.getElementById('cardReplaceTextureBtn').textContent.includes('定位按键贴图')
  );

  await page.click('#cardReplaceTextureBtn');
  await page.waitForFunction(() => {
    const normal = document.getElementById('param-card-KeyImage0');
    const down = document.getElementById('param-card-KeyImage0D');
    const picker = document.getElementById('textureImagePickerView');
    return document.getElementById('textureImageEditorModal').classList.contains('active') &&
      picker && getComputedStyle(picker).display !== 'none' &&
      normal && down &&
      normal.classList.contains('highlight-pulse') &&
      down.classList.contains('highlight-pulse');
  });

  const state = await page.evaluate(() => ({
    textureEditorActive: document.getElementById('textureImageEditorModal').classList.contains('active'),
    detailedSettingsActive: document.getElementById('skinEditorModal').classList.contains('active'),
    pickerVisible: getComputedStyle(document.getElementById('textureImagePickerView')).display !== 'none',
    highlightedIds: Array.from(document.querySelectorAll('.highlight-pulse')).map((el) => el.id),
    activeTab: textureImageEditorUi.getState().activeTabId
  }));

  expect(state.textureEditorActive).toBe(true);
  expect(state.detailedSettingsActive).toBe(false);
  expect(state.pickerVisible).toBe(true);
  expect(state.activeTab).toBe('menu');
  expect(state.highlightedIds).toEqual(expect.arrayContaining([
    'param-card-KeyImage0',
    'param-card-KeyImage0D'
  ]));
  expect(errors).toEqual([]);
});

test('画布调整 KeyImage 高度会实时同步到贴图编辑标签且关闭后不回退', async ({ page }) => {
  const errors = await boot(page);
  await installPerTrackKeyImages(page);

  await page.click('#openTextureImageEditorBtn');
  await page.click('#textureImagePickerGrid [data-param-key="KeyImage0"]');
  await page.waitForFunction(() => textureImageEditorUi.getState().selectedKey === 'KeyImage0');
  await page.evaluate(() => {
    const dialog = document.getElementById('textureImageEditorDialog');
    dialog.style.left = '920px';
    dialog.style.right = 'auto';
  });

  const beforeEditor = await page.evaluate(() => textureImageEditorUi.getState());
  const targetHeight = beforeEditor.contentBounds.bottom + 48;
  await dragSelectedKeyTop(page, 0, targetHeight);
  await page.waitForFunction((minimumHeight) => {
    const state = textureImageEditorUi.getState();
    const img = getManiaSkinImage(getActiveKeyCount(), LML.KeyImage, 0);
    return state.previewSize &&
      img &&
      img.height > minimumHeight &&
      state.previewSize.height === img.height;
  }, beforeEditor.previewSize.height);

  const synced = await page.evaluate(() => ({
    editor: textureImageEditorUi.getState(),
    canvas: (() => {
      const img = getManiaSkinImage(getActiveKeyCount(), LML.KeyImage, 0);
      return img ? { width: img.width, height: img.height } : null;
    })(),
    cropBottom: document.getElementById('textureImageCropBottom') ? document.getElementById('textureImageCropBottom').value : null
  }));
  expect(synced.editor.previewSize.height).toBe(synced.canvas.height);
  expect(synced.editor.previewSize.height).toBeGreaterThan(beforeEditor.previewSize.height);
  expect(synced.cropBottom).toBe('48');
  expect(synced.editor.dirtyTabCount).toBe(0);

  await page.click('.texture-image-tab[data-param-key="KeyImage0"] .texture-image-tab-close');
  await page.waitForFunction(() => !document.querySelector('.texture-image-tab[data-param-key="KeyImage0"]'));
  const afterClose = await page.evaluate(() => {
    const img = getManiaSkinImage(getActiveKeyCount(), LML.KeyImage, 0);
    return img ? img.height : 0;
  });
  expect(afterClose).toBe(synced.canvas.height);
  expect(errors).toEqual([]);
});

test('贴图编辑器保存 KeyImage 后，画布高度不再复用旧基准', async ({ page }) => {
  const errors = await boot(page);
  await installPerTrackKeyImages(page);

  const before = await keyImageSizes(page);
  await dragSelectedKeyTop(page, 0, before[0].normal.height + 30);
  await page.waitForFunction(() => userReplacedTextures.size >= 2);
  const raised = await keyImageSizes(page);

  await page.click('#openTextureImageEditorBtn');
  await page.click('#textureImagePickerGrid [data-param-key="KeyImage0"]');
  await page.waitForFunction(() => textureImageEditorUi.getState().selectedKey === 'KeyImage0');

  // 画布拖拽后下边界已为 30
  expect(await page.inputValue('#textureImageCropBottom')).toBe('30');
  await page.fill('#textureImageCropBottom', '25');
  await page.waitForFunction(
    (height) => textureImageEditorUi.getState().previewSize.height === height,
    85
  );
  await page.click('#textureImageApplyBtn');
  await page.waitForFunction(() => textureImageEditorUi.getState().dirtyTabCount === 0);

  const saved = await keyImageSizes(page);
  expect(saved[0].normal.height).toBe(raised[0].normal.height - 5);

  const baseline = await page.evaluate(() => {
    const target = collectKeyImageHeightTarget(getActiveKeyCount(), 0);
    return {
      contentHeight: target.sourceFrames[0].height,
      initialOffset1x: target.initialOffset1x
    };
  });
  expect(baseline.contentHeight).toBe(60);
  expect(baseline.initialOffset1x).toBe(25);

  await page.click('.texture-image-tab[data-param-key="KeyImage0"] .texture-image-tab-close');
  await page.waitForFunction(() => !document.querySelector('.texture-image-tab[data-param-key="KeyImage0"]'));
  await page.click('#textureImageEditorCloseBtn');
  await page.waitForFunction(() => document.getElementById('textureImageEditorModal').style.display === 'none');
  const adjustedHeight = saved[0].normal.height + 24;
  await dragSelectedKeyTop(page, 0, adjustedHeight);
  const adjusted = await keyImageSizes(page);
  expect(adjusted[0].normal.height).toBeGreaterThan(saved[0].normal.height);
  expect(adjusted[0].normal.height).not.toBe(raised[0].normal.height);
  expect(errors).toEqual([]);
});

test('自建贴图在画布中拖动调整高度，与通用设置的下边界挂钩，并支持在贴图编辑中查看与撤回重做', async ({ page }) => {
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
      name: 'created-key-box'
    };
    saveCreatedTextureParams('created-key-box', createdParams);
    const canvas = createSolidShapeTexture(createdParams);
    saveSkinAssetToStore(skinImageStore, 'created-key-box', canvas, false, true, true);
    saveSkinAssetToStore(skinFallbackImageStore, 'created-key-box', canvas, false, true, true);
    cfg.KeyImage0 = 'created-key-box';
    cfg.KeyImage0D = 'created-key-box';
    cfg.ImageLookups.set('KeyImage0', 'created-key-box');
    cfg.ImageLookups.set('KeyImage0D', 'created-key-box');
    cfg.ImageLookups.set('keyimage0', 'created-key-box');
    cfg.ImageLookups.set('keyimage0d', 'created-key-box');
    drawFrame();
  });

  const before = await keyImageSizes(page);
  expect(before[0].normal.height).toBe(40);

  // 往上抬 20px
  await dragSelectedKeyTop(page, 0, 60);
  await page.waitForFunction(() => {
    const img = getManiaSkinImage(getActiveKeyCount(), LML.KeyImage, 0);
    return img && img.height === 60;
  });

  const raised = await keyImageSizes(page);
  expect(raised[0].normal.height).toBe(60);

  // 验证通用设置中的下边界已增加为 20
  const generalParams = await page.evaluate(() => getCreatedTextureGeneralEditParams('created-key-box'));
  expect(generalParams.bottom).toBe(20);

  // 打开贴图编辑器验证下边界输入框直接显示为 20
  await page.click('#openTextureImageEditorBtn');
  await page.evaluate(() => textureImageEditorUi.openLibraryEditor('created-key-box'));
  await page.waitForFunction(() => textureImageEditorUi.getState().selectedBase === 'created-key-box');
  const cropBottomVal = await page.inputValue('#textureImageCropBottom');
  expect(cropBottomVal).toBe('20');
  await page.click('#textureImageEditorCloseBtn');
  await page.waitForFunction(() => document.getElementById('textureImageEditorModal').style.display === 'none');

  // 撤回
  await page.evaluate(() => performSkinUndo());
  const undone = await keyImageSizes(page);
  expect(undone[0].normal.height).toBe(40);
  const undoneGeneral = await page.evaluate(() => getCreatedTextureGeneralEditParams('created-key-box'));
  expect(!undoneGeneral || !undoneGeneral.bottom || undoneGeneral.bottom === 0).toBe(true);

  // 重做
  await page.evaluate(() => performSkinRedo());
  const redone = await keyImageSizes(page);
  expect(redone[0].normal.height).toBe(60);
  const redoneGeneral = await page.evaluate(() => getCreatedTextureGeneralEditParams('created-key-box'));
  expect(redoneGeneral.bottom).toBe(20);
  expect(errors).toEqual([]);
});

test('KeyImage 被多轨引用时，在画布拖动调整高度提示弹窗，选择独立创建为当前轨独立创建贴图', async ({ page }) => {
  const errors = await boot(page);
  await page.evaluate(() => {
    const keys = getActiveKeyCount();
    const cfg = getManiaConfigForKeys(keys);
    if (!cfg.ImageLookups) cfg.ImageLookups = new Map();
    const frame = document.createElement('canvas');
    frame.width = 30;
    frame.height = 50;
    const ctx = frame.getContext('2d');
    ctx.fillStyle = '#ff8833';
    ctx.fillRect(0, 0, frame.width, frame.height);
    saveSkinAssetToStore(skinImageStore, 'shared-drag-key', frame, false, true, true);
    saveSkinAssetToStore(skinFallbackImageStore, 'shared-drag-key', frame, false, true, true);
    for (let col = 0; col < 2; col++) {
      cfg[`KeyImage${col}`] = 'shared-drag-key';
      cfg[`KeyImage${col}D`] = `down-${col}`;
      cfg.ImageLookups.set(`KeyImage${col}`, 'shared-drag-key');
      cfg.ImageLookups.set(`KeyImage${col}D`, `down-${col}`);
    }
    drawFrame();
  });

  // 拖拽第 1 轨 (col 0)
  await dragSelectedKeyTop(page, 0, 80);

  // 弹窗提示多轨引用
  const scopeModal = page.locator('#textureImageApplyScopeModal');
  await expect(scopeModal).toBeVisible();
  await expect(page.locator('#textureImageApplyScopeTitle')).toHaveText('贴图被多处引用');

  // 选择“独立创建”
  await page.click('#textureImageApplyScopeCurrentBtn');
  await expect(scopeModal).toBeHidden();

  // 验证第 1 轨独立创建了新贴图且高度增加，第 2 轨仍使用原贴图且高度保持原状
  const afterIndependent = await page.evaluate(() => {
    const keys = getActiveKeyCount();
    return {
      name0: getManiaNoteTextureName(keys, LML.KeyImage, 0),
      name1: getManiaNoteTextureName(keys, LML.KeyImage, 1),
      h0: getManiaSkinImage(keys, LML.KeyImage, 0).height,
      h1: getManiaSkinImage(keys, LML.KeyImage, 1).height
    };
  });
  expect(afterIndependent.name0).not.toBe('shared-drag-key');
  expect(afterIndependent.name0).toContain('shared-drag-key');
  expect(afterIndependent.name1).toBe('shared-drag-key');
  expect(afterIndependent.h0).toBe(80);
  expect(afterIndependent.h1).toBe(50);

  // 验证撤回
  await page.evaluate(() => performSkinUndo());
  const afterUndo = await page.evaluate(() => {
    const keys = getActiveKeyCount();
    return {
      name0: getManiaNoteTextureName(keys, LML.KeyImage, 0),
      name1: getManiaNoteTextureName(keys, LML.KeyImage, 1),
      h0: getManiaSkinImage(keys, LML.KeyImage, 0).height,
      h1: getManiaSkinImage(keys, LML.KeyImage, 1).height
    };
  });
  expect(afterUndo.name0).toBe('shared-drag-key');
  expect(afterUndo.name1).toBe('shared-drag-key');
  expect(afterUndo.h0).toBe(50);
  expect(afterUndo.h1).toBe(50);
  expect(errors).toEqual([]);
});

test('KeyImage 被多轨引用时，在画布拖动调整高度提示弹窗，选择同步替换更新所有引用', async ({ page }) => {
  const errors = await boot(page);
  await page.evaluate(() => {
    const keys = getActiveKeyCount();
    const cfg = getManiaConfigForKeys(keys);
    if (!cfg.ImageLookups) cfg.ImageLookups = new Map();
    const frame = document.createElement('canvas');
    frame.width = 30;
    frame.height = 50;
    const ctx = frame.getContext('2d');
    ctx.fillStyle = '#8833ff';
    ctx.fillRect(0, 0, frame.width, frame.height);
    saveSkinAssetToStore(skinImageStore, 'shared-sync-key', frame, false, true, true);
    saveSkinAssetToStore(skinFallbackImageStore, 'shared-sync-key', frame, false, true, true);
    for (let col = 0; col < keys; col++) {
      cfg[`KeyImage${col}`] = 'shared-sync-key';
      cfg[`KeyImage${col}D`] = `down-${col}`;
      cfg.ImageLookups.set(`KeyImage${col}`, 'shared-sync-key');
      cfg.ImageLookups.set(`KeyImage${col}D`, `down-${col}`);
    }
    drawFrame();
  });

  await dragSelectedKeyTop(page, 0, 75);

  const scopeModal = page.locator('#textureImageApplyScopeModal');
  await expect(scopeModal).toBeVisible();

  // 选择“同步替换”
  await page.click('#textureImageApplyScopeAllBtn');
  await expect(scopeModal).toBeHidden();

  // 验证两轨均更新为 75，且贴图名保持原名
  const afterSync = await page.evaluate(() => {
    const keys = getActiveKeyCount();
    return {
      name0: getManiaNoteTextureName(keys, LML.KeyImage, 0),
      name1: getManiaNoteTextureName(keys, LML.KeyImage, 1),
      h0: getManiaSkinImage(keys, LML.KeyImage, 0).height,
      h1: getManiaSkinImage(keys, LML.KeyImage, 1).height
    };
  });
  expect(afterSync.name0).toBe('shared-sync-key');
  expect(afterSync.name1).toBe('shared-sync-key');
  expect(afterSync.h0).toBe(75);
  expect(afterSync.h1).toBe(75);
  expect(errors).toEqual([]);
});

test('KeyImage 被多轨引用时，在画布拖动调整高度提示弹窗，点击取消撤回预览还原原状', async ({ page }) => {
  const errors = await boot(page);
  await page.evaluate(() => {
    const keys = getActiveKeyCount();
    const cfg = getManiaConfigForKeys(keys);
    if (!cfg.ImageLookups) cfg.ImageLookups = new Map();
    const frame = document.createElement('canvas');
    frame.width = 30;
    frame.height = 50;
    const ctx = frame.getContext('2d');
    ctx.fillStyle = '#ff3388';
    ctx.fillRect(0, 0, frame.width, frame.height);
    saveSkinAssetToStore(skinImageStore, 'shared-cancel-key', frame, false, true, true);
    saveSkinAssetToStore(skinFallbackImageStore, 'shared-cancel-key', frame, false, true, true);
    for (let col = 0; col < keys; col++) {
      cfg[`KeyImage${col}`] = 'shared-cancel-key';
      cfg[`KeyImage${col}D`] = `down-${col}`;
      cfg.ImageLookups.set(`KeyImage${col}`, 'shared-cancel-key');
      cfg.ImageLookups.set(`KeyImage${col}D`, `down-${col}`);
    }
    drawFrame();
  });

  await dragSelectedKeyTop(page, 0, 75);

  const scopeModal = page.locator('#textureImageApplyScopeModal');
  await expect(scopeModal).toBeVisible();

  // 点击取消
  await page.click('#textureImageApplyScopeCancelBtn');
  await expect(scopeModal).toBeHidden();

  // 验证两轨均还原为 50
  const afterCancel = await page.evaluate(() => {
    const keys = getActiveKeyCount();
    return {
      name0: getManiaNoteTextureName(keys, LML.KeyImage, 0),
      name1: getManiaNoteTextureName(keys, LML.KeyImage, 1),
      h0: getManiaSkinImage(keys, LML.KeyImage, 0).height,
      h1: getManiaSkinImage(keys, LML.KeyImage, 1).height
    };
  });
  expect(afterCancel.name0).toBe('shared-cancel-key');
  expect(afterCancel.name1).toBe('shared-cancel-key');
  expect(afterCancel.h0).toBe(50);
  expect(afterCancel.h1).toBe(50);
  expect(errors).toEqual([]);
});

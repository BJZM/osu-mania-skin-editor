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
  await page.waitForTimeout(250);
  return errors;
}

async function installKeyImageReferences(page, references) {
  await page.evaluate((refs) => {
    const keys = getActiveKeyCount();
    const cfg = getManiaConfigForKeys(keys);
    if (!cfg.ImageLookups) cfg.ImageLookups = new Map();
    const saved = new Set();

    const saveReference = (name) => {
      if (saved.has(name)) return;
      saved.add(name);
      const frame = document.createElement('canvas');
      frame.width = 30;
      frame.height = 60;
      frame._is2x = false;
      const ctx = frame.getContext('2d');
      ctx.fillStyle = `hsl(${Array.from(name).reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 360} 80% 60%)`;
      ctx.fillRect(0, 0, frame.width, frame.height);
      saveSkinAssetToStore(skinImageStore, name, frame, false, true, true);
      saveSkinAssetToStore(skinFallbackImageStore, name, frame, false, true, true);
    };

    for (let col = 0; col < keys; col++) {
      const normal = refs[col].normal;
      const down = refs[col].down;
      saveReference(normal);
      saveReference(down);
      cfg[`KeyImage${col}`] = normal;
      cfg[`KeyImage${col}D`] = down;
      cfg.ImageLookups.set(`KeyImage${col}`, normal);
      cfg.ImageLookups.set(`KeyImage${col}D`, down);
      cfg.ImageLookups.set(`KeyImage${col}D`.toLowerCase(), down);
    }
    drawFrame();
  }, references);
}

async function openAndEditKeyImage(page, paramKey = 'KeyImage0') {
  await page.click('#openTextureImageEditorBtn');
  await page.click(`#textureImagePickerGrid [data-param-key="${paramKey}"]`);
  await page.waitForFunction((key) => textureImageEditorUi.getState().selectedKey === key, paramKey);
  await page.fill('#textureImageCropBottom', '10');
  await page.fill('#textureImageScalePercent', '120');
  await page.waitForFunction(() => {
    const preview = textureImageEditorUi.getState().previewSize;
    return preview && preview.width === 36 && preview.height === 84;
  });
}

async function saveKeyImage(page, mode = 'current') {
  if (mode === 'current') {
    await page.click('#textureImageApplyBtn');
  } else {
    await page.click('#textureImageApplyMenuBtn');
    await expect(page.locator('#textureImageApplyMenu')).toBeVisible();
    if (mode === 'all') {
      await page.click('#textureImageApplyAllBtn');
    } else if (mode === 'current-only') {
      await page.click('#textureImageApplyCurrentOnlyBtn');
    } else {
      await page.click('#textureImageApplyAllOnlyBtn');
    }
    await expect(page.locator('#textureImageApplyMenu')).toBeHidden();
  }
  await expect(page.locator('#textureImageApplyScopeModal')).toBeHidden();
  await expect(page.locator('#textureImageApplyBtn')).toHaveText('保存当前轨道');
  await page.waitForFunction(() => textureImageEditorUi.getState().dirtyTabCount === 0);
}

function readKeyImageState(page) {
  return page.evaluate(() => {
    const keys = getActiveKeyCount();
    const probe = document.createElement('canvas');
    const readColor = (img) => {
      if (!img) return null;
      probe.width = img.width;
      probe.height = img.height;
      const ctx = probe.getContext('2d');
      ctx.clearRect(0, 0, probe.width, probe.height);
      ctx.drawImage(img, 0, 0);
      return Array.from(ctx.getImageData(
        Math.floor(probe.width / 2),
        Math.floor(probe.height / 2),
        1,
        1
      ).data);
    };
    return {
      names: Array.from({ length: keys }, (_, col) => ({
        normal: getManiaNoteTextureName(keys, LML.KeyImage, col),
        down: getManiaNoteTextureName(keys, LML.KeyImageDown, col)
      })),
      sizes: Array.from({ length: keys }, (_, col) => {
        const normal = getManiaSkinImage(keys, LML.KeyImage, col);
        const down = getManiaSkinImage(keys, LML.KeyImageDown, col);
        return {
          normal: normal ? { width: normal.width, height: normal.height } : null,
          down: down ? { width: down.width, height: down.height } : null
        };
      }),
      colors: Array.from({ length: keys }, (_, col) => ({
        normal: readColor(getManiaSkinImage(keys, LML.KeyImage, col)),
        down: readColor(getManiaSkinImage(keys, LML.KeyImageDown, col))
      })),
      exportKeys: Array.from(userReplacedTextures.keys()),
      editor: textureImageEditorUi.getState()
    };
  });
}

function readKeyImageUiState(page) {
  return page.evaluate(() => {
    renderSkinEditorParams();
    const read = (key) => {
      const preview = document.querySelector(`#param-card-${key} .texture-preview-box`);
      return preview ? preview.title : '';
    };
    return {
      normal: read('KeyImage0'),
      down: read('KeyImage0D')
    };
  });
}

async function dragSelectedKeyTop(page, col, targetSourceHeight) {
  const geometry = await page.evaluate(({ col, targetSourceHeight }) => {
    const key = canvasInteractiveElements.find((item) => item.id === `key_${col}`);
    const img = getManiaSkinImage(getActiveKeyCount(), LML.KeyImage, col);
    const rawColWRes = getManiaSkinConfig(getActiveKeyCount(), LML.ColumnWidth, col);
    const rawColW = (rawColWRes && rawColWRes.value > 0) ? rawColWRes.value : 30;
    const ratio = img._is2x ? 2 : 1;
    const stableRefW = rawColW * 1.6 * ratio;
    const currentDrawHeight = key.w * img.height / stableRefW;
    const targetDrawHeight = key.w * targetSourceHeight / stableRefW;
    const pxPerLogical = key.w / stableRefW;
    const rect = canvas.getBoundingClientRect();
    return {
      handleX: rect.left + (key.x + key.w / 2) * rect.width / canvas.width,
      handleY: rect.top + key.keyImageResizeEdgeY * rect.height / canvas.height,
      cssDelta: (targetDrawHeight - currentDrawHeight) / pxPerLogical * rect.height / canvas.height
    };
  }, { col, targetSourceHeight });

  await page.mouse.move(geometry.handleX, geometry.handleY);
  await page.mouse.down();
  await page.waitForFunction((id) => selectedCanvasElement && selectedCanvasElement.id === id, `key_${col}`);
  await page.mouse.move(geometry.handleX, geometry.handleY - geometry.cssDelta, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(250);
}

test('KeyImage 主保存只处理当前轨道并同步裁剪拉伸参数', async ({ page }) => {
  const errors = await boot(page);
  await installKeyImageReferences(page, Array.from({ length: 4 }, (_, col) => ({
    normal: `apply-current-normal-${col}`,
    down: `apply-current-down-${col}`
  })));
  const before = await readKeyImageState(page);

  await openAndEditKeyImage(page);
  await saveKeyImage(page);
  const after = await readKeyImageState(page);

  expect(after.names[0].normal).not.toBe(before.names[0].normal);
  expect(after.names[0].down).not.toBe(before.names[0].down);
  expect(after.names[0].normal).not.toBe(after.names[0].down);
  expect(after.sizes[0].normal).toEqual({ width: 36, height: 84 });
  expect(after.sizes[0].down).toEqual({ width: 36, height: 84 });
  expect(after.colors[0].normal).toEqual(before.colors[0].normal);
  expect(after.colors[0].down).toEqual(before.colors[0].down);
  for (let col = 1; col < 4; col++) {
    expect(after.names[col]).toEqual(before.names[col]);
    expect(after.sizes[col]).toEqual(before.sizes[col]);
    expect(after.colors[col]).toEqual(before.colors[col]);
  }
  expect(errors).toEqual([]);
});

test('KeyImage 单轨保存可一步撤回重做并同步参数卡片', async ({ page }) => {
  const errors = await boot(page);
  await installKeyImageReferences(page, Array.from({ length: 4 }, (_, col) => ({
    normal: `apply-undo-normal-${col}`,
    down: `apply-undo-down-${col}`
  })));
  const before = await readKeyImageState(page);

  await openAndEditKeyImage(page);
  await saveKeyImage(page);
  const saved = await readKeyImageState(page);
  const savedUi = await readKeyImageUiState(page);

  await page.evaluate(() => performSkinUndo());
  const undone = await readKeyImageState(page);
  const undoneUi = await readKeyImageUiState(page);
  expect(undone.names).toEqual(before.names);
  expect(undone.sizes).toEqual(before.sizes);
  expect(undone.colors).toEqual(before.colors);
  expect(undoneUi.normal).toContain(before.names[0].normal);
  expect(undoneUi.down).toContain(before.names[0].down);

  await page.evaluate(() => performSkinRedo());
  const redone = await readKeyImageState(page);
  const redoneUi = await readKeyImageUiState(page);
  expect(redone.names).toEqual(saved.names);
  expect(redone.sizes).toEqual(saved.sizes);
  expect(redone.colors).toEqual(saved.colors);
  expect(redoneUi).toEqual(savedUi);
  expect(redoneUi.normal).toContain(saved.names[0].normal);
  expect(redoneUi.down).toContain(saved.names[0].down);
  expect(errors).toEqual([]);
});

test('KeyImage 与 KeyImageD 使用同一源文件时仍分别生成独立贴图', async ({ page }) => {
  const errors = await boot(page);
  await installKeyImageReferences(page, Array.from({ length: 4 }, () => ({
    normal: 'apply-shared-key',
    down: 'apply-shared-key'
  })));
  const before = await readKeyImageState(page);

  await openAndEditKeyImage(page);
  await saveKeyImage(page);
  const after = await readKeyImageState(page);
  const generatedFiles = after.exportKeys.filter((name) => /apply-shared-key/i.test(name));

  expect(before.names[0].normal).toBe(before.names[0].down);
  expect(after.names[0].normal).not.toBe(after.names[0].down);
  expect(after.sizes[0].normal).toEqual({ width: 36, height: 84 });
  expect(after.sizes[0].down).toEqual({ width: 36, height: 84 });
  expect(after.colors[0].normal).toEqual(before.colors[0].normal);
  expect(after.colors[0].down).toEqual(before.colors[0].down);
  expect(new Set(generatedFiles.map((name) => name.replace(/@2x\.png$/i, '.png'))).size).toBe(2);
  expect(errors).toEqual([]);
});

test('编辑 KeyImageD 时也会同步裁剪拉伸参数到 KeyImage', async ({ page }) => {
  const errors = await boot(page);
  await installKeyImageReferences(page, Array.from({ length: 4 }, (_, col) => ({
    normal: `apply-down-normal-${col}`,
    down: `apply-down-source-${col}`
  })));
  const before = await readKeyImageState(page);

  await openAndEditKeyImage(page, 'KeyImage0D');
  await saveKeyImage(page);
  const after = await readKeyImageState(page);

  expect(after.names[0].normal).not.toBe(before.names[0].normal);
  expect(after.names[0].down).not.toBe(before.names[0].down);
  expect(after.sizes[0].normal).toEqual({ width: 36, height: 84 });
  expect(after.sizes[0].down).toEqual({ width: 36, height: 84 });
  expect(after.colors[0].normal).toEqual(before.colors[0].normal);
  expect(after.colors[0].down).toEqual(before.colors[0].down);
  expect(errors).toEqual([]);
});

test('应用到全部轨道会同步参数但保留每条轨道的原贴图', async ({ page }) => {
  const errors = await boot(page);
  await installKeyImageReferences(page, Array.from({ length: 4 }, (_, col) => ({
    normal: `apply-all-normal-${col}`,
    down: `apply-all-down-${col}`
  })));
  const before = await readKeyImageState(page);

  await openAndEditKeyImage(page);
  await saveKeyImage(page, 'all');
  const after = await readKeyImageState(page);

  for (let col = 0; col < 4; col++) {
    expect(after.names[col].normal).not.toBe(before.names[col].normal);
    expect(after.names[col].down).not.toBe(before.names[col].down);
    expect(after.sizes[col].normal).toEqual({ width: 36, height: 84 });
    expect(after.sizes[col].down).toEqual({ width: 36, height: 84 });
    expect(after.colors[col]).toEqual(before.colors[col]);
  }
  expect(errors).toEqual([]);
});

test('KeyImage 当前轨道与全轨应用保持两次独立撤回粒度', async ({ page }) => {
  const errors = await boot(page);
  await installKeyImageReferences(page, Array.from({ length: 4 }, (_, col) => ({
    normal: `apply-history-normal-${col}`,
    down: `apply-history-down-${col}`
  })));
  const before = await readKeyImageState(page);

  await openAndEditKeyImage(page);
  await saveKeyImage(page);
  const afterCurrent = await readKeyImageState(page);
  await saveKeyImage(page, 'all');
  const afterAll = await readKeyImageState(page);

  await page.evaluate(() => performSkinUndo());
  const undoneAll = await readKeyImageState(page);
  expect(undoneAll.names).toEqual(afterCurrent.names);
  expect(undoneAll.sizes).toEqual(afterCurrent.sizes);
  expect(undoneAll.colors).toEqual(afterCurrent.colors);

  await page.evaluate(() => performSkinUndo());
  const undoneCurrent = await readKeyImageState(page);
  expect(undoneCurrent.names).toEqual(before.names);
  expect(undoneCurrent.sizes).toEqual(before.sizes);
  expect(undoneCurrent.colors).toEqual(before.colors);

  await page.evaluate(() => performSkinRedo());
  await page.evaluate(() => performSkinRedo());
  const redoneAll = await readKeyImageState(page);
  expect(redoneAll.names).toEqual(afterAll.names);
  expect(redoneAll.sizes).toEqual(afterAll.sizes);
  expect(redoneAll.colors).toEqual(afterAll.colors);
  expect(errors).toEqual([]);
});

test('高级保存仅更新当前状态时不会改写 KeyImageD', async ({ page }) => {
  const errors = await boot(page);
  await installKeyImageReferences(page, Array.from({ length: 4 }, (_, col) => ({
    normal: `apply-current-only-normal-${col}`,
    down: `apply-current-only-down-${col}`
  })));
  const before = await readKeyImageState(page);

  await openAndEditKeyImage(page);
  await page.click('#textureImageApplyMenuBtn');
  await expect(page.locator('#textureImageApplyCurrentOnlyBtn')).toHaveText('仅更新当前 KeyImage');
  await expect(page.locator('#textureImageApplyAllOnlyBtn')).toHaveText('全部轨道仅更新 KeyImage');
  await page.click('#textureImageApplyCurrentOnlyBtn');
  await page.waitForFunction(() => textureImageEditorUi.getState().dirtyTabCount === 0);
  const after = await readKeyImageState(page);

  expect(after.names[0].normal).not.toBe(before.names[0].normal);
  expect(after.names[0].down).toBe(before.names[0].down);
  expect(after.sizes[0].normal).toEqual({ width: 36, height: 84 });
  expect(after.sizes[0].down).toEqual(before.sizes[0].down);
  expect(after.colors[0].down).toEqual(before.colors[0].down);
  expect(errors).toEqual([]);
});

test('高级保存可只更新全部轨道的当前状态', async ({ page }) => {
  const errors = await boot(page);
  await installKeyImageReferences(page, Array.from({ length: 4 }, (_, col) => ({
    normal: `apply-all-only-normal-${col}`,
    down: `apply-all-only-down-${col}`
  })));
  const before = await readKeyImageState(page);

  await openAndEditKeyImage(page);
  await saveKeyImage(page, 'all-only');
  const after = await readKeyImageState(page);

  for (let col = 0; col < 4; col++) {
    expect(after.names[col].normal).not.toBe(before.names[col].normal);
    expect(after.sizes[col].normal).toEqual({ width: 36, height: 84 });
    expect(after.names[col].down).toBe(before.names[col].down);
    expect(after.sizes[col].down).toEqual(before.sizes[col].down);
    expect(after.colors[col].down).toEqual(before.colors[col].down);
  }
  expect(errors).toEqual([]);
});

test('全轨同源时按状态分组，KeyImage 与 KeyImageD 仍保持独立', async ({ page }) => {
  const errors = await boot(page);
  await installKeyImageReferences(page, Array.from({ length: 4 }, () => ({
    normal: 'apply-shared-all-key',
    down: 'apply-shared-all-key'
  })));

  await openAndEditKeyImage(page);
  await saveKeyImage(page, 'all');
  const after = await readKeyImageState(page);
  const names = after.names.flatMap((item) => [item.normal, item.down]);

  expect(new Set(after.names.map((item) => item.normal)).size).toBe(1);
  expect(new Set(after.names.map((item) => item.down)).size).toBe(1);
  expect(after.names[0].normal).not.toBe(after.names[0].down);
  expect(new Set(names).size).toBe(2);
  expect(after.sizes.every((item) =>
    item.normal.width === 36 &&
    item.normal.height === 84 &&
    item.down.width === 36 &&
    item.down.height === 84
  )).toBe(true);
  expect(errors).toEqual([]);
});

test('KeyImage 编辑后调整画布高度，再应用到全轨仍保留编辑参数', async ({ page }) => {
  const errors = await boot(page);
  await installKeyImageReferences(page, Array.from({ length: 4 }, (_, col) => ({
    normal: `apply-height-normal-${col}`,
    down: `apply-height-down-${col}`
  })));

  await openAndEditKeyImage(page);
  const beforeHeightDrag = await page.evaluate(() => textureImageEditorUi.getState().previewSize);
  await page.evaluate(() => {
    const dialog = document.getElementById('textureImageEditorDialog');
    dialog.style.left = '920px';
    dialog.style.right = 'auto';
  });
  await dragSelectedKeyTop(page, 0, beforeHeightDrag.height + 30);
  await page.evaluate(() => {
    const dialog = document.getElementById('textureImageEditorDialog');
    dialog.style.left = '';
    dialog.style.right = '24px';
    dialog.style.top = '48px';
  });

  await saveKeyImage(page, 'all');
  const after = await readKeyImageState(page);

  expect(after.sizes.every((item) =>
    item.normal.width === 36 &&
    item.normal.height === 84 &&
    item.down.width === 36 &&
    item.down.height === 84
  )).toBe(true);
  expect(errors).toEqual([]);
});

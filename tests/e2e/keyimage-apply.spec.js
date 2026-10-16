const path = require('path');
const { test, expect } = require('@playwright/test');

const ROOT = path.resolve(__dirname, '../..');
const SKIN = path.join(ROOT, 'samples', 'skins', 'Kumakalerki.osk');

async function boot(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof textureImageEditorUi !== 'undefined');
  await page.setInputFiles('#oskInput', SKIN);
  await page.waitForFunction(() => isSkinLoading === false, null, { timeout: 60000 });
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
  await page.fill('#textureImageCropHeight', '10');
  await page.fill('#textureImageScalePercent', '120');
  await page.waitForFunction(() => {
    const preview = textureImageEditorUi.getState().previewSize;
    return preview && preview.width === 36 && preview.height === 84;
  });
}

async function saveWithScope(page, scope) {
  await page.click('#textureImageApplyBtn');
  await expect(page.locator('#textureImageApplyScopeModal')).toBeVisible();
  if (scope === 'all') {
    await page.click('#textureImageApplyScopeAllBtn');
  } else {
    await page.click('#textureImageApplyScopeCurrentBtn');
  }
  await expect(page.locator('#textureImageApplyScopeModal')).toBeHidden();
  await expect(page.locator('#textureImageApplyBtn')).toHaveText('保存到皮肤');
  await page.waitForFunction(() => textureImageEditorUi.getState().dirtyTabCount === 0);
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

function readKeyImageState(page) {
  return page.evaluate(() => {
    const keys = getActiveKeyCount();
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
      exportKeys: Array.from(userReplacedTextures.keys()),
      editor: textureImageEditorUi.getState()
    };
  });
}

test('KeyImage 仅当前轨道时同步 KeyImageD，并保留编辑参数', async ({ page }) => {
  const errors = await boot(page);
  await installKeyImageReferences(page, Array.from({ length: 4 }, (_, col) => ({
    normal: `apply-current-normal-${col}`,
    down: `apply-current-down-${col}`
  })));
  const before = await readKeyImageState(page);

  await openAndEditKeyImage(page);
  await saveWithScope(page, 'current');
  const after = await readKeyImageState(page);

  expect(after.names[0].normal).not.toBe(before.names[0].normal);
  expect(after.names[0].down).not.toBe(before.names[0].down);
  expect(after.sizes[0].normal).toEqual({ width: 36, height: 84 });
  expect(after.sizes[0].down).toEqual({ width: 36, height: 84 });
  for (let col = 1; col < 4; col++) {
    expect(after.names[col]).toEqual(before.names[col]);
    expect(after.sizes[col]).toEqual(before.sizes[col]);
  }
  expect(after.editor.inputValues.height).toBe(10);
  expect(after.editor.imageTransform.scalePercent).toBe(120);

  await saveWithScope(page, 'all');
  const appliedLaterToAll = await readKeyImageState(page);
  expect(appliedLaterToAll.sizes.every((item) =>
    item.normal.width === 36 &&
    item.normal.height === 84 &&
    item.down.width === 36 &&
    item.down.height === 84
  )).toBe(true);
  for (let col = 1; col < 4; col++) {
    expect(appliedLaterToAll.names[col]).not.toEqual(after.names[col]);
  }
  expect(appliedLaterToAll.editor.inputValues.height).toBe(10);
  expect(appliedLaterToAll.editor.imageTransform.scalePercent).toBe(120);
  expect(errors).toEqual([]);
});

test('KeyImage 全轨引用同一文件时只生成一份新贴图', async ({ page }) => {
  const errors = await boot(page);
  await installKeyImageReferences(page, Array.from({ length: 4 }, () => ({
    normal: 'apply-shared-key',
    down: 'apply-shared-key'
  })));

  await openAndEditKeyImage(page);
  await saveWithScope(page, 'all');
  const after = await readKeyImageState(page);
  const names = after.names.flatMap((item) => [item.normal, item.down]);
  const generatedFiles = after.exportKeys.filter((name) => /apply-shared-key_col1/i.test(name));

  expect(new Set(names).size).toBe(1);
  expect(after.sizes.every((item) =>
    item.normal.width === 36 &&
    item.normal.height === 84 &&
    item.down.width === 36 &&
    item.down.height === 84
  )).toBe(true);
  expect(new Set(generatedFiles.map((name) => name.replace(/@2x\.png$/i, '.png'))).size).toBe(1);
  expect(errors).toEqual([]);
});

test('编辑 KeyImageD 时也会同步 KeyImage', async ({ page }) => {
  const errors = await boot(page);
  await installKeyImageReferences(page, Array.from({ length: 4 }, (_, col) => ({
    normal: `apply-down-normal-${col}`,
    down: `apply-down-source-${col}`
  })));
  const before = await readKeyImageState(page);

  await openAndEditKeyImage(page, 'KeyImage0D');
  await saveWithScope(page, 'current');
  const after = await readKeyImageState(page);

  expect(after.names[0].normal).not.toBe(before.names[0].normal);
  expect(after.names[0].down).not.toBe(before.names[0].down);
  expect(after.sizes[0].normal).toEqual({ width: 36, height: 84 });
  expect(after.sizes[0].down).toEqual({ width: 36, height: 84 });
  expect(after.editor.inputValues.height).toBe(10);
  expect(errors).toEqual([]);
});

test('KeyImage 全轨引用不同文件时按引用分组生成', async ({ page }) => {
  const errors = await boot(page);
  await installKeyImageReferences(page, [
    { normal: 'apply-group-a', down: 'apply-group-a' },
    { normal: 'apply-group-a', down: 'apply-group-a' },
    { normal: 'apply-group-b', down: 'apply-group-b' },
    { normal: 'apply-group-b', down: 'apply-group-b' }
  ]);
  await openAndEditKeyImage(page);
  await saveWithScope(page, 'all');
  const after = await readKeyImageState(page);
  const names = after.names.flatMap((item) => [item.normal, item.down]);
  const generatedFiles = after.exportKeys.filter((name) => /apply-group-[ab]/i.test(name));

  expect(names[0]).toBe(names[1]);
  expect(names[2]).toBe(names[3]);
  expect(names[4]).toBe(names[5]);
  expect(names[6]).toBe(names[7]);
  expect(names[0]).not.toBe(names[4]);
  expect(new Set(names).size).toBe(2);
  expect(new Set(generatedFiles.map((name) => name.replace(/@d?2x\.png$/i, '.png'))).size).toBe(2);
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

  await page.evaluate(() => document.getElementById('textureImageApplyBtn').click());
  await expect(page.locator('#textureImageApplyScopeModal')).toBeVisible();
  await page.click('#textureImageApplyScopeAllBtn');
  await expect(page.locator('#textureImageApplyScopeModal')).toBeHidden();
  await expect(page.locator('#textureImageApplyBtn')).toHaveText('保存到皮肤');
  await page.waitForFunction(() => userReplacedTextures.size > 0);
  const after = await readKeyImageState(page);

  expect(after.sizes.every((item) =>
    item.normal.width === 36 &&
    item.normal.height === 84 &&
    item.down.width === 36 &&
    item.down.height === 84
  )).toBe(true);
  expect(errors).toEqual([]);
});

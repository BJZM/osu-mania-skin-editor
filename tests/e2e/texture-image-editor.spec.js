const path = require('path');
const { test, expect } = require('@playwright/test');

const ROOT = path.resolve(__dirname, '../..');
const SKIN = path.join(ROOT, 'samples', 'skins', 'Kumakalerki.osk');
const OPAQUE_TAIL_SKIN = path.join(ROOT, 'samples', 'skins', 'Gyoo.osk');

const BEATMAP = path.join(ROOT, 'samples', 'beatmaps', '1790742 MIMI - Kuu ni Naru.osz');

async function boot(page, skinPath = SKIN) {
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
  await page.setInputFiles('#oszInput', BEATMAP);
  await page.waitForFunction(
    () => isStartupBeatmapReady() && beatmaps.length > 0,
    null,
    { timeout: 60000 }
  );
  await page.setInputFiles('#oskInput', skinPath);
  await page.waitForFunction(() => isSkinLoading === false && isStartupWorkspaceReady(), null, { timeout: 60000 });
  await page.waitForTimeout(250);
  return errors;
}

async function selectPickerParam(page, paramKey) {
  await page.click('#openTextureImageEditorBtn');
  await page.waitForFunction(() => {
    const modal = document.getElementById('textureImageEditorModal');
    return modal && modal.classList.contains('active');
  });
  const pickerCount = await page.locator('#textureImagePickerGrid .texture-image-picker-item').count();
  expect(pickerCount).toBeGreaterThan(20);
  await page.click(`#textureImagePickerGrid [data-param-key="${paramKey}"]`);
  await page.waitForFunction((key) => textureImageEditorUi.getState().selectedKey === key, paramKey);
}

async function selectKeyImage(page) {
  await selectPickerParam(page, 'KeyImage0');
}

async function selectLongBodyImage(page) {
  await selectPickerParam(page, 'NoteImage0L');
}

async function installLongBodyHeight(page, height) {
  await page.evaluate((bodyHeight) => {
    const keys = getActiveKeyCount();
    const cfg = getManiaConfigForKeys(keys);
    if (!cfg.ImageLookups) cfg.ImageLookups = new Map();
    const currentBody = getManiaSkinImage(keys, LML.HoldNoteBodyImage, 0);
    const body = document.createElement('canvas');
    body.width = Math.max(4, currentBody ? currentBody.width : 4);
    body.height = bodyHeight;
    const ctx = body.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, body.width, body.height);
    const bodyName = `longbody_height_${bodyHeight}`;
    saveSkinAssetToStore(skinImageStore, bodyName, body, false, true, true);
    cfg.ImageLookups.set('NoteImage0L', bodyName);
  }, height);
}

async function saveTextureEditor(page) {
  await page.click('#textureImageApplyBtn');
  const scopeModal = page.locator('#textureImageApplyScopeModal');
  if (await scopeModal.isVisible()) {
    await page.click('#textureImageApplyScopeAllBtn');
    await expect(scopeModal).toBeHidden();
  }
}

async function acceptSharedTextureDecision(page) {
  const scopeModal = page.locator('#textureImageApplyScopeModal');
  if (await scopeModal.isVisible()) {
    await page.click('#textureImageApplyScopeAllBtn');
    await expect(scopeModal).toBeHidden();
  }
}

async function setEdits(page, sourceWidth, sourceHeight) {
  await page.fill('#textureImageCropLeft', '-1');
  await page.fill('#textureImageCropTop', '-1');
  await page.fill('#textureImageCropRight', '4');
  await page.fill('#textureImageCropBottom', '3');
  const outputWidth = sourceWidth + 3;
  const outputHeight = sourceHeight + 2;
  const expected = {
    width: outputWidth,
    height: outputHeight
  };
  await page.waitForFunction((size) => {
    const preview = textureImageEditorUi.getState().previewSize;
    return preview && preview.width === size.width && preview.height === size.height;
  }, expected);
  return expected;
}

function getKeyImageSize(page) {
  return page.evaluate(() => {
    const img = getManiaSkinImage(getActiveKeyCount(), LML.KeyImage, 0);
    return img ? { width: img.width, height: img.height } : null;
  });
}

function getKeyImageAlphaBounds(page) {
  return page.evaluate(() => {
    const img = getManiaSkinImage(getActiveKeyCount(), LML.KeyImage, 0);
    if (!img) return null;
    const probe = document.createElement('canvas');
    probe.width = img.width;
    probe.height = img.height;
    const ctx = probe.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, probe.width, probe.height).data;
    let top = Infinity;
    let bottom = -1;
    for (let y = 0; y < probe.height; y++) {
      for (let x = 0; x < probe.width; x++) {
        if (data[(y * probe.width + x) * 4 + 3] === 0) continue;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
    return bottom >= 0 ? { top, bottom } : null;
  });
}

function getKeyImageAlphaCount(page) {
  return page.evaluate(() => {
    const img = getManiaSkinImage(getActiveKeyCount(), LML.KeyImage, 0);
    if (!img) return 0;
    const probe = document.createElement('canvas');
    probe.width = img.width;
    probe.height = img.height;
    const ctx = probe.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, probe.width, probe.height).data;
    let count = 0;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 0) count++;
    }
    return count;
  });
}

async function getCropHandlePoint(page, handle) {
  const data = await page.evaluate((handleName) => {
    const canvas = document.getElementById('textureImagePreviewCanvas');
    const state = textureImageEditorUi.getState();
    const rect = state.transformRect;
    const viewport = state.previewViewport;
    if (!canvas || !rect || !viewport) return null;
    const left = viewport.offsetX + rect.x * viewport.scale;
    const top = viewport.offsetY + rect.y * viewport.scale;
    const right = left + rect.width * viewport.scale;
    const bottom = top + rect.height * viewport.scale;
    const points = {
      nw: [left, top],
      n: [(left + right) / 2, top],
      ne: [right, top],
      e: [right, (top + bottom) / 2],
      se: [right, bottom],
      s: [(left + right) / 2, bottom],
      sw: [left, bottom],
      w: [left, (top + bottom) / 2]
    };
    return {
      point: points[handleName],
      canvasWidth: canvas.width,
      canvasHeight: canvas.height
    };
  }, handle);
  if (!data || !data.point) return null;
  const box = await page.locator('#textureImagePreviewCanvas').boundingBox();
  return {
    x: box.x + data.point[0] * box.width / data.canvasWidth,
    y: box.y + data.point[1] * box.height / data.canvasHeight
  };
}

async function getTransformHandlePoint(page, handle) {
  const data = await page.evaluate((handleName) => {
    const canvas = document.getElementById('textureImagePreviewCanvas');
    const state = textureImageEditorUi.getState();
    const rect = state.transformRect;
    const viewport = state.previewViewport;
    if (!canvas || !rect || !viewport) return null;
    const left = viewport.offsetX + rect.x * viewport.scale;
    const top = viewport.offsetY + rect.y * viewport.scale;
    const right = left + rect.width * viewport.scale;
    const bottom = top + rect.height * viewport.scale;
    const points = {
      nw: [left, top],
      n: [(left + right) / 2, top],
      ne: [right, top],
      e: [right, (top + bottom) / 2],
      se: [right, bottom],
      s: [(left + right) / 2, bottom],
      sw: [left, bottom],
      w: [left, (top + bottom) / 2]
    };
    return {
      point: points[handleName],
      canvasWidth: canvas.width,
      canvasHeight: canvas.height
    };
  }, handle);
  if (!data || !data.point) return null;
  const box = await page.locator('#textureImagePreviewCanvas').boundingBox();
  return {
    x: box.x + data.point[0] * box.width / data.canvasWidth,
    y: box.y + data.point[1] * box.height / data.canvasHeight
  };
}

async function getPreviewPoint(page, worldX, worldY) {
  const data = await page.evaluate(({ x, y }) => {
    const canvas = document.getElementById('textureImagePreviewCanvas');
    const viewport = textureImageEditorUi.getState().previewViewport;
    if (!canvas || !viewport) return null;
    return {
      x: viewport.offsetX + x * viewport.scale,
      y: viewport.offsetY + y * viewport.scale,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height
    };
  }, { x: worldX, y: worldY });
  if (!data) return null;
  const box = await page.locator('#textureImagePreviewCanvas').boundingBox();
  return {
    x: box.x + data.x * box.width / data.canvasWidth,
    y: box.y + data.y * box.height / data.canvasHeight
  };
}

test('贴图编辑在数值变化时实时更新画布，取消后恢复', async ({ page }) => {
  const errors = await boot(page);
  await selectKeyImage(page);

  const source = await page.evaluate(() => textureImageEditorUi.getState().sourceSize);
  expect(source.width).toBeGreaterThan(4);
  expect(source.height).toBeGreaterThan(4);
  const expected = await setEdits(page, source.width, source.height);

  const state = await page.evaluate(() => textureImageEditorUi.getState());
  expect(state.previewSize).toEqual(expected);
  expect(await getKeyImageSize(page)).toEqual(expected);

  await page.click('#textureImageEditorCloseBtn');
  await page.click('#textureImageUnsavedDiscardBtn');
  await page.waitForFunction(() => document.getElementById('textureImageEditorModal').style.display === 'none');
  expect(await getKeyImageSize(page)).toEqual(source);
  expect(errors).toEqual([]);
});

test('右侧参数以原图边界和尺寸为 0，并按扩边正数、内收负数计算', async ({ page }) => {
  const errors = await boot(page);
  await selectKeyImage(page);

  const source = await page.evaluate(() => textureImageEditorUi.getState().sourceSize);
  await page.fill('#textureImageCropLeft', '7');
  await page.fill('#textureImageCropTop', '5');
  await page.fill('#textureImageCropRight', '4');
  await page.fill('#textureImageCropBottom', '-14');
  await page.waitForFunction((size) => {
    const preview = textureImageEditorUi.getState().previewSize;
    return preview && preview.width === size.width && preview.height === size.height;
  }, { width: source.width + 11, height: source.height - 9 });

  const state = await page.evaluate(() => textureImageEditorUi.getState());
  expect(state.cropRect).toEqual({
    x: -7,
    y: -5,
    width: source.width + 11,
    height: source.height - 9
  });
  expect(state.inputValues.left).toBe(7);
  expect(state.inputValues.top).toBe(5);
  expect(state.inputValues.right).toBe(4);
  expect(state.inputValues.bottom).toBe(-14);
  expect(errors).toEqual([]);
});

test('拖动裁剪框时会吸附到非透明内容的最外缘', async ({ page }) => {
  const errors = await boot(page);
  await selectKeyImage(page);

  const state = await page.evaluate(() => textureImageEditorUi.getState());
  expect(state.contentBounds.left).toBeGreaterThan(state.cropRect.x);
  const westHandle = await getCropHandlePoint(page, 'w');
  const nearContentEdge = await getPreviewPoint(page, state.contentBounds.left + 4, state.cropRect.height / 2);
  await page.mouse.move(westHandle.x, westHandle.y);
  await page.mouse.down();
  await page.mouse.move(nearContentEdge.x, nearContentEdge.y, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(150);

  const snapped = await page.evaluate(() => textureImageEditorUi.getState());
  expect(snapped.cropRect.x).toBe(state.contentBounds.left);
  expect(Number(await page.inputValue('#textureImageCropLeft'))).toBe(-state.contentBounds.left);
  expect(errors).toEqual([]);
});

test('裁剪与扩边时预览中的原图位置保持一致', async ({ page }) => {
  const errors = await boot(page);
  await selectKeyImage(page);

  const before = await page.evaluate(() => textureImageEditorUi.getState());
  const outputWidth = before.sourceSize.width + 24;
  const outputHeight = before.sourceSize.height + 18;
  await page.fill('#textureImageCropLeft', '12');
  await page.fill('#textureImageCropTop', '9');
  await page.fill('#textureImageCropRight', '12');
  await page.fill('#textureImageCropBottom', '9');
  await page.waitForFunction((size) => {
    const preview = textureImageEditorUi.getState().previewSize;
    return preview && preview.width === size.width && preview.height === size.height;
  }, { width: outputWidth, height: outputHeight });

  const after = await page.evaluate(() => textureImageEditorUi.getState());
  expect(after.previewViewport.scale).toBeCloseTo(before.previewViewport.scale, 5);
  expect(after.previewViewport.offsetX).toBeCloseTo(before.previewViewport.offsetX, 5);
  expect(after.previewViewport.offsetY).toBeCloseTo(before.previewViewport.offsetY, 5);
  expect(errors).toEqual([]);
});

test('预览中贴图范围为透明棋盘格，范围外为纯黑', async ({ page }) => {
  const errors = await boot(page);
  await selectKeyImage(page);

  await page.fill('#textureImageCropRight', '-60');
  await page.fill('#textureImageCropBottom', '-244');
  await page.waitForFunction(() => {
    const preview = textureImageEditorUi.getState().previewSize;
    return preview && preview.width === 40 && preview.height === 40;
  });

  const pixels = await page.evaluate(() => {
    const canvas = document.getElementById('textureImagePreviewCanvas');
    const viewport = textureImageEditorUi.getState().previewViewport;
    const ctx = canvas.getContext('2d');
    const sample = (worldX, worldY) => {
      const x = Math.round(viewport.offsetX + worldX * viewport.scale);
      const y = Math.round(viewport.offsetY + worldY * viewport.scale);
      return Array.from(ctx.getImageData(x, y, 1, 1).data);
    };
    return {
      inside: sample(10, 10),
      outside: sample(80, 80)
    };
  });

  expect(['#1c1a20', '#0e0d13']).toContain(
    `#${pixels.inside.slice(0, 3).map((value) => value.toString(16).padStart(2, '0')).join('')}`
  );
  expect(pixels.inside[3]).toBe(255);
  expect(pixels.outside).toEqual([0, 0, 0, 255]);
  expect(errors).toEqual([]);
});

test('拖动裁剪手柄可裁剪和扩大，画布内部拖动不再移动裁剪框', async ({ page }) => {
  const errors = await boot(page);
  await selectKeyImage(page);

  const before = await page.evaluate(() => textureImageEditorUi.getState());
  const se = await getCropHandlePoint(page, 'se');
  await page.mouse.move(se.x, se.y);
  await page.mouse.down();
  await page.mouse.move(se.x + 28, se.y + 20, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(200);

  const expanded = await page.evaluate(() => textureImageEditorUi.getState());
  expect(expanded.cropRect.width).toBeGreaterThan(before.cropRect.width);
  expect(expanded.cropRect.height).toBeGreaterThan(before.cropRect.height);
  expect(Number(await page.inputValue('#textureImageCropRight'))).toBe(expanded.cropRect.width - before.cropRect.width);
  expect(Number(await page.inputValue('#textureImageCropBottom'))).toBe(expanded.cropRect.height - before.cropRect.height);

  const center = await getPreviewPoint(
    page,
    expanded.cropRect.x + expanded.cropRect.width / 2,
    expanded.cropRect.y + expanded.cropRect.height / 2
  );
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.mouse.move(center.x - 18, center.y - 14, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(200);

  const unchanged = await page.evaluate(() => textureImageEditorUi.getState());
  expect(unchanged.cropRect).toEqual(expanded.cropRect);
  expect(Number(await page.inputValue('#textureImageCropLeft'))).toBe(-expanded.cropRect.x || 0);
  expect(Number(await page.inputValue('#textureImageCropTop'))).toBe(-expanded.cropRect.y || 0);
  expect(errors).toEqual([]);
});

test('向上拖动 KeyImage 顶部裁剪柄会在顶部扩边并立即预览', async ({ page }) => {
  const errors = await boot(page);
  await selectKeyImage(page);

  const before = await page.evaluate(() => ({
    state: textureImageEditorUi.getState(),
    exportedCount: userReplacedTextures.size
  }));
  const beforeBounds = await getKeyImageAlphaBounds(page);
  expect(beforeBounds).not.toBeNull();

  const top = await getCropHandlePoint(page, 'n');
  await page.mouse.move(top.x, top.y);
  await page.mouse.down();
  await page.mouse.move(top.x, top.y - 24, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(220);

  const after = await page.evaluate(() => ({
    state: textureImageEditorUi.getState(),
    exportedCount: userReplacedTextures.size,
    imageSize: (() => {
      const img = getManiaSkinImage(getActiveKeyCount(), LML.KeyImage, 0);
      return img ? { width: img.width, height: img.height } : null;
    })()
  }));
  const afterBounds = await getKeyImageAlphaBounds(page);
  const addedHeight = after.state.previewSize.height - before.state.previewSize.height;

  expect(addedHeight).toBeGreaterThan(0);
  expect(after.imageSize).toEqual(after.state.previewSize);
  expect(after.exportedCount).toBe(before.exportedCount);
  expect(afterBounds.top).toBe(beforeBounds.top + addedHeight);
  expect(afterBounds.bottom).toBe(beforeBounds.bottom + addedHeight);
  expect(errors).toEqual([]);
});

test('普通裁剪不会改变原图像素比例，反向拖动后恢复原尺寸', async ({ page }) => {
  const errors = await boot(page);
  await selectKeyImage(page);

  const before = await page.evaluate(() => textureImageEditorUi.getState());
  const beforeBounds = await getKeyImageAlphaBounds(page);
  const right = await getCropHandlePoint(page, 'e');
  await page.mouse.move(right.x, right.y);
  await page.mouse.down();
  await page.mouse.move(right.x + 36, right.y, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(220);

  const expanded = await page.evaluate(() => textureImageEditorUi.getState());
  const expandedBounds = await getKeyImageAlphaBounds(page);
  expect(expanded.imageTransform.scalePercent).toBe(100);
  expect(expanded.imageTransform.stretchX).toBe(0);
  expect(expanded.previewSize.width).toBeGreaterThan(before.previewSize.width);
  expect(expandedBounds).toEqual(beforeBounds);

  const expandedRight = await getCropHandlePoint(page, 'e');
  await page.mouse.move(expandedRight.x, expandedRight.y);
  await page.mouse.down();
  await page.mouse.move(expandedRight.x - 36, expandedRight.y, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(220);

  const restored = await page.evaluate(() => textureImageEditorUi.getState());
  expect(restored.previewSize).toEqual(before.previewSize);
  expect(await getKeyImageAlphaBounds(page)).toEqual(beforeBounds);
  expect(errors).toEqual([]);
});

test('纵向裁切保持原图逐行像素映射，不产生额外重采样', async ({ page }) => {
  const errors = await boot(page);
  await selectKeyImage(page);

  const source = await page.evaluate(() => {
    const img = getManiaSkinImage(getActiveKeyCount(), LML.KeyImage, 0);
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    canvas.getContext('2d').drawImage(img, 0, 0);
    window.__verticalCropSource = canvas;
    return { width: img.width, height: img.height };
  });

  await page.fill('#textureImageCropTop', '-20');
  await page.waitForFunction(
    (height) => textureImageEditorUi.getState().previewSize.height === height,
    source.height - 20
  );
  await page.waitForTimeout(150);

  const diff = await page.evaluate(() => {
    const source = window.__verticalCropSource;
    const target = getManiaSkinImage(getActiveKeyCount(), LML.KeyImage, 0);
    const canvas = document.createElement('canvas');
    canvas.width = target.width;
    canvas.height = target.height;
    canvas.getContext('2d').drawImage(target, 0, 0);
    const sourceData = source.getContext('2d').getImageData(0, 0, source.width, source.height).data;
    const targetData = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let different = 0;
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const sourceIndex = ((y + 20) * source.width + x) * 4;
        const targetIndex = (y * canvas.width + x) * 4;
        for (let channel = 0; channel < 4; channel++) {
          if (sourceData[sourceIndex + channel] !== targetData[targetIndex + channel]) {
            different++;
          }
        }
      }
    }
    return different;
  });

  expect(diff).toBe(0);
  expect(errors).toEqual([]);
});

test('右侧数值可控制等比缩放、横向与纵向拉伸压缩', async ({ page }) => {
  const errors = await boot(page);
  await selectKeyImage(page);

  const before = await page.evaluate(() => textureImageEditorUi.getState());
  const scaledWidth = Math.round(before.cropRect.width * 1.5);
  const scaledHeight = Math.round(before.cropRect.height * 1.5);
  await page.fill('#textureImageScalePercent', '150');
  await page.waitForFunction((size) => {
    const preview = textureImageEditorUi.getState().previewSize;
    return preview && preview.width === size.width && preview.height === size.height;
  }, { width: scaledWidth, height: scaledHeight });

  const expectedWidth = Math.round(before.cropRect.width * 1.5 + 20);
  await page.fill('#textureImageStretchX', '20');
  await page.waitForFunction((width) => {
    const preview = textureImageEditorUi.getState().previewSize;
    return preview && preview.width === width;
  }, expectedWidth);

  const expectedHeight = Math.round(before.cropRect.height * 1.5 - 5);
  await page.fill('#textureImageStretchY', '-5');
  await page.waitForFunction((height) => {
    const preview = textureImageEditorUi.getState().previewSize;
    return preview && preview.height === height;
  }, expectedHeight);

  const transformed = await page.evaluate(() => textureImageEditorUi.getState());
  expect(transformed.imageTransform.scalePercent).toBe(150);
  expect(transformed.imageTransform.stretchX).toBe(20);
  expect(transformed.imageTransform.stretchY).toBe(-5);
  expect(transformed.transformInputValues).toEqual({
    scalePercent: 150,
    stretchX: 20,
    stretchY: -5
  });
  expect(transformed.previewSize).toEqual({
    width: expectedWidth,
    height: expectedHeight
  });
  expect(await getKeyImageSize(page)).toEqual({
    width: expectedWidth,
    height: expectedHeight
  });
  expect(await page.evaluate(() => userReplacedTextures.size)).toBe(0);

  await saveTextureEditor(page, 'current');
  await page.waitForFunction(() => textureImageEditorUi.getState().dirtyTabCount === 0);
  expect(await getKeyImageSize(page)).toEqual({
    width: expectedWidth,
    height: expectedHeight
  });
  expect(errors).toEqual([]);
});

test('先拉伸再调整缩放不会造成非等比例变形', async ({ page }) => {
  const errors = await boot(page);
  await selectKeyImage(page);

  await page.fill('#textureImageStretchX', '20');
  await page.waitForFunction(() => {
    const state = textureImageEditorUi.getState();
    return state.previewSize &&
      state.previewSize.width === Math.round(state.cropRect.width + 20) &&
      state.previewSize.height === state.cropRect.height;
  });
  const stretched = await page.evaluate(() => textureImageEditorUi.getState());

  await page.fill('#textureImageScalePercent', '150');
  await page.waitForFunction(({ width, height }) => {
    const preview = textureImageEditorUi.getState().previewSize;
    return preview && preview.width === width && preview.height === height;
  }, {
    width: Math.round(stretched.previewSize.width * 1.5),
    height: Math.round(stretched.previewSize.height * 1.5)
  });

  const scaled = await page.evaluate(() => textureImageEditorUi.getState());
  expect(scaled.imageTransform.scaleAfterStretch).toBe(true);
  expect(scaled.previewSize.width / stretched.previewSize.width)
    .toBeCloseTo(1.5, 2);
  expect(scaled.previewSize.height / stretched.previewSize.height)
    .toBeCloseTo(1.5, 2);
  expect(errors).toEqual([]);
});

test('裁剪偏移后等比缩放以编辑后图像中心为锚点', async ({ page }) => {
  const errors = await boot(page);
  await selectKeyImage(page);

  await page.fill('#textureImageCropLeft', '15');
  await page.fill('#textureImageCropTop', '20');
  await page.waitForFunction(() => {
    const crop = textureImageEditorUi.getState().cropRect;
    return crop && crop.x === -15 && crop.y === -20;
  });
  const before = await page.evaluate(() => textureImageEditorUi.getState());
  const expectedWidth = Math.round(before.cropRect.width * 1.5);
  const expectedHeight = Math.round(before.cropRect.height * 1.5);

  await page.fill('#textureImageScalePercent', '150');
  await page.waitForFunction(({ width, height }) => {
    const preview = textureImageEditorUi.getState().previewSize;
    return preview && preview.width === width && preview.height === height;
  }, { width: expectedWidth, height: expectedHeight });

  const after = await page.evaluate(() => textureImageEditorUi.getState());
  const cropCenterX = after.cropRect.x + after.cropRect.width / 2;
  const cropCenterY = after.cropRect.y + after.cropRect.height / 2;
  expect(Math.abs(
    after.transformRect.x + after.transformRect.width / 2 - cropCenterX
  )).toBeLessThanOrEqual(1);
  expect(Math.abs(
    after.transformRect.y + after.transformRect.height / 2 - cropCenterY
  )).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});

test('先拉伸再裁剪不会再次改变已设置的拉伸倍率', async ({ page }) => {
  const errors = await boot(page);
  await selectKeyImage(page);

  await page.fill('#textureImageScalePercent', '150');
  await page.fill('#textureImageStretchX', '20');
  await page.fill('#textureImageStretchY', '-5');
  await page.waitForFunction(() => {
    const state = textureImageEditorUi.getState();
    const transform = state.imageTransform;
    if (transform.scalePercent !== 150 ||
      transform.stretchX !== 20 ||
      transform.stretchY !== -5) {
      return false;
    }
    const referenceWidth = transform.referenceWidth || state.cropRect.width;
    const referenceHeight = transform.referenceHeight || state.cropRect.height;
    const expectedWidth = Math.round(
      state.cropRect.width * (transform.scalePercent / 100 + transform.stretchX / referenceWidth)
    );
    const expectedHeight = Math.round(
      state.cropRect.height * (transform.scalePercent / 100 + transform.stretchY / referenceHeight)
    );
    return state.previewSize &&
      state.previewSize.width === expectedWidth &&
      state.previewSize.height === expectedHeight;
  });

  const stretched = await page.evaluate(() => textureImageEditorUi.getState());
  const nextWidth = stretched.cropRect.width - 24;
  const nextHeight = stretched.cropRect.height - 16;
  const expectedWidth = Math.round(stretched.previewSize.width * nextWidth / stretched.cropRect.width);
  const expectedHeight = Math.round(stretched.previewSize.height * nextHeight / stretched.cropRect.height);

  await page.fill('#textureImageCropRight', String(-24));
  await page.fill('#textureImageCropBottom', String(-16));
  await page.waitForFunction(({ width, height }) => {
    const preview = textureImageEditorUi.getState().previewSize;
    return preview && preview.width === width && preview.height === height;
  }, { width: expectedWidth, height: expectedHeight });

  const cropped = await page.evaluate(() => textureImageEditorUi.getState());
  expect(cropped.cropRect.width).toBe(nextWidth);
  expect(cropped.cropRect.height).toBe(nextHeight);
  expect(cropped.previewSize).toEqual({
    width: expectedWidth,
    height: expectedHeight
  });
  expect(cropped.previewSize.width / cropped.cropRect.width)
    .toBeCloseTo(stretched.previewSize.width / stretched.cropRect.width, 2);
  expect(cropped.previewSize.height / cropped.cropRect.height)
    .toBeCloseTo(stretched.previewSize.height / stretched.cropRect.height, 2);
  expect(errors).toEqual([]);
});

test('先拉伸再拖动裁剪柄不会再次改变已设置的拉伸倍率', async ({ page }) => {
  const errors = await boot(page);
  await selectKeyImage(page);

  await page.fill('#textureImageScalePercent', '150');
  await page.fill('#textureImageStretchX', '20');
  await page.waitForFunction(() => {
    const state = textureImageEditorUi.getState();
    return state.imageTransform.scalePercent === 150 &&
      state.imageTransform.stretchX === 20 &&
      state.previewSize &&
      state.previewSize.width === Math.round(state.cropRect.width * 1.7);
  });

  const before = await page.evaluate(() => textureImageEditorUi.getState());
  const east = await getCropHandlePoint(page, 'e');
  await page.mouse.move(east.x, east.y);
  await page.mouse.down();
  await page.mouse.move(east.x - 28, east.y, { steps: 6 });
  await page.mouse.up();
  await page.waitForFunction(
    (width) => textureImageEditorUi.getState().cropRect.width < width,
    before.cropRect.width
  );

  const after = await page.evaluate(() => textureImageEditorUi.getState());
  expect(after.previewSize.width / after.cropRect.width)
    .toBeCloseTo(before.previewSize.width / before.cropRect.width, 2);
  expect(after.previewSize.height / after.cropRect.height)
    .toBeCloseTo(before.previewSize.height / before.cropRect.height, 2);
  expect(errors).toEqual([]);
});

test('Shift 拖边框拉伸图片，拖四角等比例缩放图片', async ({ page }) => {
  const errors = await boot(page);
  await selectKeyImage(page);

  const beforeCorner = await page.evaluate(() => textureImageEditorUi.getState());
  const corner = await getTransformHandlePoint(page, 'se');
  await page.keyboard.down('Shift');
  await page.mouse.move(corner.x, corner.y);
  await page.mouse.down();
  await page.mouse.move(corner.x + 30, corner.y + 30, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await page.waitForFunction(() => textureImageEditorUi.getState().imageTransform.scalePercent > 100);

  const scaled = await page.evaluate(() => textureImageEditorUi.getState());
  expect(scaled.imageTransform.stretchX).toBe(0);
  expect(scaled.imageTransform.stretchY).toBe(0);
  expect(scaled.previewSize.width).toBeGreaterThan(beforeCorner.previewSize.width);
  expect(scaled.previewSize.height).toBeGreaterThan(beforeCorner.previewSize.height);
  expect(Math.abs(
    scaled.previewSize.width / scaled.previewSize.height -
    beforeCorner.previewSize.width / beforeCorner.previewSize.height
  )).toBeLessThan(0.02);

  await page.fill('#textureImageScalePercent', '100');
  await page.waitForFunction((size) => {
    const state = textureImageEditorUi.getState();
    return state.imageTransform.scalePercent === 100 &&
      state.previewSize &&
      state.previewSize.width === size.width &&
      state.previewSize.height === size.height;
  }, beforeCorner.previewSize);
  const beforeEdge = await page.evaluate(() => textureImageEditorUi.getState());
  const edge = await getTransformHandlePoint(page, 'e');
  await page.keyboard.down('Shift');
  await page.mouse.move(edge.x, edge.y);
  await page.mouse.down();
  await page.mouse.move(edge.x + 32, edge.y, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await page.waitForFunction(() => textureImageEditorUi.getState().imageTransform.stretchX > 0);

  const stretched = await page.evaluate(() => textureImageEditorUi.getState());
  expect(stretched.imageTransform.scalePercent).toBe(100);
  expect(stretched.imageTransform.stretchX).toBeGreaterThan(0);
  expect(stretched.imageTransform.stretchY).toBe(0);
  expect(stretched.previewSize.width).toBeGreaterThan(beforeEdge.previewSize.width);
  expect(stretched.previewSize.height).toBe(beforeEdge.previewSize.height);
  expect(errors).toEqual([]);
});

test('Shift 拉伸固定以原贴图中心为锚点并向两侧同时变化', async ({ page }) => {
  const errors = await boot(page);
  await selectKeyImage(page);

  const before = await page.evaluate(() => textureImageEditorUi.getState().transformRect);
  const edge = await getTransformHandlePoint(page, 'e');
  await page.keyboard.down('Shift');
  await page.mouse.move(edge.x, edge.y);
  await page.mouse.down();
  await page.mouse.move(edge.x + 40, edge.y, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await page.waitForFunction(() => textureImageEditorUi.getState().imageTransform.stretchX > 0);

  const after = await page.evaluate(() => textureImageEditorUi.getState().transformRect);
  expect(after.width).toBeGreaterThan(before.width);
  expect(after.x).toBeLessThan(before.x);
  expect(after.x + after.width).toBeGreaterThan(before.x + before.width);
  expect(Math.abs(
    (after.x + after.width / 2) - (before.x + before.width / 2)
  )).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});

test('Shift 先向上再向下拉伸不会因锚点切换而跳变', async ({ page }) => {
  const errors = await boot(page);
  await selectKeyImage(page);

  const before = await page.evaluate(() => textureImageEditorUi.getState().transformRect);
  const top = await getTransformHandlePoint(page, 'n');
  await page.keyboard.down('Shift');
  await page.mouse.move(top.x, top.y);
  await page.mouse.down();
  await page.mouse.move(top.x, top.y - 40, { steps: 4 });
  const expanded = await page.evaluate(() => textureImageEditorUi.getState().transformRect);
  await page.mouse.move(top.x, top.y, { steps: 6 });
  const returned = await page.evaluate(() => textureImageEditorUi.getState().transformRect);
  await page.mouse.up();
  await page.keyboard.up('Shift');

  expect(expanded.height).toBeGreaterThan(before.height);
  expect(expanded.y).toBeLessThan(before.y);
  expect(returned).toEqual(before);
  expect(errors).toEqual([]);
});

test('裁剪偏移后上下拉伸仍固定未编辑原图中心', async ({ page }) => {
  const errors = await boot(page);
  await selectKeyImage(page);

  await page.fill('#textureImageCropTop', '20');
  await page.waitForFunction(() => {
    const state = textureImageEditorUi.getState();
    return state.cropRect.y === -20;
  });
  const before = await page.evaluate(() => ({
    state: textureImageEditorUi.getState(),
    sourceCenterY: textureImageEditorUi.getState().workingSize.height / 2
  }));
  const top = await getTransformHandlePoint(page, 'n');
  await page.keyboard.down('Shift');
  await page.mouse.move(top.x, top.y);
  await page.mouse.down();
  await page.mouse.move(top.x, top.y - 30, { steps: 5 });
  const expanded = await page.evaluate(() => textureImageEditorUi.getState().transformRect);
  await page.mouse.up();
  await page.keyboard.up('Shift');

  expect(expanded.height).toBeGreaterThan(before.state.transformRect.height);
  const scaleY = expanded.height / before.state.cropRect.height;
  const sourceCenterInOutput = (before.sourceCenterY - before.state.cropRect.y) * scaleY;
  expect(Math.abs(expanded.y + sourceCenterInOutput - before.sourceCenterY)).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});

test('Shift 向左拉伸时不会把原图边缘像素裁掉', async ({ page }) => {
  const errors = await boot(page);
  await selectKeyImage(page);

  const beforeCount = await getKeyImageAlphaCount(page);
  expect(beforeCount).toBeGreaterThan(0);
  const west = await getTransformHandlePoint(page, 'w');

  await page.keyboard.down('Shift');
  await page.mouse.move(west.x, west.y);
  await page.mouse.down();
  await page.mouse.move(west.x - 64, west.y, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await page.waitForFunction(() => textureImageEditorUi.getState().imageTransform.stretchX > 0);

  const stretched = await page.evaluate(() => textureImageEditorUi.getState());
  const afterCount = await getKeyImageAlphaCount(page);
  expect(stretched.previewSize.width).toBeGreaterThan(stretched.cropRect.width);
  expect(afterCount).toBeGreaterThan(beforeCount * 1.2);
  expect(errors).toEqual([]);
});

test('Shift 从下方压缩时顶部像素保持完整映射', async ({ page }) => {
  const errors = await boot(page);
  await selectKeyImage(page);

  const before = await page.evaluate(() => textureImageEditorUi.getState());
  const beforeBounds = await getKeyImageAlphaBounds(page);
  const south = await getTransformHandlePoint(page, 's');

  await page.keyboard.down('Shift');
  await page.mouse.move(south.x, south.y);
  await page.mouse.down();
  await page.mouse.move(south.x, south.y - 64, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await page.waitForFunction(() => textureImageEditorUi.getState().imageTransform.stretchY < 0);

  const after = await page.evaluate(() => textureImageEditorUi.getState());
  const afterBounds = await getKeyImageAlphaBounds(page);
  const scaleY = after.previewSize.height / before.cropRect.height;
  expect(after.imageTransform.stretchY).toBeLessThan(0);
  expect(Math.abs(afterBounds.top - beforeBounds.top * scaleY)).toBeLessThanOrEqual(2);
  expect(Math.abs(afterBounds.bottom - beforeBounds.bottom * scaleY)).toBeLessThanOrEqual(2);
  expect(errors).toEqual([]);
});

test('保存贴图编辑结果后写入替换资源并保留透明扩边', async ({ page }) => {
  const errors = await boot(page);
  await selectKeyImage(page);

  const source = await page.evaluate(() => textureImageEditorUi.getState().sourceSize);
  const expected = await setEdits(page, source.width, source.height);
  await saveTextureEditor(page, 'current');
  await page.waitForFunction(() => userReplacedTextures.size > 0);
  await page.waitForFunction(() => textureImageEditorUi.getState().dirtyTabCount === 0);

  await expect(page.locator('#textureImageEditorModal')).toHaveClass(/active/);
  await expect(page.locator('.texture-image-tab')).toHaveCount(3);
  await expect(page.locator('.texture-image-tab[data-param-key="KeyImage0"]')).toHaveClass(/is-active/);
  await expect(page.locator('.texture-image-tab[data-param-key="KeyImage0"] .texture-image-tab-dirty')).toHaveCount(0);
  await expect(page.locator('#textureImageApplyBtn')).toBeEnabled();

  expect(await getKeyImageSize(page)).toEqual(expected);
  const applied = await page.evaluate(() => ({
    exportKeys: Array.from(userReplacedTextures.keys()),
    rightAlpha: (() => {
      const img = getManiaSkinImage(getActiveKeyCount(), LML.KeyImage, 0);
      const probe = document.createElement('canvas');
      probe.width = img.width;
      probe.height = img.height;
      probe.getContext('2d').drawImage(img, 0, 0);
      return probe.getContext('2d').getImageData(img.width - 1, img.height - 1, 1, 1).data[3];
    })()
  }));
  expect(applied.exportKeys.some((key) => /\.png$/i.test(key))).toBe(true);
  expect(applied.rightAlpha).toBe(0);
  expect(errors).toEqual([]);
});

test('设为空白只生成未保存预览，可撤回、重做并需保存后生效', async ({ page }) => {
  const errors = await boot(page);
  await selectKeyImage(page);

  const before = await page.evaluate(() => ({
    sourceSize: textureImageEditorUi.getState().sourceSize,
    exportKeys: Array.from(userReplacedTextures.keys())
  }));

  await page.click('#textureImageBlankBtn');
  await page.waitForFunction((sourceSize) => {
    const state = textureImageEditorUi.getState();
    return state.dirtyTabCount === 1 &&
      state.sourceSize && state.sourceSize.width === sourceSize.width &&
      state.sourceSize.height === sourceSize.height &&
      state.workingSize && state.workingSize.width === 1 && state.workingSize.height === 1 &&
      state.previewSize && state.previewSize.width === 1 && state.previewSize.height === 1;
  }, before.sourceSize);

  await expect(page.locator('#textureImageUndoBtn')).toBeEnabled();
  expect(await page.evaluate(() => userReplacedTextures.size)).toBe(before.exportKeys.length);

  await page.click('#textureImageUndoBtn');
  await page.waitForFunction((sourceSize) => {
    const state = textureImageEditorUi.getState();
    return state.dirtyTabCount === 0 &&
      state.previewSize && state.previewSize.width === sourceSize.width &&
      state.previewSize.height === sourceSize.height;
  }, before.sourceSize);

  await page.click('#textureImageRedoBtn');
  await page.waitForFunction(() => {
    const state = textureImageEditorUi.getState();
    return state.dirtyTabCount === 1 &&
      state.previewSize && state.previewSize.width === 1 && state.previewSize.height === 1;
  });

  expect(await getKeyImageSize(page)).toEqual({ width: 1, height: 1 });
  await expect(page.locator('#textureImageEditorModal')).toHaveClass(/active/);

  await saveTextureEditor(page, 'current');
  await page.waitForFunction(() => textureImageEditorUi.getState().dirtyTabCount === 0);
  await page.waitForFunction((count) => userReplacedTextures.size > count, before.exportKeys.length);

  const applied = await page.evaluate(async (beforeKeys) => {
    const match = Array.from(userReplacedTextures.entries())
      .find(([name]) => !beforeKeys.includes(name));
    if (!match) return null;

    const [name, buffer] = match;
    const bitmap = await createImageBitmap(new Blob([buffer], { type: 'image/png' }));
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);
    const alpha = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data[3];
    const image = getManiaSkinImage(getActiveKeyCount(), LML.KeyImage, 0);

    return {
      name,
      width: bitmap.width,
      height: bitmap.height,
      alpha,
      isBlankPlaceholder: !!image._isBlankPlaceholder,
      isTransparent1x1: !!image._isTransparent1x1
    };
  }, before.exportKeys);

  expect(applied).not.toBeNull();
  expect(applied.width).toBe(1);
  expect(applied.height).toBe(1);
  expect(applied.alpha).toBe(0);
  expect(applied.isBlankPlaceholder).toBe(true);
  expect(applied.isTransparent1x1).toBe(true);

  await page.click('#textureImageEditorCloseBtn');
  await page.waitForFunction(() =>
    document.getElementById('textureImageEditorModal').style.display === 'none'
  );
  await page.click('#openTextureImageEditorBtn');
  const editBtn = page.locator('#param-card-KeyImage0 .texture-edit-main-btn');
  await expect(editBtn).toBeEnabled();
  await editBtn.click();
  await page.waitForFunction(() => textureImageEditorUi.getState().selectedKey === 'KeyImage0');
  expect(await page.evaluate(() => textureImageEditorUi.getState().previewSize))
    .toEqual({ width: 1, height: 1 });
  expect(errors).toEqual([]);
});

test('重置只修改未保存预览，可撤回且不会立即写入替换资源', async ({ page }) => {
  const errors = await boot(page);
  await selectKeyImage(page);

  const source = await page.evaluate(() => textureImageEditorUi.getState().sourceSize);
  const resetTarget = await setEdits(page, source.width, source.height);
  await page.waitForFunction(() => textureImageEditorUi.getState().dirtyTabCount === 1);
  const beforeReset = await page.evaluate(() => ({
    exportCount: userReplacedTextures.size,
    previewSize: textureImageEditorUi.getState().previewSize
  }));
  expect(beforeReset.previewSize).toEqual(resetTarget);

  await page.click('#textureImageResetBtn');
  await page.waitForFunction((sourceSize) => {
    const state = textureImageEditorUi.getState();
    return state.previewSize &&
      state.previewSize.width === sourceSize.width &&
      state.previewSize.height === sourceSize.height;
  }, source);
  expect(await page.evaluate(() => userReplacedTextures.size)).toBe(beforeReset.exportCount);
  await expect(page.locator('#textureImageUndoBtn')).toBeEnabled();

  await page.click('#textureImageUndoBtn');
  await page.waitForFunction((expected) => {
    const preview = textureImageEditorUi.getState().previewSize;
    return preview && preview.width === expected.width && preview.height === expected.height;
  }, resetTarget);
  expect(errors).toEqual([]);
});

test('普通贴图保存后仍可继续修改并再次保存', async ({ page }) => {
  const errors = await boot(page);
  await selectKeyImage(page);

  const source = await page.evaluate(() => textureImageEditorUi.getState().sourceSize);
  const firstSave = await setEdits(page, source.width, source.height);
  await saveTextureEditor(page, 'current');
  await page.waitForFunction(() => textureImageEditorUi.getState().dirtyTabCount === 0);

  await page.fill('#textureImageCropRight', '5');
  await page.waitForFunction((width) => {
    const preview = textureImageEditorUi.getState().previewSize;
    return preview && preview.width === width;
  }, firstSave.width + 1);

  await expect(page.locator('.texture-image-tab[data-param-key="KeyImage0"] .texture-image-tab-dirty')).toHaveCount(1);
  await expect(page.locator('#textureImageApplyBtn')).toBeEnabled();
  await saveTextureEditor(page, 'current');
  await page.waitForFunction(() => textureImageEditorUi.getState().dirtyTabCount === 0);

  await expect(page.locator('#textureImageEditorModal')).toHaveClass(/active/);
  await expect(page.locator('.texture-image-tab')).toHaveCount(3);
  await expect(page.locator('.texture-image-tab[data-param-key="KeyImage0"]')).toHaveClass(/is-active/);
  await expect(page.locator('#textureImageApplyBtn')).toBeEnabled();
  expect(await getKeyImageSize(page)).toEqual({
    width: firstSave.width + 1,
    height: firstSave.height
  });
  expect(errors).toEqual([]);
});

test('KeyImage 保存后关闭再选会恢复裁剪与缩放参数继续编辑', async ({ page }) => {
  const errors = await boot(page);
  await selectKeyImage(page);

  const source = await page.evaluate(() => textureImageEditorUi.getState().sourceSize);
  const savedHeight = source.height - 24;
  await page.fill('#textureImageCropBottom', '-24');
  await page.fill('#textureImageScalePercent', '150');
  await page.waitForFunction(
    (height) => textureImageEditorUi.getState().previewSize.height === height,
    Math.round(savedHeight * 1.5)
  );
  await saveTextureEditor(page, 'current');
  await page.waitForFunction(() => textureImageEditorUi.getState().dirtyTabCount === 0);

  await page.click('.texture-image-tab[data-param-key="KeyImage0"] .texture-image-tab-close');
  await page.waitForFunction(() => !document.querySelector('.texture-image-tab[data-param-key="KeyImage0"]'));
  await page.click('#textureImagePickerGrid [data-param-key="KeyImage0"]');
  await page.waitForFunction(() => textureImageEditorUi.getState().selectedKey === 'KeyImage0');

  const reopened = await page.evaluate(() => textureImageEditorUi.getState());
  expect(reopened.sourceSize.height).toBe(source.height);
  expect(reopened.inputValues.bottom).toBe(-24);
  expect(reopened.imageTransform.scalePercent).toBe(150);
  expect(reopened.previewSize).toEqual({
    width: Math.round(source.width * 1.5),
    height: Math.round(savedHeight * 1.5)
  });

  await page.fill('#textureImageCropBottom', '-6');
  await page.waitForFunction(
    (height) => textureImageEditorUi.getState().previewSize.height === height,
    Math.round((source.height - 6) * 1.5)
  );
  await saveTextureEditor(page, 'current');
  await page.waitForFunction(() => textureImageEditorUi.getState().dirtyTabCount === 0);

  expect(await getKeyImageSize(page)).toEqual({
    width: Math.round(source.width * 1.5),
    height: Math.round((source.height - 6) * 1.5)
  });
  expect(errors).toEqual([]);
});

test('贴图编辑区左侧预览支持缩放', async ({ page }) => {
  const errors = await boot(page);
  await selectKeyImage(page);

  const before = await page.evaluate(() => textureImageEditorUi.getState().previewViewport);
  await page.click('#textureImagePreviewZoomIn');
  await page.waitForFunction(() => textureImageEditorUi.getState().previewZoom === 1.1);
  const after = await page.evaluate(() => textureImageEditorUi.getState().previewViewport);
  const zoomValue = await page.inputValue('#textureImagePreviewZoom');
  const zoomLabel = await page.textContent('#textureImagePreviewZoomValue');

  expect(after.scale).toBeGreaterThan(before.scale);
  expect(Number(zoomValue)).toBeCloseTo(1.1, 5);
  expect(zoomLabel.trim()).toBe('110%');
  expect(errors).toEqual([]);
});

test('贴图编辑区左侧预览支持鼠标滚轮缩放并保持指针位置', async ({ page }) => {
  const errors = await boot(page);
  await selectKeyImage(page);

  const box = await page.locator('#textureImagePreviewCanvas').boundingBox();
  const point = {
    x: box.x + box.width * 0.68,
    y: box.y + box.height * 0.42
  };
  const before = await page.evaluate(({ x, y }) => {
    const canvas = document.getElementById('textureImagePreviewCanvas');
    const rect = canvas.getBoundingClientRect();
    const viewport = textureImageEditorUi.getState().previewViewport;
    const canvasX = (x - rect.left) * canvas.width / rect.width;
    const canvasY = (y - rect.top) * canvas.height / rect.height;
    return {
      worldX: (canvasX - viewport.offsetX) / viewport.scale,
      worldY: (canvasY - viewport.offsetY) / viewport.scale
    };
  }, point);

  await page.mouse.move(point.x, point.y);
  await page.mouse.wheel(0, -100);
  await page.waitForFunction(() => textureImageEditorUi.getState().previewZoom === 1.1);

  const after = await page.evaluate(({ x, y }) => {
    const canvas = document.getElementById('textureImagePreviewCanvas');
    const rect = canvas.getBoundingClientRect();
    const state = textureImageEditorUi.getState();
    const viewport = state.previewViewport;
    const canvasX = (x - rect.left) * canvas.width / rect.width;
    const canvasY = (y - rect.top) * canvas.height / rect.height;
    return {
      zoom: state.previewZoom,
      worldX: (canvasX - viewport.offsetX) / viewport.scale,
      worldY: (canvasY - viewport.offsetY) / viewport.scale
    };
  }, point);

  expect(after.zoom).toBe(1.1);
  expect(Math.abs(after.worldX - before.worldX)).toBeLessThan(0.25);
  expect(Math.abs(after.worldY - before.worldY)).toBeLessThan(0.25);
  expect(errors).toEqual([]);
});

test('贴图编辑区左侧预览支持中键拖拽平移整个视图', async ({ page }) => {
  const errors = await boot(page);
  await selectKeyImage(page);

  const box = await page.locator('#textureImagePreviewCanvas').boundingBox();
  const start = {
    x: box.x + box.width * 0.5,
    y: box.y + box.height * 0.5
  };
  const delta = { x: 72, y: 46 };
  const before = await page.evaluate(() => ({
    viewport: textureImageEditorUi.getState().previewViewport,
    cropRect: textureImageEditorUi.getState().cropRect
  }));

  await page.mouse.move(start.x, start.y);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(start.x + delta.x, start.y + delta.y, { steps: 5 });
  await page.mouse.up({ button: 'middle' });

  const after = await page.evaluate(() => ({
    viewport: textureImageEditorUi.getState().previewViewport,
    cropRect: textureImageEditorUi.getState().cropRect
  }));
  const canvasSize = await page.evaluate(() => {
    const canvas = document.getElementById('textureImagePreviewCanvas');
    return { width: canvas.width, height: canvas.height };
  });
  const expectedDx = delta.x * canvasSize.width / box.width;
  const expectedDy = delta.y * canvasSize.height / box.height;

  expect(after.viewport.offsetX - before.viewport.offsetX).toBeCloseTo(expectedDx, 1);
  expect(after.viewport.offsetY - before.viewport.offsetY).toBeCloseTo(expectedDy, 1);
  expect(after.viewport.scale).toBeCloseTo(before.viewport.scale, 5);
  expect(after.cropRect).toEqual(before.cropRect);
  expect(errors).toEqual([]);
});

test('选择贴图后可返回贴图列表并关闭编辑窗口', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  const errors = await boot(page);
  await selectKeyImage(page);

  await page.click('.texture-image-tab[data-tab-id="menu"]');
  await page.waitForFunction(() =>
    getComputedStyle(document.getElementById('textureImagePickerView')).display !== 'none'
  );
  expect(await page.locator('#textureImagePickerGrid .texture-image-picker-item').count()).toBeGreaterThan(20);

  await page.click('#textureImageEditorCloseBtn');
  await page.waitForFunction(() => document.getElementById('textureImageEditorModal').style.display === 'none');
  expect(errors).toEqual([]);
});

test('贴图编辑窗口的 Ctrl+Z 只撤回窗口内操作', async ({ page }) => {
  const errors = await boot(page);
  await selectKeyImage(page);

  const source = await page.evaluate(() => textureImageEditorUi.getState().sourceSize);
  const expected = await setEdits(page, source.width, source.height);
  await page.waitForTimeout(520);
  const globalUndoBefore = await page.evaluate(() => undoStack.length);
  expect(await page.locator('#textureImageUndoBtn').isDisabled()).toBe(false);

  await page.keyboard.press('Control+z');
  await page.waitForFunction((size) => {
    const preview = textureImageEditorUi.getState().previewSize;
    return preview && preview.width === size.width && preview.height === size.height;
  }, source);

  expect(await page.evaluate(() => document.getElementById('textureImageEditorModal').classList.contains('active'))).toBe(true);
  expect(await page.evaluate(() => undoStack.length)).toBe(globalUndoBefore);
  expect(await page.locator('#textureImageUndoBtn').isDisabled()).toBe(true);

  await page.keyboard.press('Control+y');
  await page.waitForFunction((size) => {
    const preview = textureImageEditorUi.getState().previewSize;
    return preview && preview.width === size.width && preview.height === size.height;
  }, expected);
  expect(await page.evaluate(() => undoStack.length)).toBe(globalUndoBefore);
  expect(errors).toEqual([]);
});

test('长条身体一键投皮生成 40000px 合成图并可继续调整', async ({ page }) => {
  test.setTimeout(90000);
  const errors = await boot(page, OPAQUE_TAIL_SKIN);
  await installLongBodyHeight(page, 4999);
  await selectLongBodyImage(page);
  const readLongBodyState = () => page.evaluate(() => {
    const keys = getActiveKeyCount();
    return Array.from({ length: keys }, (_, column) => {
      const body = getManiaSkinImage(keys, LML.HoldNoteBodyImage, column);
      const tail = getManiaSkinImage(keys, LML.HoldNoteTailImage, column);
      const probe = document.createElement('canvas');
      if (tail) {
        probe.width = tail.width;
        probe.height = tail.height;
        probe.getContext('2d').drawImage(tail, 0, 0);
      }
      return {
        width: body ? body.width : 0,
        height: body ? body.height : 0,
        tailAlpha: tail ? probe.getContext('2d').getImageData(0, 0, probe.width, probe.height).data[3] : 0,
        style: getManiaSkinConfig(keys, LML.NoteBodyStyle, column).value
      };
    });
  });
  const beforeLongBody = await readLongBodyState();

  const toggle = page.locator('#textureImageLongBodyEnable');
  expect(await toggle.isDisabled()).toBe(false);
  expect((await page.textContent('#textureImageLongBodyStatus')).trim()).toContain('4999px');

  await page.click('.texture-image-switch-track');
  await page.waitForFunction(() => {
    const state = textureImageEditorUi.getState();
    return state.longBody.active &&
      state.longBody.targetHeight === 40000 &&
      state.previewSize.height <= 800;
  });
  await expect(page.locator('#textureImageLongBodyFade')).toHaveClass(/texture-image-range/);
  const centeredTailBottom = await page.evaluate(() => {
    const state = textureImageEditorUi.getState();
    const canvas = document.getElementById('textureImagePreviewCanvas');
    return state.previewViewport.offsetY +
      (state.longBody.coverage + state.longBody.tailScaledHeight) * state.previewViewport.scale -
      canvas.height / 2;
  });
  expect(Math.abs(centeredTailBottom)).toBeLessThan(1);
  expect(await page.evaluate(() => {
    const source = getManiaSkinImage(getActiveKeyCount(), LML.HoldNoteTailImage, 0);
    const preview = textureImageEditorUi.getLongBodyPreviewCanvas();
    if (!source || !preview) return false;
    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = source.width;
    sourceCanvas.height = source.height;
    const sourceCtx = sourceCanvas.getContext('2d');
    sourceCtx.drawImage(source, 0, 0);
    const sourceData = sourceCtx.getImageData(0, 0, source.width, source.height).data;
    const previewCtx = preview.getContext('2d');
    const previewData = previewCtx.getImageData(0, 0, preview.width, preview.height).data;
    const scaledHeight = Math.max(1, Math.round(source.height * preview.width / source.width));
    const tailOffsetY = textureImageEditorUi.getState().longBody.coverage;
    for (let y = 0; y < Math.floor(source.height / 2); y++) {
      const flippedY = source.height - 1 - y;
      for (let x = 0; x < source.width; x++) {
        const top = (y * source.width + x) * 4;
        const bottom = (flippedY * source.width + x) * 4;
        const differs = [0, 1, 2, 3].some((offset) => sourceData[top + offset] !== sourceData[bottom + offset]);
        if (!differs) continue;
        const previewX = Math.min(preview.width - 1, Math.round(x * preview.width / source.width));
        const previewTopY = tailOffsetY + Math.min(scaledHeight - 1, Math.round(y * scaledHeight / source.height));
        const previewBottomY = tailOffsetY + Math.min(scaledHeight - 1, Math.round(flippedY * scaledHeight / source.height));
        const previewTop = (previewTopY * preview.width + previewX) * 4;
        const previewBottom = (previewBottomY * preview.width + previewX) * 4;
        const topMatchesBottom = [0, 1, 2, 3].every((offset) => Math.abs(previewData[previewTop + offset] - sourceData[bottom + offset]) <= 2);
        const bottomMatchesTop = [0, 1, 2, 3].every((offset) => Math.abs(previewData[previewBottom + offset] - sourceData[top + offset]) <= 2);
        if (topMatchesBottom && bottomMatchesTop) return true;
      }
    }
    return false;
  })).toBe(true);
  const beforeDrag = await page.evaluate(() => textureImageEditorUi.getState().longBody);
  const tailCenter = await getPreviewPoint(
    page,
    (await page.evaluate(() => textureImageEditorUi.getState().previewSize.width)) / 2,
    beforeDrag.coverage + beforeDrag.tailScaledHeight / 2
  );
  await page.mouse.move(tailCenter.x, tailCenter.y);
  await page.mouse.down();
  await page.mouse.move(tailCenter.x, tailCenter.y + 30, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(120);
  expect((await page.evaluate(() => textureImageEditorUi.getState().longBody.coverage))).toBeGreaterThan(beforeDrag.coverage);

  await page.fill('#textureImageLongBodyCoverage', '123');
  await page.waitForTimeout(180);
  const bodySamples = await page.evaluate(() => {
    const state = textureImageEditorUi.getState();
    const canvas = textureImageEditorUi.getLongBodyPreviewCanvas();
    const ctx = canvas.getContext('2d');
    const findSample = (startY) => {
      for (let y = Math.max(0, Math.min(canvas.height - 1, startY)); y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
          const alpha = ctx.getImageData(x, y, 1, 1).data[3];
          if (alpha > 30) return { x, y, alpha };
        }
      }
      return null;
    };
    return {
      near: findSample(state.longBody.coverage + state.longBody.tailScaledHeight + 20),
      far: findSample(state.longBody.coverage + 500)
    };
  });
  expect(bodySamples.near).not.toBeNull();
  expect(bodySamples.far).not.toBeNull();
  await page.fill('#textureImageLongBodyFade', '80');
  await page.waitForTimeout(250);
  const fadedBody = await page.evaluate(({ near, far }) => {
    const canvas = textureImageEditorUi.getLongBodyPreviewCanvas();
    const ctx = canvas.getContext('2d');
    return {
      near: ctx.getImageData(near.x, near.y, 1, 1).data[3],
      far: ctx.getImageData(far.x, far.y, 1, 1).data[3]
    };
  }, bodySamples);
  expect(fadedBody.near).toBeLessThan(bodySamples.near.alpha);
  expect(Math.abs(fadedBody.far - bodySamples.far.alpha)).toBeLessThanOrEqual(2);

  expect(await page.evaluate(() => getManiaSkinConfig(getActiveKeyCount(), LML.NoteBodyStyle, 0).value)).toBe(1);
  expect(await page.evaluate(() => getManiaSkinConfig(getActiveKeyCount(), LML.NoteBodyStyle).value)).toBe(1);

  await page.evaluate(() => document.getElementById('toastContainer').replaceChildren());
  const undoCountBeforeApply = await page.evaluate(() => undoStack.length);
  await page.click('#textureImageApplyBtn');
  await page.waitForFunction(() => document.getElementById('textureImageApplyScopeModal').style.display === 'flex');
  await page.click('#textureImageApplyScopeAllBtn');
  await page.waitForFunction(() => textureImageEditorUi.getState().dirtyTabCount === 0, null, { timeout: 60000 });
  await expect(page.locator('#textureImageEditorModal')).toHaveClass(/active/);
  await expect(page.locator('.texture-image-tab')).toHaveCount(3);
  await expect(page.locator('#textureImageApplyBtn')).toBeEnabled();
  const saved = await readLongBodyState();
  expect(saved.every((item) => item.width > 0 && item.height === 40000)).toBe(true);
  expect(saved.every((item) => item.tailAlpha === 0)).toBe(true);
  expect(saved.every((item) => item.style === 1)).toBe(true);
  const exportedNoteBodyStyle = await page.evaluate(() => {
    const match = generateSkinIniText().match(/^NoteBodyStyle:\s*(\d+)\s*$/m);
    return match ? Number(match[1]) : null;
  });
  expect(exportedNoteBodyStyle).toBe(1);
  expect(await page.evaluate(() => undoStack.length)).toBe(undoCountBeforeApply + 1);
  await expect(page.locator('#toastContainer .toast')).toHaveCount(1);
  await expect(page.locator('#toastContainer .toast')).toContainText('一键投皮应用成功');

  await page.evaluate(() => performSkinUndo());
  expect(await readLongBodyState()).toEqual(beforeLongBody);
  await page.evaluate(() => performSkinRedo());
  expect(await readLongBodyState()).toEqual(saved);

  await page.evaluate(() => textureImageEditorUi.selectByParamKey('NoteImage0L'));
  await page.waitForFunction(() => textureImageEditorUi.getState().longBody.active);
  const restored = await page.evaluate(() => textureImageEditorUi.getState());
  expect(restored.longBody.coverage).toBe(123);
  expect(restored.longBody.fade).toBe(80);
  expect(restored.longBody.targetHeight).toBe(40000);
  expect(restored.previewSize.height).toBeLessThanOrEqual(800);
  expect(errors).toEqual([]);
});

test('长条身体高度小于 5000px 时可开启一键投皮，不再依赖尾部透明度', async ({ page }) => {
  const errors = await boot(page);
  await installLongBodyHeight(page, 4999);
  await selectLongBodyImage(page);

  expect((await page.evaluate(() => textureImageEditorUi.getState().sourceSize)).height).toBe(4999);
  expect(await page.locator('#textureImageLongBodyEnable').isDisabled()).toBe(false);
  expect((await page.textContent('#textureImageLongBodyStatus')).trim()).toContain('小于 5000px');
  await page.click('.texture-image-switch-track');
  await page.waitForFunction(() => textureImageEditorUi.getState().longBody.active);
  expect(errors).toEqual([]);
});

test('长条身体高度等于 5000px 时禁用一键投皮', async ({ page }) => {
  const errors = await boot(page);
  await installLongBodyHeight(page, 5000);
  await selectLongBodyImage(page);

  expect((await page.evaluate(() => textureImageEditorUi.getState().sourceSize)).height).toBe(5000);
  expect(await page.locator('#textureImageLongBodyEnable').isDisabled()).toBe(true);
  expect((await page.textContent('#textureImageLongBodyStatus')).trim()).toContain('需小于 5000px');
  expect(errors).toEqual([]);
});

test('一键投皮全轨统一使用当前轨透明尾部并忽略旧会话尾部', async ({ page }) => {
  test.setTimeout(90000);
  const errors = await boot(page);

  await page.evaluate(() => {
    const keys = getActiveKeyCount();
    const cfg = getManiaConfigForKeys(keys);
    if (!cfg.ImageLookups) cfg.ImageLookups = new Map();
    const tail = document.createElement('canvas');
    tail.width = 4;
    tail.height = 4;
    const ctx = tail.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, tail.width, tail.height);
    saveSkinAssetToStore(skinImageStore, 'longbody_tail_white', tail, false, true, true);
    cfg.ImageLookups.set('NoteImage0T', 'longbody_tail_white');
  });
  await installLongBodyHeight(page, 4999);
  await selectPickerParam(page, 'NoteImage0T');
  await page.click('#textureImageBlankBtn');
  await page.waitForFunction(() => {
    const state = textureImageEditorUi.getState();
    return state.dirtyTabCount === 1 &&
      state.previewSize && state.previewSize.width === 1 && state.previewSize.height === 1;
  });
  await page.click('#textureImageApplyBtn');
  await page.waitForFunction(() => textureImageEditorUi.getState().dirtyTabCount === 0);
  await page.waitForFunction(() => {
    const tail = getManiaSkinImage(getActiveKeyCount(), LML.HoldNoteTailImage, 0);
    return !tail || tail._isBlankPlaceholder;
  });

  await page.evaluate(() => textureImageEditorUi.selectByParamKey('NoteImage0L'));
  await page.waitForFunction(() => textureImageEditorUi.getState().selectedKey === 'NoteImage0L');
  expect((await page.evaluate(() => textureImageEditorUi.getState().sourceSize)).height)
    .toBeLessThan(5000);

  await page.click('.texture-image-switch-track');
  await page.waitForFunction(() => textureImageEditorUi.getState().longBody.active);
  await page.click('#textureImageApplyBtn');
  await page.waitForFunction(() => document.getElementById('textureImageApplyScopeModal').style.display === 'flex');
  await page.click('#textureImageApplyScopeAllBtn');
  await page.waitForFunction(() => textureImageEditorUi.getState().dirtyTabCount === 0, null, { timeout: 60000 });

  const applied = await page.evaluate(() => {
    const keys = getActiveKeyCount();
    const tails = Array.from({ length: keys }, (_, column) =>
      getManiaSkinImage(keys, LML.HoldNoteTailImage, column)
    );
    const sessions = Array.from(longBodyComposerSessions.entries())
      .filter(([key]) => key.startsWith(`${keys}|NoteImage`) && key.endsWith('L'))
      .map(([key, session]) => ({
        key,
        hasTail: !!session.tailFrame
      }));
    return {
      allTailsTransparent: tails.every((tail) =>
        !tail || tail._isBlankPlaceholder || isFullyTransparentImage(tail, 1, 1)
      ),
      sessions
    };
  });
  expect(applied.allTailsTransparent).toBe(true);
  expect(applied.sessions).toHaveLength(4);
  expect(applied.sessions.every((session) => !session.hasTail)).toBe(true);
  expect(errors).toEqual([]);
});

test('一键投皮同源轨道共享产物，异源轨道分别生成', async ({ page }) => {
  test.setTimeout(90000);
  const errors = await boot(page, OPAQUE_TAIL_SKIN);
  await page.evaluate(() => {
    const keys = getActiveKeyCount();
    const cfg = getManiaConfigForKeys(keys);
    if (!cfg.ImageLookups) cfg.ImageLookups = new Map();

    const bodySources = ['long_source_red', 'long_source_blue'];
    for (let column = 0; column < keys; column++) {
      const bodyName = bodySources[column % bodySources.length];
      const body = document.createElement('canvas');
      body.width = 4;
      body.height = 4999;
      const bodyCtx = body.getContext('2d');
      bodyCtx.fillStyle = column % bodySources.length === 0 ? '#ff0000' : '#0000ff';
      bodyCtx.fillRect(0, 0, body.width, body.height);
      saveSkinAssetToStore(skinImageStore, bodyName, body, false, true, true);
      cfg.ImageLookups.set(`NoteImage${column}L`, bodyName);

      const tailName = `long_tail_${column}`;
      const tail = document.createElement('canvas');
      tail.width = 4;
      tail.height = 4;
      const tailCtx = tail.getContext('2d');
      tailCtx.fillStyle = '#ffffff';
      tailCtx.fillRect(0, 0, tail.width, tail.height);
      saveSkinAssetToStore(skinImageStore, tailName, tail, false, true, true);
      cfg.ImageLookups.set(`NoteImage${column}T`, tailName);
    }
  });

  await selectLongBodyImage(page);
  await page.click('.texture-image-switch-track');
  await page.waitForFunction(() => textureImageEditorUi.getState().longBody.active);
  await page.fill('#textureImageLongBodyTargetHeight', '300');
  await page.fill('#textureImageLongBodyCoverage', '8');
  await page.waitForTimeout(250);

  await page.click('#textureImageApplyBtn');
  await page.waitForFunction(() => document.getElementById('textureImageApplyScopeModal').style.display === 'flex');
  await page.click('#textureImageApplyScopeAllBtn');
  await page.waitForFunction(() => textureImageEditorUi.getState().dirtyTabCount === 0, null, { timeout: 60000 });
  await expect(page.locator('#textureImageEditorModal')).toHaveClass(/active/);
  await expect(page.locator('.texture-image-tab')).toHaveCount(3);
  await expect(page.locator('#textureImageApplyBtn')).toBeEnabled();

  const applied = await page.evaluate(() => {
    const keys = getActiveKeyCount();
    const probe = document.createElement('canvas');
    const readColor = (img) => {
      if (!img) return null;
      probe.width = img.width;
      probe.height = img.height;
      const ctx = probe.getContext('2d');
      ctx.clearRect(0, 0, probe.width, probe.height);
      ctx.drawImage(img, 0, 0);
      const sample = ctx.getImageData(Math.floor(probe.width / 2), 200, 1, 1).data;
      return [sample[0], sample[1], sample[2], sample[3]];
    };
    return {
      names: Array.from({ length: keys }, (_, column) =>
        getManiaNoteTextureName(keys, LML.HoldNoteBodyImage, column)
      ),
      colors: Array.from({ length: keys }, (_, column) =>
        readColor(getManiaSkinImage(keys, LML.HoldNoteBodyImage, column))
      ),
      generatedBodyFiles: Array.from(new Set(
        Array.from(userReplacedTextures.keys())
          .filter((name) => /^longbody-body(?:$|[_-])/i.test(name))
          .map((name) => name.toLowerCase())
      ))
    };
  });

  expect(applied.names[0]).toBe(applied.names[2]);
  expect(applied.names[1]).toBe(applied.names[3]);
  expect(applied.names[0]).not.toBe(applied.names[1]);
  expect(applied.colors[0]).toEqual(applied.colors[2]);
  expect(applied.colors[1]).toEqual(applied.colors[3]);
  expect(applied.colors[0]).not.toEqual(applied.colors[1]);
  expect(applied.generatedBodyFiles).toHaveLength(2);
  expect(errors).toEqual([]);
});

test('一键投皮保存时可以选择仅应用到当前轨道', async ({ page }) => {
  const errors = await boot(page, OPAQUE_TAIL_SKIN);
  await installLongBodyHeight(page, 4999);
  await selectLongBodyImage(page);
  await page.click('.texture-image-switch-track');
  await page.waitForFunction(() => textureImageEditorUi.getState().longBody.active);

  await page.click('#textureImageApplyBtn');
  await page.waitForFunction(() => document.getElementById('textureImageApplyScopeModal').style.display === 'flex');
  await page.click('#textureImageApplyScopeCurrentBtn');
  await page.waitForFunction(() => textureImageEditorUi.getState().dirtyTabCount === 0, null, { timeout: 60000 });
  await expect(page.locator('#textureImageEditorModal')).toHaveClass(/active/);
  await expect(page.locator('.texture-image-tab')).toHaveCount(3);
  await expect(page.locator('#textureImageApplyBtn')).toBeEnabled();

  const applied = await page.evaluate(() => {
    const keys = getActiveKeyCount();
    const body0 = getManiaSkinImage(keys, LML.HoldNoteBodyImage, 0);
    const body1 = getManiaSkinImage(keys, LML.HoldNoteBodyImage, 1);
    const tail0 = getManiaSkinImage(keys, LML.HoldNoteTailImage, 0);
    const tail1 = getManiaSkinImage(keys, LML.HoldNoteTailImage, 1);
    const probe = document.createElement('canvas');
    const alphaOf = (img) => {
      if (!img) return 0;
      probe.width = img.width;
      probe.height = img.height;
      const ctx = probe.getContext('2d');
      ctx.clearRect(0, 0, probe.width, probe.height);
      ctx.drawImage(img, 0, 0);
      return ctx.getImageData(0, 0, probe.width, probe.height).data[3];
    };
    return {
      body0Height: body0 ? body0.height : 0,
      body1Height: body1 ? body1.height : 0,
      tail0Alpha: alphaOf(tail0),
      tail1Alpha: alphaOf(tail1)
    };
  });
  expect(applied.body0Height).toBe(40000);
  expect(applied.body1Height).not.toBe(40000);
  expect(applied.tail0Alpha).toBe(0);
  expect(applied.tail1Alpha).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('拉伸修复按按键固定宽度等比缩放，取消后恢复原尺寸', async ({ page }) => {
  const errors = await boot(page);
  await page.evaluate(() => {
    const cfg = getManiaConfigForKeys(getActiveKeyCount());
    cfg.ColumnWidth[0] = 37;
  });
  await selectKeyImage(page);

  const before = await page.evaluate(() => textureImageEditorUi.getState());
  expect(before.stretchFix.axis).toBe('width');
  expect(before.stretchFix.size).toBeGreaterThan(0);
  expect(await page.locator('#textureImageStretchFixBtn').isDisabled()).toBe(false);

  const expectedHeight = Math.max(1, Math.round(before.previewSize.height * before.stretchFix.size / before.previewSize.width));
  await page.click('#textureImageStretchFixBtn');
  await page.waitForFunction((width) => textureImageEditorUi.getState().previewSize.width === width, before.stretchFix.size);

  const after = await page.evaluate(() => textureImageEditorUi.getState());
  expect(after.previewSize).toEqual({
    width: before.stretchFix.size,
    height: expectedHeight
  });
  expect(Math.abs(after.previewSize.width / after.previewSize.height - before.previewSize.width / before.previewSize.height)).toBeLessThan(0.02);
  expect(await page.locator('#textureImageStretchFixBtn').isDisabled()).toBe(true);

  await page.click('#textureImageEditorCloseBtn');
  await page.click('#textureImageUnsavedDiscardBtn');
  await page.waitForFunction(() => document.getElementById('textureImageEditorModal').style.display === 'none');
  expect(await getKeyImageSize(page)).toEqual(before.sourceSize);
  expect(errors).toEqual([]);
});

test('拉伸修复按舞台边框固定高度等比缩放', async ({ page }) => {
  const errors = await boot(page);
  await selectPickerParam(page, 'StageLeft');

  const before = await page.evaluate(() => textureImageEditorUi.getState());
  expect(before.stretchFix.axis).toBe('height');
  expect(before.stretchFix.size).toBe(768);
  expect(await page.locator('#textureImageStretchFixBtn').isDisabled()).toBe(false);

  const expectedWidth = Math.max(1, Math.round(before.previewSize.width * before.stretchFix.size / before.previewSize.height));
  await page.click('#textureImageStretchFixBtn');
  await page.waitForFunction((height) => textureImageEditorUi.getState().previewSize.height === height, before.stretchFix.size);

  const after = await page.evaluate(() => textureImageEditorUi.getState());
  expect(after.previewSize).toEqual({
    width: expectedWidth,
    height: before.stretchFix.size
  });
  await page.click('#textureImageEditorCloseBtn');
  await page.click('#textureImageUnsavedDiscardBtn');
  expect(errors).toEqual([]);
});

test('贴图编辑窗口支持拖动、折叠和恢复停靠位置', async ({ page }) => {
  const errors = await boot(page);
  await page.click('#openTextureImageEditorBtn');
  await page.waitForFunction(() => document.getElementById('textureImageEditorModal').classList.contains('active'));

  const header = await page.locator('#textureImageEditorHeader').boundingBox();
  await page.mouse.move(header.x + 120, header.y + 18);
  await page.mouse.down();
  await page.mouse.move(header.x + 20, header.y + 90);
  await page.mouse.up();
  await page.waitForTimeout(150);

  const dragged = await page.evaluate(() => {
    const dialog = document.getElementById('textureImageEditorDialog');
    return { left: dialog.style.left, right: dialog.style.right, top: dialog.style.top };
  });
  expect(dragged.left).not.toBe('');
  expect(dragged.right).toBe('auto');
  expect(Number.parseFloat(dragged.top)).toBeGreaterThan(48);

  await page.click('#dockTextureImageEditorBtn');
  const docked = await page.evaluate(() => {
    const dialog = document.getElementById('textureImageEditorDialog');
    return { left: dialog.style.left, right: dialog.style.right, top: dialog.style.top, width: dialog.style.width };
  });
  expect(docked.left).toBe('auto');
  expect(docked.right).toBe('24px');
  expect(docked.top).toBe('48px');
  expect(docked.width).toBe('860px');

  await page.click('#collapseTextureImageEditorBtn');
  expect(await page.evaluate(() => document.getElementById('textureImageEditorDialog').classList.contains('is-collapsed'))).toBe(true);
  await page.click('#collapseTextureImageEditorBtn');
  expect(await page.evaluate(() => document.getElementById('textureImageEditorDialog').classList.contains('is-collapsed'))).toBe(false);
  expect(errors).toEqual([]);
});

test('调整贴图编辑窗口宽度时左侧预览保持原始比例', async ({ page }) => {
  const errors = await boot(page);
  await selectKeyImage(page);

  const before = await page.locator('#textureImagePreviewCanvas').boundingBox();
  await page.evaluate(() => {
    document.getElementById('textureImageEditorDialog').style.width = '620px';
  });
  await page.waitForTimeout(250);
  const after = await page.locator('#textureImagePreviewCanvas').boundingBox();
  const beforeRatio = before.width / before.height;
  const afterRatio = after.width / after.height;

  expect(Math.abs(afterRatio - beforeRatio)).toBeLessThan(0.02);
  expect(Math.abs(afterRatio - 360 / 280)).toBeLessThan(0.02);
  expect(errors).toEqual([]);
});

test('贴图编辑以不可关闭的菜单标签为起点，并可切换多个贴图标签', async ({ page }) => {
  const errors = await boot(page);
  await page.click('#openTextureImageEditorBtn');
  await page.waitForFunction(() => document.getElementById('textureImageEditorModal').classList.contains('active'));

  const menuTab = page.locator('.texture-image-tab[data-tab-id="menu"]');
  await expect(menuTab).toHaveCount(1);
  await expect(menuTab.locator('.texture-image-tab-label')).toHaveText('菜单');
  await expect(menuTab.locator('.texture-image-tab-close')).toHaveCount(0);

  await page.click('#textureImagePickerGrid [data-param-key="KeyImage0"]');
  await page.waitForFunction(() => textureImageEditorUi.getState().selectedKey === 'KeyImage0');
  await expect(page.locator('.texture-image-tab')).toHaveCount(3);
  await expect(page.locator('.texture-image-tab[data-param-key="KeyImage0"]')).toHaveClass(/is-active/);
  const source = await page.evaluate(() => textureImageEditorUi.getState().sourceSize);
  const edited = await setEdits(page, source.width, source.height);

  await page.click('.texture-image-tab[data-tab-id="menu"]');
  expect(await page.evaluate(() => textureImageEditorUi.getState().selectedKey)).toBeNull();

  await page.click('#textureImagePickerGrid [data-param-key="StageLeft"]');
  await page.waitForFunction(() => textureImageEditorUi.getState().selectedKey === 'StageLeft');
  await expect(page.locator('.texture-image-tab')).toHaveCount(4);

  await page.click('.texture-image-tab[data-param-key="KeyImage0"]');
  await page.waitForFunction(() => textureImageEditorUi.getState().selectedKey === 'KeyImage0');
  await expect(page.locator('.texture-image-tab[data-param-key="KeyImage0"]')).toHaveClass(/is-active/);
  await expect(page.locator('#textureImageEditorView')).toBeVisible();
  expect(await page.evaluate(() => textureImageEditorUi.getState().previewSize)).toEqual(edited);
  expect(errors).toEqual([]);
});

test('保存当前贴图后保留标签、清除红点并保持其他标签可保存', async ({ page }) => {
  const errors = await boot(page);
  await selectKeyImage(page);
  const keySource = await page.evaluate(() => textureImageEditorUi.getState().sourceSize);
  await setEdits(page, keySource.width, keySource.height);

  await page.click('.texture-image-tab[data-tab-id="menu"]');
  await page.click('#textureImagePickerGrid [data-param-key="StageLeft"]');
  await page.waitForFunction(() => textureImageEditorUi.getState().selectedKey === 'StageLeft');
  const stageSource = await page.evaluate(() => textureImageEditorUi.getState().sourceSize);
  await setEdits(page, stageSource.width, stageSource.height);
  await expect(page.locator('.texture-image-tab-dirty')).toHaveCount(2);

  await page.click('.texture-image-tab[data-param-key="KeyImage0"]');
  await page.waitForFunction(() => textureImageEditorUi.getState().selectedKey === 'KeyImage0');
  await saveTextureEditor(page, 'current');
  await page.waitForFunction(() => textureImageEditorUi.getState().dirtyTabCount === 1);

  const keyTab = page.locator('.texture-image-tab[data-param-key="KeyImage0"]');
  const stageTab = page.locator('.texture-image-tab[data-param-key="StageLeft"]');
  await expect(page.locator('#textureImageEditorModal')).toHaveClass(/active/);
  await expect(page.locator('.texture-image-tab')).toHaveCount(4);
  await expect(keyTab).toHaveClass(/is-active/);
  await expect(keyTab.locator('.texture-image-tab-dirty')).toHaveCount(0);
  await expect(stageTab.locator('.texture-image-tab-dirty')).toHaveCount(1);
  await expect(page.locator('#textureImageApplyBtn')).toBeEnabled();

  await stageTab.click();
  await page.waitForFunction(() => textureImageEditorUi.getState().selectedKey === 'StageLeft');
  await expect(page.locator('#textureImageApplyBtn')).toBeEnabled();
  await saveTextureEditor(page, 'current');
  await page.waitForFunction(() => textureImageEditorUi.getState().dirtyTabCount === 0);

  await expect(page.locator('#textureImageEditorModal')).toHaveClass(/active/);
  await expect(page.locator('.texture-image-tab')).toHaveCount(4);
  await expect(stageTab).toHaveClass(/is-active/);
  await expect(page.locator('.texture-image-tab-dirty')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('关闭有未保存编辑的贴图标签时提供保存、放弃和取消选项', async ({ page }) => {
  const errors = await boot(page);
  await selectKeyImage(page);
  await page.fill('#textureImageCropLeft', '-1');
  await page.waitForFunction(() => textureImageEditorUi.getState().inputValues.left === -1);

  const keyTab = page.locator('.texture-image-tab[data-param-key="KeyImage0"]');
  await keyTab.locator('.texture-image-tab-close').click();
  await expect(page.locator('#textureImageUnsavedModal')).toBeVisible();

  await page.click('#textureImageUnsavedCancelBtn');
  await expect(page.locator('#textureImageUnsavedModal')).toBeHidden();
  await expect(page.locator('.texture-image-tab')).toHaveCount(3);
  await expect(keyTab).toHaveClass(/is-active/);

  await keyTab.locator('.texture-image-tab-close').click();
  await page.click('#textureImageUnsavedDiscardBtn');
  await expect(page.locator('.texture-image-tab')).toHaveCount(2);
  await expect(page.locator('.texture-image-tab[data-tab-id="menu"]')).toHaveClass(/is-active/);
  expect(errors).toEqual([]);
});

test('从关闭提示保存贴图后应用修改并关闭对应标签', async ({ page }) => {
  const errors = await boot(page);
  await selectKeyImage(page);
  const source = await page.evaluate(() => textureImageEditorUi.getState().sourceSize);
  const expected = await setEdits(page, source.width, source.height);

  await page.locator('.texture-image-tab[data-param-key="KeyImage0"] .texture-image-tab-close').click();
  await page.click('#textureImageUnsavedSaveBtn');
  await page.waitForTimeout(100);
  await acceptSharedTextureDecision(page);
  await page.waitForFunction(() => userReplacedTextures.size > 0);
  await expect(page.locator('.texture-image-tab')).toHaveCount(2);
  await expect(page.locator('.texture-image-tab[data-tab-id="menu"]')).toHaveClass(/is-active/);

  const appliedWidth = await page.evaluate(() => {
    const img = getManiaSkinImage(getActiveKeyCount(), LML.KeyImage, 0);
    return img ? img.width : 0;
  });
  expect(appliedWidth).toBe(expected.width);
  expect(errors).toEqual([]);
});

test('关闭窗口时会提示并保存所有未提交的贴图标签', async ({ page }) => {
  const errors = await boot(page);
  await selectKeyImage(page);
  const keySource = await page.evaluate(() => textureImageEditorUi.getState().sourceSize);
  const keyExpected = await setEdits(page, keySource.width, keySource.height);

  await page.click('.texture-image-tab[data-tab-id="menu"]');
  await page.click('#textureImagePickerGrid [data-param-key="StageLeft"]');
  await page.waitForFunction(() => textureImageEditorUi.getState().selectedKey === 'StageLeft');
  const stageSource = await page.evaluate(() => textureImageEditorUi.getState().sourceSize);
  const stageExpected = await setEdits(page, stageSource.width, stageSource.height);

  await page.click('#textureImageEditorCloseBtn');
  await expect(page.locator('#textureImageUnsavedModal')).toBeVisible();
  await expect(page.locator('#textureImageUnsavedText')).toContainText('2 个贴图标签');
  await page.click('#textureImageUnsavedSaveBtn');
  for (let index = 0; index < 3; index++) {
    await page.waitForTimeout(100);
    await acceptSharedTextureDecision(page);
    if (await page.locator('#textureImageEditorModal').isHidden()) break;
  }
  await page.waitForFunction(() => document.getElementById('textureImageEditorModal').style.display === 'none');

  const applied = await page.evaluate(() => {
    const keys = getActiveKeyCount();
    const keyImage = getManiaSkinImage(keys, LML.KeyImage, 0);
    const stageLeft = getManiaSkinImage(keys, LML.LeftStageImage);
    return {
      keyWidth: keyImage ? keyImage.width : 0,
      stageHeight: stageLeft ? stageLeft.height : 0
    };
  });
  expect(applied.keyWidth).toBe(keyExpected.width);
  expect(applied.stageHeight).toBe(stageExpected.height);
  expect(errors).toEqual([]);
});

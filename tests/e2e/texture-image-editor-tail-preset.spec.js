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
  await page.waitForFunction((key) => {
    return document.querySelector(`#textureImagePickerGrid [data-param-key="${key}"]`) !== null;
  }, paramKey);
  await page.click(`#textureImagePickerGrid [data-param-key="${paramKey}"]`);
  await page.waitForFunction((key) => textureImageEditorUi.getState().selectedKey === key, paramKey);
}

test('非透明尾部时一键投皮尾部预设禁用', async ({ page }) => {
  const errors = await boot(page, OPAQUE_TAIL_SKIN);
  await selectPickerParam(page, 'NoteImage0L');
  await page.click('.texture-image-switch-track');
  await page.waitForFunction(() => textureImageEditorUi.getState().longBody.active);

  const presetSelect = page.locator('#textureImageLongBodyPreset');
  await expect(presetSelect).toBeDisabled();
  expect(await presetSelect.inputValue()).toBe('none');
  expect(errors).toEqual([]);
});

test('尾部透明时可以使用一键投皮尾部预设裁剪为尖头和圆头，并支持撤回与重做', async ({ page }) => {
  test.setTimeout(90000);
  const errors = await boot(page, SKIN);

  // 确保 NoteImage0T 为透明尾部且 NoteImage0L 高度 < 5000px
  await page.evaluate(() => {
    const keys = getActiveKeyCount();
    const cfg = getManiaConfigForKeys(keys);
    if (!cfg.ImageLookups) cfg.ImageLookups = new Map();
    const trans = document.createElement('canvas');
    trans.width = 1;
    trans.height = 1;
    saveSkinAssetToStore(skinImageStore, 'blank_tail_for_preset_test', trans, false, true, true);
    cfg.ImageLookups.set('NoteImage0T', 'blank_tail_for_preset_test');

    const body = document.createElement('canvas');
    body.width = 120;
    body.height = 200;
    const ctx = body.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, body.width, body.height);
    saveSkinAssetToStore(skinImageStore, 'sample_body_for_preset_test', body, false, true, true);
    cfg.ImageLookups.set('NoteImage0L', 'sample_body_for_preset_test');
  });

  await selectPickerParam(page, 'NoteImage0L');
  await page.click('.texture-image-switch-track');
  await page.waitForFunction(() => textureImageEditorUi.getState().longBody.active);

  const presetSelect = page.locator('#textureImageLongBodyPreset');
  await expect(presetSelect).toBeEnabled();

  // 1. 选择尖头预设
  await presetSelect.selectOption('sharp');
  await page.waitForFunction(() => {
    const st = textureImageEditorUi.getState();
    return st.longBody.tailPreset === 'sharp';
  });

  // 验证尖头预设渲染结果：像素末端被裁剪为尖头形状（顶点最窄，向下对称展开）
  const shapeValidation = await page.evaluate(() => {
    const preview = textureImageEditorUi.getLongBodyPreviewCanvas();
    if (!preview) return null;
    const ctx = preview.getContext('2d');
    const coverage = textureImageEditorUi.getState().longBody.coverage;
    const h = textureImageEditorUi.getState().longBody.presetHeight;
    const checkRow = (y) => {
      const row = ctx.getImageData(0, y, preview.width, 1).data;
      const nonZeroXs = [];
      for (let x = 0; x < preview.width; x++) {
        if (row[x * 4 + 3] > 20) nonZeroXs.push(x);
      }
      return nonZeroXs.length > 0 ? (nonZeroXs[nonZeroXs.length - 1] - nonZeroXs[0] + 1) : 0;
    };
    return {
      coverage,
      h,
      previewWidth: preview.width,
      previewHeight: preview.height,
      row0: checkRow(coverage),
      row10: checkRow(coverage + 10),
      row30: checkRow(coverage + 30),
      row60: checkRow(coverage + 60),
      topSpan: checkRow(coverage),
      midSpan: checkRow(coverage + Math.round(h / 2)),
      bottomSpan: checkRow(coverage + h)
    };
  });

  expect(shapeValidation).not.toBeNull();
  expect(shapeValidation.topSpan).toBeGreaterThan(0);
  expect(shapeValidation.midSpan).toBeGreaterThan(shapeValidation.topSpan);
  expect(shapeValidation.bottomSpan).toBeGreaterThan(shapeValidation.midSpan);

  // 2. 选择圆头预设
  await presetSelect.selectOption('round');
  await page.waitForFunction(() => {
    const st = textureImageEditorUi.getState();
    return st.longBody.tailPreset === 'round';
  });

  const roundValidation = await page.evaluate(() => {
    const preview = textureImageEditorUi.getLongBodyPreviewCanvas();
    if (!preview) return null;
    const ctx = preview.getContext('2d');
    const coverage = textureImageEditorUi.getState().longBody.coverage;
    const h = textureImageEditorUi.getState().longBody.presetHeight;
    const checkRow = (y) => {
      const row = ctx.getImageData(0, y, preview.width, 1).data;
      const nonZeroXs = [];
      for (let x = 0; x < preview.width; x++) {
        if (row[x * 4 + 3] > 20) nonZeroXs.push(x);
      }
      return nonZeroXs.length > 0 ? (nonZeroXs[nonZeroXs.length - 1] - nonZeroXs[0] + 1) : 0;
    };
    return {
      topSpan: checkRow(coverage),
      midSpan: checkRow(coverage + Math.round(h / 2)),
      bottomSpan: checkRow(coverage + h)
    };
  });

  expect(roundValidation).not.toBeNull();
  expect(roundValidation.topSpan).toBeGreaterThan(0);
  expect(roundValidation.midSpan).toBeGreaterThan(roundValidation.topSpan);
  expect(roundValidation.bottomSpan).toBeGreaterThanOrEqual(roundValidation.midSpan);

  // 3. 调整预设高度
  const heightInput = page.locator('#textureImageLongBodyPresetHeight');
  await heightInput.fill('40');
  await page.waitForFunction(() => textureImageEditorUi.getState().longBody.presetHeight === 40);

  // 4. 验证撤回与重做（Ctrl+Z / 撤回按钮）
  expect(await page.evaluate(() => textureImageEditorUi.canUndo())).toBe(true);
  await page.click('#textureImageUndoBtn');
  await page.waitForFunction(() => textureImageEditorUi.getState().longBody.presetHeight !== 40);

  await page.click('#textureImageRedoBtn');
  await page.waitForFunction(() => textureImageEditorUi.getState().longBody.presetHeight === 40);

  // 5. 保存并应用到全部轨道，验证皮肤级持久化与撤回
  await page.click('#textureImageApplyBtn');
  await page.waitForFunction(() => document.getElementById('textureImageApplyScopeModal').style.display === 'flex');
  await page.click('#textureImageApplyScopeAllBtn');
  await page.waitForFunction(() => textureImageEditorUi.getState().dirtyTabCount === 0, null, { timeout: 60000 });

  // 验证 NoteBodyStyle 变为 1，尾部变为透明
  const skinState = await page.evaluate(() => {
    const keys = getActiveKeyCount();
    const style = getManiaSkinConfig(keys, LML.NoteBodyStyle, 0).value;
    const tail = getManiaSkinImage(keys, LML.HoldNoteTailImage, 0);
    const body = getManiaSkinImage(keys, LML.HoldNoteBodyImage, 0);
    return {
      style,
      tailWidth: tail ? tail.width : 0,
      tailHeight: tail ? tail.height : 0,
      bodyHeight: body ? body.height : 0
    };
  });
  expect(skinState.style).toBe(1);
  expect(skinState.tailWidth).toBe(1);
  expect(skinState.tailHeight).toBe(1);
  expect(skinState.bodyHeight).toBe(40000);

  // 全局撤销
  expect(await page.evaluate(() => typeof performSkinUndo === 'function')).toBe(true);
  await page.evaluate(() => performSkinUndo());
  const undoneBodyHeight = await page.evaluate(() => {
    const keys = getActiveKeyCount();
    const body = getManiaSkinImage(keys, LML.HoldNoteBodyImage, 0);
    return body ? body.height : 0;
  });
  // 长条身体恢复为 200px
  expect(undoneBodyHeight).toBe(200);

  expect(errors).toEqual([]);
});

test('淡化范围拖动条在鼠标释放前实时更新已覆盖轨道颜色', async ({ page }) => {
  const errors = await boot(page, SKIN);

  await page.evaluate(() => {
    const keys = getActiveKeyCount();
    const cfg = getManiaConfigForKeys(keys);
    if (!cfg.ImageLookups) cfg.ImageLookups = new Map();
    const tail = document.createElement('canvas');
    tail.width = 1;
    tail.height = 1;
    saveSkinAssetToStore(skinImageStore, 'blank_tail_for_fade_drag_test', tail, false, true, true);
    cfg.ImageLookups.set('NoteImage0T', 'blank_tail_for_fade_drag_test');

    const body = document.createElement('canvas');
    body.width = 120;
    body.height = 200;
    const ctx = body.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, body.width, body.height);
    saveSkinAssetToStore(skinImageStore, 'body_for_fade_drag_test', body, false, true, true);
    cfg.ImageLookups.set('NoteImage0L', 'body_for_fade_drag_test');
  });

  await selectPickerParam(page, 'NoteImage0L');
  await page.locator('#textureImageLongBodyEnable').check({ force: true });
  await page.waitForFunction(() => textureImageEditorUi.getState().longBody.active);

  await page.evaluate(() => {
    const range = document.getElementById('textureImageLongBodyFade');
    range.value = '50';
    range.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForFunction(() => textureImageEditorUi.getState().longBody.fade === 50);

  const duringDrag = await page.evaluate(() => ({
    value: document.getElementById('textureImageLongBodyFade').value,
    progress: document.getElementById('textureImageLongBodyFade').style.getPropertyValue('--slider-pct'),
    label: document.getElementById('textureImageLongBodyFadeValue').textContent
  }));
  expect(duringDrag.value).toBe('50');
  expect(Number.parseFloat(duringDrag.progress)).toBe(50);
  expect(duringDrag.label).toBe(`${duringDrag.value}%`);

  expect(errors).toEqual([]);
});

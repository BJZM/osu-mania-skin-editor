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
    () => typeof textureImageEditorUi !== 'undefined' && typeof triggerTextureUpload === 'function',
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

async function selectKeyImage(page) {
  await page.click('#openTextureImageEditorBtn');
  await page.waitForFunction(() => document.getElementById('textureImageEditorModal').classList.contains('active'));
  await page.click('#textureImagePickerGrid [data-param-key="KeyImage0"]');
  await page.waitForFunction(() => textureImageEditorUi.getState().selectedKey === 'KeyImage0');
}

function readOpaquePixel(page) {
  return page.evaluate(() => {
    const img = getManiaSkinImage(getActiveKeyCount(), LML.KeyImage, 0);
    if (!img) return null;
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let best = null;
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const index = (y * canvas.width + x) * 4;
        const alpha = data[index + 3];
        if (alpha === 0) continue;
        const sum = data[index] + data[index + 1] + data[index + 2];
        const isMoreOpaque = !best || alpha > best.alpha;
        const isSameOpacityWithHigherSum = best && alpha === best.alpha && sum > best.sum;
        const isOpaqueCandidate = alpha === 255 && (!best || best.alpha !== 255 || sum > best.sum);
        if (isOpaqueCandidate || isMoreOpaque || isSameOpacityWithHigherSum) {
          best = {
            x,
            y,
            sum,
            alpha,
            rgba: [data[index], data[index + 1], data[index + 2], alpha]
          };
        }
      }
    }
    if (!best) return null;
    return {
      x: best.x,
      y: best.y,
      rgba: best.rgba
    };
  });
}

function readPixel(page, point) {
  return page.evaluate(({ x, y }) => {
    const img = getManiaSkinImage(getActiveKeyCount(), LML.KeyImage, 0);
    if (!img) return null;
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    return Array.from(ctx.getImageData(x, y, 1, 1).data);
  }, point);
}

test('RGB 分量调整实时更新贴图并保持透明度', async ({ page }) => {
  const errors = await boot(page);
  await selectKeyImage(page);

  const source = await readOpaquePixel(page);
  expect(source).not.toBeNull();
  await page.fill('#textureImageRgbRValue', '50');
  await page.fill('#textureImageRgbGValue', '150');
  await page.fill('#textureImageRgbBValue', '100');
  await page.waitForFunction(() => {
    const value = textureImageEditorUi.getState().rgbAdjustment;
    return value.r === 50 && value.g === 150 && value.b === 100;
  });
  await page.waitForTimeout(220);

  const adjusted = await readPixel(page, source);
  const expected = [
    Math.min(255, Math.round(source.rgba[0] * 0.5)),
    Math.min(255, Math.round(source.rgba[1] * 1.5)),
    source.rgba[2],
    source.rgba[3]
  ];
  expect(adjusted).toEqual(expected);

  await page.click('#textureImageCancelBtn');
  await page.waitForFunction(() => document.getElementById('textureImageEditorModal').style.display === 'none');
  expect(await readPixel(page, source)).toEqual(source.rgba);
  expect(errors).toEqual([]);
});

test('RGB 调整支持撤销、重做和保存后恢复参数', async ({ page }) => {
  const errors = await boot(page);
  await selectKeyImage(page);

  const source = await readOpaquePixel(page);
  await page.fill('#textureImageRgbRValue', '40');
  await page.waitForFunction(() => textureImageEditorUi.getState().rgbAdjustment.r === 40);
  await page.waitForTimeout(220);
  const adjusted = await readPixel(page, source);
  expect(adjusted).not.toEqual(source.rgba);

  await page.click('#textureImageUndoBtn');
  await page.waitForFunction(() => textureImageEditorUi.getState().rgbAdjustment.r === 100);
  expect(await readPixel(page, source)).toEqual(source.rgba);

  await page.click('#textureImageRedoBtn');
  await page.waitForFunction(() => textureImageEditorUi.getState().rgbAdjustment.r === 40);
  await page.waitForTimeout(180);
  expect(await readPixel(page, source)).toEqual(adjusted);

  await page.click('#textureImageApplyBtn');
  const scopeModal = page.locator('#textureImageApplyScopeModal');
  if (await scopeModal.isVisible({ timeout: 1000 }).catch(() => false)) {
    await page.click('#textureImageApplyScopeCurrentBtn');
  }
  await page.waitForFunction(() => textureImageEditorUi.getState().dirtyTabCount === 0);

  await page.click('.texture-image-tab[data-tab-id="menu"]');
  await page.click('.texture-image-tab[data-param-key="KeyImage0"]');
  await page.waitForFunction(() => textureImageEditorUi.getState().selectedKey === 'KeyImage0');
  const restored = await page.evaluate(() => textureImageEditorUi.getState().rgbAdjustment);
  expect(restored).toEqual({ r: 40, g: 100, b: 100 });
  expect(errors).toEqual([]);
});

test('RGB 调整后执行拉伸修复不会重复叠加颜色', async ({ page }) => {
  const errors = await boot(page);
  await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgb(180, 120, 60)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    saveSkinAssetToStore(skinImageStore, 'rgb_test_key', canvas, false, true, true);
    const cfg = getManiaConfigForKeys(getActiveKeyCount());
    if (!cfg.ImageLookups) cfg.ImageLookups = new Map();
    cfg.KeyImage0 = 'rgb_test_key';
    cfg.ImageLookups.set('KeyImage0', 'rgb_test_key');
    cfg.ImageLookups.set('keyimage0', 'rgb_test_key');
  });
  await selectKeyImage(page);

  const source = await readOpaquePixel(page);
  expect(source.rgba).toEqual([180, 120, 60, 255]);
  const beforeSize = await page.evaluate(() => textureImageEditorUi.getState().previewSize);

  await page.fill('#textureImageRgbGValue', '50');
  await page.waitForFunction(() => textureImageEditorUi.getState().rgbAdjustment.g === 50);
  await page.waitForTimeout(220);
  const adjusted = await readPixel(page, source);

  await page.click('#textureImageStretchFixBtn');
  await page.waitForFunction(() => textureImageEditorUi.getState().dirtyTabCount > 0);
  await page.waitForTimeout(220);

  const afterSize = await page.evaluate(() => textureImageEditorUi.getState().previewSize);
  const afterStretchFix = await readPixel(page, {
    x: Math.min(afterSize.width - 1, Math.round(source.x * afterSize.width / beforeSize.width)),
    y: Math.min(afterSize.height - 1, Math.round(source.y * afterSize.height / beforeSize.height))
  });
  expect(adjusted[0]).toBe(source.rgba[0]);
  expect(adjusted[1]).toBe(Math.round(source.rgba[1] * 0.5));
  expect(adjusted[2]).toBe(source.rgba[2]);
  expect(afterStretchFix).toEqual(adjusted);
  expect(await page.evaluate(() => textureImageEditorUi.getState().rgbAdjustment.g)).toBe(50);
  expect(errors).toEqual([]);
});

test('贴图编辑拖动条沿用 skin.ini 的滑杆样式', async ({ page }) => {
  const errors = await boot(page);
  await selectKeyImage(page);

  const initial = await page.evaluate(() => {
    const read = (id) => {
      const input = document.getElementById(id);
      const style = getComputedStyle(input);
      return {
        height: style.height,
        appearance: style.appearance,
        backgroundImage: style.backgroundImage,
        progress: input.style.getPropertyValue('--slider-pct')
      };
    };
    return {
      preview: read('textureImagePreviewZoom'),
      red: read('textureImageRgbR')
    };
  });

  expect(initial.preview.height).toBe('4px');
  expect(initial.preview.appearance).toBe('none');
  expect(initial.preview.backgroundImage).toContain('linear-gradient');
  expect(initial.red.height).toBe('4px');
  expect(initial.red.appearance).toBe('none');
  expect(Number.parseFloat(initial.red.progress)).toBe(50);

  await page.fill('#textureImageRgbRValue', '25');
  await page.waitForFunction(() => textureImageEditorUi.getState().rgbAdjustment.r === 25);
  const redProgress = await page.evaluate(
    () => document.getElementById('textureImageRgbR').style.getPropertyValue('--slider-pct')
  );
  expect(Number.parseFloat(redProgress)).toBe(12.5);
  expect(errors).toEqual([]);
});

test('RGB 拖动条在鼠标释放前实时更新已覆盖轨道颜色', async ({ page }) => {
  const errors = await boot(page);
  await selectKeyImage(page);

  await page.evaluate(() => {
    const range = document.getElementById('textureImageRgbR');
    range.value = '50';
    range.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForFunction(() => textureImageEditorUi.getState().rgbAdjustment.r === 50);

  const duringDrag = await page.evaluate(() => ({
    value: document.getElementById('textureImageRgbR').value,
    number: document.getElementById('textureImageRgbRValue').value,
    progress: document.getElementById('textureImageRgbR').style.getPropertyValue('--slider-pct')
  }));
  expect(duringDrag.value).toBe('50');
  expect(duringDrag.number).toBe('50');
  expect(Number.parseFloat(duringDrag.progress)).toBe(25);

  expect(errors).toEqual([]);
});

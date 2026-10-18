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
  await page.setInputFiles('#oskInput', SKIN);
  await page.waitForFunction(() => isSkinLoading === false && isStartupWorkspaceReady(), null, { timeout: 60000 });
  await page.waitForTimeout(250);
  return errors;
}

async function selectKeyImage(page) {
  await page.click('#openTextureImageEditorBtn');
  await page.waitForFunction(() => {
    const modal = document.getElementById('textureImageEditorModal');
    return modal && modal.classList.contains('active');
  });
  await page.click('#textureImagePickerGrid [data-param-key="KeyImage0"]');
  await page.waitForFunction((key) => textureImageEditorUi.getState().selectedKey === key, 'KeyImage0');
}

test.describe('以原图边界为 0 的四方向裁切与扩边逻辑', () => {
  test('初始状态各方向边界为 0', async ({ page }) => {
    const errors = await boot(page);
    await selectKeyImage(page);

    const left = await page.inputValue('#textureImageCropLeft');
    const right = await page.inputValue('#textureImageCropRight');
    const top = await page.inputValue('#textureImageCropTop');
    const bottom = await page.inputValue('#textureImageCropBottom');

    expect(Number(left)).toBe(0);
    expect(Number(right)).toBe(0);
    expect(Number(top)).toBe(0);
    expect(Number(bottom)).toBe(0);

    const state = await page.evaluate(() => textureImageEditorUi.getState());
    expect(state.cropRect.x).toBe(0);
    expect(state.cropRect.y).toBe(0);
    expect(state.cropRect.width).toBe(state.sourceSize.width);
    expect(state.cropRect.height).toBe(state.sourceSize.height);
    expect(errors).toEqual([]);
  });

  test('各方向输入正数向外扩大，输入负数向内裁剪', async ({ page }) => {
    const errors = await boot(page);
    await selectKeyImage(page);

    const source = await page.evaluate(() => textureImageEditorUi.getState().sourceSize);

    // 左扩 10，右扩 15，上裁 6，下裁 8
    await page.fill('#textureImageCropLeft', '10');
    await page.fill('#textureImageCropRight', '15');
    await page.fill('#textureImageCropTop', '-6');
    await page.fill('#textureImageCropBottom', '-8');

    const expectedWidth = source.width + 10 + 15;
    const expectedHeight = source.height - 6 - 8;

    await page.waitForFunction(({ w, h }) => {
      const preview = textureImageEditorUi.getState().previewSize;
      return preview && preview.width === w && preview.height === h;
    }, { w: expectedWidth, h: expectedHeight });

    const state = await page.evaluate(() => textureImageEditorUi.getState());
    expect(state.cropRect).toEqual({
      x: -10,
      y: 6,
      width: expectedWidth,
      height: expectedHeight
    });
    expect(state.inputValues.left).toBe(10);
    expect(state.inputValues.right).toBe(15);
    expect(state.inputValues.top).toBe(-6);
    expect(state.inputValues.bottom).toBe(-8);
    expect(errors).toEqual([]);
  });

  test('全方向裁剪（输入负数）时截取原图对应区域', async ({ page }) => {
    const errors = await boot(page);
    await selectKeyImage(page);

    const source = await page.evaluate(() => textureImageEditorUi.getState().sourceSize);

    await page.fill('#textureImageCropLeft', '-5');
    await page.fill('#textureImageCropRight', '-7');
    await page.fill('#textureImageCropTop', '-10');
    await page.fill('#textureImageCropBottom', '-12');

    const expectedWidth = source.width - 5 - 7;
    const expectedHeight = source.height - 10 - 12;

    await page.waitForFunction(({ w, h }) => {
      const preview = textureImageEditorUi.getState().previewSize;
      return preview && preview.width === w && preview.height === h;
    }, { w: expectedWidth, h: expectedHeight });

    const state = await page.evaluate(() => textureImageEditorUi.getState());
    expect(state.cropRect).toEqual({
      x: 5,
      y: 10,
      width: expectedWidth,
      height: expectedHeight
    });
    expect(state.inputValues.left).toBe(-5);
    expect(state.inputValues.right).toBe(-7);
    expect(state.inputValues.top).toBe(-10);
    expect(state.inputValues.bottom).toBe(-12);
    expect(errors).toEqual([]);
  });

  test('通过撤销与重做恢复四方向裁剪数值', async ({ page }) => {
    const errors = await boot(page);
    await selectKeyImage(page);

    await page.fill('#textureImageCropLeft', '8');
    await page.waitForTimeout(500);
    await page.fill('#textureImageCropBottom', '12');
    await page.waitForTimeout(500);

    expect(Number(await page.inputValue('#textureImageCropLeft'))).toBe(8);
    expect(Number(await page.inputValue('#textureImageCropBottom'))).toBe(12);

    await page.click('#textureImageUndoBtn');
    await page.waitForTimeout(100);
    expect(Number(await page.inputValue('#textureImageCropBottom'))).toBe(0);
    expect(Number(await page.inputValue('#textureImageCropLeft'))).toBe(8);

    await page.click('#textureImageRedoBtn');
    await page.waitForTimeout(100);
    expect(Number(await page.inputValue('#textureImageCropBottom'))).toBe(12);
    expect(Number(await page.inputValue('#textureImageCropLeft'))).toBe(8);
    expect(errors).toEqual([]);
  });
});

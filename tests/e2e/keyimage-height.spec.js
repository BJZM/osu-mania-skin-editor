const path = require('path');
const { test, expect } = require('@playwright/test');

const ROOT = path.resolve(__dirname, '../..');
const SKIN = path.join(ROOT, 'samples', 'skins', 'Kumakalerki.osk');
const KEY_IMAGE_CONTENT_HEIGHTS = [60, 90, 70, 80];
const KEY_IMAGE_DOWN_CONTENT_HEIGHTS = [50, 75, 65, 55];

async function boot(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof collectKeyImageHeightTarget === 'function');
  await page.setInputFiles('#oskInput', SKIN);
  await page.waitForFunction(() => isSkinLoading === false, null, { timeout: 60000 });
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
    const ratio = img._is2x ? 2 : 1;
    const stableRefW = rawColW * 1.6 * ratio;
    const currentDrawHeight = key.w * img.height / stableRefW;
    const targetDrawHeight = key.w * targetSourceHeight / stableRefW;
    const pxPerLogical = key.w / stableRefW;
    const rect = canvas.getBoundingClientRect();
    const canvasDelta = (targetDrawHeight - currentDrawHeight) / pxPerLogical;
    const cssDelta = canvasDelta * rect.height / canvas.height;
    const cssX = (canvasX) => rect.left + canvasX * rect.width / canvas.width;
    const cssY = (canvasY) => rect.top + canvasY * rect.height / canvas.height;
    return {
      handleX: cssX(key.x + key.w / 2),
      handleY: cssY(key.keyImageResizeEdgeY),
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
    'test-key-1_height_col1.png',
    'test-key-1d_height_col1d.png'
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
    return activeEditorTab === 'textures' &&
      normal && down &&
      normal.classList.contains('highlight-pulse') &&
      down.classList.contains('highlight-pulse');
  });

  const state = await page.evaluate(() => ({
    modalActive: document.getElementById('skinEditorModal').classList.contains('active'),
    highlightedIds: Array.from(document.querySelectorAll('.highlight-pulse')).map((el) => el.id),
    activeTab: activeEditorTab
  }));

  expect(state.modalActive).toBe(true);
  expect(state.activeTab).toBe('textures');
  expect(state.highlightedIds).toEqual(expect.arrayContaining([
    'param-card-KeyImage0',
    'param-card-KeyImage0D'
  ]));
  expect(errors).toEqual([]);
});

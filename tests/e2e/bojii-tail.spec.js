const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');

const ROOT = path.resolve(__dirname, '../..');
const BOJII_ZIP = path.join(ROOT, 'samples', 'skins', 'bojii 3-3-22.zip');

test('bojii skin hold note body end aligns with tail top at its 2:1 head-to-tail ratio', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => console.log('BROWSER:', m.text()));

  await page.goto('/index.html');
  await page.waitForFunction(
    () => typeof drawFrame === 'function' && typeof isSkinLoading !== 'undefined',
    null,
    { timeout: 30000 }
  );

  // Import bojii 3-3-22.zip
  await page.setInputFiles('#oskInput', BOJII_ZIP);
  await page.waitForFunction(() => isSkinLoading === false, null, { timeout: 60000 });
  await page.waitForTimeout(500);

  // Switch to 4K and inspect the preview hold note on column 1
  const info = await page.evaluate(() => {
    canvasEditMode = true;
    currentManiaKeys = 4;
    drawFrame();

    const headEl = canvasInteractiveElements.find(item => item.id === 'hold_head_1');
    const bodyEl = canvasInteractiveElements.find(item => item.id === 'hold_body_1');
    const tailEl = canvasInteractiveElements.find(item => item.id === 'hold_tail_1');

    return {
      headEl,
      bodyEl,
      tailEl
    };
  });

  expect(info.headEl).not.toBeNull();
  expect(info.bodyEl).not.toBeNull();
  expect(info.tailEl).not.toBeNull();

  // Bojii 的尾图高度是头图的一半，因此稳定的身体远端恰好与尾巴顶端重合。
  expect(info.bodyEl.y).toBeCloseTo(info.tailEl.y, 1);

  const headBottom = info.headEl.y + info.headEl.h;
  const tailBottom = info.tailEl.y + info.tailEl.h;
  expect(info.bodyEl.h).toBeCloseTo(headBottom - tailBottom, 1);

  expect(errors).toEqual([]);
});


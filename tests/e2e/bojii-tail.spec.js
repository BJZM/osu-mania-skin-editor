const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');

const ROOT = path.resolve(__dirname, '../..');
const BOJII_ZIP = path.join(ROOT, 'samples', 'skins', 'bojii 3-3-22.zip');

test('bojii skin hold note body extends smoothly to tailTopY without mid-tail cut seam', async ({ page }) => {
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

    const bodyEl = canvasInteractiveElements.find(item => item.id === 'hold_body_1');
    const tailEl = canvasInteractiveElements.find(item => item.id === 'hold_tail_1');

    return {
      bodyEl,
      tailEl
    };
  });

  expect(info.bodyEl).not.toBeNull();
  expect(info.tailEl).not.toBeNull();

  // bodyEl top (y) should match tailEl top (y) exactly!
  // Before fix: bodyEl.y was tailCenterY, which was tailEl.y + tailEl.h / 2
  // With fix: bodyEl.y is tailTopY, which matches tailEl.y!
  expect(info.bodyEl.y).toBeCloseTo(info.tailEl.y, 1);

  expect(errors).toEqual([]);
});


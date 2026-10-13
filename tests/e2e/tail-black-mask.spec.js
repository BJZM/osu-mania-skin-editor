const path = require('path');
const { test, expect } = require('@playwright/test');

const GYOO_SKIN = path.resolve(__dirname, '../../samples/skins/Gyoo.osk');

test('skin.ini tail aliases keep their black mask pixels opaque', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/index.html');
  await page.waitForFunction(
    () => typeof processSkinImage === 'function' && typeof skinImageStore !== 'undefined',
    null,
    { timeout: 30000 }
  );

  await page.setInputFiles('#oskInput', GYOO_SKIN);
  await page.waitForFunction(() => isSkinLoading === false, null, { timeout: 60000 });

  const pixel = await page.evaluate(() => {
    const entry = skinImageStore.get('arrows/noteh');
    const img = entry && (entry.static1x || entry.static2x);
    if (!img) return null;

    const probe = document.createElement('canvas');
    probe.width = img.width;
    probe.height = img.height;
    const ctx = probe.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(1, 1, 1, 1).data;
    return {
      width: img.width,
      height: img.height,
      r: data[0],
      g: data[1],
      b: data[2],
      a: data[3]
    };
  });

  expect(pixel).not.toBeNull();
  expect(pixel.width).toBe(128);
  expect(pixel.height).toBe(66);
  expect(pixel.r).toBeLessThan(12);
  expect(pixel.g).toBeLessThan(12);
  expect(pixel.b).toBeLessThan(12);
  expect(pixel.a).toBe(255);
  expect(errors).toEqual([]);
});

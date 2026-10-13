const path = require('path');
const { test, expect } = require('@playwright/test');

const ROOT = path.resolve(__dirname, '../..');
const BEATMAP = path.join(ROOT, 'samples', 'beatmaps', '1790742 MIMI - Kuu ni Naru.osz');

test.use({
  userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  viewport: { width: 820, height: 1180 },
  hasTouch: true,
  isMobile: true
});

test('iPadOS 文件输入允许选择 .osz 并按扩展名校验', async ({ page }) => {
  await page.goto('/index.html');
  await page.waitForFunction(
    () => typeof drawFrame === 'function' && typeof focusParameter === 'function',
    null,
    { timeout: 30000 }
  );

  await expect(page.locator('#oszInput')).toHaveAttribute('accept', '*/*');
  await expect(page.locator('#oskInput')).toHaveAttribute('accept', '*/*');

  await page.setInputFiles('#oszInput', {
    name: 'not-a-beatmap.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('not a beatmap')
  });
  await expect(page.locator('#toastContainer')).toContainText('请选择 .osz、.zip 或 .osu 文件');

  await page.setInputFiles('#oszInput', BEATMAP);
  await page.waitForFunction(() => beatmaps.length > 0, null, { timeout: 60000 });
});

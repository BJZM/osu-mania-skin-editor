const { test, expect } = require('@playwright/test');

test('关于弹窗展示版本、版权与第三方许可', async ({ page }) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof window.APP_INFO !== 'undefined');

  await expect(page.locator('#aboutModal')).toBeHidden();

  await page.click('#topAboutBtn');
  await expect(page.locator('#aboutModal')).toBeVisible();
  await expect(page.locator('#aboutAppVersion')).toHaveText('0.2.0');
  await expect(page.locator('#aboutModal')).toContainText('MIT');
  await expect(page.locator('#aboutModal')).toContainText('ppy Pty Ltd');
  await expect(page.locator('#aboutModal')).toContainText('JSZip');
  await expect(page.locator('#aboutModal')).toContainText('UTIF.js');
  await expect(page.locator('#aboutModal')).toContainText('Feather Icons');
  await expect(page.locator('#aboutModal')).toContainText('FFmpeg 8.1 LGPL shared');
  await expect(page.locator('#aboutModal')).toContainText('LGPL-3.0');
  await expect(page.locator('#aboutModal')).toContainText('CC BY-NC');

  await page.click('#aboutModalConfirmBtn');
  await expect(page.locator('#aboutModal')).toBeHidden();

  await page.click('#topAboutBtn');
  await expect(page.locator('#aboutModal')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#aboutModal')).toBeHidden();
});

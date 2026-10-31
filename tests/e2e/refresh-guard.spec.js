const path = require('path');
const { test, expect } = require('@playwright/test');

const ROOT = path.resolve(__dirname, '../..');
const SKIN = path.join(ROOT, 'samples', 'skins', 'Kumakalerki.osk');
const REFRESH_WARNING = '刷新之后所有的未导出改动将全部丢失，是否继续刷新？';

async function boot(page) {
  await page.goto('/index.html');
  await page.waitForFunction(() => (
    typeof isStartupSkinReady === 'function' &&
    typeof initSkinEditorShortcutsUI === 'function'
  ));
}

test('导入皮肤后按 F5 会先提示，取消时保留当前工作区', async ({ page }) => {
  await boot(page);
  await page.setInputFiles('#oskInput', SKIN);
  await page.waitForFunction(() => isStartupSkinReady(), null, { timeout: 60000 });

  await page.evaluate(() => {
    window.__refreshGuardStillLoaded = true;
  });

  const messagePromise = new Promise((resolve) => {
    page.once('dialog', async (dialog) => {
      const message = dialog.message();
      await dialog.dismiss();
      resolve(message);
    });
  });
  await page.keyboard.press('F5');

  await expect(messagePromise).resolves.toBe(REFRESH_WARNING);
  await expect.poll(() => page.evaluate(() => window.__refreshGuardStillLoaded)).toBe(true);
  await expect.poll(() => page.evaluate(() => isStartupSkinReady())).toBe(true);
});

test('导入皮肤后按 F5 确认才会刷新页面', async ({ page }) => {
  await boot(page);
  await page.setInputFiles('#oskInput', SKIN);
  await page.waitForFunction(() => isStartupSkinReady(), null, { timeout: 60000 });

  await page.evaluate(() => {
    window.__refreshGuardBeforeReload = true;
  });

  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toBe(REFRESH_WARNING);
    await dialog.accept();
  });

  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
    page.keyboard.press('F5')
  ]);

  expect(await page.evaluate(() => window.__refreshGuardBeforeReload)).toBeUndefined();
  await page.waitForFunction(() => typeof isStartupSkinReady === 'function');
  expect(await page.evaluate(() => isStartupSkinReady())).toBe(false);
});

test('没有皮肤时按 F5 保持浏览器默认刷新且不弹提示', async ({ page }) => {
  await boot(page);

  let unexpectedDialog = '';
  page.on('dialog', async (dialog) => {
    unexpectedDialog = dialog.message();
    await dialog.dismiss();
  });

  const defaultPrevented = await page.evaluate(() => {
    const event = new KeyboardEvent('keydown', {
      key: 'F5',
      code: 'F5',
      bubbles: true,
      cancelable: true
    });
    document.dispatchEvent(event);
    return event.defaultPrevented;
  });

  expect(defaultPrevented).toBe(false);
  expect(unexpectedDialog).toBe('');
  expect(await page.evaluate(() => isStartupSkinReady())).toBe(false);
});

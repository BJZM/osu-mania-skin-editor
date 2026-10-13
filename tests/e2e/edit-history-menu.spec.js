const { test, expect } = require('@playwright/test');

test('顶部编辑菜单集中展示重做、撤回与恢复初始', async ({ page }) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof performSkinRedo === 'function');

  await expect(page.locator('#editMenu')).toBeHidden();
  await page.click('#editMenuBtn');

  const menu = page.locator('#editMenu');
  await expect(menu).toBeVisible();
  await expect(menu.locator('.dropdown-item .title')).toHaveText([
    '重做',
    '撤回',
    '恢复初始'
  ]);
  await expect(page.locator('#canvasRedoBtn')).toBeDisabled();
  await expect(page.locator('#canvasUndoBtn')).toBeDisabled();
  await expect(page.locator('#sidebarRevertSkinBtn')).toBeEnabled();

  await page.click('#exportSkinBtn');
  await expect(menu).toBeHidden();
  await expect(page.locator('#exportMenu')).toBeVisible();
});

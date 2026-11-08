const { test, expect } = require('@playwright/test');

async function boot(page) {
  await page.goto('/index.html');
  await page.waitForFunction(() => (
    window.skinWorkspaceRevision &&
    typeof recordSkinUndoBeforeChange === 'function' &&
    typeof performSkinUndo === 'function' &&
    typeof performSkinRedo === 'function' &&
    isDefaultSkinLoaded === true
  ));
}

test('操作、撤回和导出会更新未导出状态', async ({ page }) => {
  await boot(page);

  const before = await page.evaluate(() => window.skinWorkspaceRevision.hasUnexportedOperations());
  expect(before).toBe(false);

  await page.evaluate(() => {
    recordSkinUndoBeforeChange('测试未导出操作', { force: true });
    currentSkinMetadata.general.Name = '未导出测试';
  });
  await expect.poll(() => page.evaluate(() => window.skinWorkspaceRevision.hasUnexportedOperations())).toBe(true);

  await page.evaluate(() => performSkinUndo());
  await expect.poll(() => page.evaluate(() => window.skinWorkspaceRevision.hasUnexportedOperations())).toBe(false);

  await page.evaluate(() => performSkinRedo());
  await expect.poll(() => page.evaluate(() => window.skinWorkspaceRevision.hasUnexportedOperations())).toBe(true);

  await page.evaluate(() => window.skinWorkspaceRevision.markExported());
  await expect.poll(() => page.evaluate(() => window.skinWorkspaceRevision.hasUnexportedOperations())).toBe(false);

  await page.evaluate(() => {
    recordSkinUndoBeforeChange('导出后的新操作', { force: true });
  });
  await expect.poll(() => page.evaluate(() => window.skinWorkspaceRevision.hasUnexportedOperations())).toBe(true);
});

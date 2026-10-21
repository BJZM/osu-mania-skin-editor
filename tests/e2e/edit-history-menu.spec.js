const { test, expect } = require('@playwright/test');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const MINIMAL_BEATMAP = path.join(ROOT, 'samples', 'beatmaps', 'minimal-4k.osu');

test('顶部菜单按文件、难度与操作、其他分组，判定演示位于播放栏', async ({ page }) => {
  await page.goto('/index.html');
  await page.waitForFunction(
    () => typeof performSkinRedo === 'function' && typeof startFromDefaultSkin === 'function'
  );

  const topbarButtonOrder = await page.locator('#canvasTopBar .tool-btn').evaluateAll(
    buttons => buttons.map(button => button.id)
  );
  expect(topbarButtonOrder).toEqual([
    'fileMenuBtn',
    'diffSelectBtn',
    'canvasUndoBtn',
    'canvasRedoBtn',
    'openSkinEditorBtn',
    'openTextureImageEditorBtn',
    'exportSkinBtn',
    'otherMenuBtn'
  ]);

  await page.setInputFiles('#oszInput', MINIMAL_BEATMAP);
  await page.waitForFunction(
    () => Array.isArray(beatmaps) && beatmaps.length > 0,
    null,
    { timeout: 30000 }
  );

  await expect(page.locator('#fileMenu')).toBeHidden();
  await page.click('#fileMenuBtn');
  await expect(page.locator('#fileMenu')).toBeVisible();
  await expect(page.locator('#fileMenu .dropdown-item .title')).toHaveText([
    '导入皮肤',
    '导入谱面',
    '从默认皮肤开始'
  ]);

  await page.click('#diffSelectBtn');
  await expect(page.locator('#fileMenu')).toBeHidden();
  await expect(page.locator('#diffMenu')).toBeVisible();

  await page.click('#exportSkinBtn');
  await expect(page.locator('#diffMenu')).toBeHidden();
  await expect(page.locator('#exportMenu')).toBeVisible();

  await page.click('#otherMenuBtn');
  await expect(page.locator('#exportMenu')).toBeHidden();
  await expect(page.locator('#otherMenu')).toBeVisible();
  await expect(page.locator('#otherMenu .dropdown-item .title')).toHaveText([
    '恢复初始状态',
    '帮助',
    '关于',
    '界面语言 / Language'
  ]);
  await expect(page.locator('#otherMenu [data-language-select]')).toHaveValue('zh-CN');
  await expect(page.locator('#sidebarRevertSkinBtn')).toHaveClass(/is-danger/);
  await expect(page.locator('#canvasRedoBtn')).toBeDisabled();
  await expect(page.locator('#canvasUndoBtn')).toBeDisabled();
  await expect(page.locator('#sidebarRevertSkinBtn')).toBeEnabled();

  await expect(page.locator('#playerControls #previewJudgementToggle')).toHaveCount(1);
  await expect(page.locator('#canvasEditModeToggle')).toHaveCount(0);
});

test('从默认皮肤开始会清空当前皮肤并恢复可编辑默认工作区', async ({ page }) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof startFromDefaultSkin === 'function');

  await page.evaluate(() => {
    currentSkinZip = { fake: true };
    currentSkinFileName = 'ImportedSkin';
    editableDefaultSkinWorkspaceActive = false;
  });

  await page.click('#fileMenuBtn');
  let dialogMessage = '';
  page.once('dialog', async dialog => {
    dialogMessage = dialog.message();
    await dialog.accept();
  });
  await page.click('#useDefaultSkinBtn');
  expect(dialogMessage).toContain('从 osu!stable 默认皮肤重新开始');

  await page.waitForFunction(
    () => currentSkinZip === null && isEditableDefaultSkinWorkspaceActive()
  );

  const state = await page.evaluate(() => ({
    skinName: currentSkinFileName,
    active: isEditableDefaultSkinWorkspaceActive(),
    keys: Array.from(maniaSkinConfigurations.keys()).sort((a, b) => a - b)
  }));
  expect(state.skinName).toBe('默认皮肤');
  expect(state.active).toBe(true);
  expect(state.keys).toContain(4);
});

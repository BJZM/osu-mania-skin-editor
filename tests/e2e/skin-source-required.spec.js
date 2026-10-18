const path = require('path');
const { test, expect } = require('@playwright/test');

const ROOT = path.resolve(__dirname, '../..');
const SKIN = path.join(ROOT, 'samples', 'skins', 'Kumakalerki.osk');
const BEATMAP = path.join(ROOT, 'samples', 'beatmaps', '1790742 MIMI - Kuu ni Naru.osz');

async function boot(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  await page.goto('/index.html');
  await page.waitForFunction(() => (
    typeof openSkinEditorDialogFromToolbar === 'function' &&
    typeof isSkinEditingWorkspaceReady === 'function' &&
    typeof isStartupWorkspaceReady === 'function' &&
    typeof textureImageEditorUi === 'object' &&
    textureImageEditorUi !== null
  ));
  return errors;
}

async function importBeatmap(page) {
  await page.setInputFiles('#oszInput', BEATMAP);
  await page.waitForFunction(
    () => isStartupBeatmapReady() && beatmaps.length > 0,
    null,
    { timeout: 60000 }
  );
}

async function importSkin(page) {
  await page.setInputFiles('#oskInput', SKIN);
  await page.waitForFunction(() => isStartupSkinReady(), null, { timeout: 60000 });
}

test('仅导入谱面时等待皮肤，补齐后解锁编辑与播放', async ({ page }) => {
  const errors = await boot(page);

  await page.click('#openSkinEditorBtn');
  await expect(page.locator('#skinEditorSkinRequired .skin-source-required-title'))
    .toHaveText('请导入谱面和皮肤');
  await expect(page.locator('#skinEditorSkinRequired [data-startup-required-action="beatmap"]')).toBeVisible();
  await expect(page.locator('#skinEditorSkinRequired [data-skin-source-action="import"]')).toBeVisible();
  await page.click('#closeSkinEditorBtn');

  await importBeatmap(page);
  expect(await page.evaluate(() => ({
    panelVisible: !document.getElementById('startupActions').hidden,
    beatmapReady: isStartupBeatmapReady(),
    skinReady: isStartupSkinReady(),
    workspaceReady: isStartupWorkspaceReady(),
    playerDisabled: document.getElementById('playerControls').classList.contains('disabled')
  }))).toEqual({
    panelVisible: true,
    beatmapReady: true,
    skinReady: false,
    workspaceReady: false,
    playerDisabled: true
  });
  await expect(page.locator('#startupBeatmapDesc')).toContainText('等待导入皮肤');

  await page.click('#openSkinEditorBtn');
  await expect(page.locator('#skinEditorSkinRequired .skin-source-required-title')).toHaveText('请导入皮肤');
  await expect(page.locator('#skinEditorSkinRequired [data-startup-required-action="beatmap"]')).toBeHidden();
  await expect(page.locator('#skinEditorSkinRequired [data-skin-source-action="import"]')).toBeVisible();
  await expect(page.locator('#skinEditorSkinRequired [data-skin-source-action="default"]')).toBeVisible();
  await expect(page.locator('#paramListContainer')).toBeHidden();
  await page.click('#closeSkinEditorBtn');

  await page.click('#openTextureImageEditorBtn');
  await expect(page.locator('#textureImageSkinRequired .skin-source-required-title')).toHaveText('请导入皮肤');
  await page.evaluate(() => textureImageEditorUi.close());

  await importSkin(page);
  await page.waitForFunction(() => isSkinEditingWorkspaceReady());
  expect(await page.evaluate(() => ({
    panelHidden: document.getElementById('startupActions').hidden,
    canPlay: canPlayWithStartupSelection(),
    playerDisabled: document.getElementById('playerControls').classList.contains('disabled')
  }))).toEqual({
    panelHidden: true,
    canPlay: true,
    playerDisabled: false
  });

  await page.click('#openSkinEditorBtn');
  await expect(page.locator('#skinEditorSkinRequired')).toBeHidden();
  await expect(page.locator('#paramListContainer .param-card').first()).toBeVisible();
  await page.click('#closeSkinEditorBtn');

  await page.click('#openTextureImageEditorBtn');
  await expect(page.locator('#textureImageSkinRequired')).toBeHidden();
  await expect(page.locator('#textureImagePickerView')).toBeVisible();

  expect(errors).toEqual([]);
});

test('仅导入皮肤时等待谱面，补齐后解锁编辑与播放', async ({ page }) => {
  const errors = await boot(page);

  await importSkin(page);
  expect(await page.evaluate(() => ({
    panelVisible: !document.getElementById('startupActions').hidden,
    beatmapReady: isStartupBeatmapReady(),
    skinReady: isStartupSkinReady(),
    workspaceReady: isStartupWorkspaceReady(),
    playerDisabled: document.getElementById('playerControls').classList.contains('disabled')
  }))).toEqual({
    panelVisible: true,
    beatmapReady: false,
    skinReady: true,
    workspaceReady: false,
    playerDisabled: true
  });
  await expect(page.locator('#startupSkinDesc')).toContainText('等待导入谱面');

  await page.click('#openSkinEditorBtn');
  await expect(page.locator('#skinEditorSkinRequired .skin-source-required-title')).toHaveText('请导入谱面');
  await expect(page.locator('#skinEditorSkinRequired [data-startup-required-action="beatmap"]')).toBeVisible();
  await expect(page.locator('#skinEditorSkinRequired [data-skin-source-action="import"]')).toBeHidden();
  await expect(page.locator('#skinEditorSkinRequired [data-skin-source-action="default"]')).toBeHidden();
  await page.click('#closeSkinEditorBtn');

  await page.click('#openTextureImageEditorBtn');
  await expect(page.locator('#textureImageSkinRequired .skin-source-required-title')).toHaveText('请导入谱面');
  await expect(page.locator('#textureImageSkinRequired [data-startup-required-action="beatmap"]')).toBeVisible();
  await page.evaluate(() => textureImageEditorUi.close());

  await importBeatmap(page);
  await page.waitForFunction(() => isSkinEditingWorkspaceReady());
  expect(await page.evaluate(() => ({
    panelHidden: document.getElementById('startupActions').hidden,
    canPlay: canPlayWithStartupSelection(),
    playerDisabled: document.getElementById('playerControls').classList.contains('disabled')
  }))).toEqual({
    panelHidden: true,
    canPlay: true,
    playerDisabled: false
  });

  await page.click('#openSkinEditorBtn');
  await expect(page.locator('#skinEditorSkinRequired')).toBeHidden();
  await expect(page.locator('#paramListContainer .param-card').first()).toBeVisible();

  expect(errors).toEqual([]);
});

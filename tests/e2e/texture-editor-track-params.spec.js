const path = require('path');
const { test, expect } = require('@playwright/test');

const ROOT = path.resolve(__dirname, '../..');
const MINIMAL_BEATMAP = path.join(ROOT, 'samples', 'beatmaps', 'minimal-4k.osu');

async function boot(page) {
  await page.goto('/index.html');
  await page.waitForFunction(
    () => typeof triggerTextureUpload === 'function' && typeof userReplacedTextures !== 'undefined',
    null,
    { timeout: 30000 }
  );
  await page.setInputFiles('#oszInput', MINIMAL_BEATMAP);
  await page.waitForFunction(
    () => isStartupBeatmapReady() && beatmaps.length > 0,
    null,
    { timeout: 60000 }
  );
  await page.click('#startupUseDefaultSkinBtn');
  await page.waitForFunction(() => isStartupWorkspaceReady(), null, { timeout: 60000 });
}

test('打开贴图编辑与导入窗口后在画布调整轨道参数，关闭窗口后调整不复原且支持撤回重做', async ({ page }) => {
  await boot(page);

  // 1. 记录初始轨道宽度
  const initialWidth = await page.evaluate(() => {
    const cfg = getManiaConfigForKeys(getActiveKeyCount());
    return cfg.ColumnWidth ? cfg.ColumnWidth[0] : 30;
  });

  // 2. 打开贴图编辑与导入窗口
  await page.evaluate(() => {
    if (typeof openTextureImageEditor === 'function') {
      openTextureImageEditor();
    } else {
      const btn = document.getElementById('openTextureImageEditorBtn') || document.getElementById('textureImageEditorBtn');
      if (btn) btn.click();
    }
  });

  const modal = page.locator('#textureImageEditorModal');
  await expect(modal).toBeVisible();

  // 3. 在贴图窗口打开期间，在画布/运行时调整轨道参数（例如将第 1 轨宽度由 30 改为 55）
  await page.evaluate(() => {
    const keys = getActiveKeyCount();
    const cfg = getManiaConfigForKeys(keys);
    if (!Array.isArray(cfg.ColumnWidth)) {
      cfg.ColumnWidth = new Array(keys).fill(30);
    }
    recordSkinUndoBeforeChange('画布调整: 第 1 轨宽度');
    cfg.ColumnWidth[0] = 55;
    syncColumnRightFromLayout(cfg, keys);
    drawFrame();
    syncParamInputValue('ColumnWidth', cfg.ColumnWidth);
    if (typeof syncTextureEditorNonTextureSettings === 'function') {
      syncTextureEditorNonTextureSettings();
    }
  });

  const changedWidth = await page.evaluate(() => {
    const cfg = getManiaConfigForKeys(getActiveKeyCount());
    return cfg.ColumnWidth[0];
  });
  expect(changedWidth).toBe(55);

  // 4. 关闭贴图编辑与导入窗口
  await page.click('#textureImageEditorCloseBtn');
  await expect(modal).toBeHidden();

  // 5. 验证关闭窗口后，轨道参数依然保持调整后的 55，绝不复原
  const widthAfterClose = await page.evaluate(() => {
    const cfg = getManiaConfigForKeys(getActiveKeyCount());
    return cfg.ColumnWidth[0];
  });
  expect(widthAfterClose).toBe(55);

  // 6. 验证撤回/重做链路正常
  await page.evaluate(() => {
    if (typeof performSkinUndo === 'function') performSkinUndo();
  });
  const widthAfterUndo = await page.evaluate(() => {
    const cfg = getManiaConfigForKeys(getActiveKeyCount());
    return cfg.ColumnWidth[0];
  });
  expect(widthAfterUndo).toBe(initialWidth);

  await page.evaluate(() => {
    if (typeof performSkinRedo === 'function') performSkinRedo();
  });
  const widthAfterRedo = await page.evaluate(() => {
    const cfg = getManiaConfigForKeys(getActiveKeyCount());
    return cfg.ColumnWidth[0];
  });
  expect(widthAfterRedo).toBe(55);
});

test('贴图编辑窗口打开并处于未保存编辑状态时调整轨道参数，丢弃贴图修改关闭后轨道参数依然保留', async ({ page }) => {
  await boot(page);

  // 1. 打开贴图编辑与导入窗口
  await page.evaluate(() => {
    if (typeof openTextureImageEditor === 'function') {
      openTextureImageEditor();
    } else {
      const btn = document.getElementById('openTextureImageEditorBtn') || document.getElementById('textureImageEditorBtn');
      if (btn) btn.click();
    }
  });

  const modal = page.locator('#textureImageEditorModal');
  await expect(modal).toBeVisible();

  // 2. 选择一个贴图进入编辑（产生 dirty 状态）
  await page.evaluate(() => {
    const p = getTextureTabParams().find((item) => item.key === 'KeyImage0');
    if (p) {
      const target = buildEditorTarget(p);
      if (target) selectTarget(target);
    }
  });

  // 模拟对贴图产生未保存的滤镜修改（dirty）
  await page.evaluate(() => {
    const activeTab = getActiveTab();
    if (activeTab && activeTab.state) {
      beginEditorHistory('调整色相', { group: 'rgb' });
      activeTab.state.rgbAdjustment = { r: 100, g: -50, b: -50 };
      commitEditorHistory();
      refreshLivePreview();
    }
  });

  // 3. 在画布中调整轨道参数（ColumnStart 由 136 改为 160）
  await page.evaluate(() => {
    const keys = getActiveKeyCount();
    const cfg = getManiaConfigForKeys(keys);
    recordSkinUndoBeforeChange('画布调整: ColumnStart');
    cfg.ColumnStart = 160;
    syncColumnRightFromLayout(cfg, keys);
    drawFrame();
    syncParamInputValue('ColumnStart', cfg.ColumnStart);
    if (typeof syncTextureEditorNonTextureSettings === 'function') {
      syncTextureEditorNonTextureSettings();
    }
  });

  // 4. 点击关闭，弹窗选择“放弃修改”
  await page.click('#textureImageEditorCloseBtn');
  const unsavedModal = page.locator('#textureImageUnsavedModal');
  await expect(unsavedModal).toBeVisible();
  await page.click('#textureImageUnsavedDiscardBtn');
  await expect(modal).toBeHidden();

  // 5. 验证：ColumnStart 依然保持 160，未被复原
  const columnStartAfterDiscard = await page.evaluate(() => {
    const cfg = getManiaConfigForKeys(getActiveKeyCount());
    return cfg.ColumnStart;
  });
  expect(columnStartAfterDiscard).toBe(160);
});

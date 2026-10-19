const path = require('path');
const { test, expect } = require('@playwright/test');

const ROOT = path.resolve(__dirname, '../..');
const BEATMAP = path.join(ROOT, 'samples', 'beatmaps', '1790742 MIMI - Kuu ni Naru.osz');

async function boot(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type === 'error') errors.push(`console: ${message.text()}`);
  });
  await page.goto('/index.html');
  await page.setInputFiles('#oszInput', BEATMAP);
  await page.waitForFunction(() => isStartupBeatmapReady() && beatmaps.length > 0, null, { timeout: 30000 });
  await page.click('#startupUseDefaultSkinBtn');
  await page.waitForFunction(() => isStartupWorkspaceReady(), null, { timeout: 30000 });
  await page.waitForTimeout(200);
  return errors;
}

test.describe('详细设置弹窗与贴图编辑导入弹窗共存验证', () => {
  test('详细设置打开时打开贴图编辑弹窗，两者同时保持打开共存', async ({ page }) => {
    const errors = await boot(page);

    // 1. 打开详细设置
    await page.click('#openSkinEditorBtn');
    await page.waitForFunction(() => document.getElementById('skinEditorModal').classList.contains('active'));

    // 2. 详细设置已打开，再点击打开贴图编辑
    await page.click('#openTextureImageEditorBtn');
    await page.waitForFunction(() => document.getElementById('textureImageEditorModal').classList.contains('active'));

    // 3. 验证两者同时保持 active，且贴图编辑弹窗处于更前台层级
    const state = await page.evaluate(() => {
      const skinModal = document.getElementById('skinEditorModal');
      const textureModal = document.getElementById('textureImageEditorModal');
      return {
        skinActive: skinModal.classList.contains('active'),
        textureActive: textureModal.classList.contains('active'),
        skinZ: parseInt(skinModal.style.zIndex || getComputedStyle(skinModal).zIndex, 10),
        textureZ: parseInt(textureModal.style.zIndex || getComputedStyle(textureModal).zIndex, 10),
        activeWindow: activeFloatingWindow
      };
    });

    expect(state.skinActive).toBe(true);
    expect(state.textureActive).toBe(true);
    expect(state.textureZ).toBeGreaterThan(state.skinZ);
    expect(state.activeWindow).toBe('texture-editor');
    expect(errors).toEqual([]);
  });

  test('点击详细设置弹窗可将其置顶于贴图编辑弹窗之上，点击贴图编辑弹窗又可切回置顶', async ({ page }) => {
    const errors = await boot(page);

    // 打开两个弹窗
    await page.click('#openSkinEditorBtn');
    await page.waitForFunction(() => document.getElementById('skinEditorModal').classList.contains('active'));
    await page.click('#openTextureImageEditorBtn');
    await page.waitForFunction(() => document.getElementById('textureImageEditorModal').classList.contains('active'));

    // 1. 通过工具栏按钮置顶详细设置
    await page.click('#openSkinEditorBtn');
    await page.waitForTimeout(100);

    let state = await page.evaluate(() => {
      const skinModal = document.getElementById('skinEditorModal');
      const textureModal = document.getElementById('textureImageEditorModal');
      return {
        skinActive: skinModal.classList.contains('active'),
        textureActive: textureModal.classList.contains('active'),
        skinZ: parseInt(skinModal.style.zIndex || getComputedStyle(skinModal).zIndex, 10),
        textureZ: parseInt(textureModal.style.zIndex || getComputedStyle(textureModal).zIndex, 10),
        activeWindow: activeFloatingWindow
      };
    });

    expect(state.skinActive).toBe(true);
    expect(state.textureActive).toBe(true);
    expect(state.skinZ).toBeGreaterThan(state.textureZ);
    expect(state.activeWindow).toBe('skin-editor');

    // 2. 将两个窗口并排摆放（左侧详细设置，右侧贴图编辑），互不重叠
    await page.evaluate(() => {
      const skinDialog = document.getElementById('skinEditorDialog');
      skinDialog.style.left = '10px';
      skinDialog.style.right = 'auto';
      skinDialog.style.width = '480px';

      const textureDialog = document.getElementById('textureImageEditorDialog');
      textureDialog.style.left = '520px';
      textureDialog.style.right = 'auto';
      textureDialog.style.width = '700px';
    });

    // 3. 点击贴图编辑窗口标题栏，置顶贴图编辑
    await page.click('#textureImageEditorHeader');
    await page.waitForTimeout(100);

    state = await page.evaluate(() => {
      const skinModal = document.getElementById('skinEditorModal');
      const textureModal = document.getElementById('textureImageEditorModal');
      return {
        skinActive: skinModal.classList.contains('active'),
        textureActive: textureModal.classList.contains('active'),
        skinZ: parseInt(skinModal.style.zIndex || getComputedStyle(skinModal).zIndex, 10),
        textureZ: parseInt(textureModal.style.zIndex || getComputedStyle(textureModal).zIndex, 10),
        activeWindow: activeFloatingWindow
      };
    });

    expect(state.skinActive).toBe(true);
    expect(state.textureActive).toBe(true);
    expect(state.textureZ).toBeGreaterThan(state.skinZ);
    expect(state.activeWindow).toBe('texture-editor');

    // 4. 点击已移至左侧的详细设置窗口标题栏，切换置顶到详细设置
    await page.click('#skinEditorHeader');
    await page.waitForTimeout(100);

    state = await page.evaluate(() => {
      const skinModal = document.getElementById('skinEditorModal');
      const textureModal = document.getElementById('textureImageEditorModal');
      return {
        skinActive: skinModal.classList.contains('active'),
        textureActive: textureModal.classList.contains('active'),
        skinZ: parseInt(skinModal.style.zIndex || getComputedStyle(skinModal).zIndex, 10),
        textureZ: parseInt(textureModal.style.zIndex || getComputedStyle(textureModal).zIndex, 10),
        activeWindow: activeFloatingWindow
      };
    });

    expect(state.skinActive).toBe(true);
    expect(state.textureActive).toBe(true);
    expect(state.skinZ).toBeGreaterThan(state.textureZ);
    expect(state.activeWindow).toBe('skin-editor');
    expect(errors).toEqual([]);
  });

  test('贴图编辑弹窗打开时，通过 E 键可自由切换详细设置弹窗开关，且不影响贴图编辑弹窗', async ({ page }) => {
    const errors = await boot(page);

    // 1. 打开贴图编辑
    await page.click('#openTextureImageEditorBtn');
    await page.waitForFunction(() => document.getElementById('textureImageEditorModal').classList.contains('active'));

    // 2. 按 E 键打开详细设置
    await page.keyboard.press('e');
    await page.waitForFunction(() => document.getElementById('skinEditorModal').classList.contains('active'));

    let state = await page.evaluate(() => ({
      skinActive: document.getElementById('skinEditorModal').classList.contains('active'),
      textureActive: document.getElementById('textureImageEditorModal').classList.contains('active'),
      activeWindow: activeFloatingWindow
    }));
    expect(state.skinActive).toBe(true);
    expect(state.textureActive).toBe(true);
    expect(state.activeWindow).toBe('skin-editor');

    // 3. 再次按 E 键关闭详细设置，贴图编辑弹窗依旧保持打开
    await page.keyboard.press('e');
    await page.waitForFunction(() => !document.getElementById('skinEditorModal').classList.contains('active'));

    state = await page.evaluate(() => ({
      skinActive: document.getElementById('skinEditorModal').classList.contains('active'),
      textureActive: document.getElementById('textureImageEditorModal').classList.contains('active'),
      activeWindow: activeFloatingWindow
    }));
    expect(state.skinActive).toBe(false);
    expect(state.textureActive).toBe(true);
    expect(state.activeWindow).toBe('texture-editor');
    expect(errors).toEqual([]);
  });

  test('两者同时打开时，按 Esc 键优先关闭当前处于前台的弹窗，再次按 Esc 关闭剩余弹窗', async ({ page }) => {
    const errors = await boot(page);

    // 打开两个弹窗（贴图编辑在后打开，默认在前台）
    await page.click('#openSkinEditorBtn');
    await page.waitForFunction(() => document.getElementById('skinEditorModal').classList.contains('active'));
    await page.click('#openTextureImageEditorBtn');
    await page.waitForFunction(() => document.getElementById('textureImageEditorModal').classList.contains('active'));

    // 贴图编辑在前台，按 Esc 优先关闭贴图编辑
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('textureImageEditorModal').classList.contains('active'));

    let state = await page.evaluate(() => ({
      skinActive: document.getElementById('skinEditorModal').classList.contains('active'),
      textureActive: document.getElementById('textureImageEditorModal').classList.contains('active'),
      activeWindow: activeFloatingWindow
    }));
    expect(state.textureActive).toBe(false);
    expect(state.skinActive).toBe(true);
    expect(state.activeWindow).toBe('skin-editor');

    // 再次按 Esc，关闭详细设置
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('skinEditorModal').classList.contains('active'));

    state = await page.evaluate(() => ({
      skinActive: document.getElementById('skinEditorModal').classList.contains('active'),
      textureActive: document.getElementById('textureImageEditorModal').classList.contains('active')
    }));
    expect(state.skinActive).toBe(false);
    expect(state.textureActive).toBe(false);
    expect(errors).toEqual([]);
  });

  test('两者同时打开时，在两个面板分别操作，撤回/重做链路正常且两面板状态与画布保持一致', async ({ page }) => {
    const errors = await boot(page);

    // 打开两个弹窗
    await page.click('#openSkinEditorBtn');
    await page.waitForFunction(() => document.getElementById('skinEditorModal').classList.contains('active'));
    await page.click('#openTextureImageEditorBtn');
    await page.waitForFunction(() => document.getElementById('textureImageEditorModal').classList.contains('active'));

    // 1. 在详细设置中修改 HitPosition 参数
    const initialHitPos = await page.evaluate(() => {
      const cfg = ensureManiaConfigForKeys(getActiveKeyCount());
      return cfg.HitPosition;
    });

    await page.evaluate(() => {
      onParamChange('HitPosition', 420);
    });

    let currentHitPos = await page.evaluate(() => ensureManiaConfigForKeys(getActiveKeyCount()).HitPosition);
    expect(currentHitPos).toBe(420);

    // 2. 将详细设置置顶并按 Ctrl+Z 撤回
    await page.click('#openSkinEditorBtn');
    await page.waitForTimeout(100);
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(200);

    currentHitPos = await page.evaluate(() => ensureManiaConfigForKeys(getActiveKeyCount()).HitPosition);
    expect(currentHitPos).toBe(initialHitPos);

    // 3. 按 Ctrl+Y 重做
    await page.keyboard.press('Control+y');
    await page.waitForTimeout(200);

    currentHitPos = await page.evaluate(() => ensureManiaConfigForKeys(getActiveKeyCount()).HitPosition);
    expect(currentHitPos).toBe(420);

    // 两者依然保持同时打开
    const state = await page.evaluate(() => ({
      skinActive: document.getElementById('skinEditorModal').classList.contains('active'),
      textureActive: document.getElementById('textureImageEditorModal').classList.contains('active')
    }));
    expect(state.skinActive).toBe(true);
    expect(state.textureActive).toBe(true);
    expect(errors).toEqual([]);
  });
});

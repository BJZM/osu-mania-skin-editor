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

test.describe('详细设置与贴图导入编辑窗口关闭动画验证', () => {
  test('详细设置窗口点击关闭时触发 modalScaleDown 关闭动画并在动画完成后关闭', async ({ page }) => {
    const errors = await boot(page);

    await page.click('#openSkinEditorBtn');
    await page.waitForFunction(() => document.getElementById('skinEditorModal').classList.contains('active'));

    await page.click('#closeSkinEditorBtn');

    // 关闭中阶段应带有 is-closing 且应用 modalScaleDown 动画
    const closingState = await page.evaluate(() => {
      const modal = document.getElementById('skinEditorModal');
      const dialog = document.getElementById('skinEditorDialog');
      return {
        isClosing: modal.classList.contains('is-closing'),
        animName: getComputedStyle(dialog).animationName
      };
    });
    expect(closingState.isClosing).toBe(true);
    expect(closingState.animName).toContain('modalScaleDown');

    // 动画完成后完全关闭
    await page.waitForFunction(() => !document.getElementById('skinEditorModal').classList.contains('active'));
    const closedState = await page.evaluate(() => {
      const modal = document.getElementById('skinEditorModal');
      return {
        active: modal.classList.contains('active'),
        isClosing: modal.classList.contains('is-closing'),
        display: getComputedStyle(modal).display
      };
    });
    expect(closedState.active).toBe(false);
    expect(closedState.isClosing).toBe(false);
    expect(closedState.display).toBe('none');
    expect(errors).toEqual([]);
  });

  test('贴图导入与编辑窗口点击关闭时触发 modalScaleDown 关闭动画并在动画完成后关闭', async ({ page }) => {
    const errors = await boot(page);

    await page.click('#openTextureImageEditorBtn');
    await page.waitForFunction(() => document.getElementById('textureImageEditorModal').classList.contains('active'));

    await page.click('#textureImageEditorCloseBtn');

    // 关闭中阶段应带有 is-closing 且应用 modalScaleDown 动画
    const closingState = await page.evaluate(() => {
      const modal = document.getElementById('textureImageEditorModal');
      const dialog = document.getElementById('textureImageEditorDialog');
      return {
        isClosing: modal.classList.contains('is-closing'),
        animName: getComputedStyle(dialog).animationName
      };
    });
    expect(closingState.isClosing).toBe(true);
    expect(closingState.animName).toContain('modalScaleDown');

    // 动画完成后完全关闭
    await page.waitForFunction(() => document.getElementById('textureImageEditorModal').style.display === 'none');
    const closedState = await page.evaluate(() => {
      const modal = document.getElementById('textureImageEditorModal');
      return {
        active: modal.classList.contains('active'),
        isClosing: modal.classList.contains('is-closing'),
        display: modal.style.display
      };
    });
    expect(closedState.active).toBe(false);
    expect(closedState.isClosing).toBe(false);
    expect(closedState.display).toBe('none');
    expect(errors).toEqual([]);
  });

  test('按 E 键切换详细设置开关带有关闭动画', async ({ page }) => {
    const errors = await boot(page);

    await page.keyboard.press('e');
    await page.waitForFunction(() => document.getElementById('skinEditorModal').classList.contains('active'));

    await page.keyboard.press('e');
    const closingState = await page.evaluate(() => {
      const modal = document.getElementById('skinEditorModal');
      const dialog = document.getElementById('skinEditorDialog');
      return {
        isClosing: modal.classList.contains('is-closing'),
        animName: getComputedStyle(dialog).animationName
      };
    });
    expect(closingState.isClosing).toBe(true);
    expect(closingState.animName).toContain('modalScaleDown');

    await page.waitForFunction(() => !document.getElementById('skinEditorModal').classList.contains('active'));
    expect(errors).toEqual([]);
  });

  test('按 Esc 键关闭贴图编辑窗口带有关闭动画', async ({ page }) => {
    const errors = await boot(page);

    await page.click('#openTextureImageEditorBtn');
    await page.waitForFunction(() => document.getElementById('textureImageEditorModal').classList.contains('active'));

    await page.keyboard.press('Escape');
    const closingState = await page.evaluate(() => {
      const modal = document.getElementById('textureImageEditorModal');
      const dialog = document.getElementById('textureImageEditorDialog');
      return {
        isClosing: modal.classList.contains('is-closing'),
        animName: getComputedStyle(dialog).animationName
      };
    });
    expect(closingState.isClosing).toBe(true);
    expect(closingState.animName).toContain('modalScaleDown');

    await page.waitForFunction(() => document.getElementById('textureImageEditorModal').style.display === 'none');
    expect(errors).toEqual([]);
  });

  test('在关闭动画过程中重新打开能取消关闭动画并立即恢复打开状态', async ({ page }) => {
    const errors = await boot(page);

    await page.click('#openSkinEditorBtn');
    await page.waitForFunction(() => document.getElementById('skinEditorModal').classList.contains('active'));

    // 触发关闭
    await page.click('#closeSkinEditorBtn');
    expect(await page.evaluate(() => document.getElementById('skinEditorModal').classList.contains('is-closing'))).toBe(true);

    // 动画结束前再次点击打开
    await page.click('#openSkinEditorBtn');
    const reopenedState = await page.evaluate(() => {
      const modal = document.getElementById('skinEditorModal');
      return {
        active: modal.classList.contains('active'),
        isClosing: modal.classList.contains('is-closing')
      };
    });
    expect(reopenedState.active).toBe(true);
    expect(reopenedState.isClosing).toBe(false);

    // 确保即使过了 250ms 也依然保持打开（定时器已被正确清除）
    await page.waitForTimeout(250);
    expect(await page.evaluate(() => document.getElementById('skinEditorModal').classList.contains('active'))).toBe(true);
    expect(errors).toEqual([]);
  });
});

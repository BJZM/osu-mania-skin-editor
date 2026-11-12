import { test, expect } from '@playwright/test';

test.describe('场景切换选项卡 (Stage View Tabs)', () => {
  test('右侧纵向排布选项卡可顺畅切换游戏内、选歌页面与主页面并正确渲染', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForLoadState('domcontentloaded');

    const rail = page.locator('#stageNavRail');
    await expect(rail).toBeVisible();

    const gameplayTab = page.locator('#tabViewGameplay');
    const songSelectTab = page.locator('#tabViewSongSelect');
    const mainMenuTab = page.locator('#tabViewMainMenu');

    const gameCanvas = page.locator('#gameCanvas');
    const songSelectCanvas = page.locator('#songSelectCanvas');
    const mainMenuCanvas = page.locator('#mainMenuCanvas');

    // 1. 默认处于游戏内
    await expect(gameplayTab).toHaveClass(/active/);
    await expect(gameCanvas).toBeVisible();
    await expect(songSelectCanvas).toBeHidden();
    await expect(mainMenuCanvas).toBeHidden();

    // 2. 切换到选歌页面并截图验证
    await songSelectTab.click();
    await expect(songSelectTab).toHaveClass(/active/);
    await expect(gameplayTab).not.toHaveClass(/active/);
    await expect(songSelectCanvas).toBeVisible();
    await expect(gameCanvas).toBeHidden();
    await page.waitForTimeout(600);
    await page.screenshot({ path: 'test-results/stage-song-select.png' });

    // 3. 切换到主页面并截图默认居中状态
    await mainMenuTab.click();
    await expect(mainMenuTab).toHaveClass(/active/);
    await expect(songSelectTab).not.toHaveClass(/active/);
    await expect(mainMenuCanvas).toBeVisible();
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-results/stage-main-menu-default.png' });

    // 点击中心展开四色主菜单
    const box = await mainMenuCanvas.boundingBox();
    if (box) {
      await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
      await page.waitForTimeout(600);
    }
    await page.screenshot({ path: 'test-results/stage-main-menu.png' });

    // 4. 切回游戏内
    await gameplayTab.click();
    await expect(gameplayTab).toHaveClass(/active/);
    await expect(gameCanvas).toBeVisible();
    await expect(songSelectCanvas).toBeHidden();
    await expect(mainMenuCanvas).toBeHidden();
  });
});

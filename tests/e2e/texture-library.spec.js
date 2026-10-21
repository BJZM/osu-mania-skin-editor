const path = require('path');
const { test, expect } = require('@playwright/test');

const ROOT = path.resolve(__dirname, '../..');
const SKIN = path.join(ROOT, 'samples', 'skins', 'Kumakalerki.osk');
const BEATMAP = path.join(ROOT, 'samples', 'beatmaps', '1790742 MIMI - Kuu ni Naru.osz');

async function boot(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  await page.goto('/index.html');
  await page.waitForFunction(
    () => typeof textureImageEditorUi !== 'undefined' && typeof textureLibraryUi !== 'undefined',
    null,
    { timeout: 30000 }
  );
  await page.setInputFiles('#oszInput', BEATMAP);
  await page.waitForFunction(
    () => isStartupBeatmapReady() && beatmaps.length > 0,
    null,
    { timeout: 60000 }
  );
  await page.setInputFiles('#oskInput', SKIN);
  await page.waitForFunction(() => isSkinLoading === false && isStartupWorkspaceReady(), null, {
    timeout: 60000
  });
  await page.click('#openTextureImageEditorBtn');
  await page.waitForFunction(() =>
    document.getElementById('textureImageEditorModal').classList.contains('active')
  );
  return errors;
}

test('全部贴图显示逻辑与点击引用界面保持排列和样式相同', async ({ page }) => {
  const errors = await boot(page);
  const libraryTab = page.locator('.texture-image-tab[data-tab-id="texture-library"]');
  await expect(libraryTab).toContainText('全部贴图');
  await libraryTab.click();
  await expect(page.locator('#textureImageLibraryView')).toBeVisible();

  // 1. 验证工具栏与引用界面的排列和结构一致 (.texture-existing-toolbar / .texture-existing-search / .texture-existing-count)
  const toolbar = page.locator('#textureImageLibraryView .texture-existing-toolbar');
  await expect(toolbar).toBeVisible();
  const searchWrap = page.locator('#textureImageLibraryView .texture-existing-search');
  await expect(searchWrap).toBeVisible();
  const countEl = page.locator('#textureImageLibraryCount');
  await expect(countEl).toHaveClass(/texture-existing-count/);

  // 2. 验证网格容器使用 .texture-existing-grid
  const grid = page.locator('#textureImageLibraryGrid');
  await expect(grid).toHaveClass(/texture-existing-grid/);

  // 3. 验证卡片数量与全部贴图逐帧展开后的总数匹配
  const total = await page.evaluate(() => {
    return collectExistingTextureSources(null, currentSkinZip, {
      expandAnimationFrames: true
    }).length;
  });
  expect(total).toBeGreaterThan(1);
  await expect(countEl).toHaveText(`${total} / ${total} 项`);

  const cards = page.locator('#textureImageLibraryGrid .texture-existing-card');
  await expect(cards).toHaveCount(total);

  // 4. 验证卡片内部元素排列与样式与引用卡片相同 (canvas 缩略图、meta、basename、path、badges)
  const firstCard = cards.first();
  await expect(firstCard.locator('.texture-existing-preview canvas')).toBeVisible();
  await expect(firstCard.locator('.texture-existing-meta strong')).toBeVisible();
  await expect(firstCard.locator('.texture-existing-meta .texture-existing-path')).toBeVisible();
  await expect(firstCard.locator('.texture-existing-meta .texture-existing-badges .texture-existing-badge')).toBeVisible();

  // 5. 验证点击选中交互与引用界面的选中高亮样式一致 (.selected)
  await firstCard.click();
  await expect(firstCard).toHaveClass(/selected/);
  expect(await firstCard.getAttribute('aria-selected')).toBe('true');
  const selectedPath = await firstCard.getAttribute('data-texture-path');
  expect(await page.evaluate(() => textureLibraryUi.getState().selectedPath)).toBe(selectedPath);

  // 6. 验证搜索过滤与计数显示逻辑
  const candidate = await page.evaluate(() => {
    const list = collectExistingTextureSources();
    return list[Math.floor(list.length / 2)].basename;
  });
  await page.fill('#textureImageLibrarySearch', candidate);
  const filteredTotal = await page.evaluate((keyword) => {
    return filterExistingTextureSources(
      collectExistingTextureSources(null, currentSkinZip, { expandAnimationFrames: true }),
      keyword
    ).length;
  }, candidate);
  expect(filteredTotal).toBeGreaterThan(0);
  await expect(page.locator('#textureImageLibraryGrid .texture-existing-card')).toHaveCount(filteredTotal);
  await expect(countEl).toHaveText(`${filteredTotal} / ${total} 项`);

  // 清空搜索后恢复全部
  await page.fill('#textureImageLibrarySearch', '');
  await expect(page.locator('#textureImageLibraryGrid .texture-existing-card')).toHaveCount(total);
  await expect(countEl).toHaveText(`${total} / ${total} 项`);

  expect(errors).toEqual([]);
});

test('全部贴图逐帧展开，引用候选仍保留动画基名', async ({ page }) => {
  const errors = await boot(page);
  const libraryTab = page.locator('.texture-image-tab[data-tab-id="texture-library"]');
  await libraryTab.click();

  const sources = await page.evaluate(() => {
    const grouped = collectExistingTextureSources();
    const expanded = collectExistingTextureSources(null, currentSkinZip, {
      expandAnimationFrames: true
    });
    const animation = grouped.find((source) => source.isAnimation);
    return {
      animation: animation
        ? {
            path: animation.path,
            frameCount: animation.frames.length
          }
        : null,
      expandedPaths: expanded.map((source) => source.path),
      expandedAnimationFrames: expanded.filter((source) => source.isAnimationFrame),
      animationFramePaths: animation
        ? expanded
            .filter((source) => source.animationBasePath === animation.path)
            .map((source) => source.path)
        : []
    };
  });

  expect(sources.animation).not.toBeNull();
  expect(sources.expandedPaths).not.toContain(sources.animation.path);
  expect(sources.animationFramePaths).toHaveLength(sources.animation.frameCount);
  expect(sources.expandedAnimationFrames.every((source) => source.frames.length === 1)).toBe(true);

  for (const framePath of sources.animationFramePaths) {
    await expect(
      page.locator(`#textureImageLibraryGrid .texture-library-card[data-texture-path="${framePath}"]`)
    ).toHaveCount(1);
  }
  await expect(
    page.locator(
      `#textureImageLibraryGrid .texture-library-card[data-texture-path="${sources.animation.path}"]`
    )
  ).toHaveCount(0);
  await expect(
    page.locator(
      `#textureImageLibraryGrid .texture-library-card[data-texture-path="${sources.animationFramePaths[0]}"] .texture-existing-badge.is-animation`
    )
  ).toHaveCount(0);

  const pickerCount = await page.evaluate(() => collectExistingTextureSources().length);
  expect(pickerCount).toBeLessThan(
    await page.evaluate(() => {
      return collectExistingTextureSources(null, currentSkinZip, {
        expandAnimationFrames: true
      }).length;
    })
  );

  expect(errors).toEqual([]);
});
test('主菜单和全部贴图下底栏四按钮保持隐藏留空，进入贴图编辑后显示', async ({ page }) => {
  const errors = await boot(page);
  const footer = page.locator('#textureImageFooter');
  const applyBtn = page.locator('#textureImageApplyBtn');
  const resetBtn = page.locator('#textureImageResetBtn');
  const blankBtn = page.locator('#textureImageBlankBtn');
  const cancelBtn = page.locator('#textureImageCancelBtn');
  const menuTab = page.locator('.texture-image-tab[data-tab-id="menu"]');
  const libraryTab = page.locator('.texture-image-tab[data-tab-id="texture-library"]');

  // 1. 默认处于主菜单（菜单标签），底栏四按钮隐藏
  await expect(menuTab).toHaveClass(/is-active/);
  await expect(footer).toBeHidden();
  await expect(applyBtn).toBeHidden();
  await expect(resetBtn).toBeHidden();
  await expect(blankBtn).toBeHidden();
  await expect(cancelBtn).toBeHidden();

  // 2. 切换到全部贴图标签，底栏四按钮依然隐藏
  await libraryTab.click();
  await expect(libraryTab).toHaveClass(/is-active/);
  await expect(footer).toBeHidden();
  await expect(applyBtn).toBeHidden();
  await expect(resetBtn).toBeHidden();
  await expect(blankBtn).toBeHidden();
  await expect(cancelBtn).toBeHidden();

  // 3. 从主菜单点击贴图编辑按钮进入编辑，底栏与四按钮显示
  await menuTab.click();
  await expect(menuTab).toHaveClass(/is-active/);
  const firstEditBtn = page.locator('#textureImagePickerGrid .texture-edit-main-btn:not([disabled])').first();
  await expect(firstEditBtn).toBeVisible();
  await firstEditBtn.click();
  await expect(page.locator('#textureImageEditorView')).toBeVisible();
  await expect(footer).toBeVisible();
  await expect(applyBtn).toBeVisible();
  await expect(resetBtn).toBeVisible();
  await expect(blankBtn).toBeVisible();
  await expect(cancelBtn).toBeVisible();

  // 4. 切回全部贴图标签，底栏四按钮恢复隐藏留空
  await libraryTab.click();
  await expect(libraryTab).toHaveClass(/is-active/);
  await expect(footer).toBeHidden();
  await expect(applyBtn).toBeHidden();

  // 5. 切回主菜单（菜单）标签，底栏四按钮同样恢复隐藏留空
  await menuTab.click();
  await expect(menuTab).toHaveClass(/is-active/);
  await expect(footer).toBeHidden();
  await expect(applyBtn).toBeHidden();

  expect(errors).toEqual([]);
});

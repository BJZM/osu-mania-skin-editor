const path = require('path');
const { test, expect } = require('@playwright/test');

const ROOT = path.resolve(__dirname, '../..');
const SKIN = path.join(ROOT, 'samples', 'skins', 'Kumakalerki.osk');
const BEATMAP = path.join(ROOT, 'samples', 'beatmaps', '1790742 MIMI - Kuu ni Naru.osz');
const UPLOAD_IMAGE = path.join(ROOT, 'assets', 'app-icon.png');

async function boot(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  await page.goto('/index.html');
  await page.waitForFunction(
    () => typeof textureImageEditorUi !== 'undefined' &&
      typeof buildFontGlyphTextureParams === 'function',
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
  await page.waitForFunction(
    () => isSkinLoading === false && isStartupWorkspaceReady(),
    null,
    { timeout: 60000 }
  );
  await page.waitForTimeout(250);
  return errors;
}

test('详细设置和贴图页同时显示数字与连击数字，且路径由各自前缀决定', async ({ page }) => {
  const errors = await boot(page);
  await page.evaluate(() => {
    skinFontsConfig.comboPrefix = 'combo';
    skinFontsConfig.hasExplicitComboPrefix = false;
    for (const cfg of maniaSkinConfigurations.values()) {
      if (cfg) cfg.FontCombo = null;
    }
  });

  await page.click('#openSkinEditorBtn');
  await page.click('#skinEditorTabs .tab-btn[data-tab="fonts"]');
  await expect(page.locator('.hud-font-glyphs-block')).toHaveCount(2);
  await expect(page.locator('.combo-font-glyphs-block')).toContainText('连击数字贴图');
  await expect(
    page.locator('.combo-font-glyphs-block #combo-glyph-card-0 .hud-glyph-filename')
  ).toHaveText('score-0.png');
  await page.click('#closeSkinEditorBtn');

  await page.click('#openTextureImageEditorBtn');
  await page.waitForSelector('#textureImagePickerGrid .texture-image-picker-item');
  const scorePath = page.locator(
    '#param-card-FontGlyphScoreDigit0 .texture-font-glyph-path-input'
  );
  const comboPath = page.locator(
    '#param-card-FontGlyphComboDigit0 .texture-font-glyph-path-input'
  );
  await expect(scorePath).toHaveValue('score-0');
  await expect(comboPath).toHaveValue('score-0');

  await page.evaluate(() => {
    onParamChange('ComboPrefix', 'Fonts/combo/combo');
  });
  await expect(scorePath).toHaveValue('score-0');
  await expect(comboPath).toHaveValue('Fonts/combo/combo-0');
  expect(errors).toEqual([]);
});

test('贴图编辑菜单按贴图映射、数字贴图、连击数字贴图排列', async ({ page }) => {
  const errors = await boot(page);

  await page.click('#openTextureImageEditorBtn');
  await page.waitForSelector('#textureImagePickerGrid .texture-image-picker-item');

  const categoryNames = await page
    .locator('#textureImagePickerGrid > .param-category-block')
    .evaluateAll((blocks) => blocks.map((block) => {
      const label = block.querySelector('.param-category-title > span');
      return label ? label.textContent.trim() : '';
    }));
  expect(categoryNames).toEqual([
    '贴图映射',
    '数字贴图',
    '连击数字贴图'
  ]);
  expect(errors).toEqual([]);
});

test('详细设置字体替换贴图的导入按钮提供与贴图页一致的下拉菜单', async ({ page }) => {
  const errors = await boot(page);

  await page.click('#openSkinEditorBtn');
  await page.click('#skinEditorTabs .tab-btn[data-tab="fonts"]');

  const scoreZero = page.locator('#glyph-card-0');
  const dropdown = scoreZero.locator('.hud-glyph-upload-dropdown');
  await expect(dropdown.locator('.texture-upload-main-btn')).toContainText('导入');
  await expect(dropdown.locator('.texture-upload-menu-item.item-1x')).toHaveCount(1);
  await expect(dropdown.locator('.texture-upload-menu-item.item-2x')).toHaveCount(1);
  await expect(dropdown.locator('.texture-upload-menu-item.item-existing')).toHaveCount(1);

  await dropdown.hover();
  await expect(dropdown.locator('.texture-upload-menu')).toBeVisible();

  const fileChooserPromise = page.waitForEvent('filechooser');
  await dropdown.locator('.texture-upload-menu-item.item-2x').click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(UPLOAD_IMAGE);
  await page.waitForFunction(() => userReplacedTextures.has('score-0@2x.png'));

  await page.evaluate(() => performSkinUndo());
  await page.waitForFunction(() => !userReplacedTextures.has('score-0@2x.png'));

  await dropdown.hover();
  await expect(dropdown.locator('.texture-upload-menu')).toBeVisible();
  await dropdown.locator('.texture-upload-menu-item.item-existing').click();
  await expect(page.locator('#textureExistingPickerModal')).toHaveCSS('display', 'flex');

  expect(errors).toEqual([]);
});

test('字形卡支持 1x、@2x、已有贴图导入，并可编辑、撤回和重做', async ({ page }) => {
  const errors = await boot(page);
  const customGroup = 'fonts/custom/custom';
  const customGlyph = `${customGroup}-3`;
  await page.evaluate(({ group, glyph }) => {
    const canvas = document.createElement('canvas');
    canvas.width = 18;
    canvas.height = 20;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#42d7ff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    saveSkinAssetToStore(skinImageStore, glyph, canvas, false, true, true);
    saveSkinAssetToStore(skinFallbackImageStore, glyph, canvas, false, true, true);
    window.__fontGlyphCustomGroup = group;
  }, { group: customGroup, glyph: customGlyph });

  await page.click('#openTextureImageEditorBtn');
  await page.waitForSelector('#textureImagePickerGrid .texture-image-picker-item');

  const scoreZero = page.locator('#param-card-FontGlyphScoreDigit0');
  await expect(scoreZero.locator('.texture-upload-menu-item.item-1x')).toHaveCount(1);
  await page.evaluate(() => {
    triggerTextureUpload('score-0', 'FontGlyphScoreDigit0', 'FontGlyphScoreDigit0', null, '1x');
  });
  await page.setInputFiles('#textureReplaceInput', UPLOAD_IMAGE);
  await page.waitForFunction(() => userReplacedTextures.has('score-0.png'));

  const scoreOne = page.locator('#param-card-FontGlyphScoreDigit1');
  await expect(scoreOne.locator('.texture-upload-menu-item.item-2x')).toHaveCount(1);
  await page.evaluate(() => {
    triggerTextureUpload('score-1', 'FontGlyphScoreDigit1', 'FontGlyphScoreDigit1', null, '2x');
  });
  await page.setInputFiles('#textureReplaceInput', UPLOAD_IMAGE);
  await page.waitForFunction(() => userReplacedTextures.has('score-1@2x.png'));

  await expect(
    page.locator('#param-card-FontGlyphComboDigit0 .texture-upload-menu-item.item-existing')
  ).toHaveCount(1);
  const originalCombo = await page.evaluate(() => ({
    prefix: skinFontsConfig.comboPrefix,
    explicit: skinFontsConfig.hasExplicitComboPrefix
  }));
  await page.evaluate(() => {
    const p = getTextureTabParams().find(
      (item) => item.key === 'FontGlyphComboDigit0'
    );
    openTextureExistingPicker(p, getActiveKeyCount());
  });
  await expect(page.locator('#textureExistingPickerModal')).toHaveCSS('display', 'flex');
  await page.fill('#textureExistingPickerSearch', customGlyph);
  await page.locator('#textureExistingPickerGrid .texture-existing-card').first().click();
  await page.click('#textureExistingPickerConfirmBtn');
  await page.waitForFunction((prefix) => {
    return skinFontsConfig.comboPrefix === prefix &&
      skinFontsConfig.hasExplicitComboPrefix === true;
  }, customGroup);
  await expect(
    page.locator('#param-card-FontGlyphComboDigit0 .texture-font-glyph-path-input')
  ).toHaveValue(`${customGroup}-0`);

  await page.evaluate(() => performSkinUndo());
  await page.waitForFunction((previous) =>
    skinFontsConfig.comboPrefix === previous.prefix &&
    skinFontsConfig.hasExplicitComboPrefix === previous.explicit
  , originalCombo);
  await page.evaluate(() => renderPicker());
  await expect(
    page.locator('#param-card-FontGlyphComboDigit0 .texture-font-glyph-path-input')
  ).toHaveValue('combo-0');

  await page.evaluate(() => performSkinRedo());
  await page.waitForFunction((prefix) => {
    return skinFontsConfig.comboPrefix === prefix &&
      skinFontsConfig.hasExplicitComboPrefix === true;
  }, customGroup);
  await page.evaluate(() => renderPicker());

  await page.click('#param-card-FontGlyphComboDigit0');
  await page.waitForFunction(() =>
    textureImageEditorUi.getState().selectedKey === 'FontGlyphComboDigit0'
  );
  await page.fill('#textureImageCropLeft', '1');
  await page.waitForTimeout(100);
  await page.click('#textureImageApplyBtn');
  await page.waitForFunction((target) => {
    return Array.from(userReplacedTextures.keys()).some((name) =>
      normalizeSkinKey(name) === normalizeSkinKey(`${target}.png`)
    );
  }, `${customGroup}-0`);

  expect(await page.evaluate((target) =>
    !!getSkinAnimation(target, true)
  , `${customGroup}-0`)).toBe(true);
  expect(await page.evaluate(() => {
    const cfg = getManiaConfigForKeys(getActiveKeyCount());
    return cfg.FontGlyphComboDigit0 !== undefined ||
      cfg.ImageLookups?.has('FontGlyphComboDigit0');
  })).toBe(false);

  await page.evaluate(() => performSkinUndo());
  await page.waitForFunction((target) => {
    return !Array.from(userReplacedTextures.keys()).some((name) =>
      normalizeSkinKey(name) === normalizeSkinKey(`${target}.png`)
    );
  }, `${customGroup}-0`);
  await page.evaluate(() => renderPicker());
  await expect(
    page.locator('#param-card-FontGlyphComboDigit0 .texture-font-glyph-path-input')
  ).toHaveValue(`${customGroup}-0`);
  expect(errors).toEqual([]);
});

const path = require('path');
const { test, expect } = require('@playwright/test');

const ROOT = path.resolve(__dirname, '../..');
const SKIN = path.join(ROOT, 'samples', 'skins', 'Kumakalerki.osk');

test('StageLight 上传不会按源文件名覆盖 LightingN', async ({ page }) => {
  await page.goto('/index.html');
  await page.waitForFunction(
    () => typeof triggerTextureUpload === 'function' && typeof userReplacedTextures !== 'undefined',
    null,
    { timeout: 30000 }
  );
  await page.setInputFiles('#oskInput', SKIN);
  await page.waitForFunction(() => isSkinLoading === false, null, { timeout: 60000 });

  await page.evaluate(() => {
    const get = (name) => {
      const frames = getSkinAnimationFramesFromStore(skinImageStore, name);
      return frames ? frames[0] : null;
    };
    window._beforeLightingN = get('lightingN');
    window._beforeStage = get('mania-stage-light');
  });

  await page.evaluate(() => triggerTextureUpload('mania-stage-light', LML.LightImage, 'StageLight'));
  await page.setInputFiles('#textureReplaceInput', {
    name: 'lightingN.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64'
    )
  });
  await page.waitForFunction(() => document.getElementById('textureUploadModal').style.display === 'flex');
  await page.click('#textureUploadConfirmBtn');
  await page.waitForFunction(() => Array.from(userReplacedTextures.keys()).some((key) => /stage/i.test(key)));
  await page.waitForFunction(() => Array.from(userReplacedTextures.keys()).some((key) => /stage/i.test(key)));

  const result = await page.evaluate(() => {
    const get = (name) => {
      const frames = getSkinAnimationFramesFromStore(skinImageStore, name);
      return frames ? frames[0] : null;
    };
    return {
      stageLight: get('stagelight'),
      maniaStageLight: get('mania-stage-light'),
      lightingN: get('lightingN'),
      lightingNUnchanged: get('lightingN') === window._beforeLightingN,
      stageLightReplaced: get('mania-stage-light') !== window._beforeStage,
      exportKeys: Array.from(userReplacedTextures.keys()).sort(),
      stageLookup: getManiaConfigForKeys(getActiveKeyCount()).ImageLookups.get('StageLight'),
      lightNLookup: getManiaConfigForKeys(getActiveKeyCount()).ImageLookups.get('LightingN')
    };
  });

  expect(result.lightingNUnchanged).toBe(true);
  expect(result.stageLightReplaced).toBe(true);
  expect(result.exportKeys.some((key) => /^lightingN\.png$/i.test(key))).toBe(false);
});

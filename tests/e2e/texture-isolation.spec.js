const path = require('path');
const { test, expect } = require('@playwright/test');

const ROOT = path.resolve(__dirname, '../..');
const SKIN = path.join(ROOT, 'samples', 'skins', 'Kumakalerki.osk');
const MINIMAL_BEATMAP = path.join(ROOT, 'samples', 'beatmaps', 'minimal-4k.osu');

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

test('默认皮肤替换 KeyImage 不会同步替换 KeyImageD', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });

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

  const before = await page.evaluate(() => {
    const keys = getActiveKeyCount();
    const info = {};
    const name = getManiaNoteTextureName(keys, LML.KeyImageDown, 0, info);
    const img = getManiaSkinImage(keys, LML.KeyImageDown, 0);
    return {
      name,
      explicit: info.explicit,
      width: img ? img.width : 0,
      height: img ? img.height : 0,
      normalName: getManiaNoteTextureName(keys, LML.KeyImage, 0)
    };
  });

  await page.evaluate(() => {
    triggerTextureUpload('mania-key1', LML.KeyImage, 'KeyImage0', 0, '1x');
  });
  await page.setInputFiles('#textureReplaceInput', {
    name: 'replacement.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64'
    )
  });
  await page.waitForFunction(
    () => Array.from(userReplacedTextures.keys()).some((key) => /^replacement_col1/i.test(key)),
    null,
    { timeout: 30000 }
  );

  const after = await page.evaluate(() => {
    const keys = getActiveKeyCount();
    const info = {};
    const name = getManiaNoteTextureName(keys, LML.KeyImageDown, 0, info);
    const img = getManiaSkinImage(keys, LML.KeyImageDown, 0);
    return {
      name,
      explicit: info.explicit,
      width: img ? img.width : 0,
      height: img ? img.height : 0,
      normalName: getManiaNoteTextureName(keys, LML.KeyImage, 0)
    };
  });

  expect(after.normalName).not.toBe(before.normalName);
  expect(after.name).toBe(before.name);
  expect(after.width).toBe(before.width);
  expect(after.height).toBe(before.height);
  expect(after.explicit).toBe(true);
  expect(errors).toEqual([]);
});

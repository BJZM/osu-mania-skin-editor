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

test('长条打击特效 LightingL 与单键打击特效 LightingN 的替换相互独立互不绑定', async ({ page }) => {
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

  const initial = await page.evaluate(() => {
    const keys = getActiveKeyCount();
    const resN = resolveTextureParam(keys, { key: 'LightingN', default: 'lightingN' });
    const resL = resolveTextureParam(keys, { key: 'LightingL', default: 'lightingL' });
    const iniN = getTextureParamIniValue(keys, { key: 'LightingN' });
    const iniL = getTextureParamIniValue(keys, { key: 'LightingL' });
    return {
      nameN: resN ? resN.name : null,
      nameL: resL ? resL.name : null,
      iniN,
      iniL
    };
  });

  expect(initial.nameN).toBe('lightingN');
  expect(initial.nameL).toBe('lightingL');
  expect(initial.iniN).toBe('');
  expect(initial.iniL).toBe('');

  // 1. 替换单键打击特效 LightingN
  const beforeImgs = await page.evaluate(() => {
    const keys = getActiveKeyCount();
    window._beforeLightingN = getManiaSkinImage(keys, LML.ExplosionImage, 0);
    const lFrames = getManiaSkinAnimationFrames(keys, LML.HoldNoteLightImage, 0);
    window._beforeLightingL = lFrames ? lFrames[0] : getManiaSkinImage(keys, LML.HoldNoteLightImage, 0);
    return {
      hasN: !!window._beforeLightingN,
      hasL: !!window._beforeLightingL
    };
  });
  expect(beforeImgs.hasN).toBe(true);
  expect(beforeImgs.hasL).toBe(true);

  await page.evaluate(() => {
    triggerTextureUpload('lightingN', 'LightingN', 'LightingN', null, '1x');
  });
  await page.setInputFiles('#textureReplaceInput', {
    name: 'custom-lightingN.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNk+M9QzwAEjAwMDAwAFAcBAf8q8B8AAAAASUVORK5CYII=',
      'base64'
    )
  });
  await page.waitForFunction(
    () => Array.from(userReplacedTextures.keys()).some((key) => /^lightingn\.png$/i.test(key)),
    null,
    { timeout: 30000 }
  );

  const afterN = await page.evaluate(() => {
    const keys = getActiveKeyCount();
    const cfg = getManiaConfigForKeys(keys);
    const resN = resolveTextureParam(keys, { key: 'LightingN', default: 'lightingN' });
    const resL = resolveTextureParam(keys, { key: 'LightingL', default: 'lightingL' });
    const iniN = getTextureParamIniValue(keys, { key: 'LightingN' });
    const iniL = getTextureParamIniValue(keys, { key: 'LightingL' });
    const currentN = getManiaSkinImage(keys, LML.ExplosionImage, 0);
    const lFrames = getManiaSkinAnimationFrames(keys, LML.HoldNoteLightImage, 0);
    const currentL = lFrames ? lFrames[0] : getManiaSkinImage(keys, LML.HoldNoteLightImage, 0);
    return {
      nameN: resN ? resN.name : null,
      nameL: resL ? resL.name : null,
      iniN,
      iniL,
      imgNChanged: currentN !== window._beforeLightingN,
      imgLUnchanged: currentL === window._beforeLightingL,
      hasLightingKey: cfg && cfg.ImageLookups ? (cfg.ImageLookups.has('Lighting') || cfg.ImageLookups.has('lighting')) : false,
      lookupsLightingN: cfg && cfg.ImageLookups ? cfg.ImageLookups.get('LightingN') : null,
      lookupsLightingL: cfg && cfg.ImageLookups ? cfg.ImageLookups.get('LightingL') : null
    };
  });

  // LightingN 已更新，LightingL 必须仍然保持默认未被修改
  expect(afterN.imgNChanged).toBe(true);
  expect(afterN.imgLUnchanged).toBe(true);
  expect(afterN.nameL).toBe('lightingL');
  expect(afterN.iniL).toBe('');
  expect(afterN.hasLightingKey).toBe(false);
  expect(afterN.lookupsLightingL).toBeUndefined();

  // 2. 替换长条打击特效 LightingL
  await page.evaluate(() => {
    triggerTextureUpload('lightingL', 'LightingL', 'LightingL', null, '1x');
  });
  await page.setInputFiles('#textureReplaceInput', {
    name: 'custom-lightingL.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64'
    )
  });
  await page.waitForFunction(
    () => Array.from(userReplacedTextures.keys()).some((key) => /^lightingl\.png$/i.test(key)),
    null,
    { timeout: 30000 }
  );

  const afterL = await page.evaluate(() => {
    const keys = getActiveKeyCount();
    const cfg = getManiaConfigForKeys(keys);
    const resN = resolveTextureParam(keys, { key: 'LightingN', default: 'lightingN' });
    const resL = resolveTextureParam(keys, { key: 'LightingL', default: 'lightingL' });
    const iniN = getTextureParamIniValue(keys, { key: 'LightingN' });
    const iniL = getTextureParamIniValue(keys, { key: 'LightingL' });
    const currentN = getManiaSkinImage(keys, LML.ExplosionImage, 0);
    const lFrames = getManiaSkinAnimationFrames(keys, LML.HoldNoteLightImage, 0);
    const currentL = lFrames ? lFrames[0] : getManiaSkinImage(keys, LML.HoldNoteLightImage, 0);
    return {
      nameN: resN ? resN.name : null,
      nameL: resL ? resL.name : null,
      iniN,
      iniL,
      imgNChanged: currentN !== window._beforeLightingN,
      imgLChanged: currentL !== window._beforeLightingL,
      hasLightingKey: cfg && cfg.ImageLookups ? (cfg.ImageLookups.has('Lighting') || cfg.ImageLookups.has('lighting')) : false,
      lookupsLightingN: cfg && cfg.ImageLookups ? cfg.ImageLookups.get('LightingN') : null,
      lookupsLightingL: cfg && cfg.ImageLookups ? cfg.ImageLookups.get('LightingL') : null
    };
  });

  // LightingL 已更新，LightingN 保持其独立状态
  expect(afterL.imgNChanged).toBe(true);
  expect(afterL.imgLChanged).toBe(true);
  expect(afterL.hasLightingKey).toBe(false);

  // 3. 验证撤回行为 (Undo)
  await page.evaluate(() => {
    performSkinUndo();
  });
  const afterUndo1 = await page.evaluate(() => {
    const keys = getActiveKeyCount();
    const currentN = getManiaSkinImage(keys, LML.ExplosionImage, 0);
    const lFrames = getManiaSkinAnimationFrames(keys, LML.HoldNoteLightImage, 0);
    const currentL = lFrames ? lFrames[0] : getManiaSkinImage(keys, LML.HoldNoteLightImage, 0);
    return {
      imgNChanged: currentN !== window._beforeLightingN,
      imgLRestored: currentL === window._beforeLightingL
    };
  });
  // 仅撤回了 LightingL，LightingN 仍保持被替换状态
  expect(afterUndo1.imgLRestored).toBe(true);
  expect(afterUndo1.imgNChanged).toBe(true);

  await page.evaluate(() => {
    performSkinUndo();
  });
  const afterUndo2 = await page.evaluate(() => {
    const keys = getActiveKeyCount();
    const currentN = getManiaSkinImage(keys, LML.ExplosionImage, 0);
    const lFrames = getManiaSkinAnimationFrames(keys, LML.HoldNoteLightImage, 0);
    const currentL = lFrames ? lFrames[0] : getManiaSkinImage(keys, LML.HoldNoteLightImage, 0);
    return {
      imgNRestored: currentN === window._beforeLightingN,
      imgLRestored: currentL === window._beforeLightingL
    };
  });
  // 撤回了 LightingN，两者均恢复原状
  expect(afterUndo2.imgNRestored).toBe(true);
  expect(afterUndo2.imgLRestored).toBe(true);

  // 4. 验证重做行为 (Redo)
  await page.evaluate(() => {
    performSkinRedo();
  });
  const afterRedo1 = await page.evaluate(() => {
    const keys = getActiveKeyCount();
    const currentN = getManiaSkinImage(keys, LML.ExplosionImage, 0);
    const lFrames = getManiaSkinAnimationFrames(keys, LML.HoldNoteLightImage, 0);
    const currentL = lFrames ? lFrames[0] : getManiaSkinImage(keys, LML.HoldNoteLightImage, 0);
    return {
      imgNChanged: currentN !== window._beforeLightingN,
      imgLRestored: currentL === window._beforeLightingL
    };
  });
  expect(afterRedo1.imgNChanged).toBe(true);
  expect(afterRedo1.imgLRestored).toBe(true);

  await page.evaluate(() => {
    performSkinRedo();
  });
  const afterRedo2 = await page.evaluate(() => {
    const keys = getActiveKeyCount();
    const currentN = getManiaSkinImage(keys, LML.ExplosionImage, 0);
    const lFrames = getManiaSkinAnimationFrames(keys, LML.HoldNoteLightImage, 0);
    const currentL = lFrames ? lFrames[0] : getManiaSkinImage(keys, LML.HoldNoteLightImage, 0);
    return {
      imgNChanged: currentN !== window._beforeLightingN,
      imgLChanged: currentL !== window._beforeLightingL
    };
  });
  expect(afterRedo2.imgNChanged).toBe(true);
  expect(afterRedo2.imgLChanged).toBe(true);

  expect(errors).toEqual([]);
});

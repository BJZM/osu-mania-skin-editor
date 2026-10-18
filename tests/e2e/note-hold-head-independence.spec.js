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
    () => typeof textureImageEditorUi !== 'undefined' && typeof getManiaNoteTextureName === 'function',
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
  await page.waitForFunction(() => isSkinLoading === false && isStartupWorkspaceReady(), null, { timeout: 60000 });
  await page.waitForTimeout(250);
  return errors;
}

async function bootDefaultWorkspace(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });

  await page.goto('/index.html');
  await page.waitForFunction(
    () => typeof textureImageEditorUi !== 'undefined' && typeof isDefaultSkinLoaded !== 'undefined',
    null,
    { timeout: 30000 }
  );
  await page.setInputFiles('#oszInput', BEATMAP);
  await page.waitForFunction(() => isStartupBeatmapReady() && beatmaps.length > 0, null, { timeout: 60000 });
  await page.click('#startupUseDefaultSkinBtn');
  await page.waitForFunction(
    () => isDefaultSkinLoaded && isStartupSkinReady() && isEditableDefaultSkinWorkspaceActive(),
    null,
    { timeout: 60000 }
  );
  await page.waitForFunction(() => {
    const keys = getActiveKeyCount();
    return !!getManiaSkinImage(keys, LML.NoteImage, 0) &&
      !!getManiaSkinImage(keys, LML.HoldNoteHeadImage, 0);
  }, null, { timeout: 30000 });
  await page.waitForTimeout(250);
  return errors;
}

async function saveNoteImageAsIndependentIfShared(page) {
  await page.click('#textureImageApplyBtn');
  const scopeModal = page.locator('#textureImageApplyScopeModal');
  if (await scopeModal.isVisible()) {
    await page.click('#textureImageApplyScopeCurrentBtn');
    await expect(scopeModal).toBeHidden();
  }
  await page.waitForFunction(() => textureImageEditorUi.getState().dirtyTabCount === 0);
}

test('编辑单键不会改写同轨回退使用的长条头贴图', async ({ page }) => {
  const errors = await boot(page);

  const before = await page.evaluate(() => {
    const keys = getActiveKeyCount();
    const cfg = getManiaConfigForKeys(keys);
    for (const key of ['NoteImage0H', 'noteimage0h', 'HoldNoteHeadImage0', 'holdnoteheadimage0']) {
      cfg.ImageLookups.delete(key);
      delete cfg[key];
    }

    const noteName = getManiaNoteTextureName(keys, LML.NoteImage, 0);
    const headName = getManiaNoteTextureName(keys, LML.HoldNoteHeadImage, 0);
    const note = getManiaSkinImage(keys, LML.NoteImage, 0);
    const head = getManiaSkinImage(keys, LML.HoldNoteHeadImage, 0);
    return {
      keys,
      noteName,
      headName,
      noteSize: { width: note.width, height: note.height },
      headSize: { width: head.width, height: head.height }
    };
  });

  expect(before.headName).toBe(before.noteName);
  expect(before.headSize).toEqual(before.noteSize);

  await page.click('#openTextureImageEditorBtn');
  await page.click('#textureImagePickerGrid [data-param-key="NoteImage0"]');
  await page.waitForFunction(() => textureImageEditorUi.getState().selectedKey === 'NoteImage0');

  await page.fill('#textureImageCropRight', '4');
  await page.waitForFunction(
    (width) => textureImageEditorUi.getState().previewSize.width === width,
    before.noteSize.width + 4
  );
  await saveNoteImageAsIndependentIfShared(page);

  const after = await page.evaluate(() => {
    const keys = getActiveKeyCount();
    const cfg = getManiaConfigForKeys(keys);
    const noteName = getManiaNoteTextureName(keys, LML.NoteImage, 0);
    const headName = getManiaNoteTextureName(keys, LML.HoldNoteHeadImage, 0);
    const note = getManiaSkinImage(keys, LML.NoteImage, 0);
    const head = getManiaSkinImage(keys, LML.HoldNoteHeadImage, 0);
    return {
      noteName,
      headName,
      noteSize: { width: note.width, height: note.height },
      headSize: { width: head.width, height: head.height },
      explicitHead: cfg.ImageLookups.get('NoteImage0H') || cfg.NoteImage0H || ''
    };
  });

  expect(after.noteName).not.toBe(before.noteName);
  expect(after.headName).toBe(before.headName);
  expect(after.explicitHead).toBe(before.noteName);
  expect(after.noteSize.width).toBe(before.noteSize.width + 4);
  expect(after.headSize).toEqual(before.headSize);
  expect(errors).toEqual([]);
});

test('默认皮肤编辑单键后，长条头仍从默认资源库正常解析', async ({ page }) => {
  const errors = await bootDefaultWorkspace(page);

  const before = await page.evaluate(() => {
    const keys = getActiveKeyCount();
    const note = getManiaSkinImage(keys, LML.NoteImage, 0);
    const head = getManiaSkinImage(keys, LML.HoldNoteHeadImage, 0);
    return {
      keys,
      noteSize: note ? { width: note.width, height: note.height } : null,
      headSize: head ? { width: head.width, height: head.height } : null,
      customStoreSize: skinImageStore.size,
      defaultStoreSize: defaultSkinImageStore.size,
      defaultKeys: Array.from(defaultSkinImageStore.keys()).filter((key) => /mania-note1h?/i.test(key))
    };
  });
  expect(before.noteSize).not.toBeNull();
  expect(before.headSize).not.toBeNull();
  expect(before.customStoreSize).toBe(0);

  await page.click('#openTextureImageEditorBtn');
  await page.click('#textureImagePickerGrid [data-param-key="NoteImage0"]');
  await page.waitForFunction(() => textureImageEditorUi.getState().selectedKey === 'NoteImage0');
  await page.fill('#textureImageCropRight', '4');
  await page.waitForFunction(
    (width) => textureImageEditorUi.getState().previewSize.width === width,
    before.noteSize.width + 4
  );
  await saveNoteImageAsIndependentIfShared(page);

  const after = await page.evaluate(() => {
    const keys = getActiveKeyCount();
    const schema = SKIN_INI_PARAM_SCHEMA.find((item) => item.key === 'HoldNoteHeadImage');
    const headParam = expandPerTrackTextureParams(schema, keys, true)
      .find((item) => item.key === 'NoteImage0H');
    const resolved = resolveTextureParam(keys, headParam);
    const head = getManiaSkinImage(keys, LML.HoldNoteHeadImage, 0);
    return {
      state: resolved.state,
      name: resolved.name,
      size: { width: head.width, height: head.height },
      explicitHead: getManiaConfigForKeys(keys).ImageLookups.get('NoteImage0H') || ''
    };
  });

  expect(after.explicitHead.toLowerCase()).toBe('mania-note1h');
  expect(after.state).toBe('ok');
  expect(after.name.toLowerCase()).toBe('mania-note1h');
  expect(after.size).toEqual(before.headSize);
  expect(errors).toEqual([]);
});

test('长条头实际回退到单键文件时会固定该文件，而不是固定缺失的头图名', async ({ page }) => {
  const errors = await boot(page);

  const before = await page.evaluate(() => {
    const keys = getActiveKeyCount();
    const cfg = getManiaConfigForKeys(keys);
    for (const key of ['NoteImage0', 'noteimage0', 'NoteImage0H', 'noteimage0h',
      'HoldNoteHeadImage0', 'holdnoteheadimage0']) {
      cfg.ImageLookups.delete(key);
      delete cfg[key];
    }

    const removeHeadAssets = (store) => {
      for (const key of Array.from(store.keys())) {
        if (/mania-note1h(?:$|[-.@])/i.test(key)) store.delete(key);
      }
    };
    removeHeadAssets(skinImageStore);
    removeHeadAssets(skinFallbackImageStore);
    removeHeadAssets(defaultSkinImageStore);

    const note = getManiaSkinImage(keys, LML.NoteImage, 0);
    const head = getManiaSkinImage(keys, LML.HoldNoteHeadImage, 0);
    return {
      noteSize: { width: note.width, height: note.height },
      headSize: { width: head.width, height: head.height }
    };
  });

  expect(before.headSize).toEqual(before.noteSize);

  await page.click('#openTextureImageEditorBtn');
  await page.click('#textureImagePickerGrid [data-param-key="NoteImage0"]');
  await page.waitForFunction(() => textureImageEditorUi.getState().selectedKey === 'NoteImage0');
  await page.fill('#textureImageCropRight', '4');
  await page.waitForFunction(
    (width) => textureImageEditorUi.getState().previewSize.width === width,
    before.noteSize.width + 4
  );
  await saveNoteImageAsIndependentIfShared(page);

  const after = await page.evaluate(() => {
    const keys = getActiveKeyCount();
    const cfg = getManiaConfigForKeys(keys);
    const head = getManiaSkinImage(keys, LML.HoldNoteHeadImage, 0);
    return {
      headName: getManiaNoteTextureName(keys, LML.HoldNoteHeadImage, 0),
      headSize: { width: head.width, height: head.height },
      explicitHead: cfg.ImageLookups.get('NoteImage0H') || cfg.NoteImage0H || ''
    };
  });
  expect(after.explicitHead).toBe('mania-note1');
  expect(after.headName).toBe('mania-note1');
  expect(after.headSize).toEqual(before.headSize);
  expect(errors).toEqual([]);
});

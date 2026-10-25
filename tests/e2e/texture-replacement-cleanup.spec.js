const path = require('path');
const { test, expect } = require('@playwright/test');

const ROOT = path.resolve(__dirname, '../..');
const SKIN = path.join(ROOT, 'samples', 'skins', 'Kumakalerki.osk');
const MINIMAL_BEATMAP = path.join(ROOT, 'samples', 'beatmaps', 'minimal-4k.osu');

async function loadWorkspace(page) {
  await page.goto('/index.html');
  await page.waitForFunction(
    () => typeof prepareTextureReplacement === 'function' &&
      typeof completeTextureReplacement === 'function' &&
      typeof textureImageEditorUi !== 'undefined',
    null,
    { timeout: 30000 }
  );
  await page.setInputFiles('#oskInput', SKIN);
  await page.waitForFunction(() => isSkinLoading === false && skinImageStore.size > 0, null, { timeout: 60000 });
  await page.setInputFiles('#oszInput', MINIMAL_BEATMAP);
  await page.waitForFunction(() => isStartupWorkspaceReady(), null, { timeout: 60000 });
  await page.click('#openTextureImageEditorBtn');
  await page.waitForFunction(() => document.getElementById('textureImageEditorModal').classList.contains('active'));
}

async function prepareSharedReplacement(page, include7K = true) {
  return page.evaluate((with7K) => {
    const keys = getActiveKeyCount();
    const candidates = collectExistingTextureSources().filter((source) => {
      const identities = new Set([normalizeTextureReplacementIdentity(source.path)]);
      if (!normalizeTextureReplacementIdentity(source.path)) return false;
      if (!isTextureReplacementSourceOwned(source)) return false;
      if (!source.frames || source.frames.length !== 1) return false;
      return collectTexturePathReferences(source.path, { allKeyCounts: true }).length === 0 &&
        identities.size === 1;
    });
    if (candidates.length < 2) throw new Error('Not enough unreferenced owned textures');

    const oldPath = candidates[0].path;
    const newPath = candidates[1].path;
    const params = getTextureTabParams();
    const hint = params.find((p) => p.key === 'StageHint');
    const light = params.find((p) => p.key === 'StageLight');
    if (!hint || !light) throw new Error('Missing StageHint or StageLight params');

    assignTextureParamLookup(keys, hint, oldPath);
    assignTextureParamLookup(keys, light, oldPath);

    if (with7K) {
      const config7 = ensureManiaConfigForKeys(7);
      maniaSkinConfigurations.set(7, config7);
      const hint7 = getTextureTabParamsForKeys(7).find((p) => p.key === 'StageHint');
      if (!hint7) throw new Error('Missing 7K StageHint param');
      assignTextureParamLookup(7, hint7, oldPath);
    }

    return {
      oldPath,
      newPath,
      oldIdentity: normalizeTextureReplacementIdentity(oldPath),
      initialReferences: collectTexturePathReferences(oldPath, { allKeyCounts: true }).length
    };
  }, include7K);
}

async function openExistingPickerFor(page, paramKey) {
  const opened = await page.evaluate((key) => {
    const p = getTextureTabParams().find((item) => item.key === key);
    return p ? openTextureExistingPicker(p, getActiveKeyCount()) : false;
  }, paramKey);
  expect(opened).toBe(true);
  await expect(page.locator('#textureExistingPickerModal')).toHaveCSS('display', 'flex');
}

async function chooseExistingSource(page, sourcePath) {
  await page.fill('#textureExistingPickerSearch', sourcePath);
  const card = page.locator('#textureExistingPickerGrid .texture-existing-card').first();
  await expect(card).toHaveAttribute('data-texture-path', sourcePath);
  await card.click();
  await page.click('#textureExistingPickerConfirmBtn');
  await expect(page.locator('#textureExistingPickerModal')).toHaveCSS('display', 'none');
}

async function replacementState(page, oldPath) {
  return page.evaluate((pathValue) => {
    const identity = normalizeTextureReplacementIdentity(pathValue);
    return {
      references: collectTexturePathReferences(pathValue, { allKeyCounts: true }).length,
      visible: collectExistingTextureSources().some(
        (source) => normalizeTextureReplacementIdentity(source.path) === identity
      ),
      deleted: Array.from(deletedSkinTexturePaths)
    };
  }, oldPath);
}

test('existing picker keeps shared sources until the final reference leaves, with undo and redo', async ({ page }) => {
  await loadWorkspace(page);
  const setup = await prepareSharedReplacement(page, true);
  expect(setup.initialReferences).toBeGreaterThan(3);
  const undoBefore = await page.evaluate(() => undoStack.length);

  await openExistingPickerFor(page, 'StageHint');
  await chooseExistingSource(page, setup.newPath);
  expect(await page.evaluate(() => undoStack.length)).toBe(undoBefore + 1);
  const afterFirst = await replacementState(page, setup.oldPath);
  expect(afterFirst.references).toBeGreaterThan(0);
  expect(afterFirst.references).toBeLessThan(setup.initialReferences);
  expect(afterFirst.visible).toBe(true);

  await openExistingPickerFor(page, 'StageLight');
  await chooseExistingSource(page, setup.newPath);
  expect(await page.evaluate(() => undoStack.length)).toBe(undoBefore + 2);
  const afterSecond = await replacementState(page, setup.oldPath);
  expect(afterSecond.references).toBeGreaterThan(0);
  expect(afterSecond.references).toBeLessThan(afterFirst.references);
  expect(afterSecond.visible).toBe(true);

  const cleanup = await page.evaluate((newPath) => {
    const p = getTextureTabParamsForKeys(7).find((item) => item.key === 'StageHint');
    const replacement = prepareTextureReplacement(p, 7, newPath);
    recordSkinUndoBeforeChange('replace final shared texture', { force: true });
    assignTextureParamLookup(7, p, newPath);
    return completeTextureReplacement(replacement);
  }, setup.newPath);
  expect(cleanup.deleted).toBe(true);

  const afterFinal = await replacementState(page, setup.oldPath);
  expect(afterFinal.references).toBe(0);
  expect(afterFinal.visible).toBe(false);
  expect(afterFinal.deleted).toContain(`${setup.oldPath.replace(/\\/g, '/').toLowerCase()}.png`);

  await page.click('#textureImageUndoBtn');
  await page.waitForFunction((identity) => collectExistingTextureSources().some(
    (source) => normalizeTextureReplacementIdentity(source.path) === identity
  ), setup.oldIdentity);
  const afterUndo = await replacementState(page, setup.oldPath);
  expect(afterUndo.references).toBeGreaterThan(0);
  expect(afterUndo.visible).toBe(true);

  await page.click('#textureImageRedoBtn');
  await page.waitForFunction((identity) => !collectExistingTextureSources().some(
    (source) => normalizeTextureReplacementIdentity(source.path) === identity
  ), setup.oldIdentity);
  const afterRedo = await replacementState(page, setup.oldPath);
  expect(afterRedo.references).toBe(0);
  expect(afterRedo.visible).toBe(false);

  const exportedOldPaths = await page.evaluate(async (identity) => {
    const archive = await buildSkinArchiveBlob('zip', { mode: 'release' });
    const zip = await JSZip.loadAsync(await archive.blob.arrayBuffer());
    return Object.keys(zip.files).filter((filename) =>
      normalizeTextureReplacementIdentity(filename) === identity
    );
  }, setup.oldIdentity);
  expect(exportedOldPaths).toEqual([]);
});

test('direct path input cleans the old source only after its final reference', async ({ page }) => {
  await loadWorkspace(page);
  const setup = await prepareSharedReplacement(page, false);

  await page.evaluate(({ paramKey, pathValue }) => {
    const input = document.querySelector(`#param-card-${paramKey} .texture-path-input`);
    input.value = pathValue;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, { paramKey: 'StageHint', pathValue: setup.newPath });
  const afterFirst = await replacementState(page, setup.oldPath);
  expect(afterFirst.references).toBeGreaterThan(0);
  expect(afterFirst.references).toBeLessThan(setup.initialReferences);
  expect(afterFirst.visible).toBe(true);

  await page.waitForTimeout(700);
  await page.evaluate(({ paramKey }) => {
    const input = document.querySelector(`#param-card-${paramKey} .texture-path-input`);
    input.value = 'missing-replacement-target';
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, { paramKey: 'StageLight' });
  const afterMissing = await replacementState(page, setup.oldPath);
  expect(afterMissing.references).toBe(0);
  expect(afterMissing.visible).toBe(true);

  await page.waitForTimeout(700);
  await page.evaluate(({ paramKey, pathValue }) => {
    const input = document.querySelector(`#param-card-${paramKey} .texture-path-input`);
    input.value = pathValue;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, { paramKey: 'StageLight', pathValue: setup.oldPath });

  await page.waitForTimeout(700);
  await page.evaluate(({ paramKey, pathValue }) => {
    const input = document.querySelector(`#param-card-${paramKey} .texture-path-input`);
    input.value = pathValue;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, { paramKey: 'StageLight', pathValue: setup.newPath });

  const afterSecond = await replacementState(page, setup.oldPath);
  expect(afterSecond.references).toBe(0);
  expect(afterSecond.visible).toBe(false);
});

test('local upload applies the same cleanup transaction', async ({ page }) => {
  await loadWorkspace(page);
  const setup = await prepareSharedReplacement(page, false);

  const upload = async (paramKey, lookup) => page.evaluate(async ({ key, lookupValue }) => {
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 8;
    canvas.getContext('2d').fillRect(0, 0, 8, 8);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    const arrayBuffer = await blob.arrayBuffer();
    const file = new File([blob], 'cleanup-replacement.png', { type: 'image/png' });
    return textureUploadUi.applyEditedTexture(
      file,
      arrayBuffer,
      canvas,
      false,
      'cleanup-replacement',
      lookupValue,
      key,
      null,
      { notify: false }
    );
  }, { key: paramKey, lookupValue: lookup });

  expect(await upload('StageHint', 'HitTargetImage')).toBe(true);
  const afterFirst = await replacementState(page, setup.oldPath);
  expect(afterFirst.references).toBeGreaterThan(0);
  expect(afterFirst.references).toBeLessThan(setup.initialReferences);
  expect(afterFirst.visible).toBe(true);

  expect(await upload('StageLight', 'LightImage')).toBe(true);
  const afterSecond = await replacementState(page, setup.oldPath);
  expect(afterSecond.references).toBe(0);
  expect(afterSecond.visible).toBe(false);

  await page.click('#textureImageUndoBtn');
  await page.waitForFunction((identity) => collectExistingTextureSources().some(
    (source) => normalizeTextureReplacementIdentity(source.path) === identity
  ), setup.oldIdentity);
  expect((await replacementState(page, setup.oldPath)).references).toBeGreaterThan(0);

  await page.click('#textureImageRedoBtn');
  await page.waitForFunction((identity) => !collectExistingTextureSources().some(
    (source) => normalizeTextureReplacementIdentity(source.path) === identity
  ), setup.oldIdentity);
  expect((await replacementState(page, setup.oldPath)).references).toBe(0);
});

test('created library textures are not auto-deleted by replacement cleanup', async ({ page }) => {
  await loadWorkspace(page);
  const result = await page.evaluate(() => {
    const keys = getActiveKeyCount();
    const createdPath = 'created-replacement-keep';
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 8;
    canvas.getContext('2d').fillRect(0, 0, 8, 8);
    saveSkinAssetToStore(skinImageStore, createdPath, canvas, false, true, true);
    saveSkinAssetToStore(skinFallbackImageStore, createdPath, canvas, false, true, true);
    saveCreatedTextureParams(createdPath, {
      name: createdPath,
      width: 8,
      height: 8,
      spec: '1x'
    });

    const params = getTextureTabParams();
    const hint = params.find((p) => p.key === 'StageHint');
    const light = params.find((p) => p.key === 'StageLight');
    assignTextureParamLookup(keys, hint, createdPath);
    assignTextureParamLookup(keys, light, createdPath);

    const newPath = collectExistingTextureSources().find(
      (source) => normalizeTextureReplacementIdentity(source.path) !==
        normalizeTextureReplacementIdentity(createdPath)
    ).path;
    const hintReplacement = prepareTextureReplacement(hint, keys, newPath);
    assignTextureParamLookup(keys, hint, newPath);
    completeTextureReplacement(hintReplacement);
    const lightReplacement = prepareTextureReplacement(light, keys, newPath);
    assignTextureParamLookup(keys, light, newPath);
    const cleanup = completeTextureReplacement(lightReplacement);

    return {
      cleanup,
      remains: collectExistingTextureSources().some((source) =>
        normalizeTextureReplacementIdentity(source.path) ===
          normalizeTextureReplacementIdentity(createdPath)
      ),
      hasCreatedParams: hasCreatedTextureParams(createdPath)
    };
  });

  expect(result.cleanup.deleted).toBe(false);
  expect(result.cleanup.reason).toBe('not-owned');
  expect(result.remains).toBe(true);
  expect(result.hasCreatedParams).toBe(true);
});

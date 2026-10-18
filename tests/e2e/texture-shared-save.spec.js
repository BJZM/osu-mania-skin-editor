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
  await page.waitForFunction(() => typeof textureImageEditorUi !== 'undefined');
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
  return errors;
}

async function installSharedNoteReference(page, name, columns) {
  await page.evaluate(({ name, columns }) => {
    const keys = getActiveKeyCount();
    const cfg = getManiaConfigForKeys(keys);
    if (!cfg.ImageLookups) cfg.ImageLookups = new Map();
    const frame = document.createElement('canvas');
    frame.width = 30;
    frame.height = 60;
    const ctx = frame.getContext('2d');
    ctx.fillStyle = '#d557a3';
    ctx.fillRect(0, 0, frame.width, frame.height);
    saveSkinAssetToStore(skinImageStore, name, frame, false, true, true);
    saveSkinAssetToStore(skinFallbackImageStore, name, frame, false, true, true);
    for (const column of columns) {
      cfg[`NoteImage${column}`] = name;
      cfg.ImageLookups.set(`NoteImage${column}`, name);
      cfg.ImageLookups.set(`NoteImage${column}`.toLowerCase(), name);
    }
    drawFrame();
  }, { name, columns });
}

async function openNoteEditor(page, paramKey = 'NoteImage0') {
  await page.click('#openTextureImageEditorBtn');
  await page.click(`#textureImagePickerGrid [data-param-key="${paramKey}"]`);
  await page.waitForFunction((key) => textureImageEditorUi.getState().selectedKey === key, paramKey);
  await page.fill('#textureImageCropRight', '4');
  await page.waitForFunction(() => textureImageEditorUi.getState().previewSize.width === 34);
}

function readNoteState(page) {
  return page.evaluate(() => {
    const keys = getActiveKeyCount();
    return {
      names: [0, 1].map((column) =>
        getManiaNoteTextureName(keys, LML.NoteImage, column)
      ),
      sizes: [0, 1].map((column) => {
        const image = getManiaSkinImage(keys, LML.NoteImage, column);
        return image ? { width: image.width, height: image.height } : null;
      })
    };
  });
}

test('generic shared texture save can overwrite the original path', async ({ page }) => {
  const errors = await boot(page);
  await installSharedNoteReference(page, 'shared-note-save', [0, 1]);
  const before = await readNoteState(page);

  await openNoteEditor(page);
  await page.click('#textureImageApplyBtn');
  await expect(page.locator('#textureImageApplyScopeModal')).toBeVisible();
  await page.click('#textureImageApplyScopeAllBtn');
  await page.waitForFunction(() => textureImageEditorUi.getState().dirtyTabCount === 0);
  const after = await readNoteState(page);

  expect(after.names).toEqual(before.names);
  expect(after.sizes).toEqual([
    { width: 34, height: 60 },
    { width: 34, height: 60 }
  ]);
  expect(errors).toEqual([]);
});

test('generic shared texture save can create an independent copy', async ({ page }) => {
  const errors = await boot(page);
  await installSharedNoteReference(page, 'shared-note-copy', [0, 1]);
  const before = await readNoteState(page);

  await openNoteEditor(page);
  await page.click('#textureImageApplyBtn');
  await expect(page.locator('#textureImageApplyScopeModal')).toBeVisible();
  await page.click('#textureImageApplyScopeCurrentBtn');
  await page.waitForFunction(() => textureImageEditorUi.getState().dirtyTabCount === 0);
  const after = await readNoteState(page);

  expect(after.names[0]).not.toBe(before.names[0]);
  expect(after.names[0]).toContain('shared-note-copy');
  expect(after.names[1]).toBe(before.names[1]);
  expect(after.sizes).toEqual([
    { width: 34, height: 60 },
    { width: 30, height: 60 }
  ]);
  expect(errors).toEqual([]);
});

test('unshared texture saves without a scope prompt', async ({ page }) => {
  const errors = await boot(page);
  await installSharedNoteReference(page, 'single-note-save', [0]);
  const before = await readNoteState(page);

  await openNoteEditor(page);
  await page.click('#textureImageApplyBtn');
  await expect(page.locator('#textureImageApplyScopeModal')).toBeHidden();
  await page.waitForFunction(() => textureImageEditorUi.getState().dirtyTabCount === 0);
  const after = await readNoteState(page);

  expect(after.names[0]).toBe(before.names[0]);
  expect(after.sizes[0]).toEqual({ width: 34, height: 60 });
  expect(errors).toEqual([]);
});

const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, expect } = require('@playwright/test');
const JSZip = require('../../vendor/jszip.min.js');

const ROOT = path.resolve(__dirname, '../..');
const SKIN = path.join(ROOT, 'samples', 'skins', 'Kumakalerki.osk');
const BEATMAP = path.join(ROOT, 'samples', 'beatmaps', '1790742 MIMI - Kuu ni Naru.osz');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'texture-project-e2e-'));
test.setTimeout(90000);

test.afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function boot(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  await page.goto('/index.html');
  await page.waitForFunction(
    () => typeof exportSkin === 'function' &&
      typeof readTextureProjectFromArchive === 'function'
  );
  await page.setInputFiles('#oskInput', SKIN);
  await page.waitForFunction(() => isSkinLoading === false, null, { timeout: 60000 });
  await page.setInputFiles('#oszInput', BEATMAP);
  await page.waitForFunction(() => beatmaps.length > 0, null, { timeout: 60000 });
  await page.waitForFunction(
    () => isStartupWorkspaceReady() && isSkinLoading === false,
    null,
    { timeout: 60000 }
  );
  await page.waitForTimeout(400);
  return errors;
}

async function seedTextureProjectState(page) {
  await page.evaluate(() => {
    const keys = getActiveKeyCount();
    const param = getTextureTabParams().find((item) => item.key === 'NoteImage0');
    const target = buildEditorTarget(param);
    const source = document.createElement('canvas');
    source.width = 24;
    source.height = 32;
    const sourceCtx = source.getContext('2d');
    sourceCtx.fillStyle = '#ff66aa';
    sourceCtx.fillRect(4, 4, 16, 24);

    const tail = document.createElement('canvas');
    tail.width = 12;
    tail.height = 10;
    const tailCtx = tail.getContext('2d');
    tailCtx.fillStyle = '#ffffff';
    tailCtx.fillRect(2, 0, 8, 10);

    textureEditRecipes.set(`${keys}|${param.key}`, {
      sourceFrames: [source],
      originalReference: normalizeSkinKey(target.base || param.default || 'mania-note1'),
      keyImageOriginalSources: {},
      params: {
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        cropLeft: 0,
        cropRight: 0,
        cropTop: 0,
        cropBottom: 0,
        cropX: 0,
        cropY: 0,
        widthDelta: 0,
        heightDelta: 0,
        imageTransform: {
          scalePercent: 125,
          stretchX: 0,
          stretchY: 0,
          scaleAfterStretch: false,
          anchorX: 0.5,
          anchorY: 0.5
        },
        rgbAdjustment: { r: 110, g: 100, b: 90 }
      },
      outputFrames: target.frames.slice()
    });

    createdSkinTextureParams.set('texture-project-test', {
      name: 'texture-project-test',
      width: 32,
      height: 32,
      spec: '1x',
      shape: 'circle',
      fillColor: '#66ccff',
      fillAlpha: 100,
      outlineEnabled: false,
      generalEditParams: {
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        imageTransform: {
          scalePercent: 140,
          stretchX: 2,
          stretchY: 0,
          scaleAfterStretch: false,
          anchorX: 0.5,
          anchorY: 0.5
        },
        rgbAdjustment: { r: 100, g: 120, b: 100 }
      }
    });

    longBodyComposerSessions.set(`${keys}|NoteImage0L`, {
      baseFrames: [cloneFrame(source)],
      tailFrame: cloneFrame(tail),
      bodySourceName: 'mania-note1',
      tailSourceName: 'mania-note1T',
      targetHeight: 40000,
      coverage: 96,
      fade: 35,
      tailPreset: 'round',
      presetHeight: 18
    });
  });
}

async function exportViaMode(page, format, mode) {
  await page.evaluate((targetFormat) => {
    const button = document.getElementById(targetFormat === 'zip' ? 'exportZipBtn' : 'exportOskBtn');
    button.click();
  }, format);
  await expect(page.locator('#textureExportModeModal')).toBeVisible();
  const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
  await page.click(mode === 'editable' ? '#textureExportEditableBtn' : '#textureExportReleaseBtn');
  return downloadPromise;
}

test('导出方式可选，可编辑模式写入工程源图而发布模式保持干净', async ({ page }) => {
  const errors = await boot(page);
  await seedTextureProjectState(page);

  const editableDownload = await exportViaMode(page, 'osk', 'editable');
  const editableZip = await JSZip.loadAsync(fs.readFileSync(await editableDownload.path()));
  const editableEntries = Object.keys(editableZip.files);
  expect(editableEntries).toContain('_skin-editor/texture-project.json');
  expect(editableEntries.some((name) => name.startsWith('_skin-editor/sources/'))).toBe(true);
  const manifest = JSON.parse(await editableZip.file('_skin-editor/texture-project.json').async('string'));
  expect(manifest.createdTextures).toHaveLength(1);
  expect(manifest.editedTextures).toHaveLength(1);
  expect(manifest.longBodies).toHaveLength(1);
  expect(manifest.longBodies[0].settings.targetHeight).toBe(40000);
  const sourceFiles = editableEntries.filter((name) => name.startsWith('_skin-editor/sources/') && !name.endsWith('/'));
  expect(sourceFiles).toHaveLength(2);

  const projectStateBeforeRelease = await page.evaluate(() => ({
    created: createdSkinTextureParams.size,
    recipes: textureEditRecipes.size,
    longBodies: longBodyComposerSessions.size
  }));
  const releaseDownload = await exportViaMode(page, 'zip', 'release');
  const releaseZip = await JSZip.loadAsync(fs.readFileSync(await releaseDownload.path()));
  expect(Object.keys(releaseZip.files).some((name) => name.startsWith('_skin-editor/'))).toBe(false);
  expect(await page.evaluate(() => ({
    created: createdSkinTextureParams.size,
    recipes: textureEditRecipes.size,
    longBodies: longBodyComposerSessions.size
  }))).toEqual(projectStateBeforeRelease);
  expect(errors).toEqual([]);
});

test('再次导入可编辑工程会恢复生成参数、普通贴图配方和投皮断点', async ({ page }) => {
  const errors = await boot(page);
  await seedTextureProjectState(page);

  const editableDownload = await exportViaMode(page, 'osk', 'editable');
  const downloadPath = path.join(tmpDir, 'editable-project.osk');
  await editableDownload.saveAs(downloadPath);
  await page.setInputFiles('#oskInput', downloadPath);
  await page.waitForFunction(
    () => isSkinLoading === false && hasActiveTextureProjectImport(),
    null,
    { timeout: 60000 }
  );
  await page.waitForTimeout(350);

  const restored = await page.evaluate(async () => {
    const keys = getActiveKeyCount();
    const param = getTextureTabParams().find((item) => item.key === 'NoteImage0');
    const target = buildEditorTarget(param);
    const recipe = getStoredTextureEditRecipe(target);
    const longBody = longBodyComposerSessions.get(`${keys}|NoteImage0L`);
    const created = createdSkinTextureParams.get('texture-project-test');
    const generated = createSolidShapeTexture(created);
    const generatedEdited = buildEditedFrames([generated], created.generalEditParams);
    const longBodyPreview = await buildLongBodyCompositeForSourceAsync({
      ...longBody,
      targetHeight: longBody.targetHeight
    }, 200);
    return {
      created,
      generatedSize: { width: generated.width, height: generated.height },
      generatedEditedSize: generatedEdited && generatedEdited.frames[0]
        ? {
            width: generatedEdited.frames[0].width,
            height: generatedEdited.frames[0].height
          }
        : null,
      recipeScale: recipe && recipe.params && recipe.params.imageTransform
        ? recipe.params.imageTransform.scalePercent
        : null,
      recipeRgb: recipe && recipe.params ? recipe.params.rgbAdjustment : null,
      longBodyHeight: longBody ? longBody.targetHeight : null,
      longBodyFade: longBody ? longBody.fade : null,
      longBodyPreviewHeight: longBodyPreview ? longBodyPreview.height : null,
      hiddenRegistered: Array.from(skinImageStore.keys())
        .some((key) => key.startsWith('_skin-editor/'))
    };
  });

  expect(restored.created).toBeTruthy();
  expect(restored.generatedSize).toEqual({ width: 32, height: 32 });
  expect(restored.generatedEditedSize).toEqual({ width: 47, height: 45 });
  expect(restored.created.generalEditParams.imageTransform.scalePercent).toBe(140);
  expect(restored.created.generalEditParams.rgbAdjustment.g).toBe(120);
  expect(restored.recipeScale).toBe(125);
  expect(restored.recipeRgb).toEqual({ r: 110, g: 100, b: 90 });
  expect(restored.longBodyHeight).toBe(40000);
  expect(restored.longBodyFade).toBe(35);
  expect(restored.longBodyPreviewHeight).toBe(200);
  expect(restored.hiddenRegistered).toBe(false);

  expect(await page.evaluate(() => hasActiveTextureProjectImport())).toBe(true);
  expect(errors).toEqual([]);
});

test('发布版再次导入不恢复工程状态，投皮会话仍可被全局撤销恢复', async ({ page }) => {
  const errors = await boot(page);
  await seedTextureProjectState(page);

  const [releaseDownload] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }),
    page.evaluate(() => exportSkin('osk', { mode: 'release' }))
  ]);
  const releasePath = path.join(tmpDir, 'release-project.osk');
  await releaseDownload.saveAs(releasePath);
  await page.setInputFiles('#oskInput', releasePath);
  await page.waitForFunction(() => isSkinLoading === false, null, { timeout: 60000 });
  await page.waitForTimeout(300);
  const releaseState = await page.evaluate(() => ({
    created: createdSkinTextureParams.size,
    recipes: textureEditRecipes.size,
    longBodies: longBodyComposerSessions.size,
    projectActive: hasActiveTextureProjectImport()
  }));
  expect(releaseState).toEqual({
    created: 0,
    recipes: 0,
    longBodies: 0,
    projectActive: false
  });

  await seedTextureProjectState(page);
  const undoRestored = await page.evaluate(() => {
    const keys = getActiveKeyCount();
    const sessionKey = `${keys}|NoteImage0L`;
    recordSkinUndoBeforeChange('测试投皮会话快照', { force: true });
    const session = longBodyComposerSessions.get(sessionKey);
    session.targetHeight = 24000;
    longBodyComposerSessions.set(sessionKey, session);
    performSkinUndo();
    return longBodyComposerSessions.get(sessionKey).targetHeight;
  });
  expect(undoRestored).toBe(40000);
  expect(errors).toEqual([]);
});

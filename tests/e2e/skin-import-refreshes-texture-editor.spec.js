const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, expect } = require('@playwright/test');
const JSZip = require('../../vendor/jszip.min.js');

const ROOT = path.resolve(__dirname, '../..');
const SKIN = path.join(ROOT, 'samples', 'skins', 'Kumakalerki.osk');
const BEATMAP = path.join(ROOT, 'samples', 'beatmaps', '1790742 MIMI - Kuu ni Naru.osz');

let tmpDir;
let replacementSkin;

test.beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skin-import-texture-refresh-'));
  const zip = new JSZip();
  zip.file('mania-stage-left.png', fs.readFileSync(path.join(ROOT, 'assets', 'app-icon.png')));
  replacementSkin = path.join(tmpDir, 'replacement-stage-left.osk');
  fs.writeFileSync(replacementSkin, await zip.generateAsync({ type: 'nodebuffer' }));
});

test.afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function collectPageErrors(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  return errors;
}

async function bootWorkspace(page) {
  await page.goto('/index.html');
  await page.waitForFunction(
    () => typeof textureImageEditorUi !== 'undefined' && typeof isStartupWorkspaceReady === 'function',
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
}

test('导入新皮肤时保持已打开的贴图编辑标签并刷新为新皮肤资源', async ({ page }) => {
  const errors = collectPageErrors(page);
  await bootWorkspace(page);

  await page.click('#openTextureImageEditorBtn');
  await page.evaluate(() => textureImageEditorUi.selectByParamKey('StageLeft'));
  await page.waitForFunction(() => {
    const state = textureImageEditorUi.getState();
    return state.selectedKey === 'StageLeft' &&
      state.sourceSize &&
      state.sourceSize.width === 32 &&
      state.sourceSize.height === 770;
  });

  await page.setInputFiles('#oskInput', replacementSkin);
  await page.waitForFunction(() => isSkinLoading === false && currentSkinFileName === 'replacement-stage-left.osk');
  await page.waitForFunction(() => {
    const state = textureImageEditorUi.getState();
    return state.selectedKey === 'StageLeft' &&
      state.sourceSize &&
      state.sourceSize.width === 256 &&
      state.sourceSize.height === 256;
  }, null, { timeout: 10000 });

  expect(await page.evaluate(() => {
    const state = textureImageEditorUi.getState();
    return {
      activeTabId: state.activeTabId,
      selectedKey: state.selectedKey,
      sourceSize: state.sourceSize,
      editorVisible: getComputedStyle(document.getElementById('textureImageEditorView')).display !== 'none',
      pickerVisible: getComputedStyle(document.getElementById('textureImagePickerView')).display !== 'none'
    };
  })).toEqual({
    activeTabId: expect.stringMatching(/^texture-\d+$/),
    selectedKey: 'StageLeft',
    sourceSize: { width: 256, height: 256 },
    editorVisible: true,
    pickerVisible: false
  });
  expect(errors).toEqual([]);
});

test('导入新皮肤时保持全部贴图标签打开并刷新资源列表', async ({ page }) => {
  const errors = collectPageErrors(page);
  await bootWorkspace(page);

  await page.click('#openTextureImageEditorBtn');
  await page.click('.texture-image-tab[data-tab-id="texture-library"]');
  await page.waitForFunction(() => {
    const state = textureLibraryUi.getState();
    return state.active && state.sourceCount > 1;
  });

  await page.setInputFiles('#oskInput', replacementSkin);
  await page.waitForFunction(() => isSkinLoading === false && currentSkinFileName === 'replacement-stage-left.osk');
  await page.waitForFunction(() => textureLibraryUi.getState().sourceCount === 1, null, { timeout: 10000 });

  expect(await page.evaluate(() => ({
    library: textureLibraryUi.getState(),
    libraryVisible: getComputedStyle(document.getElementById('textureImageLibraryView')).display !== 'none',
    pickerVisible: getComputedStyle(document.getElementById('textureImagePickerView')).display !== 'none',
    editorVisible: getComputedStyle(document.getElementById('textureImageEditorView')).display !== 'none',
    cardCount: document.querySelectorAll('#textureImageLibraryGrid .texture-existing-card').length
  }))).toMatchObject({
    library: {
      active: true,
      sourceCount: 1,
      visibleCount: 1
    },
    libraryVisible: true,
    pickerVisible: false,
    editorVisible: false,
    cardCount: 1
  });
  expect(errors).toEqual([]);
});

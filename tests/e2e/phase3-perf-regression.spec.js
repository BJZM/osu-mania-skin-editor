const path = require('path');
const { test, expect } = require('@playwright/test');

const ROOT = path.resolve(__dirname, '../..');
const LARGE_SKIN = path.join(ROOT, 'samples', 'skins', 'R Skin v3.1(Rin O edit V5.1).osk');
const SMALL_SKIN = path.join(ROOT, 'samples', 'skins', 'Kumakalerki.osk');
const MINIMAL_BEATMAP = path.join(ROOT, 'samples', 'beatmaps', 'minimal-4k.osu');
const LN_BEATMAP = path.join(ROOT, 'samples', 'beatmaps', "1939237 Various Artists - Hylotl's LN Collection.osz");

test('高密度长条谱 Seek 往返、UpsideDown 切换与大型 .osk 并发导入回归', async ({ page }) => {
  test.setTimeout(90000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });

  await page.goto('/index.html');
  await page.waitForFunction(
    () => typeof drawFrame === 'function' && typeof getOrBuildNotesRenderIndex === 'function',
    null,
    { timeout: 30000 }
  );

  await page.setInputFiles('#oskInput', LARGE_SKIN);
  await page.waitForFunction(() => isSkinLoading === false && isStartupSkinReady(), null, { timeout: 60000 });

  await page.setInputFiles('#oszInput', LN_BEATMAP);
  await page.waitForFunction(() => isStartupWorkspaceReady() && Array.isArray(beatmaps) && beatmaps.length > 0, null, { timeout: 60000 });

  await page.evaluate(async () => {
    let bestIdx = 0;
    let bestScore = -1;
    for (let i = 0; i < beatmaps.length; i++) {
      const bm = beatmaps[i];
      const count = (bm && bm.data && bm.data.hitObjects) ? bm.data.hitObjects.length : 0;
      if (count > bestScore) {
        bestScore = count;
        bestIdx = i;
      }
    }
    await loadBeatmapDifficulty(bestIdx);
  });
  await page.waitForFunction(() => activeNotes.length > 500, null, { timeout: 30000 });

  const checkResult = await page.evaluate(() => {
    const idx = getOrBuildNotesRenderIndex(activeNotes);
    const maxTime = activeNotes.reduce((m, n) => Math.max(m, n.endTime || n.startTime), 0);
    const seekFractions = [0.18, 0.72, 0.35, 0.88, 0.05];
    const mismatches = [];

    const naiveComboAt = (t) => {
      let combo = 0;
      for (let i = 0; i < activeNotes.length; i++) {
        const n = activeNotes[i];
        if (n.isHold) {
          if (t >= n.startTime) combo++;
          if (n.ticks && n.ticks.length > 0) {
            for (let k = 0; k < n.ticks.length; k++) {
              if (t >= n.ticks[k]) combo++;
              else break;
            }
          }
          if (t >= n.endTime) combo++;
        } else if (t >= n.startTime) {
          combo++;
        }
      }
      return combo;
    };

    const prevEditMode = canvasEditMode;
    canvasEditMode = true;
    const keys = Math.round(currentBeatmap.difficulty.circleSize);
    const cfg = ensureManiaConfigForKeys(keys);
    const prevUpsideDown = cfg.UpsideDown;

    for (let s = 0; s < seekFractions.length; s++) {
      const targetSec = (maxTime * seekFractions[s]) / 1000;
      const targetMs = targetSec * 1000;
      cfg.UpsideDown = (s % 2 === 1);
      if (ui.progressRange) ui.progressRange.value = String(targetSec);
      isSeeking = true;
      syncNotesStateWithTime(targetMs);
      drawFrame();
      isSeeking = false;

      const indexedCombo = upperBoundFloat64(idx.comboEventTimes, targetMs);
      const expectedCombo = naiveComboAt(targetMs);
      if (indexedCombo !== expectedCombo) {
        mismatches.push({ targetMs, indexedCombo, expectedCombo });
      }
    }

    cfg.UpsideDown = prevUpsideDown;
    canvasEditMode = prevEditMode;
    drawFrame();

    return {
      noteCount: activeNotes.length,
      holdCount: idx.holds.length,
      sorted: idx.sorted,
      comboEventCount: idx.comboEventTimes.length,
      mismatches,
      storeSize: skinImageStore.size
    };
  });

  expect(checkResult.noteCount).toBeGreaterThan(500);
  expect(checkResult.holdCount).toBeGreaterThan(100);
  expect(checkResult.sorted).toBe(true);
  expect(checkResult.comboEventCount).toBeGreaterThan(checkResult.noteCount);
  expect(checkResult.storeSize).toBeGreaterThan(20);
  expect(checkResult.mismatches).toEqual([]);
  expect(errors).toEqual([]);
});

test('纯色贴图创建器防抖输入后立即确认创建仍同步读取最新表单参数', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });

  await page.goto('/index.html');
  await page.waitForFunction(
    () => typeof textureImageEditorUi !== 'undefined' && typeof createSolidShapeTexture === 'function',
    null,
    { timeout: 30000 }
  );
  await page.setInputFiles('#oskInput', SMALL_SKIN);
  await page.waitForFunction(() => isSkinLoading === false, null, { timeout: 60000 });
  await page.setInputFiles('#oszInput', MINIMAL_BEATMAP);
  await page.waitForFunction(() => isStartupWorkspaceReady(), null, { timeout: 60000 });
  await page.waitForTimeout(200);

  await page.click('#openTextureImageEditorBtn');
  await page.waitForSelector('#textureImageCreateOpenBtn', { state: 'visible' });
  await page.click('#textureImageCreateOpenBtn');
  await page.waitForSelector('#textureImageCreateWidth', { state: 'visible' });

  // 连续触发输入后不等待防抖结束，立即点击确认创建
  await page.evaluate(() => {
    const setInput = (id, val) => {
      const el = document.getElementById(id);
      el.value = String(val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    setInput('textureImageCreateName', 'phase3-debounce-test');
    setInput('textureImageCreateWidth', '96');
    setInput('textureImageCreateHeight', '48');
    setInput('textureImageCreateAlphaValue', '75');
    setInput('textureImageCreateColorHex', '#33aaee');
    document.getElementById('textureImageCreateConfirmBtn').click();
  });

  await page.waitForFunction(
    () => typeof getCreatedTextureParams === 'function' && !!getCreatedTextureParams('phase3-debounce-test'),
    null,
    { timeout: 10000 }
  );

  const saved = await page.evaluate(() => {
    const params = getCreatedTextureParams('phase3-debounce-test');
    const entry = skinImageStore.get('phase3-debounce-test');
    const img = entry && (entry.static2x || entry.static1x);
    return {
      params,
      width: img ? img.width : 0,
      height: img ? img.height : 0
    };
  });

  expect(saved.params.width).toBe(96);
  expect(saved.params.height).toBe(48);
  expect(saved.params.alpha).toBe(75);
  expect(saved.params.color.toLowerCase()).toBe('#33aaee');
  expect(saved.width).toBe(96);
  expect(saved.height).toBe(48);
  expect(errors).toEqual([]);
});

test('i18n 语言切换在 zh-CN 与 en 间正确启用/还原帮助弹窗 HTML 翻译', async ({ page }) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof window.I18n !== 'undefined');

  await page.evaluate(() => window.I18n.setLanguage('en'));
  const enSample = await page.evaluate(() => {
    const el = document.querySelector('#helpModal .desc-val');
    return el ? el.innerHTML : '';
  });
  expect(enSample).toContain('ColumnWidth');

  await page.evaluate(() => window.I18n.setLanguage('zh-CN'));
  const zhSample = await page.evaluate(() => {
    const el = document.querySelector('#helpModal .desc-val');
    return el ? el.innerHTML : '';
  });
  expect(zhSample).toContain('无视图片自身宽度');
});

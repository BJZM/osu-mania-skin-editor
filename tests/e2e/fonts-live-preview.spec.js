const path = require('path');
const { test, expect } = require('@playwright/test');

const ROOT = path.resolve(__dirname, '../..');
const SKIN = path.join(ROOT, 'samples', 'skins', 'Kumakalerki.osk');
const BEATMAP = path.join(ROOT, 'samples', 'beatmaps', 'minimal-4k.osu');

async function openFontsEditor(page) {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof drawFrame === 'function', null, { timeout: 30000 });
  await page.setInputFiles('#oskInput', SKIN);
  await page.waitForFunction(() => isSkinLoading === false, null, { timeout: 60000 });
  await page.setInputFiles('#oszInput', BEATMAP);
  await page.waitForFunction(
    () => beatmaps.length > 0 && isStartupSkinReady(),
    null,
    { timeout: 60000 }
  );
  await page.evaluate(() => {
    openSkinEditorDialog();
    switchEditorTab('fonts');
  });
}

test('字体与数字重叠参数会实时反映到画布并正确撤回', async ({ page }) => {
  await openFontsEditor(page);

  const before = await page.evaluate(() => {
    const keys = getActiveKeyCount();
    const cfg = ensureManiaConfigForKeys(keys);
    cfg.ScoreOverlap = 12;
    cfg.ComboOverlap = 3;
    skinFontsConfig.scoreOverlap = 0;
    skinFontsConfig.comboOverlap = 0;
    skinFontsConfig.hasExplicitScoreOverlap = false;
    skinFontsConfig.hasExplicitComboOverlap = false;
    currentCombo = 2468;
    comboAnimState.lastCombo = currentCombo;
    comboAnimState.incStartTime = -1e9;
    renderSkinEditorParams();
    drawFrame();

    const combo = canvasInteractiveElements.find((item) => item.id === 'combo');
    const data = ctx.getImageData(
      Math.max(0, Math.floor(combo.x)),
      Math.max(0, Math.floor(combo.y)),
      Math.max(1, Math.floor(combo.w)),
      Math.max(1, Math.floor(combo.h))
    ).data;
    let comboHash = 2166136261;
    for (let i = 0; i < data.length; i += 4) {
      comboHash ^= data[i] + data[i + 1] * 3 + data[i + 2] * 7 + data[i + 3] * 11;
      comboHash = Math.imul(comboHash, 16777619);
    }

    return {
      scoreOverlap: getSkinFontOverlap('score', keys),
      comboOverlap: getSkinFontOverlap('combo', keys),
      scoreX: canvasInteractiveElements.find((item) => item.id === 'hud_score_digit_0').x,
      comboHash,
      scoreSlider: Number(document.querySelector('#param-card-ScoreOverlap input[type="range"]').value),
      comboSlider: Number(document.querySelector('#param-card-ComboOverlap input[type="range"]').value)
    };
  });

  expect(before.scoreOverlap).toBe(12);
  expect(before.comboOverlap).toBe(3);
  expect(before.scoreSlider).toBe(12);
  expect(before.comboSlider).toBe(3);

  const after = await page.evaluate(() => {
    const scoreSlider = document.querySelector('#param-card-ScoreOverlap input[type="range"]');
    scoreSlider.value = '20';
    scoreSlider.dispatchEvent(new Event('input', { bubbles: true }));
    const comboslider = document.querySelector('#param-card-ComboOverlap input[type="range"]');
    comboslider.value = '18';
    comboslider.dispatchEvent(new Event('input', { bubbles: true }));
    drawFrame();

    const keys = getActiveKeyCount();
    const combo = canvasInteractiveElements.find((item) => item.id === 'combo');
    const data = ctx.getImageData(
      Math.max(0, Math.floor(combo.x)),
      Math.max(0, Math.floor(combo.y)),
      Math.max(1, Math.floor(combo.w)),
      Math.max(1, Math.floor(combo.h))
    ).data;
    let comboHash = 2166136261;
    for (let i = 0; i < data.length; i += 4) {
      comboHash ^= data[i] + data[i + 1] * 3 + data[i + 2] * 7 + data[i + 3] * 11;
      comboHash = Math.imul(comboHash, 16777619);
    }

    return {
      scoreOverlap: getSkinFontOverlap('score', keys),
      comboOverlap: getSkinFontOverlap('combo', keys),
      scoreX: canvasInteractiveElements.find((item) => item.id === 'hud_score_digit_0').x,
      comboHash,
      explicitScore: skinFontsConfig.hasExplicitScoreOverlap,
      explicitCombo: skinFontsConfig.hasExplicitComboOverlap
    };
  });

  expect(after.scoreOverlap).toBe(20);
  expect(after.comboOverlap).toBe(18);
  expect(after.explicitScore).toBe(true);
  expect(after.explicitCombo).toBe(true);
  expect(after.scoreX).not.toBeCloseTo(before.scoreX, 1);
  expect(after.comboHash).not.toBe(before.comboHash);

  const undone = await page.evaluate(() => {
    performSkinUndo();
    drawFrame();
    const keys = getActiveKeyCount();
    return {
      scoreOverlap: getSkinFontOverlap('score', keys),
      comboOverlap: getSkinFontOverlap('combo', keys),
      explicitScore: skinFontsConfig.hasExplicitScoreOverlap,
      explicitCombo: skinFontsConfig.hasExplicitComboOverlap
    };
  });

  expect(undone).toEqual({
    scoreOverlap: 12,
    comboOverlap: 3,
    explicitScore: false,
    explicitCombo: false
  });
});

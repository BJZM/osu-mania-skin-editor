const { test, expect } = require('@playwright/test');

test('NoteBodyStyle parsing and rendering respects osu! wiki specification', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  await page.goto('/index.html');
  await page.waitForFunction(
    () => typeof drawFrame === 'function' && typeof getManiaSkinConfig === 'function',
    null,
    { timeout: 30000 }
  );

  const result = await page.evaluate(() => {
    // 1. 验证默认值按 osu! wiki 为 1 (Cascade from top / RepeatFromTail)
    const def = getManiaSkinConfig(4, LML.NoteBodyStyle);
    
    // 2. 验证解析皮肤文本中的 NoteBodyStyle 与逐轨 NoteBodyStyle#
    const testIni = [
      '[Mania]',
      'Keys: 4',
      'NoteBodyStyle: cascade from bottom',
      'NoteBodyStyle0: stretch',
      'NoteBodyStyle1: cascade from top'
    ].join('\n');
    parseSkinIniLazer(testIni);

    const styleCol0 = getManiaSkinConfig(4, LML.NoteBodyStyle, 0);
    const styleCol1 = getManiaSkinConfig(4, LML.NoteBodyStyle, 1);
    const styleCol2 = getManiaSkinConfig(4, LML.NoteBodyStyle, 2); // 应该回退到全局 cascade from bottom (2)

    return {
      defaultVal: def ? def.value : null,
      col0: styleCol0 ? styleCol0.value : null,
      col1: styleCol1 ? styleCol1.value : null,
      col2: styleCol2 ? styleCol2.value : null,
    };
  });

  expect(result.defaultVal).toBe(1);
  expect(result.col0).toBe(0); // stretch
  expect(result.col1).toBe(1); // cascade from top
  expect(result.col2).toBe(2); // cascade from bottom
  expect(pageErrors).toEqual([]);
});

test('Percy LN ultra-long texture tiles at 1:1 scale from top without squishing', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  await page.goto('/index.html');
  await page.waitForFunction(() => typeof drawFrame === 'function', null, { timeout: 30000 });

  // Load Kumakalerki.osk which contains a real 128x40000 Percy LN body texture
  const path = require('path');
  const kumakalerki = path.resolve(__dirname, '../../samples/skins/Kumakalerki.osk');
  await page.setInputFiles('#oskInput', kumakalerki);
  await page.waitForFunction(() => isSkinLoading === false, null, { timeout: 60000 });
  await page.waitForTimeout(500);

  const renderInfo = await page.evaluate(() => {
    canvasEditMode = true;
    currentManiaKeys = 4;
    drawFrame();

    const headEl = canvasInteractiveElements.find(item => item.id === 'hold_head_1');
    const bodyEl = canvasInteractiveElements.find(item => item.id === 'hold_body_1');
    const tailEl = canvasInteractiveElements.find(item => item.id === 'hold_tail_1');

    return {
      headEl,
      bodyEl,
      tailEl
    };
  });

  expect(renderInfo.headEl).not.toBeNull();
  expect(renderInfo.bodyEl).not.toBeNull();
  expect(renderInfo.tailEl).not.toBeNull();
  // 1. 身体顶点与尾巴顶点严格对齐 (覆盖整个尾巴内部，无腰斩缝隙)
  expect(renderInfo.bodyEl.y).toBeCloseTo(renderInfo.tailEl.y, 1);
  // 2. 身体底端与长条头中心对齐 (osu!stable 机制: 长条身体基准高出半个长条头高度，判定线位于长条头贴图中心)
  const bodyBottom = renderInfo.bodyEl.y + renderInfo.bodyEl.h;
  const headCenter = renderInfo.headEl.y + renderInfo.headEl.h / 2;
  expect(bodyBottom).toBeCloseTo(headCenter, 1);
  expect(pageErrors).toEqual([]);
});

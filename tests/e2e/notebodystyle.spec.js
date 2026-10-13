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

    const numericIni = [
      '[Mania]',
      'Keys: 4',
      'NoteBodyStyle: 1',
      'NoteBodyStyle0: 3',
      'NoteBodyStyle1: 4'
    ].join('\n');
    parseSkinIniLazer(numericIni);

    const numericGlobal = getManiaSkinConfig(4, LML.NoteBodyStyle);
    const numericCol0 = getManiaSkinConfig(4, LML.NoteBodyStyle, 0);
    const numericCol1 = getManiaSkinConfig(4, LML.NoteBodyStyle, 1);
    const schemaDefault = SKIN_INI_PARAM_SCHEMA
      .find(item => item.key === 'NoteBodyStyle')
      ?.default;

    return {
      defaultVal: def ? def.value : null,
      col0: styleCol0 ? styleCol0.value : null,
      col1: styleCol1 ? styleCol1.value : null,
      col2: styleCol2 ? styleCol2.value : null,
      numericGlobal: numericGlobal ? numericGlobal.value : null,
      numericCol0: numericCol0 ? numericCol0.value : null,
      numericCol1: numericCol1 ? numericCol1.value : null,
      schemaDefault,
    };
  });

  // 未显式配置时，NoteBodyStyle 默认使用 RepeatFromTail。
  expect(result.defaultVal).toBe(1);
  expect(result.col0).toBe(0); // stretch
  expect(result.col1).toBe(1); // cascade from top
  expect(result.col2).toBe(2); // cascade from bottom
  // skin.ini 数值映射：1=FromTail，2=FromHead，3/4=TopAndBottom。
  expect(result.numericGlobal).toBe(1);
  expect(result.numericCol0).toBe(3);
  expect(result.numericCol1).toBe(3);
  expect(result.schemaDefault).toBe(1);
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

  // 身体长度等于头尾两个下端锚点之间的滚动距离，而不由尾巴顶端裁切决定。
  const headBottom = renderInfo.headEl.y + renderInfo.headEl.h;
  const tailBottom = renderInfo.tailEl.y + renderInfo.tailEl.h;
  expect(renderInfo.bodyEl.h).toBeCloseTo(headBottom - tailBottom, 1);

  // 身体底端与长条头中心对齐。
  const bodyBottom = renderInfo.bodyEl.y + renderInfo.bodyEl.h;
  const headCenter = renderInfo.headEl.y + renderInfo.headEl.h / 2;
  expect(bodyBottom).toBeCloseTo(headCenter, 1);
  expect(pageErrors).toEqual([]);
});

test('hold note body length stays fixed when head texture height changes', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  await page.goto('/index.html');
  await page.waitForFunction(
    () => typeof drawFrame === 'function' && typeof saveSkinAssetToStore === 'function',
    null,
    { timeout: 30000 }
  );

  const result = await page.evaluate(async () => {
    function makeImage(width, height, color) {
      return new Promise((resolve) => {
        const c = document.createElement('canvas');
        c.width = width;
        c.height = height;
        const cx = c.getContext('2d');
        cx.fillStyle = color;
        cx.fillRect(0, 0, width, height);
        const img = new Image();
        img.onload = () => resolve(img);
        img.src = c.toDataURL();
      });
    }

    async function setTexture(key, width, height, color) {
      const img = await makeImage(width, height, color);
      img._is2x = false;
      img._isRootLevel = true;
      saveSkinAssetToStore(skinImageStore, key, img, false, true, true);
    }

    await setTexture('mania-note2h', 16, 16, '#fff');
    await setTexture('mania-note2l', 16, 32, '#fff');
    await setTexture('mania-note2t', 16, 8, '#fff');

    isPreviewMode = true;
    canvasEditMode = true;
    currentManiaKeys = 4;

    const sample = () => {
      drawFrame();
      cancelAnimationFrame(animationId);

      const headEl = canvasInteractiveElements.find(item => item.id === 'hold_head_1');
      const bodyEl = canvasInteractiveElements.find(item => item.id === 'hold_body_1');
      const tailEl = canvasInteractiveElements.find(item => item.id === 'hold_tail_1');

      return headEl && bodyEl && tailEl
        ? {
            headCenter: headEl.y + headEl.h / 2,
            headBottom: headEl.y + headEl.h,
            bodyTop: bodyEl.y,
            bodyHeight: bodyEl.h,
            tailTop: tailEl.y,
            tailBottom: tailEl.y + tailEl.h
          }
        : null;
    };

    const halfHead = sample();
    await setTexture('mania-note2h', 16, 8, '#fff');
    const shortHead = sample();
    await setTexture('mania-note2h', 16, 32, '#fff');
    const fullHead = sample();

    const cfg = ensureManiaConfigForKeys(4);
    const styleSamples = [];
    for (const style of [0, 1, 2, 3]) {
      cfg.NoteBodyStyle = style;
      cfg.NoteBodyStyles[1] = style;
      const styled = sample();
      styleSamples.push({
        style,
        bodyTop: styled.bodyTop,
        bodyHeight: styled.bodyHeight
      });
    }

    return { shortHead, halfHead, fullHead, styleSamples };
  });

  expect(result.shortHead).not.toBeNull();
  expect(result.halfHead).not.toBeNull();
  expect(result.fullHead).not.toBeNull();

  const headCenterRise = result.halfHead.headCenter - result.fullHead.headCenter;
  expect(headCenterRise).toBeGreaterThan(0);

  // 头图高度翻倍后，身体长度不变，身体整体随头中心上移。
  expect(result.shortHead.bodyHeight).toBeCloseTo(result.halfHead.bodyHeight, 1);
  expect(result.fullHead.bodyHeight).toBeCloseTo(result.halfHead.bodyHeight, 1);
  expect(result.fullHead.bodyTop).toBeCloseTo(result.halfHead.bodyTop - headCenterRise, 1);
  expect(result.shortHead.bodyTop).toBeGreaterThan(result.shortHead.tailTop);
  expect(result.halfHead.bodyTop).toBeCloseTo(result.halfHead.tailTop, 1);
  expect(result.fullHead.bodyTop).toBeLessThan(result.halfHead.tailTop);

  // 头图下端仍与身体底端保持对齐。
  expect(result.shortHead.bodyTop + result.shortHead.bodyHeight).toBeCloseTo(result.shortHead.headCenter, 1);
  expect(result.halfHead.bodyTop + result.halfHead.bodyHeight).toBeCloseTo(result.halfHead.headCenter, 1);
  expect(result.fullHead.bodyTop + result.fullHead.bodyHeight).toBeCloseTo(result.fullHead.headCenter, 1);

  // 尾巴位置由自身下端锚点决定，不随头图高度变化。
  expect(result.shortHead.tailTop).toBeCloseTo(result.halfHead.tailTop, 1);
  expect(result.fullHead.tailTop).toBeCloseTo(result.halfHead.tailTop, 1);
  expect(result.shortHead.tailBottom).toBeCloseTo(result.halfHead.tailBottom, 1);
  expect(result.fullHead.tailBottom).toBeCloseTo(result.halfHead.tailBottom, 1);

  // NoteBodyStyle 只改变身体矩形内部的贴图取样，不改变身体位置或长度。
  for (const styled of result.styleSamples) {
    expect(styled.bodyTop).toBeCloseTo(result.fullHead.bodyTop, 1);
    expect(styled.bodyHeight).toBeCloseTo(result.fullHead.bodyHeight, 1);
  }
  expect(pageErrors).toEqual([]);
});

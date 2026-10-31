const { test, expect } = require('@playwright/test');

async function installKeyImage(page, key, opaque) {
  await page.evaluate(async ({ key, opaque }) => {
    const texture = document.createElement('canvas');
    texture.width = 100;
    texture.height = 400;
    if (opaque) {
      const textureCtx = texture.getContext('2d');
      textureCtx.fillStyle = '#111111';
      textureCtx.fillRect(0, 0, texture.width, texture.height);
    }

    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
      image.src = texture.toDataURL();
    });
    registerSkinImage(key, image);
  }, { key, opaque });
}

test('KeyImage 盖住判定线，透明像素仍露出判定线', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/index.html');
  await page.waitForFunction(
    () => typeof drawFrame === 'function' &&
      typeof markStartupBeatmapReady === 'function' &&
      typeof markStartupSkinReady === 'function',
    null,
    { timeout: 30000 }
  );

  await page.evaluate(() => {
    skinImageStore.clear();
    skinFallbackImageStore.clear();
    defaultSkinImageStore.clear();
    defaultSkinFallbackStore.clear();
  });
  await installKeyImage(page, 'test-transparent-keyimage', false);
  await installKeyImage(page, 'test-opaque-keyimage', true);

  const result = await page.evaluate(() => {
    markStartupBeatmapReady();
    markStartupSkinReady();
    cancelAnimationFrame(animationId);
    isPlaying = false;
    isSeeking = true;
    currentBeatmap = {
      keys: 4,
      difficulty: { circleSize: 4 },
      hitObjects: [],
      timingPoints: []
    };
    currentTimingPoints = [];
    activeNotes = [];
    judgements = [];
    activeEditorKeyCount = 4;
    currentManiaScrollState = null;
    canvasEditMode = false;
    hasCanvasBg = false;

    maniaSkinConfigurations.clear();
    const cfg = ensureManiaConfigForKeys(4);
    Object.assign(cfg, {
      SkinVersion: 2.7,
      ShowJudgementLine: true,
      HitPosition: 300,
      ColumnStart: 136,
      ColumnWidth: [60, 60, 60, 60],
      ColumnSpacing: [10, 10, 10],
      ColumnLineWidth: [0, 0, 0, 0, 0],
      ColumnColour: Array.from({ length: 4 }, () => ({ r: 0, g: 0, b: 0, a: 0 })),
      KeysUnderNotes: 1,
      BarLineHeight: 0,
      UpsideDown: false
    });
    cfg.ImageLookups = new Map([
      ['KeyImage0', 'test-transparent-keyimage'],
      ['KeyImage0D', 'test-transparent-keyimage'],
      ['KeyImage1', 'test-opaque-keyimage'],
      ['KeyImage1D', 'test-opaque-keyimage']
    ]);
    maniaSkinConfigurations.set(4, cfg);

    const scale48 = canvas.height / 480;
    const hitY = Math.round(cfg.HitPosition * scale48);
    const colStartX = Math.round(cfg.ColumnStart * scale48);
    const colWidth = Math.round(cfg.ColumnWidth[0] * scale48);
    const colSpacing = Math.round(cfg.ColumnSpacing[0] * scale48);
    const insideKeyImageX = colStartX + Math.round(colWidth / 2);
    const insideOpaqueKeyImageX = colStartX + colWidth + colSpacing + Math.round(colWidth / 2);
    const gapX = colStartX + colWidth + Math.round(colSpacing / 2);

    const sample = (x) => {
      let max = 0;
      for (let dy = -3; dy <= 3; dy++) {
        const data = ctx.getImageData(x, hitY + dy, 1, 1).data;
        max = Math.max(max, data[0], data[1], data[2]);
      }
      return max;
    };

    cfg.ShowJudgementLine = true;
    drawFrame();
    const insideWithLine = sample(insideKeyImageX);
    const opaqueWithLine = sample(insideOpaqueKeyImageX);
    const gapWithLine = sample(gapX);

    cfg.ShowJudgementLine = false;
    drawFrame();
    const insideWithoutLine = sample(insideKeyImageX);
    const opaqueWithoutLine = sample(insideOpaqueKeyImageX);
    const gapWithoutLine = sample(gapX);

    return {
      insideWithLine,
      insideWithoutLine,
      opaqueWithLine,
      opaqueWithoutLine,
      gapWithLine,
      gapWithoutLine
    };
  });

  expect(result.insideWithLine).toBeGreaterThan(200);
  expect(result.insideWithoutLine).toBeLessThan(80);
  expect(result.opaqueWithLine).toBeLessThan(80);
  expect(result.opaqueWithoutLine).toBeLessThan(80);
  expect(result.gapWithLine).toBeGreaterThan(200);
  expect(result.gapWithoutLine).toBeLessThan(80);
  expect(pageErrors).toEqual([]);
});

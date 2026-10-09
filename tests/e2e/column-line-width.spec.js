const { test, expect } = require('@playwright/test');

test('ColumnLineWidth normalizes, renders, clips and mirrors correctly', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await page.goto('/');
  await page.waitForFunction(
    () => typeof drawFrame === 'function' && typeof focusParameter === 'function',
    null,
    { timeout: 30000 }
  );

  const result = await page.evaluate(() => {
    activeEditorKeyCount = 4;
    currentBeatmap = {
      keys: 4,
      difficulty: { circleSize: 4 },
      hitObjects: [],
      timingPoints: []
    };
    activeNotes = [];
    currentTimingPoints = [];
    judgements = [];
    isPreviewJudgementActive = false;
    skinImageStore.clear();
    skinFallbackImageStore.clear();
    defaultSkinImageStore.clear();
    const cfg = ensureManiaConfigForKeys(4);
    Object.assign(cfg, {
      SkinVersion: 2.7,
      UpsideDown: false,
      ColumnStart: 100,
      ColumnWidth: [60, 60, 60, 60],
      ColumnSpacing: [0, 0, 0],
      ColumnLineWidth: [0, 0, 0, 0, 2],
      ColumnColour: Array.from({ length: 4 }, () => ({ r: 0, g: 0, b: 0, a: 0 })),
      HitPosition: 402
    });
    cfg.CustomColours = cfg.CustomColours || {};
    cfg.CustomColours.columnline = 'rgba(255,0,0,1)';

    focusParameter('ColumnLineWidth');
    const card = document.getElementById('param-card-ColumnLineWidth');
    const labels = Array.from(card.querySelectorAll('.chip-label')).map(item => item.textContent);
    const textInput = card.querySelector('.param-text-input');
    textInput.value = '0,10,0,10';
    textInput.dispatchEvent(new Event('change', { bubbles: true }));
    drawFrame();
    const normalizedAfterInput = cfg.ColumnLineWidth.slice();

    const scale48 = canvas.height / 480;
    const scale768 = canvas.height / 768;
    const lineWidth = 10 * 0.740 * scale768;
    const defaultWidth = 2 * 0.740 * scale768;
    const boundary12 = 160 * scale48;
    const lastBoundary = 340 * scale48;
    const pixel = (x, y) => Array.from(ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data);
    const maxRed = (x, y) => {
      let max = 0;
      for (let dx = -3; dx <= 3; dx++) {
        max = Math.max(max, pixel(x + dx, y)[0]);
      }
      return max;
    };

    cfg.ColumnLineWidth = [0, 10, 0, 10, 2];
    cfg.UpsideDown = false;
    drawFrame();
    const lastBoundaryRed = maxRed(lastBoundary - defaultWidth / 2, 20);

    const sampleLayout = (lineWidths, upsideDown) => {
      cfg.ColumnLineWidth = [...lineWidths];
      cfg.UpsideDown = upsideDown;
      drawFrame();
      return {
        above: maxRed(boundary12 + lineWidth / 2, 20),
        below: maxRed(boundary12 + lineWidth / 2, 402 * scale48 + 18),
        top: maxRed(boundary12 + lineWidth / 2, 8),
        belowHit: maxRed(boundary12 + lineWidth / 2, canvas.height - 402 * scale48 + 8)
      };
    };

    const normalWithoutLine = sampleLayout([0, 0, 0, 0, 0], false);
    const normalWithLine = sampleLayout([0, 10, 0, 10, 2], false);
    const mirroredWithoutLine = sampleLayout([0, 0, 0, 0, 0], true);
    const mirroredWithLine = sampleLayout([0, 10, 0, 10, 2], true);

    return {
      labels,
      normalizedAfterInput,
      inputValue: textInput.value,
      lastBoundaryRed,
      normalAboveChanged: normalWithLine.above !== normalWithoutLine.above,
      normalBelowChanged: normalWithLine.below !== normalWithoutLine.below,
      mirroredTopChanged: mirroredWithLine.top !== mirroredWithoutLine.top,
      mirroredBelowHitChanged: mirroredWithLine.belowHit !== mirroredWithoutLine.belowHit
    };
  });

  expect(result.labels).toEqual(['左边界', '轨1-2线', '轨2-3线', '轨3-4线', '右边界']);
  expect(result.normalizedAfterInput).toEqual([0, 10, 0, 10, 2]);
  expect(result.inputValue).toBe('0,10,0,10,2');
  expect(result.lastBoundaryRed).toBeGreaterThan(120);
  expect(result.normalAboveChanged).toBe(true);
  expect(result.normalBelowChanged).toBe(false);
  expect(result.mirroredTopChanged).toBe(false);
  expect(result.mirroredBelowHitChanged).toBe(true);
  expect(pageErrors).toEqual([]);
});

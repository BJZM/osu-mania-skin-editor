const { test, expect } = require('@playwright/test');

test('背景暗化不会改变舞台左右侧图的亮度', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await page.goto('/index.html');
  await page.waitForFunction(
    () => typeof drawFrame === 'function' &&
      typeof markStartupBeatmapReady === 'function' &&
      typeof markStartupSkinReady === 'function',
    null,
    { timeout: 30000 }
  );

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
    isPreviewJudgementActive = false;

    const makeStageImage = (baseColor, fileName) => {
      const surface = document.createElement('canvas');
      surface.width = 120;
      surface.height = 768;
      const surfaceCtx = surface.getContext('2d');
      surfaceCtx.fillStyle = baseColor;
      surfaceCtx.fillRect(0, 0, surface.width, surface.height);
      // 舞台侧图通常是不透明的整图，黑色像素必须保持黑色，不能继承背景亮度。
      surfaceCtx.fillStyle = '#000';
      surfaceCtx.fillRect(30, 0, 60, surface.height);
      const rawImage = new Image();
      rawImage.src = surface.toDataURL();
      return new Promise((resolve, reject) => {
        rawImage.onload = () => {
          const processedImage = processSkinImage(rawImage, fileName);
          if (processedImage.complete) {
            resolve(processedImage);
            return;
          }
          processedImage.onload = () => resolve(processedImage);
          processedImage.onerror = reject;
        };
        rawImage.onerror = reject;
      });
    };

    return Promise.all([
      makeStageImage('rgb(210, 40, 30)', 'stageleft.png'),
      makeStageImage('rgb(30, 120, 210)', 'mania-stage-right.png'),
      makeStageImage('rgb(255, 235, 0)', 'background.png')
    ]).then(([leftImage, rightImage, backgroundImage]) => {
      skinImageStore.clear();
      skinFallbackImageStore.clear();
      defaultSkinImageStore.clear();
      defaultSkinFallbackStore.clear();
      registerSkinImage('test-stage-left-background-dim', leftImage);
      registerSkinImage('test-stage-right-background-dim', rightImage);

      maniaSkinConfigurations.clear();
      const cfg = ensureManiaConfigForKeys(4);
      Object.assign(cfg, {
        ImageLookups: new Map([
          ['StageLeft', 'test-stage-left-background-dim'],
          ['StageRight', 'test-stage-right-background-dim']
        ]),
        SkinVersion: 2.7,
        ShowJudgementLine: false,
        HitPosition: 300,
        ColumnStart: 136,
        ColumnWidth: [60, 60, 60, 60],
        ColumnSpacing: [0, 0, 0],
        ColumnLineWidth: [0, 0, 0, 0, 0],
        ColumnColour: Array.from({ length: 4 }, () => ({ r: 0, g: 0, b: 0, a: 255 })),
        KeysUnderNotes: 1,
        BarLineHeight: 0,
        UpsideDown: false
      });
      maniaSkinConfigurations.set(4, cfg);

      const scale48 = canvas.height / 480;
      const scale768 = canvas.height / 768;
      const colStartX = cfg.ColumnStart * scale48;
      const stageWidth = 60 * scale48 * 4;
      const stageSideWidth = 120 * scale768;
      const sampleLeftX = Math.max(2, Math.round(colStartX - stageSideWidth / 2));
      const sampleRightX = Math.min(
        canvas.width - 2,
        Math.round(colStartX + stageWidth + stageSideWidth / 2)
      );
      const sampleY = Math.round(canvas.height * 0.4);
      const read = (x) => Array.from(ctx.getImageData(x, sampleY, 1, 1).data);

      bgDim = 0;
      hasCanvasBg = false;
      drawFrame();
      const dim0 = {
        left: read(sampleLeftX),
        right: read(sampleRightX)
      };

      bgDim = 100;
      hasCanvasBg = true;
      canvasBgImage = backgroundImage;
      drawFrame();
      const dim100 = {
        left: read(sampleLeftX),
        right: read(sampleRightX)
      };

      // 模拟背景/故事板绘制意外遗留的低透明度状态，舞台侧图仍须恢复完整亮度。
      hasCanvasBg = false;
      ctx.globalAlpha = 0.2;
      drawFrame();
      const leakedAlpha = {
        left: read(sampleLeftX),
        right: read(sampleRightX)
      };

      return {
        dim0,
        dim100,
        leakedAlpha,
        expectedLeft: [0, 0, 0, 255],
        expectedRight: [0, 0, 0, 255]
      };
    });
  });

  expect(result.dim100).toEqual(result.dim0);
  expect(result.leakedAlpha).toEqual(result.dim0);
  expect(result.dim0.left).toEqual(result.expectedLeft);
  expect(result.dim0.right).toEqual(result.expectedRight);
  expect(pageErrors).toEqual([]);
});

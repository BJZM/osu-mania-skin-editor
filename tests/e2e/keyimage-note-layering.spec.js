const { test, expect } = require('@playwright/test');

async function installSolidTexture(page, key, width, height, color) {
  await page.evaluate(async ({ key, width, height, color }) => {
    const texture = document.createElement('canvas');
    texture.width = width;
    texture.height = height;
    const textureCtx = texture.getContext('2d');
    textureCtx.fillStyle = color;
    textureCtx.fillRect(0, 0, width, height);

    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
      image.src = texture.toDataURL();
    });
    image.__layeringTestName = key;
    registerSkinImage(key, image);
  }, { key, width, height, color });
}

test('KeysUnderNotes 开启时长条身体与 Note 一起绘制在 KeyImage 之上', async ({ page }) => {
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

  await page.evaluate(() => {
    skinImageStore.clear();
    skinFallbackImageStore.clear();
    defaultSkinImageStore.clear();
    defaultSkinFallbackStore.clear();
  });
  await installSolidTexture(page, 'test-layering-body', 16, 16, '#ff0000');
  await installSolidTexture(page, 'test-layering-key', 100, 400, '#0000ff');
  await installSolidTexture(page, 'test-layering-head', 16, 8, '#ff0000');
  await installSolidTexture(page, 'test-layering-tail', 16, 8, '#ff0000');

  const result = await page.evaluate(() => {
    markStartupBeatmapReady();
    markStartupSkinReady();
    cancelAnimationFrame(animationId);
    isPlaying = false;
    isSeeking = true;
    ui.progressRange.value = '1';
    currentBeatmap = {
      keys: 4,
      difficulty: { circleSize: 4 },
      hitObjects: [],
      timingPoints: []
    };
    currentManiaScrollState = null;
    activeEditorKeyCount = 4;
    activeNotes = [{
      column: 0,
      isHold: true,
      startTime: 500,
      endTime: 3500,
      scrollPositionStart: 500,
      scrollPositionEnd: 1200,
      hit: false,
      tailHit: false,
      holdHeadFrozen: false
    }];

    maniaSkinConfigurations.clear();

    const cfg = ensureManiaConfigForKeys(4);
    Object.assign(cfg, {
      SkinVersion: 2.7,
      KeysUnderNotes: 1,
      HitPosition: 300,
      ColumnStart: 136,
      ColumnWidth: [60, 60, 60, 60],
      ColumnSpacing: [0, 0, 0],
      ColumnLineWidth: [0, 0, 0, 0, 0],
      ColumnColour: Array.from({ length: 4 }, () => ({ r: 0, g: 0, b: 0, a: 0 })),
      NoteBodyStyle: NOTE_BODY_STYLE.Stretch,
      UpsideDown: false
    });
    cfg.ImageLookups = new Map([
      ['NoteImage0H', 'test-layering-head'],
      ['NoteImage0L', 'test-layering-body'],
      ['NoteImage0T', 'test-layering-tail'],
      ['KeyImage0', 'test-layering-key'],
      ['KeyImage0D', 'test-layering-key']
    ]);
    maniaSkinConfigurations.set(4, cfg);

    canvasEditMode = false;
    hasCanvasBg = false;

    const drawOrder = [];
    const originalDrawImage = ctx.drawImage;
    ctx.drawImage = function (image, ...args) {
      if (image && image.__layeringTestName) {
        drawOrder.push(image.__layeringTestName);
      }
      return originalDrawImage.call(this, image, ...args);
    };

    drawFrame();
    const noteAboveKeyImage = drawOrder.slice();
    drawOrder.length = 0;
    activeNotes[0].hit = false;
    activeNotes[0].tailHit = false;
    cfg.KeysUnderNotes = 0;
    drawFrame();
    const keyImageAboveNote = drawOrder.slice();

    ctx.drawImage = originalDrawImage;

    return {
      noteAboveKeyImage,
      keyImageAboveNote
    };
  });

  expect(result.noteAboveKeyImage).toContain('test-layering-body');
  expect(result.noteAboveKeyImage).toContain('test-layering-key');
  expect(result.noteAboveKeyImage.indexOf('test-layering-key'))
    .toBeLessThan(result.noteAboveKeyImage.indexOf('test-layering-body'));

  expect(result.keyImageAboveNote).toContain('test-layering-body');
  expect(result.keyImageAboveNote).toContain('test-layering-key');
  expect(result.keyImageAboveNote.indexOf('test-layering-body'))
    .toBeLessThan(result.keyImageAboveNote.indexOf('test-layering-key'));
  expect(pageErrors).toEqual([]);
});

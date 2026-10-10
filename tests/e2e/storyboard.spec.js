const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, expect } = require('@playwright/test');
const JSZip = require('../../vendor/jszip.min.js');

const ROOT = path.resolve(__dirname, '../..');
const VIDEO_WEBM = Buffer.from(
  'GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYECGFOAZwEAAAAAAALPEU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHWTbuMU6uEElTDZ1OsggEjTbuMU6uEHFO7a1OsggK57AEAAAAAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmsCrXsYMPQkBNgIxMYXZmNjIuMC4xMDBXQYxMYXZmNjIuMC4xMDBEiYhAj0AAAAAAABZUrmvIrgEAAAAAAAA/14EBc8WIuH+yQPr/l5ycgQAitZyDdW5kiIEAhoVWX1ZQOIOBASPjg4QF9eEA4JCwgRC6gRCagQJVsIRVuYEBElTDZ/pzc59jwIBnyJlFo4dFTkNPREVSRIeMTGF2ZjYyLjAuMTAwc3PVY8CLY8WIuH+yQPr/l5xnyKBFo4dFTkNPREVSRIeTTGF2YzYyLjAuMTAwIGxpYnZweGfIoUWjiERVUkFUSU9ORIeTMDA6MDA6MDEuMDAwMDAwMDAwAB9DtnVBEeeBAKO9gQAAgPACAJ0BKhAAEAAARwiFhYiFhIgCAgJ1qgP4A/oCDU0YAP79bvP/45k3MMT/jm3/8WE8DijI//FRAKOVgQBkALEBAAEQEAAYABhYL/QACAAAo5WBAMgAsQEAARAQABgAGFgv9AAIAACjlYEBLACxAQABEBAAGAAYWC/0AAgAAKOVgQGQALEBAAEQEAAYABhYL/QACAAAo5WBAfQAsQEAARAQABgAGFgv9AAIAACjlYECWACxAQABEBAAGAAYWC/0AAgAAKOVgQK8ALEBAAEQEBRgAGFgv9AAIAAAo5WBAyAAsQEAARAQABgAGFgv9AAIAACjlYEDhACxAQABEBAAGAAYWC/0AAgAABxTu2uRu4+zgQC3iveBAfGCAaLwgQM=',
  'base64'
);
const VIDEO_AVI = fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'avi-test.avi'));

let tmpDir;
let storyboardOsz;
let stressOsz;
let aviOsz;
let aviStoryboardOsz;
let boundedCacheOsz;
let noMediaOsz;

test.beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mania-storyboard-test-'));
  const image = fs.readFileSync(path.join(ROOT, 'assets', 'app-icon.png'));

  const storyboardZip = new JSZip();
  storyboardZip.file('video.webm', VIDEO_WEBM);
  storyboardZip.file('bg.png', image);
  storyboardZip.file('anim0.png', image);
  storyboardZip.file('anim1.png', image);
  storyboardZip.file('Storyboard Test.osu', [
    'osu file format v14',
    '',
    '[General]',
    'AudioFilename: audio.mp3',
    'Mode: 3',
    '',
    '[Metadata]',
    'Title:Storyboard Test',
    'Version:Test',
    '',
    '[Difficulty]',
    'CircleSize:4',
    '',
    '[Events]',
    '0,0,"bg.png",0,0',
    'Video,3000,"video.webm",0,0',
    '',
    '[TimingPoints]',
    '0,500,4,2,0,100,1,0',
    '',
    '[HitObjects]',
    '64,192,0,1,0,0:0:0:0:'
  ].join('\n'));
  storyboardZip.file('Storyboard Test.osb', [
    '[Events]',
    'Animation,Background,Centre,"anim.png",320,240,2,500,LoopForever',
    ' F,0,0,2000,1,0',
    '',
    'Sprite,Foreground,Centre,"anim0.png",320,240',
    ' F,0,0,2000,1,0',
    ' L,0,2',
    '  MX,0,0,1000,320,420'
  ].join('\n'));
  storyboardOsz = path.join(tmpDir, 'storyboard-test.osz');
  fs.writeFileSync(storyboardOsz, await storyboardZip.generateAsync({ type: 'nodebuffer' }));

  const stressZip = new JSZip();
  const pixel = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  );
  const stressEvents = ['[Events]'];
  for (let i = 0; i < 500; i++) {
    const imagePath = `stress-${i}.png`;
    stressZip.file(imagePath, pixel);
    stressEvents.push(`Sprite,Background,TopLeft,"${imagePath}",${i % 640},${(i * 7) % 480}`);
    stressEvents.push(' F,0,0,1000,1');
  }
  stressZip.file('Stress Test.osu', [
    'osu file format v14',
    '',
    '[General]',
    'AudioFilename: audio.mp3',
    'Mode: 3',
    '',
    '[Metadata]',
    'Title:Stress Test',
    'Version:Test',
    '',
    '[Difficulty]',
    'CircleSize:4',
    '',
    '[TimingPoints]',
    '0,500,4,2,0,100,1,0',
    '',
    '[HitObjects]',
    '64,192,0,1,0,0:0:0:0:'
  ].join('\n'));
  stressZip.file('Stress Test.osb', stressEvents.join('\n'));
  stressOsz = path.join(tmpDir, 'stress-storyboard.osz');
  fs.writeFileSync(stressOsz, await stressZip.generateAsync({ type: 'nodebuffer' }));

  const boundedZip = new JSZip();
  const boundedEvents = ['[Events]'];
  for (let i = 0; i < 16; i++) {
    const imagePath = `bounded-${i}.png`;
    boundedZip.file(imagePath, image);
    const startTime = i * 500;
    boundedEvents.push(`Sprite,Background,TopLeft,"${imagePath}",${i * 4},${i * 3}`);
    boundedEvents.push(` F,0,${startTime},${startTime + 300},1,0`);
  }
  boundedZip.file('Bounded Cache.osu', [
    'osu file format v14',
    '',
    '[General]',
    'AudioFilename: audio.mp3',
    'Mode: 3',
    '',
    '[Metadata]',
    'Title:Bounded Cache',
    'Version:Test',
    '',
    '[Difficulty]',
    'CircleSize:4',
    '',
    '[TimingPoints]',
    '0,500,4,2,0,100,1,0',
    '',
    '[HitObjects]',
    '64,192,0,1,0,0:0:0:0:'
  ].join('\n'));
  boundedZip.file('Bounded Cache.osb', boundedEvents.join('\n'));
  boundedCacheOsz = path.join(tmpDir, 'bounded-cache.osz');
  fs.writeFileSync(boundedCacheOsz, await boundedZip.generateAsync({ type: 'nodebuffer' }));

  const aviZip = new JSZip();
  aviZip.file('video.avi', VIDEO_AVI);
  aviZip.file('bg.png', image);
  aviZip.file('AVI Test.osu', [
    'osu file format v14',
    '',
    '[General]',
    'AudioFilename: audio.mp3',
    'Mode: 3',
    '',
    '[Metadata]',
    'Title:AVI Test',
    'Version:Test',
    '',
    '[Difficulty]',
    'CircleSize:4',
    '',
    '[Events]',
    '0,0,"bg.png",0,0',
    'Video,0,"video.avi",0,0',
    '',
    '[TimingPoints]',
    '0,500,4,2,0,100,1,0',
    '',
    '[HitObjects]',
    '64,192,0,1,0,0:0:0:0:'
  ].join('\n'));
  aviOsz = path.join(tmpDir, 'avi-video.osz');
  fs.writeFileSync(aviOsz, await aviZip.generateAsync({ type: 'nodebuffer' }));

  const aviStoryboardZip = new JSZip();
  aviStoryboardZip.file('video.avi', VIDEO_AVI);
  aviStoryboardZip.file('bg.png', image);
  aviStoryboardZip.file('AVI Storyboard.osu', [
    'osu file format v14',
    '',
    '[General]',
    'AudioFilename: audio.mp3',
    'Mode: 3',
    '',
    '[Metadata]',
    'Title:AVI Storyboard Test',
    'Version:Test',
    '',
    '[Difficulty]',
    'CircleSize:4',
    '',
    '[Events]',
    '0,0,"bg.png",0,0',
    'Video,0,"video.avi",0,0',
    '',
    '[TimingPoints]',
    '0,500,4,2,0,100,1,0',
    '',
    '[HitObjects]',
    '64,192,0,1,0,0:0:0:0:'
  ].join('\n'));
  aviStoryboardZip.file('AVI Storyboard.osb', [
    '[Events]',
    'Sprite,Background,Centre,"bg.png",320,240',
    ' F,0,0,2000,1,0'
  ].join('\n'));
  aviStoryboardOsz = path.join(tmpDir, 'avi-storyboard.osz');
  fs.writeFileSync(
    aviStoryboardOsz,
    await aviStoryboardZip.generateAsync({ type: 'nodebuffer' })
  );

  const noMediaZip = new JSZip();
  noMediaZip.file('bg.png', image);
  noMediaZip.file('No Media.osu', [
    'osu file format v14',
    '',
    '[General]',
    'AudioFilename: audio.mp3',
    'Mode: 3',
    '',
    '[Metadata]',
    'Title:No Media',
    'Version:Test',
    '',
    '[Difficulty]',
    'CircleSize:4',
    '',
    '[Events]',
    '0,0,"bg.png",0,0',
    '',
    '[TimingPoints]',
    '0,500,4,2,0,100,1,0',
    '',
    '[HitObjects]',
    '64,192,0,1,0,0:0:0:0:'
  ].join('\n'));
  noMediaOsz = path.join(tmpDir, 'no-media.osz');
  fs.writeFileSync(noMediaOsz, await noMediaZip.generateAsync({ type: 'nodebuffer' }));
});

test.afterAll(() => {
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
});

function captureErrors(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

async function boot(page) {
  await page.goto('/index.html');
  await page.waitForFunction(
    () => typeof drawFrame === 'function' &&
      typeof parseStoryboardEvents === 'function' &&
      typeof resumeStoryboardPlayback === 'function' &&
      typeof beatmaps !== 'undefined',
    null,
    { timeout: 30000 }
  );
}

test('导入并播放 WebM Video 与 .osb 故事板背景', async ({ page }) => {
  const errors = captureErrors(page);
  await boot(page);

  const parsed = await page.evaluate(() => {
    const data = parseStoryboardEvents([
      '[Events]',
      'Video,1250,"video.webm",0,0',
      'Sprite,Background,Centre,"sprite.png",320,240',
      ' L,0,2',
      '  MX,0,0,1000,0,640',
      'Sprite,Foreground,Centre,"tint.png",320,240',
      ' C,0,0,1000,255,128,0'
    ].join('\n'), 14);
    return {
      videoPath: data.video && data.video.path,
      videoStart: data.video && data.video.offset,
      commandLoopCount: data.sprites[0].commands[0].loop.iterations,
      singleColour: data.sprites[1].commands[0].values
    };
  });
  expect(parsed).toEqual({
    videoPath: 'video.webm',
    videoStart: 1250,
    commandLoopCount: 2,
    singleColour: [[255, 128, 0]]
  });

  await page.setInputFiles('#oszInput', storyboardOsz);
  await page.waitForFunction(
    () => beatmaps.length > 0 &&
      currentBeatmap &&
      currentBeatmap.storyboard &&
      currentBeatmap.storyboard.sprites.length > 0 &&
      storyboardPlaybackState,
    null,
    { timeout: 30000 }
  );

  await page.evaluate(() => resumeStoryboardPlayback());
  await page.waitForTimeout(10000);
  console.log(await page.evaluate(() => ({
    loading: storyboardPlaybackState.videoLoading,
    failed: storyboardPlaybackState.videoFailed,
    video: storyboardPlaybackState.video && {
      transcoded: storyboardPlaybackState.video.transcoded,
      ready: storyboardPlaybackState.video.ready,
      readyState: storyboardPlaybackState.video.element.readyState,
      error: storyboardPlaybackState.video.element.error && storyboardPlaybackState.video.element.error.message
    }
  })));
  await page.waitForFunction(
    () => storyboardPlaybackState.video &&
      storyboardPlaybackState.video.ready &&
      !storyboardPlaybackState.video.transcoded,
    null,
    { timeout: 30000 }
  );

  await page.evaluate(() => {
    isSeeking = true;
    ui.progressRange.value = 3.5;
    drawFrame();
  });
  await page.waitForFunction(
    () => storyboardPlaybackState.video.element.currentTime >= 0.45 &&
      storyboardPlaybackState.video.element.readyState >= 2,
    null,
    { timeout: 10000 }
  );

  const directVideoProbe = await page.evaluate(() => {
    const source = storyboardPlaybackState.video.element;
    const probe = document.createElement('canvas');
    probe.width = source.videoWidth || 64;
    probe.height = source.videoHeight || 64;
    const probeCtx = probe.getContext('2d');
    probeCtx.drawImage(source, 0, 0, probe.width, probe.height);
    return {
      videoWidth: source.videoWidth,
      videoHeight: source.videoHeight,
      currentTime: source.currentTime,
      readyState: source.readyState,
      pixel: Array.from(probeCtx.getImageData(probe.width / 2, probe.height / 2, 1, 1).data)
    };
  });
  expect(directVideoProbe.pixel[0], JSON.stringify(directVideoProbe)).toBeGreaterThan(35);

  const drawFunctionProbe = await page.evaluate(() => {
    const probe = document.createElement('canvas');
    probe.width = canvas.width;
    probe.height = canvas.height;
    const probeCtx = probe.getContext('2d');
    const drawn = drawStoryboardVideo(probeCtx, 3500, probe.width, probe.height);
    return {
      drawn,
      offset: storyboardPlaybackState.video.offset,
      duration: storyboardPlaybackState.video.duration,
      pixel: Array.from(probeCtx.getImageData(probe.width / 2, probe.height / 2, 1, 1).data)
    };
  });
  expect(drawFunctionProbe.pixel[0], JSON.stringify(drawFunctionProbe)).toBeGreaterThan(35);

  const pixel = await page.evaluate(() => {
    drawFrame();
    return Array.from(ctx.getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data);
  });
  expect(pixel[0]).toBeGreaterThan(35);
  expect(pixel[0]).toBeGreaterThan(pixel[1] + 20);
  expect(pixel[0]).toBeGreaterThan(pixel[2] + 20);
  expect(errors).toEqual([]);
});

test('高密度故事板导入与连续绘制保持响应', async ({ page }) => {
  const errors = captureErrors(page);
  await boot(page);
  await page.evaluate(() => {
    const original = findZipEntry;
    window.__storyboardFindCalls = 0;
    findZipEntry = function (...args) {
      window.__storyboardFindCalls++;
      return original.apply(this, args);
    };
  });

  await page.setInputFiles('#oszInput', stressOsz);
  await page.waitForFunction(
    () => beatmaps.length > 0 &&
      storyboardPlaybackState &&
      storyboardPlaybackState.elements.length === 500,
    null,
    { timeout: 30000 }
  );
  await page.waitForFunction(
    () => Array.from(storyboardPlaybackState.assets.values()).filter(asset => asset.ready).length >= 500,
    null,
    { timeout: 30000 }
  );

  const result = await page.evaluate(() => {
    const started = performance.now();
    isPlaying = true;
    for (let i = 0; i < 30; i++) {
      drawStoryboardComposite(ctx, 0, canvas.width, canvas.height);
    }
    isPlaying = false;
    return {
      elapsed: performance.now() - started,
      findCalls: window.__storyboardFindCalls,
      activeLoads: storyboardPlaybackState.activeAssetLoads,
      maxLoads: storyboardPlaybackState.maxConcurrentAssetLoads,
      cached: !!storyboardPlaybackState.compositeCanvas
    };
  });

  expect(result.elapsed).toBeLessThan(2500);
  expect(result.findCalls).toBeLessThan(1200);
  expect(result.activeLoads).toBeLessThanOrEqual(result.maxLoads);
  expect(result.cached).toBe(true);
  expect(errors).toEqual([]);
});

test('故事板资源缓存有上限且结束元素会被释放', async ({ page }) => {
  const errors = captureErrors(page);
  await boot(page);

  await page.setInputFiles('#oszInput', boundedCacheOsz);
  await page.waitForFunction(
    () => beatmaps.length > 0 &&
      storyboardPlaybackState &&
      storyboardPlaybackState.elements.length === 16,
    null,
    { timeout: 30000 }
  );

  await page.evaluate(() => {
    storyboardPlaybackState.maxAssetCacheBytes = 2 * 1024 * 1024;
    storyboardPlaybackState.maxTintCacheBytes = 1024 * 1024;
    enableVideo = false;
    isPlaying = false;
    isSeeking = true;
  });

  for (let i = 0; i < 16; i++) {
    await page.evaluate((timeMs) => {
      ui.progressRange.value = String(timeMs / 1000);
      drawFrame();
    }, i * 500 + 100);
    await page.waitForFunction(
      () => storyboardPlaybackState.assetLoadQueue.length === 0 &&
        storyboardPlaybackState.activeAssetLoads === 0,
      null,
      { timeout: 30000 }
    );
  }

  const cache = await page.evaluate(() => {
    const state = storyboardPlaybackState;
    const assets = Array.from(state.assets.values());
    const meta = state.elements.map(element => element.data._meta);
    return {
      assetBytes: state.assetCacheBytes,
      tintBytes: state.tintCacheBytes,
      assetCount: assets.length,
      allUrlsReleased: assets.every(asset => !asset.url),
      deadElementCount: meta.filter(value => value && value.isDeadAfterEnd).length,
      activeCount: state.activeElementsByLayer.reduce((sum, layer) => sum + layer.length, 0)
    };
  });

  expect(cache.assetBytes).toBeLessThanOrEqual(2 * 1024 * 1024);
  expect(cache.tintBytes).toBeLessThanOrEqual(1024 * 1024);
  expect(cache.assetCount).toBeLessThanOrEqual(8);
  expect(cache.allUrlsReleased).toBe(true);
  expect(cache.deadElementCount).toBe(16);
  expect(cache.activeCount).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);

  await page.evaluate(() => { isSeeking = false; });
});

test('AVI 背景自动转码为可播放 WebM', async ({ page }) => {
  const errors = captureErrors(page);
  await boot(page);

  await page.setInputFiles('#oszInput', aviOsz);
  await page.waitForFunction(
    () => beatmaps.length > 0 &&
      currentBeatmap &&
      currentBeatmap.storyboard &&
      currentBeatmap.storyboard.video &&
      currentBeatmap.storyboard.video.path === 'video.avi' &&
      storyboardPlaybackState &&
      storyboardPlaybackState.storyboard &&
      storyboardPlaybackState.storyboard.video,
    null,
    { timeout: 30000 }
  );

  await page.evaluate(() => resumeStoryboardPlayback());
  await page.waitForFunction(
    () => storyboardPlaybackState &&
      storyboardPlaybackState.video &&
      storyboardPlaybackState.video.transcoded &&
      storyboardPlaybackState.video.ready,
    null,
    { timeout: 60000 }
  );

  await page.evaluate(() => {
    isSeeking = true;
    ui.progressRange.value = 0.5;
    drawFrame();
  });
  await page.waitForFunction(
    () => storyboardPlaybackState.video.element.currentTime >= 0.45 &&
      storyboardPlaybackState.video.element.readyState >= 2,
    null,
    { timeout: 10000 }
  );

  const pixel = await page.evaluate(() => {
    drawFrame();
    return Array.from(ctx.getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data);
  });
  expect(pixel[0]).toBeGreaterThan(35);
  expect(pixel[0]).toBeGreaterThan(pixel[1] + 20);
  expect(pixel[0]).toBeGreaterThan(pixel[2] + 20);
  expect(errors).toEqual([]);
});

test('AVI 背景与故事板共存时仍会加载并播放视频', async ({ page }) => {
  const errors = captureErrors(page);
  await boot(page);

  await page.setInputFiles('#oszInput', aviStoryboardOsz);
  await page.waitForFunction(
    () => beatmaps.length > 0 &&
      storyboardPlaybackState &&
      storyboardPlaybackState.elements.length > 0 &&
      storyboardPlaybackState.storyboard &&
      storyboardPlaybackState.storyboard.video,
    null,
    { timeout: 30000 }
  );

  await page.waitForFunction(
    () => storyboardPlaybackState.video &&
      storyboardPlaybackState.video.transcoded &&
      storyboardPlaybackState.video.ready &&
      !storyboardPlaybackState.videoFailed,
    null,
    { timeout: 60000 }
  );

  await page.evaluate(() => {
    isSeeking = true;
    ui.progressRange.value = 0.5;
    drawFrame();
  });
  await page.waitForFunction(
    () => storyboardPlaybackState.video.element.currentTime >= 0.45 &&
      storyboardPlaybackState.video.element.readyState >= 2,
    null,
    { timeout: 10000 }
  );

  const result = await page.evaluate(() => {
    drawFrame();
    const withStoryboard = Array.from(
      ctx.getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data
    );
    enableStoryboard = false;
    storyboardPlaybackState.compositeDirty = true;
    drawFrame();
    const withoutStoryboard = Array.from(
      ctx.getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data
    );
    return {
      withStoryboard,
      withoutStoryboard,
      videoFailed: storyboardPlaybackState.videoFailed,
      transcoded: storyboardPlaybackState.video.transcoded
    };
  });
  expect(result.videoFailed).toBe(false);
  expect(result.transcoded).toBe(true);
  expect(result.withoutStoryboard[0]).toBeGreaterThan(35);
  expect(errors).toEqual([]);
});

test('无视频且无故事板时对应开关保持禁用', async ({ page }) => {
  const errors = captureErrors(page);
  await boot(page);
  await page.setInputFiles('#oszInput', noMediaOsz);

  await page.waitForFunction(
    () => beatmaps.length > 0 && currentBeatmap && storyboardPlaybackState,
    null,
    { timeout: 30000 }
  );

  const controls = await page.evaluate(() => {
    const storyboardToggle = document.getElementById('storyboardToggle');
    const videoToggle = document.getElementById('videoToggle');
    return {
      storyboardDisabled: storyboardToggle.disabled,
      videoDisabled: videoToggle.disabled,
      storyboardChecked: storyboardToggle.checked,
      videoChecked: videoToggle.checked,
      storyboardItemDisabled: storyboardToggle.closest('.tweak-switch-item')
        .classList.contains('is-disabled'),
      videoItemDisabled: videoToggle.closest('.tweak-switch-item')
        .classList.contains('is-disabled')
    };
  });

  expect(controls).toEqual({
    storyboardDisabled: true,
    videoDisabled: true,
    storyboardChecked: false,
    videoChecked: false,
    storyboardItemDisabled: true,
    videoItemDisabled: true
  });
  expect(errors).toEqual([]);
});

test('有故事板和视频时仍可正常加载静态背景图并支持底栏开关控制', async ({ page }) => {
  const errors = captureErrors(page);
  await boot(page);

  await page.setInputFiles('#oszInput', storyboardOsz);
  await page.waitForFunction(
    () => beatmaps.length > 0 &&
      currentBeatmap &&
      hasCanvasBg &&
      canvasBgImage &&
      canvasBgImage.complete,
    null,
    { timeout: 30000 }
  );

  const bgStatus = await page.evaluate(() => ({
    hasBg: hasCanvasBg,
    imgSrc: !!canvasBgImage,
    complete: canvasBgImage && canvasBgImage.complete,
    sbEnabled: enableStoryboard,
    vidEnabled: enableVideo
  }));
  expect(bgStatus.hasBg).toBe(true);
  expect(bgStatus.imgSrc).toBe(true);
  expect(bgStatus.complete).toBe(true);
  expect(bgStatus.sbEnabled).toBe(true);
  expect(bgStatus.vidEnabled).toBe(true);

  // 验证开关位于底栏且在流速滑块左侧
  const switchLayout = await page.evaluate(() => {
    const sb = document.getElementById('storyboardToggle');
    const speed = document.getElementById('speedRange');
    const playerControls = document.getElementById('playerControls');
    if (!sb || !speed || !playerControls) return null;
    const sbRect = sb.getBoundingClientRect();
    const speedRect = speed.getBoundingClientRect();
    return {
      inBottomBar: playerControls.contains(sb),
      isLeftOfSpeed: sbRect.left < speedRect.left
    };
  });
  expect(switchLayout).not.toBeNull();
  expect(switchLayout.inBottomBar).toBe(true);
  expect(switchLayout.isLeftOfSpeed).toBe(true);

  // 测试底栏开关切换
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.evaluate(() => document.getElementById('storyboardToggle').click());
  const sbOff = await page.evaluate(() => enableStoryboard);
  expect(sbOff).toBe(false);

  await page.evaluate(() => document.getElementById('videoToggle').click());
  const vidOff = await page.evaluate(() => enableVideo);
  expect(vidOff).toBe(false);

  await page.evaluate(() => document.getElementById('storyboardToggle').click());
  const sbOn = await page.evaluate(() => enableStoryboard);
  expect(sbOn).toBe(true);

  await page.evaluate(() => document.getElementById('videoToggle').click());
  const vidOn = await page.evaluate(() => enableVideo);
  expect(vidOn).toBe(true);

  expect(errors).toEqual([]);
});


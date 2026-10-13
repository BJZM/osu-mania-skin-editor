const { test, expect } = require('@playwright/test');

// 在页面里注册一组纯色序列帧，用于观察画布实际绘制的是第几帧。
const REGISTER_ANIMATED_TEXTURE = async (page, baseName, colors) => {
  return page.evaluate(async ({ baseName, colors }) => {
    function makeImage(color) {
      return new Promise((resolve) => {
        const c = document.createElement('canvas');
        c.width = 16;
        c.height = 8;
        const cx = c.getContext('2d');
        cx.fillStyle = color;
        cx.fillRect(0, 0, 16, 8);
        const img = new Image();
        img.onload = () => resolve(img);
        img.src = c.toDataURL();
      });
    }

    for (let i = 0; i < colors.length; i++) {
      registerSkinImage(`${baseName}-${i}`, await makeImage(colors[i]));
    }
    return true;
  }, { baseName, colors });
};

test('note 动态贴图在画布中按序列帧播放', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  await page.goto('/index.html');
  await page.waitForFunction(() => typeof drawFrame === 'function', null, { timeout: 30000 });

  await REGISTER_ANIMATED_TEXTURE(page, 'mania-note1', ['#ff0000', '#00ff00']);

  const result = await page.evaluate(async () => {
    const single = getManiaSkinImage(4, LML.NoteImage, 0);
    const frames = getManiaSkinAnimationFrames(4, LML.NoteImage, 0);

    // 预览模式下 4K 轨道 0 的单键固定落在下面这个位置
    const c = document.getElementById('maniaCanvas') || document.querySelector('canvas');
    const cx = c.getContext('2d');
    const scale48 = c.height / 480;
    const colX = 136 * scale48;
    const colW = 30 * scale48;
    const bottomY = 402 * scale48 - 120 * scale48;
    const drawH = colW * (8 / 16);
    const probeX = Math.round(colX + colW / 2);
    const probeY = Math.round(bottomY - drawH / 2);

    drawFrame();
    const seen = new Set();
    const deadline = performance.now() + 500;
    while (performance.now() < deadline) {
      await new Promise((r) => requestAnimationFrame(r));
      const px = cx.getImageData(probeX, probeY, 1, 1).data;
      seen.add(`${px[0]},${px[1]},${px[2]}`);
    }

    return {
      frameCount: frames ? frames.length : null,
      hasFirstFrameImage: !!single,
      seen: Array.from(seen)
    };
  });

  expect(result.frameCount).toBe(2);
  expect(result.hasFirstFrameImage).toBe(true);
  // 画布必须在两帧之间切换，而不是永远停在首帧
  expect(result.seen).toContain('255,0,0');
  expect(result.seen).toContain('0,255,0');
  expect(pageErrors).toEqual([]);
});

test('note 动态贴图相位跟随音符 startTime', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  await page.goto('/index.html');
  await page.waitForFunction(() => typeof drawFrame === 'function', null, { timeout: 30000 });

  const colors = Array.from({ length: 10 }, (_, i) => {
    const channel = i * 20;
    return `#${channel.toString(16).padStart(2, '0')}0000`;
  });
  await REGISTER_ANIMATED_TEXTURE(page, 'mania-note1', colors);

  const result = await page.evaluate(({ colors }) => {
    const canvas = document.getElementById('maniaCanvas') || document.querySelector('canvas');
    const cx = canvas.getContext('2d');
    const scale48 = canvas.height / 480;
    const hitPos = 402 * scale48;
    const startX = 136 * scale48;
    const colW = 30 * scale48;
    const speedFactor = getManiaSpeedFactor(scrollSpeed, scale48);
    const startTimes = [0, 1, 2, 3].map(c => ((120 + (c % 4) * 80) * scale48) / speedFactor);
    const drawHeight = colW * (8 / 16);

    const probe = (column) => ({
      x: Math.round(startX + column * colW + colW / 2),
      y: Math.round(hitPos - ((120 + (column % 4) * 80) * scale48) - drawHeight / 2)
    });
    const probes = [0, 3].map(probe);

    const originalUpdateEffectAnimClock = updateEffectAnimClock;
    updateEffectAnimClock = () => effectAnimClockMs;
    effectAnimClockMs = 10000;
    currentSkinMetadata.general.AnimationFramerate = 60;

    drawFrame();
    cancelAnimationFrame(animationId);

    const sample = (point) => Array.from(cx.getImageData(point.x, point.y, 1, 1).data.slice(0, 3));
    const frames = getManiaSkinAnimationFrames(4, LML.NoteImage, 0);
    const fps = getSkinAnimationFramerate();
    const expectedIndices = [0, 3].map(column => {
      const frame = selectSkinAnimationFrame(
        frames,
        getLegacyNoteAnimationClockMs(effectAnimClockMs, startTimes[column]),
        fps
      );
      return frames.indexOf(frame);
    });

    updateEffectAnimClock = originalUpdateEffectAnimClock;

    return {
      samples: probes.map(sample),
      expectedIndices,
      expectedColors: expectedIndices.map(index => {
        const hex = colors[index];
        return [
          parseInt(hex.slice(1, 3), 16),
          parseInt(hex.slice(3, 5), 16),
          parseInt(hex.slice(5, 7), 16)
        ];
      })
    };
  }, { colors });

  expect(result.expectedIndices[0]).not.toBe(result.expectedIndices[1]);
  expect(result.samples[0]).toEqual(result.expectedColors[0]);
  expect(result.samples[1]).toEqual(result.expectedColors[1]);
  expect(pageErrors).toEqual([]);
});

test('4K 逐轨动画贴图回退读取 mania-note2 的完整序列帧', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  await page.goto('/index.html');
  await page.waitForFunction(() => typeof drawFrame === 'function', null, { timeout: 30000 });

  await REGISTER_ANIMATED_TEXTURE(page, 'mania-note2', ['#0000ff', '#ffff00', '#00ffff']);

  const result = await page.evaluate(() => {
    if (!maniaSkinConfigurations.has(4)) {
      maniaSkinConfigurations.set(4, ensureManiaConfigForKeys(4));
    }
    // 4K 下第 2、3 轨的官方默认贴图是 mania-note2，动画帧必须与静态贴图识别一致
    const col1 = getManiaSkinAnimationFrames(4, LML.NoteImage, 1);
    const col2 = getManiaSkinAnimationFrames(4, LML.NoteImage, 2);
    return {
      col1: col1 ? col1.length : 0,
      col2: col2 ? col2.length : 0
    };
  });

  expect(result.col1).toBe(3);
  expect(result.col2).toBe(3);
  expect(pageErrors).toEqual([]);
});

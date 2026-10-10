const { test, expect } = require('@playwright/test');

test('LN scroll length follows stable default speed and inherited SV', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await page.goto('/index.html');
  await page.waitForFunction(
    () => typeof drawFrame === 'function' &&
      typeof createManiaScrollState === 'function' &&
      typeof parseTimingPointsFromOsuText === 'function',
    null,
    { timeout: 30000 }
  );

  const result = await page.evaluate(() => {
    const timingText = [
      '[TimingPoints]',
      '0,500,4,2,1,50,1,0',
      '100,-50,4,2,1,50,0,0'
    ].join('\n');
    const timingPoints = parseTimingPointsFromOsuText(timingText);
    const startTime = 0;
    const endTime = 400;
    const withSvState = createManiaScrollState(timingPoints, endTime);
    const withoutSvState = createManiaScrollState([
      { time: 0, beatLength: 500, meter: 4, uninherited: true }
    ], endTime);

    const withSvLength = getManiaScrollPositionAt(endTime, withSvState)
      - getManiaScrollPositionAt(startTime, withSvState);
    const withoutSvLength = getManiaScrollPositionAt(endTime, withoutSvState)
      - getManiaScrollPositionAt(startTime, withoutSvState);

    currentBeatmap = {
      difficulty: { circleSize: 4 },
      hitObjects: []
    };
    currentTimingPoints = timingPoints;
    judgements = [];
    activeExplosions = [];
    isPlaying = false;
    audio.currentTime = 0;

    const setScrollState = (scrollState) => {
      currentManiaScrollState = scrollState;
      activeNotes = [{
        column: 0,
        isHold: true,
        startTime: startTime,
        endTime: endTime,
        scrollPositionStart: getManiaScrollPositionAt(startTime, scrollState),
        scrollPositionEnd: getManiaScrollPositionAt(endTime, scrollState),
        ticks: [],
        hit: false,
        holdHeadFrozen: false
      }];
      drawFrame();
      const body = canvasInteractiveElements.find(item => item.id === 'hold_body_0');
      return body ? body.h : 0;
    };

    const withSvBodyHeight = setScrollState(withSvState);
    const withoutSvBodyHeight = setScrollState(withoutSvState);

    return {
      inheritedScrollSpeed: timingPoints.find(tp => tp.uninherited === false)?.scrollSpeed,
      withSvLength: withSvLength,
      withoutSvLength: withoutSvLength,
      withSvBodyHeight: withSvBodyHeight,
      withoutSvBodyHeight: withoutSvBodyHeight
    };
  });

  expect(result.inheritedScrollSpeed).toBeCloseTo(2, 6);
  expect(result.withoutSvLength).toBeCloseTo(400, 6);
  expect(result.withSvLength).toBeCloseTo(700, 6);
  expect(result.withSvBodyHeight).toBeGreaterThan(result.withoutSvBodyHeight + 100);
  expect(pageErrors).toEqual([]);
});

test('stable default speed is anchored to the map common BPM and preserves inherited SV', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await page.goto('/index.html');
  await page.waitForFunction(
    () => typeof createManiaScrollState === 'function' &&
      typeof getManiaScrollPositionAt === 'function' &&
      typeof parseTimingPointsFromOsuText === 'function',
    null,
    { timeout: 30000 }
  );

  const result = await page.evaluate(() => {
    const timingText = [
      '[TimingPoints]',
      '0,500,4,2,1,50,1,0',
      '1000,250,4,2,1,50,1,0',
      '2000,-50,4,2,1,50,0,0'
    ].join('\n');
    const timingPoints = parseTimingPointsFromOsuText(timingText);
    const scrollState = createManiaScrollState(timingPoints, 3000);

    return {
      length: getManiaScrollPositionAt(3000, scrollState) - getManiaScrollPositionAt(0, scrollState),
      multiplierAt0: getManiaScrollMultiplierAt(0, scrollState),
      multiplierAt1000: getManiaScrollMultiplierAt(1000, scrollState),
      multiplierAt2000: getManiaScrollMultiplierAt(2000, scrollState)
    };
  });

  expect(result.multiplierAt0).toBeCloseTo(0.5, 6);
  expect(result.multiplierAt1000).toBeCloseTo(1, 6);
  expect(result.multiplierAt2000).toBeCloseTo(2, 6);
  expect(result.length).toBeCloseTo(3500, 6);
  expect(pageErrors).toEqual([]);
});

test('Scroll speed calculation matches osu!stable / lazer (ComputeScrollTime, getManiaSpeedFactor, and HitPosition independence)', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await page.goto('/index.html');
  await page.waitForFunction(
    () => typeof computeManiaScrollTime === 'function' &&
      typeof getManiaSpeedFactor === 'function' &&
      typeof drawFrame === 'function',
    null,
    { timeout: 30000 }
  );

  const evalResult = await page.evaluate(() => {
    // 1. 验证 computeManiaScrollTime 在 1, 24, 40 时的输出符合 MAX_TIME_RANGE / scrollSpeed (11485 / speed)
    const timeAt1 = computeManiaScrollTime(1);
    const timeAt24 = computeManiaScrollTime(24);
    const timeAt40 = computeManiaScrollTime(40);

    // 2. 验证 getManiaSpeedFactor 在 480 虚拟网格下的基础速度 (scale48 = 1)
    const speedFactorAt24 = getManiaSpeedFactor(24, 1);
    const expectedFactorAt24 = (402 / (11485 / 24)) * 1;

    // 3. 验证当 HitPosition 发生改变时，音符/长条的滚动距离与高度（流速）保持严格恒定
    currentBeatmap = {
      difficulty: { circleSize: 4 },
      hitObjects: []
    };
    currentTimingPoints = [{ time: 0, beatLength: 500, meter: 4, uninherited: true }];
    currentManiaScrollState = createManiaScrollState(currentTimingPoints, 1000);
    scrollSpeed = 24;
    currentTime = 0;
    isPlaying = false;
    canvasEditMode = true;

    // 在默认 HitPosition (402) 下测量时间跨度 300ms 的长条高度
    const hpDefault = 402;
    maniaSkinConfigurations.set(4, { HitPosition: hpDefault });
    activeNotes = [
      {
        column: 0,
        isHold: true,
        startTime: 0,
        endTime: 300,
        scrollPositionStart: 0,
        scrollPositionEnd: 300,
        hit: false,
        holdHeadFrozen: false
      }
    ];
    drawFrame();
    const bodyDef = canvasInteractiveElements.find(item => item.id === 'hold_body_0');
    const heightDefault = bodyDef ? bodyDef.h : 0;

    // 在自定义 HitPosition (440) 下测量相同时间跨度的长条高度
    maniaSkinConfigurations.set(4, { HitPosition: 440 });
    drawFrame();
    const bodyCustom = canvasInteractiveElements.find(item => item.id === 'hold_body_0');
    const heightCustom = bodyCustom ? bodyCustom.h : 0;

    return {
      timeAt1,
      timeAt24,
      timeAt40,
      speedFactorAt24,
      expectedFactorAt24,
      heightDefault,
      heightCustom
    };
  });

  expect(evalResult.timeAt1).toBeCloseTo(11485, 3);
  expect(evalResult.timeAt24).toBeCloseTo(11485 / 24, 3);
  expect(evalResult.timeAt40).toBeCloseTo(11485 / 40, 3);
  expect(evalResult.speedFactorAt24).toBeCloseTo(evalResult.expectedFactorAt24, 5);
  // 核心特性：HitPosition 改变时音符下落速度与相对长度完全一致
  expect(evalResult.heightDefault).toBeGreaterThan(50);
  expect(evalResult.heightCustom).toBeCloseTo(evalResult.heightDefault, 3);
  expect(pageErrors).toEqual([]);
});

test('F3 and F4 shortcuts adjust scrollSpeed within [1, 40] range', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await page.goto('/index.html');
  await page.waitForFunction(() => typeof scrollSpeed === 'number', null, { timeout: 30000 });

  // 初始流速应为 24
  let initialSpeed = await page.evaluate(() => scrollSpeed);
  expect(initialSpeed).toBe(24);

  // 按 F4 增大流速
  await page.keyboard.press('F4');
  let speedAfterF4 = await page.evaluate(() => scrollSpeed);
  expect(speedAfterF4).toBe(25);

  // 按 F3 减小流速
  await page.keyboard.press('F3');
  await page.keyboard.press('F3');
  let speedAfterF3 = await page.evaluate(() => scrollSpeed);
  expect(speedAfterF3).toBe(23);

  expect(pageErrors).toEqual([]);
});


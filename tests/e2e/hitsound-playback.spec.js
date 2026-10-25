const path = require('path');
const { test, expect } = require('@playwright/test');

const ROOT = path.resolve(__dirname, '../..');
const CRYSTAL_WORLD = path.join(
  ROOT,
  'samples',
  'beatmaps',
  '712414 wa. remixed celas - Crystal World ~Fracture~.osz'
);
const MINIMAL_BEATMAP = path.join(ROOT, 'samples', 'beatmaps', 'minimal-4k.osu');
const SKIN_WITH_HITSOUNDS = path.join(ROOT, 'samples', 'skins', 'Kumakalerki.osk');

async function boot(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  await page.goto('/index.html');
  await page.waitForFunction(
    () => typeof prepareManiaHitsoundPlayback === 'function' &&
      typeof getManiaHitsoundDebugSnapshot === 'function'
  );
  return errors;
}

test('Crystal World 读取 timing 与自定义采样，并按 note 多音混播', async ({ page }) => {
  const errors = await boot(page);
  await page.setInputFiles('#oszInput', CRYSTAL_WORLD);
  await page.waitForFunction(() => beatmaps.length > 0 && activeNotes.length > 0, null, { timeout: 60000 });
  await page.click('#startupUseDefaultSkinBtn');
  await page.waitForFunction(
    () => isStartupWorkspaceReady() &&
      getManiaHitsoundDebugSnapshot().ready &&
      getManiaHitsoundDebugSnapshot().resolvedNoteCount > 0,
    null,
    { timeout: 60000 }
  );

  const analysis = await page.evaluate(() => {
    const firstTiming = currentTimingPoints[0] || {};
    const firstNote = activeNotes[0];
    const customNote = activeNotes.find((note) => note.hitSample && note.hitSample.filename);
    const defaultNote = activeNotes.find((note) => note.hitSample && !note.hitSample.filename);
    return {
      timing: {
        sampleSet: firstTiming.sampleSet,
        sampleIndex: firstTiming.sampleIndex,
        volume: firstTiming.volume
      },
      firstNote: {
        hitSound: firstNote.hitSound,
        hitSample: firstNote.hitSample,
        refs: firstNote.hitsoundSampleRefs
      },
      customNote: {
        time: customNote.startTime,
        hitSample: customNote.hitSample,
        refs: customNote.hitsoundSampleRefs
      },
      defaultNote: {
        time: defaultNote.startTime,
        hitSound: defaultNote.hitSound,
        refs: defaultNote.hitsoundSampleRefs
      },
      snapshot: getManiaHitsoundDebugSnapshot()
    };
  });

  expect(analysis.timing).toEqual({ sampleSet: 3, sampleIndex: 1, volume: 50 });
  expect(analysis.firstNote.hitSound).toBe(2);
  expect(analysis.firstNote.hitSample).toEqual({
    normalSet: 0,
    additionSet: 0,
    index: 0,
    volume: 0,
    filename: ''
  });
  expect(analysis.firstNote.refs.map((ref) => ref.sound)).toEqual(['hitnormal', 'hitwhistle']);
  expect(analysis.firstNote.refs.every((ref) => ref.source === 'beatmap')).toBe(true);
  expect(analysis.firstNote.refs.every((ref) => ref.volume === 50)).toBe(true);

  expect(analysis.customNote.hitSample.filename).toMatch(/\.wav$/i);
  expect(analysis.customNote.refs).toHaveLength(1);
  expect(analysis.customNote.refs[0].source).toBe('beatmap');
  expect(analysis.customNote.refs[0].path.toLowerCase()).toBe(
    analysis.customNote.hitSample.filename.toLowerCase()
  );
  expect(analysis.customNote.refs[0].volume).toBe(70);
  expect(analysis.defaultNote.refs.some((ref) => ref.path.toLowerCase() === 'drum-hitnormal.wav'))
    .toBe(true);
  expect(analysis.snapshot.loadedSampleCount).toBeGreaterThan(40);
  expect(analysis.snapshot.failedSampleCount).toBe(0);
  expect(analysis.snapshot.missingBufferCount).toBe(0);

  const directPlayback = await page.evaluate(async () => {
    await resumeManiaHitsoundPlayback();
    const defaultNote = activeNotes.find((note) => note.hitSample && !note.hitSample.filename);
    const customNote = activeNotes.find((note) => note.hitSample && note.hitSample.filename);
    const startedDefault = playManiaHitSound(defaultNote, defaultNote.startTime);
    const startedCustom = playManiaHitSound(customNote, customNote.startTime);
    return {
      startedDefault,
      startedCustom,
      snapshot: getManiaHitsoundDebugSnapshot()
    };
  });
  expect(directPlayback.startedDefault).toBeGreaterThan(0);
  expect(directPlayback.startedCustom).toBe(1);
  expect(directPlayback.snapshot.triggerCount).toBeGreaterThanOrEqual(2);
  expect(directPlayback.snapshot.lastPlayed.some((item) => /\.wav$/i.test(item.path))).toBe(true);

  const triggerBeforeMuted = directPlayback.snapshot.triggerCount;
  await page.click('#effectsVolumeMuteBtn');
  expect(await page.evaluate(() => {
    const note = activeNotes[0];
    const started = playManiaHitSound(note, note.startTime);
    return { started, skipped: getManiaHitsoundDebugSnapshot().skippedMutedCount };
  })).toEqual({ started: 0, skipped: 1 });
  expect(await page.evaluate(() => getManiaHitsoundDebugSnapshot().triggerCount))
    .toBe(triggerBeforeMuted);
  await page.click('#effectsVolumeMuteBtn');

  await page.evaluate(() => {
    audio.currentTime = 1.15;
    syncNotesStateWithTime(1150);
    drawFrame();
  });
  const triggerBeforePlayback = await page.evaluate(() => getManiaHitsoundDebugSnapshot().triggerCount);
  await page.click('#playPauseBtn');
  await page.waitForFunction(
    (before) => getManiaHitsoundDebugSnapshot().triggerCount > before,
    triggerBeforePlayback,
    { timeout: 5000 }
  );
  expect(errors).toEqual([]);
});

test('皮肤命中音效在谱面没有同名文件时作为回退来源', async ({ page }) => {
  const errors = await boot(page);
  await page.setInputFiles('#oskInput', SKIN_WITH_HITSOUNDS);
  await page.waitForFunction(() => isStartupSkinReady(), null, { timeout: 60000 });
  await page.setInputFiles('#oszInput', MINIMAL_BEATMAP);
  await page.waitForFunction(
    () => isStartupWorkspaceReady() &&
      getManiaHitsoundDebugSnapshot().ready,
    null,
    { timeout: 60000 }
  );

  const resolved = await page.evaluate(() => {
    const note = activeNotes.find((item) => item.hitSample && !item.hitSample.filename);
    return {
      hitSound: note.hitSound,
      refs: note.hitsoundSampleRefs,
      snapshot: getManiaHitsoundDebugSnapshot()
    };
  });
  expect(resolved.hitSound).toBe(0);
  expect(resolved.refs).toHaveLength(1);
  expect(resolved.refs[0].source).toBe('skin');
  expect(resolved.refs[0].path.toLowerCase()).toBe('normal-hitnormal.wav');
  expect(resolved.refs[0].sound).toBe('hitnormal');
  expect(resolved.snapshot.loadedSampleCount).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('默认皮肤在没有皮肤 ZIP 时提供 Legacy 打击音效回退', async ({ page }) => {
  const errors = await boot(page);
  await page.setInputFiles('#oszInput', MINIMAL_BEATMAP);
  await page.waitForFunction(() => beatmaps.length > 0 && activeNotes.length > 0, null, { timeout: 60000 });
  await page.click('#startupUseDefaultSkinBtn');
  await page.waitForFunction(
    () => isStartupWorkspaceReady() &&
      isEditableDefaultSkinWorkspaceActive() &&
      getManiaHitsoundDebugSnapshot().ready &&
      getManiaHitsoundDebugSnapshot().resolvedNoteCount > 0,
    null,
    { timeout: 60000 }
  );

  const resolved = await page.evaluate(() => {
    const note = activeNotes[0];
    return {
      refs: note.hitsoundSampleRefs,
      snapshot: getManiaHitsoundDebugSnapshot(),
      catalog: Array.from(getEffectiveSkinHitsoundCatalog().values()).map((group) => ({
        key: group.key,
        source: group.source,
        selectedPath: group.selectedPath
      }))
    };
  });

  expect(resolved.refs).toHaveLength(1);
  expect(resolved.refs[0].source).toBe('default');
  expect(resolved.refs[0].path).toBe('normal-hitnormal.wav');
  expect(resolved.catalog).toHaveLength(12);
  expect(resolved.catalog.every((group) => group.source === 'default')).toBe(true);
  expect(resolved.snapshot.loadedSampleCount).toBeGreaterThan(0);
  expect(resolved.snapshot.failedSampleCount).toBe(0);
  expect(errors).toEqual([]);
});

test('恢复前台时丢弃迟到的音效，并继续触发当前 note', async ({ page }) => {
  const errors = await boot(page);
  await page.setInputFiles('#oszInput', CRYSTAL_WORLD);
  await page.waitForFunction(() => beatmaps.length > 0 && activeNotes.length > 0, null, { timeout: 60000 });
  await page.click('#startupUseDefaultSkinBtn');
  await page.waitForFunction(
    () => isStartupWorkspaceReady() &&
      getManiaHitsoundDebugSnapshot().ready &&
      getManiaHitsoundDebugSnapshot().resolvedNoteCount > 0,
    null,
    { timeout: 60000 }
  );

  const playback = await page.evaluate(async () => {
    await resumeManiaHitsoundPlayback();
    audio.currentTime = 5;
    for (const note of activeNotes) {
      note.hit = false;
      note.tailHit = false;
    }

    const snapshotBeforeStaleFrame = getManiaHitsoundDebugSnapshot();
    drawFrame();
    const staleBoundary = 4900;
    const staleNotes = activeNotes.filter((note) => note.startTime <= staleBoundary);
    const snapshotAfterStaleFrame = getManiaHitsoundDebugSnapshot();

    const freshNote = activeNotes.find((note) => note.startTime > 5250);
    audio.currentTime = (freshNote.startTime + 20) / 1000;
    const snapshotBeforeFreshFrame = getManiaHitsoundDebugSnapshot();
    drawFrame();
    const freshSnapshot = getManiaHitsoundDebugSnapshot();

    return {
      staleNoteCount: staleNotes.length,
      staleNotesAllHandled: staleNotes.every((note) => note.hit),
      staleReplayCount: snapshotAfterStaleFrame.lastPlayed
        .slice(snapshotBeforeStaleFrame.lastPlayed.length)
        .filter((item) => item.noteTime <= staleBoundary).length,
      freshNoteTime: freshNote.startTime,
      freshTriggers: freshSnapshot.triggerCount - snapshotBeforeFreshFrame.triggerCount,
      freshPlayedNoteTimes: freshSnapshot.lastPlayed
        .slice(snapshotBeforeFreshFrame.lastPlayed.length)
        .map((item) => item.noteTime)
    };
  });

  expect(playback.staleNoteCount).toBeGreaterThan(10);
  expect(playback.staleNotesAllHandled).toBe(true);
  expect(playback.staleReplayCount).toBe(0);
  expect(playback.freshTriggers).toBeGreaterThan(0);
  expect(playback.freshPlayedNoteTimes.every((noteTime) =>
    noteTime >= playback.freshNoteTime - 100
  )).toBe(true);
  expect(errors).toEqual([]);
});

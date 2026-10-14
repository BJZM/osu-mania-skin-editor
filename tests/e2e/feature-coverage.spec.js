// ---------------------------------------------------------------------------
// 功能完整性回归测试
// 覆盖：默认皮肤 / 皮肤导入 / 谱面导入 / 难度与键位切换 / 播放控制 /
//      渲染正确性 / 参数编辑器 / 画布交互 / 帮助弹窗 / 快捷键
// ---------------------------------------------------------------------------
const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, expect } = require('@playwright/test');
const JSZip = require('../../vendor/jszip.min.js');

const ROOT = path.resolve(__dirname, '../..');
const SKIN = path.join(ROOT, 'samples', 'skins', 'Kumakalerki.osk');
const BOJII_SKIN = path.join(ROOT, 'samples', 'skins', 'bojii 04-02-2023.osk');
const BEATMAP = path.join(ROOT, 'samples', 'beatmaps', '1790742 MIMI - Kuu ni Naru.osz');

let tmpDir;
let skinWithoutIni;
let singleOsu;
let unsafeSkinArchive;

test.beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mania-skin-test-'));

  // 1) 不含 skin.ini 的 .osk：验证「按默认命名规范回退」且不崩溃
  const noIniZip = new JSZip();
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  );
  noIniZip.file('mania-note1.png', png);
  noIniZip.file('mania-key1.png', png);
  skinWithoutIni = path.join(tmpDir, 'no-skin-ini.osk');
  fs.writeFileSync(skinWithoutIni, await noIniZip.generateAsync({ type: 'nodebuffer' }));

  // 2) 从 .osz 中抽出一个独立的 .osu，验证单文件导入路径
  const oszBuf = fs.readFileSync(BEATMAP);
  const osz = await JSZip.loadAsync(oszBuf);
  const entry = Object.keys(osz.files).find((p) => p.toLowerCase().endsWith('.osu'));
  singleOsu = path.join(tmpDir, 'single.osu');
  fs.writeFileSync(singleOsu, await osz.files[entry].async('nodebuffer'));

  // 3) 含可执行文件和损坏条目名的皮肤包：导入与再次导出都应自动清理
  const unsafeZip = new JSZip();
  unsafeZip.file('skin.ini', [
    '[General]',
    'Name: Unsafe Archive Test',
    'Version: latest',
    '',
    '[Mania]',
    'Keys: 4',
    'ColumnWidth: 65,65,65,65',
    '',
    'NoteImage0: mania-note1',
    'NoteImage1: mania-note1',
    'NoteImage2: mania-note1',
    'NoteImage3: mania-note1'
  ].join('\r\n'));
  unsafeZip.file('mania-note1.png', png);
  unsafeZip.file('mania-key1.png', png);
  unsafeZip.file('remove-me.exe', Buffer.from('MZ'));
  unsafeZip.file('broken\u0006name.png', png);
  unsafeSkinArchive = path.join(tmpDir, 'unsafe-archive.osk');
  fs.writeFileSync(unsafeSkinArchive, await unsafeZip.generateAsync({ type: 'nodebuffer' }));
});

test.afterAll(() => {
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
});

// --------------------------------------------------------------------------
// helpers
// --------------------------------------------------------------------------

async function boot(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    // 过滤 dev server（python http.server）偶发的传输层噪声，与页面功能无关
    if (/Failed to load resource|net::ERR_(CONNECTION|ABORTED|EMPTY|NETWORK)/i.test(text)) return;
    errors.push('console: ' + text);
  });
  await page.goto('/index.html');
  await page.waitForFunction(
    () => typeof drawFrame === 'function' && typeof focusParameter === 'function',
    null,
    { timeout: 30000 }
  );
  await page.waitForTimeout(400);
  return errors;
}

async function importSkin(page, file = SKIN) {
  await page.setInputFiles('#oskInput', file);
  await page.waitForFunction(() => isSkinLoading === false, null, { timeout: 60000 });
  await page.waitForTimeout(250);
}

async function importBeatmap(page, file = BEATMAP) {
  await page.setInputFiles('#oszInput', file);
  await page.waitForFunction(() => beatmaps.length > 0, null, { timeout: 60000 });
  await page.waitForTimeout(600);
}

/** 画布上「非纯黑」像素数量，用于判断是否真的画出了东西 */
function countLitPixels(page, step = 8) {
  return page.evaluate((s) => {
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let lit = 0;
    for (let y = 0; y < canvas.height; y += s) {
      for (let x = 0; x < canvas.width; x += s) {
        const i = (y * canvas.width + x) * 4;
        if (data[i] > 24 || data[i + 1] > 24 || data[i + 2] > 24) lit++;
      }
    }
    return lit;
  }, step);
}

function pixelAt(page, x, y) {
  return page.evaluate(([px, py]) => Array.from(ctx.getImageData(px, py, 1, 1).data), [x, y]);
}

// --------------------------------------------------------------------------
// A. 启动与默认皮肤
// --------------------------------------------------------------------------

test('A1 启动即加载默认皮肤资源，未导入皮肤时用默认皮肤渲染谱面', async ({ page }) => {
  const errors = await boot(page);
  const info = await page.evaluate(() => ({
    defaultImgs: defaultSkinImageStore.size,
    isDefaultLoaded: isDefaultSkinLoaded,
    canvasSize: { w: canvas.width, h: canvas.height },
    topBarHeight: document.getElementById('canvasTopBar').getBoundingClientRect().height
  }));
  expect(info.defaultImgs).toBeGreaterThan(0);
  expect(info.isDefaultLoaded).toBe(true);
  expect(info.canvasSize.w).toBeGreaterThan(0);
  expect(info.canvasSize.h).toBeGreaterThan(0);
  expect(info.topBarHeight).toBe(48);

  // 只导入谱面、不导入任何皮肤，验证默认皮肤回退链路真的能画出内容
  await importBeatmap(page);
  await page.evaluate(() => {
    audio.currentTime = 12;
    syncNotesStateWithTime(12000);
    drawFrame();
  });
  await page.waitForTimeout(400);
  expect(await countLitPixels(page)).toBeGreaterThan(20);
  expect(errors).toEqual([]);
});

// --------------------------------------------------------------------------
// B. 皮肤导入
// --------------------------------------------------------------------------

test('B1 导入含 skin.ini 的 .osk：配置、键位、皮肤信息全部生效', async ({ page }) => {
  const errors = await boot(page);
  await importSkin(page);

  const state = await page.evaluate(() => ({
    version: globalSkinVersion,
    configs: Array.from(maniaSkinConfigurations.keys()).sort((a, b) => a - b),
    pills: Array.from(document.querySelectorAll('#keyPillsContainer .key-pill')).map((p) => p.textContent.trim()),
    images: skinImageStore.size,
    skinName: document.getElementById('infoSkinName').textContent.trim()
  }));
  expect(state.configs).toEqual([4, 6, 7]);
  expect(state.pills).toEqual(['4K', '6K', '7K']);
  expect(state.images).toBeGreaterThan(50);
  expect(state.version).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('B2 导入不含 skin.ini 的 .osk：不崩溃并回退默认命名规范', async ({ page }) => {
  const errors = await boot(page);
  await importSkin(page, skinWithoutIni);

  const state = await page.evaluate(() => ({
    images: skinImageStore.size,
    toast: document.getElementById('toastContainer').textContent.replace(/\s+/g, ' ').trim()
  }));
  expect(state.images).toBeGreaterThan(0);
  expect(state.toast).toContain('皮肤加载完成');
  expect(errors).toEqual([]);
});

test('B3 缺少 cursortrail 时回退到 stable 默认拖尾', async ({ page }) => {
  const errors = await boot(page);
  await importSkin(page, BOJII_SKIN);

  const fallback = await page.evaluate(() => ({
    userTrail: getSkinAnimationFramesFromStore(skinImageStore, 'cursortrail'),
    defaultTrailCount: (getSkinAnimationFramesFromStore(defaultSkinImageStore, 'cursortrail') || []).length,
    defaultTrailWidth: (getSkinAnimationFramesFromStore(defaultSkinImageStore, 'cursortrail') || [])[0]?.width,
    cursorActive: document.documentElement.classList.contains('skin-cursor-active')
  }));
  expect(fallback.userTrail).toBeNull();
  expect(fallback.defaultTrailCount).toBe(1);
  expect(fallback.defaultTrailWidth).toBe(20);
  expect(fallback.cursorActive).toBe(true);

  await page.mouse.move(80, 120);
  for (let x = 120; x <= 520; x += 20) {
    await page.mouse.move(x, 120);
  }
  await page.waitForTimeout(40);

  const trailPixels = await page.evaluate(() => {
    const layer = document.getElementById('skinCursorLayer');
    const data = layer.getContext('2d').getImageData(0, 0, layer.width, layer.height).data;
    const scaleX = layer.width / window.innerWidth;
    const scaleY = layer.height / window.innerHeight;
    const left = Math.round(100 * scaleX);
    const right = Math.round(420 * scaleX);
    const top = Math.round(80 * scaleY);
    const bottom = Math.round(160 * scaleY);
    let count = 0;
    for (let y = top; y < bottom; y++) {
      for (let x = left; x < right; x++) {
        if (data[(y * layer.width + x) * 4 + 3] > 8) count++;
      }
    }
    return count;
  });
  expect(trailPixels).toBeGreaterThan(20);
  expect(errors).toEqual([]);
});

// --------------------------------------------------------------------------
// C. 谱面导入与切换
// --------------------------------------------------------------------------

test('C1 导入 .osz：难度列表 / 统计 / 首难度自动加载', async ({ page }) => {
  const errors = await boot(page);
  await importBeatmap(page);

  const state = await page.evaluate(() => ({
    count: beatmaps.length,
    options: Array.from(document.querySelectorAll('#diffSelect option')).map((o) => o.textContent),
    title: document.getElementById('infoBeatmapTitle').textContent.trim(),
    stats: {
      keys: document.getElementById('stat-keys').textContent.trim(),
      notes: document.getElementById('stat-notes').textContent.trim(),
      holds: document.getElementById('stat-holds').textContent.trim(),
      time: document.getElementById('stat-time').textContent.trim()
    },
    activeNotes: activeNotes.length
  }));
  expect(state.count).toBeGreaterThan(1);
  expect(state.options.length).toBe(state.count);
  expect(state.title).not.toBe('等待导入谱面...');
  expect(state.stats.keys).not.toBe('-');
  expect(state.stats.notes).not.toBe('-');
  expect(state.activeNotes).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('C2 导入单个 .osu 文件', async ({ page }) => {
  const errors = await boot(page);
  await importBeatmap(page, singleOsu);
  const state = await page.evaluate(() => ({
    count: beatmaps.length,
    title: document.getElementById('infoBeatmapTitle').textContent.trim()
  }));
  expect(state.count).toBe(1);
  expect(state.title).not.toBe('等待导入谱面...');
  expect(errors).toEqual([]);
});

test('C3 切换难度会重新加载对应谱面', async ({ page }) => {
  const errors = await boot(page);
  await importBeatmap(page);
  const before = await page.evaluate(() => {
    const idx = 0;
    return { idx, version: currentBeatmap.metadata.version, notes: activeNotes.length };
  });

  await page.evaluate(async () => {
    ui.diff.value = '1';
    await loadBeatmapDifficulty(1);
  });
  await page.waitForTimeout(400);

  const after = await page.evaluate(() => ({
    version: currentBeatmap.metadata.version,
    notes: activeNotes.length
  }));
  expect(after.version).not.toBe(before.version);
  expect(after.notes).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('C4 键位数切换（4K/6K/7K）同步画布与标签', async ({ page }) => {
  const errors = await boot(page);
  await importSkin(page);
  // 键位 pill 位于皮肤编辑器面板内，需先打开面板
  await page.click('#openSkinEditorBtn');
  await page.waitForTimeout(300);

  await page.click('#keyPillsContainer .key-pill:has-text("7K")');
  await page.waitForTimeout(300);
  const seven = await page.evaluate(() => ({
    keys: getActiveKeyCount(),
    label: document.getElementById('activeKeyCountTabLabel').textContent.trim()
  }));
  expect(seven.keys).toBe(7);
  expect(seven.label).toBe('7K');

  await page.click('#keyPillsContainer .key-pill:has-text("4K")');
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => getActiveKeyCount())).toBe(4);
  expect(errors).toEqual([]);
});

// --------------------------------------------------------------------------
// D. 播放控制
// --------------------------------------------------------------------------

test('D1 播放 / 暂停切换', async ({ page }) => {
  const errors = await boot(page);
  await importBeatmap(page);

  await page.click('#playPauseBtn');
  await page.waitForTimeout(900);
  const playing = await page.evaluate(() => ({ isPlaying, currentTime: audio.currentTime }));
  expect(playing.isPlaying).toBe(true);

  await page.click('#playPauseBtn');
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => isPlaying)).toBe(false);

  const resume = await page.evaluate(async () => {
    const pausedAt = audio.currentTime;
    const startedAt = performance.now();
    const originalDrawFrame = drawFrame;
    let earlyProgress = null;
    drawFrame = function (...args) {
      const result = originalDrawFrame.apply(this, args);
      if (earlyProgress === null) earlyProgress = Number(ui.progressRange.value);
      return result;
    };

    playAudioAndBeatmap();
    queueMicrotask(() => drawFrame());
    await new Promise((resolve) => setTimeout(resolve, 250));
    drawFrame = originalDrawFrame;
    return {
      pausedAt,
      earlyProgress,
      currentTime: audio.currentTime,
      elapsed: (performance.now() - startedAt) / 1000
    };
  });
  // Chromium 恢复播放时会把 currentTime 按输出延迟前移；恢复首帧不应额外前移。
  expect(resume.earlyProgress).not.toBeNull();
  expect(resume.earlyProgress - resume.pausedAt).toBeLessThan(0.025);
  expect(resume.currentTime - resume.pausedAt).toBeLessThan(resume.elapsed + 0.025);
  expect(await page.evaluate(() => isPlaying)).toBe(true);

  await page.click('#playPauseBtn');
  expect(errors).toEqual([]);
});

test('D2 进度条拖动 seek 会改变播放位置', async ({ page }) => {
  const errors = await boot(page);
  await importBeatmap(page);

  const target = await page.evaluate(() => {
    const r = document.getElementById('progressRange');
    r.value = String(Math.floor(Number(r.max) * 0.5));
    r.dispatchEvent(new Event('input', { bubbles: true }));
    r.dispatchEvent(new Event('change', { bubbles: true }));
    return Number(r.value);
  });
  await page.waitForTimeout(400);
  const current = await page.evaluate(() => Number(document.getElementById('progressRange').value));
  expect(Math.abs(current - target)).toBeLessThan(2);

  const seekAfterPause = await page.evaluate(async () => {
    playAudioAndBeatmap();
    await new Promise((resolve) => setTimeout(resolve, 250));
    pauseAudioAndBeatmap();

    const range = document.getElementById('progressRange');
    const secondTarget = Math.floor(Number(range.max) * 0.25);
    range.value = String(secondTarget);
    range.dispatchEvent(new Event('input', { bubbles: true }));
    range.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 300));

    return {
      secondTarget,
      currentTime: audio.currentTime
    };
  });
  // 暂停点的补正只能用于恢复播放，拖动进度条后不能被旧暂停位置拉回去。
  expect(Math.abs(seekAfterPause.currentTime - seekAfterPause.secondTarget)).toBeLessThan(2);
  expect(errors).toEqual([]);
});

test('D3 音量滑块与静音按钮生效', async ({ page }) => {
  const errors = await boot(page);

  // 设计如此：未加载谱面时整条播放控制栏为 disabled（pointer-events: none）
  expect(await page.evaluate(() => document.getElementById('playerControls').className)).toContain('disabled');
  await importBeatmap(page);
  expect(await page.evaluate(() => document.getElementById('playerControls').className)).not.toContain('disabled');

  await page.evaluate(() => {
    const r = document.getElementById('volumeRange');
    r.value = '0.3';
    r.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(await page.evaluate(() => Math.round(audio.volume * 10) / 10)).toBeCloseTo(0.3, 1);

  await page.click('#volumeMuteBtn');
  const muted = await page.evaluate(() => ({ muted: audio.muted, volume: audio.volume }));
  expect(muted.muted).toBe(true);
  expect(muted.volume).toBe(0);

  await page.click('#volumeMuteBtn');
  expect(await page.evaluate(() => audio.muted)).toBe(false);
  expect(errors).toEqual([]);
});

test('D4 空格键切换播放 / 暂停', async ({ page }) => {
  const errors = await boot(page);
  await importBeatmap(page);

  await page.keyboard.press('Space');
  await page.waitForTimeout(350);
  expect(await page.evaluate(() => isPlaying)).toBe(true);

  await page.keyboard.press('Space');
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => isPlaying)).toBe(false);

  // 操作进度条后焦点仍在其上，空格也应继续可用。
  await page.focus('#progressRange');
  await page.keyboard.press('Space');
  await page.waitForTimeout(350);
  expect(await page.evaluate(() => isPlaying)).toBe(true);

  await page.keyboard.press('Space');
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => isPlaying)).toBe(false);
  expect(errors).toEqual([]);
});

test('D5 流速与背景暗化滑块写入状态', async ({ page }) => {
  const errors = await boot(page);

  await page.evaluate(() => {
    const r = document.getElementById('speedRange');
    r.value = '28';
    r.dispatchEvent(new Event('input', { bubbles: true }));
    const d = document.getElementById('dimRange');
    d.value = '65';
    d.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(200);
  const state = await page.evaluate(() => ({ speed: scrollSpeed, dim: bgDim, dimText: document.getElementById('dimText').textContent }));
  expect(state.speed).toBe(28);
  expect(state.dim).toBe(65);
  expect(state.dimText).toContain('65');
  expect(errors).toEqual([]);
});

// --------------------------------------------------------------------------
// E. 渲染正确性
// --------------------------------------------------------------------------

test('E1 判定线开关：JudgementLine=0 时白色判定线消失', async ({ page }) => {
  const errors = await boot(page);

  const result = await page.evaluate(() => {
    // 清空贴图库并关掉小节线，避免 StageHint / BarLine 干扰判定线的像素判定
    skinImageStore.clear();
    skinFallbackImageStore.clear();
    defaultSkinImageStore.clear();
    currentBeatmap = { keys: 4, difficulty: { circleSize: 4 }, hitObjects: [], timingPoints: [] };
    currentTimingPoints = [];
    activeNotes = [];
    judgements = [];
    isPreviewMode = false;
    const cfg = ensureManiaConfigForKeys(4);
    Object.assign(cfg, {
      SkinVersion: 2.7, ColumnStart: 100, ColumnWidth: [60, 60, 60, 60],
      ColumnSpacing: [0, 0, 0], ColumnLineWidth: [0, 0, 0, 0, 0],
      ColumnColour: Array.from({ length: 4 }, () => ({ r: 0, g: 0, b: 0, a: 0 })),
      HitPosition: 402, BarLineHeight: 0
    });

    const scale48 = canvas.height / 480;
    const hitY = Math.round(402 * scale48);
    const probeX = Math.round((100 + 120) * canvas.height / 480);
    const sample = () => {
      let max = 0;
      for (let dy = -3; dy <= 3; dy++) {
        const d = ctx.getImageData(probeX, hitY + dy, 1, 1).data;
        max = Math.max(max, d[0], d[1], d[2]);
      }
      return max;
    };

    cfg.ShowJudgementLine = true;
    drawFrame();
    const withLine = sample();
    cfg.ShowJudgementLine = false;
    drawFrame();
    const withoutLine = sample();
    return { withLine, withoutLine };
  });

  expect(result.withLine).toBeGreaterThan(200);
  expect(result.withoutLine).toBeLessThan(80);
  expect(errors).toEqual([]);
});

test('E2 UpsideDown 会把判定线与演奏区镜像到画布另一侧', async ({ page }) => {
  const errors = await boot(page);

  const result = await page.evaluate(() => {
    skinImageStore.clear();
    skinFallbackImageStore.clear();
    defaultSkinImageStore.clear();
    currentBeatmap = { keys: 4, difficulty: { circleSize: 4 }, hitObjects: [], timingPoints: [] };
    currentTimingPoints = [];
    activeNotes = [];
    judgements = [];
    isPreviewMode = false;
    const cfg = ensureManiaConfigForKeys(4);
    Object.assign(cfg, {
      SkinVersion: 2.7, ColumnStart: 100, ColumnWidth: [60, 60, 60, 60],
      ColumnSpacing: [0, 0, 0], ColumnLineWidth: [0, 0, 0, 0, 0],
      ColumnColour: Array.from({ length: 4 }, () => ({ r: 0, g: 0, b: 0, a: 0 })),
      HitPosition: 402, ShowJudgementLine: true, BarLineHeight: 0
    });
    const scale48 = canvas.height / 480;
    const probeX = Math.round((100 + 120) * scale48);
    const hitY = Math.round(402 * scale48);
    const mirrorY = canvas.height - hitY;
    const maxNear = (y) => {
      let max = 0;
      for (let dy = -4; dy <= 4; dy++) {
        const yy = Math.max(0, Math.min(canvas.height - 1, y + dy));
        const d = ctx.getImageData(probeX, yy, 1, 1).data;
        max = Math.max(max, d[0], d[1], d[2]);
      }
      return max;
    };

    cfg.UpsideDown = false;
    drawFrame();
    const normalAtHit = maxNear(hitY);
    const normalAtMirror = maxNear(mirrorY);

    cfg.UpsideDown = true;
    drawFrame();
    const flippedAtHit = maxNear(hitY);
    const flippedAtMirror = maxNear(mirrorY);

    return { normalAtHit, normalAtMirror, flippedAtHit, flippedAtMirror };
  });

  // 正常：判定线在 HitPosition；开启 UpsideDown 后：镜像到另一侧
  expect(result.normalAtHit).toBeGreaterThan(200);
  expect(result.normalAtMirror).toBeLessThan(80);
  expect(result.flippedAtHit).toBeLessThan(80);
  expect(result.flippedAtMirror).toBeGreaterThan(200);
  expect(errors).toEqual([]);
});

test('E3 加载谱面后画布绘制出音符 / HUD 等可见内容', async ({ page }) => {
  const errors = await boot(page);
  await importSkin(page);
  await importBeatmap(page);

  await page.evaluate(() => {
    audio.currentTime = 12;
    syncNotesStateWithTime(12000);
    drawFrame();
  });
  await page.waitForTimeout(400);
  expect(await countLitPixels(page)).toBeGreaterThan(60);
  expect(errors).toEqual([]);
});

// --------------------------------------------------------------------------
// F. 皮肤参数编辑器
// --------------------------------------------------------------------------

test('F1 编辑器面板打开 / 关闭 / 折叠 / 停靠', async ({ page }) => {
  const errors = await boot(page);
  await importSkin(page);

  expect(await page.evaluate(() => getComputedStyle(document.getElementById('skinEditorModal')).display)).toBe('none');

  await page.click('#openSkinEditorBtn');
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => document.getElementById('skinEditorModal').className)).toContain('active');

  await page.click('#collapseSkinEditorBtn');
  await page.waitForTimeout(250);
  const collapsed = await page.evaluate(() => document.getElementById('skinEditorDialog').className);
  expect(collapsed).toContain('is-collapsed');

  await page.click('#collapseSkinEditorBtn');
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => document.getElementById('skinEditorDialog').className)).not.toContain('is-collapsed');

  await page.click('#closeSkinEditorBtn');
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => document.getElementById('skinEditorModal').className)).not.toContain('active');
  expect(await page.evaluate(() => getComputedStyle(document.getElementById('skinEditorModal')).display)).toBe('none');
  expect(errors).toEqual([]);
});

test('F2 五个参数 Tab 均渲染出参数卡片', async ({ page }) => {
  const errors = await boot(page);
  await importSkin(page);
  await page.click('#openSkinEditorBtn');
  await page.waitForTimeout(300);

  const counts = {};
  for (const tab of ['mania', 'textures', 'fonts', 'general', 'raw']) {
    await page.click(`#skinEditorTabs .tab-btn[data-tab="${tab}"]`);
    await page.waitForTimeout(250);
    counts[tab] = await page.evaluate(() => ({
      active: document.querySelector('#skinEditorTabs .tab-btn.active').dataset.tab,
      cards: document.querySelectorAll('#paramListContainer .param-card').length
    }));
    expect(counts[tab].active).toBe(tab);
    expect(counts[tab].cards).toBeGreaterThan(0);
  }
  expect(errors).toEqual([]);
});

test('F3 参数搜索过滤与清空', async ({ page }) => {
  const errors = await boot(page);
  await importSkin(page);
  await page.click('#openSkinEditorBtn');
  await page.click('#skinEditorTabs .tab-btn[data-tab="mania"]');
  await page.waitForTimeout(300);

  const allCount = await page.evaluate(() => document.querySelectorAll('#paramListContainer .param-card').length);
  await page.fill('#paramSearchInput', 'HitPosition');
  await page.waitForTimeout(300);
  const filtered = await page.evaluate(() => Array.from(document.querySelectorAll('#paramListContainer .param-card')).map((c) => c.id));
  expect(filtered.length).toBeGreaterThan(0);
  expect(filtered.length).toBeLessThan(allCount);
  expect(filtered.some((id) => id.toLowerCase().includes('hitposition'))).toBe(true);

  await page.click('#clearSearchBtn');
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => document.querySelectorAll('#paramListContainer .param-card').length)).toBe(allCount);
  expect(errors).toEqual([]);
});

test('F4 修改参数即时写入配置并影响画布', async ({ page }) => {
  const errors = await boot(page);
  await importSkin(page);
  await page.click('#openSkinEditorBtn');
  await page.click('#skinEditorTabs .tab-btn[data-tab="mania"]');
  await page.waitForTimeout(300);

  const before = await page.evaluate(() => {
    const cfg = getManiaConfigForKeys(getActiveKeyCount());
    return { hitPosition: cfg.HitPosition };
  });

  const after = await page.evaluate(() => {
    const card = document.getElementById('param-card-HitPosition');
    const input = card.querySelector('input[type="number"], .param-text-input, input');
    input.value = '333';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return getManiaConfigForKeys(getActiveKeyCount()).HitPosition;
  });

  expect(after).toBe(333);
  expect(after).not.toBe(before.hitPosition);
  expect(errors).toEqual([]);
});

test('F4A 准度透明垫片参数与进度饼图拖动联动', async ({ page }) => {
  const errors = await boot(page);
  await importSkin(page);
  await page.click('#openSkinEditorBtn');
  await page.click('#skinEditorTabs .tab-btn[data-tab="mania"]');
  await page.waitForTimeout(300);

  expect(await page.evaluate(() => !!document.getElementById('param-card-ScorePercentWidth'))).toBe(true);

  const paramResult = await page.evaluate(() => {
    const beforePie = canvasInteractiveElements.find((e) => e.id === 'hud_progress_pie');
    const beforeWidth = getScorePercentPaddingWidth(getActiveKeyCount());
    const beforeX = beforePie ? beforePie.x : null;
    const applied = onParamChange('ScorePercentWidth', 120);
    drawFrame();
    const afterPie = canvasInteractiveElements.find((e) => e.id === 'hud_progress_pie');
    return {
      applied,
      beforeWidth,
      afterWidth: getScorePercentPaddingWidth(getActiveKeyCount()),
      beforeX,
      afterX: afterPie ? afterPie.x : null,
      exportKeys: Array.from(userReplacedTextures.keys()),
      iniText: generateSkinIniText()
    };
  });

  expect(paramResult.applied).toBe(120);
  expect(paramResult.afterWidth).toBe(120);
  expect(paramResult.afterX).toBeLessThan(paramResult.beforeX);
  expect(paramResult.exportKeys.some((key) => /percent\.png$/i.test(key))).toBe(true);
  expect(paramResult.iniText).not.toContain('ScorePercentWidth');

  const visibleState = await page.evaluate(() => {
    onParamChange('ScorePercentVisible', true);
    const visible = getScorePercentVisibility(getActiveKeyCount());
    const restoredWidth = getScorePercentPaddingWidth(getActiveKeyCount());
    onParamChange('ScorePercentWidth', 160);
    const toggle = document.querySelector('#param-card-ScorePercentVisible input[type="checkbox"]');
    return {
      visible,
      restoredWidth,
      resizedVisible: getScorePercentVisibility(getActiveKeyCount()),
      resizedWidth: getScorePercentPaddingWidth(getActiveKeyCount()),
      resizedToggleChecked: !!(toggle && toggle.checked)
    };
  });
  expect(visibleState.visible).toBe(true);
  expect(visibleState.restoredWidth).toBe(paramResult.beforeWidth);
  expect(visibleState.resizedVisible).toBe(false);
  expect(visibleState.resizedWidth).toBe(160);
  expect(visibleState.resizedToggleChecked).toBe(false);

  expect(await page.evaluate((originalWidth) => {
    onParamChange('ScorePercentVisible', true);
    const restored = getScorePercentVisibility(getActiveKeyCount()) &&
      getScorePercentPaddingWidth(getActiveKeyCount()) === originalWidth;
    onParamChange('ScorePercentVisible', false);
    return {
      restored,
      hidden: !getScorePercentVisibility(getActiveKeyCount())
    };
  }, paramResult.beforeWidth)).toEqual({ restored: true, hidden: true });

  await page.click('#closeSkinEditorBtn');
  await page.waitForTimeout(250);

  const dragGeometry = await page.evaluate(() => {
    drawFrame();
    const pie = canvasInteractiveElements.find((e) => e.id === 'hud_progress_pie');
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width / canvas.width;
    const scaleY = rect.height / canvas.height;
    return {
      width: getScorePercentPaddingWidth(getActiveKeyCount()),
      x: rect.left + (pie.x + pie.w / 2) * scaleX,
      y: rect.top + (pie.y + pie.h / 2) * scaleY,
      dragCssPx: -60 * scaleX
    };
  });

  await page.mouse.move(dragGeometry.x, dragGeometry.y);
  await page.mouse.down();
  await page.mouse.move(dragGeometry.x + dragGeometry.dragCssPx, dragGeometry.y, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(250);

  const draggedWidth = await page.evaluate(() => getScorePercentPaddingWidth(getActiveKeyCount()));
  expect(draggedWidth).toBeGreaterThan(dragGeometry.width);
  expect(errors).toEqual([]);
});

test('F5 撤销与恢复初始状态', async ({ page }) => {
  const errors = await boot(page);
  await importSkin(page);
  await page.click('#openSkinEditorBtn');
  await page.click('#skinEditorTabs .tab-btn[data-tab="mania"]');
  await page.waitForTimeout(300);

  const original = await page.evaluate(() => getManiaConfigForKeys(getActiveKeyCount()).HitPosition);
  await page.evaluate(() => {
    const card = document.getElementById('param-card-HitPosition');
    const input = card.querySelector('input[type="number"], .param-text-input, input');
    input.value = '360';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => getManiaConfigForKeys(getActiveKeyCount()).HitPosition)).toBe(360);

  await page.evaluate(() => performSkinUndo());
  await page.waitForTimeout(400);
  const undone = await page.evaluate(() => getManiaConfigForKeys(getActiveKeyCount()).HitPosition);
  expect(undone).toBe(original);

  await page.evaluate(() => {
    const card = document.getElementById('param-card-HitPosition');
    const input = card.querySelector('input[type="number"], .param-text-input, input');
    input.value = '300';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(300);
  // revertSkinToInitial 内部使用 confirm()，测试里直接放行
  await page.evaluate(() => {
    window.confirm = () => true;
    revertSkinToInitial();
  });
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => getManiaConfigForKeys(getActiveKeyCount()).HitPosition)).toBe(original);
  expect(errors).toEqual([]);
});

test('F6 导出 .osk / .zip 触发下载', async ({ page }) => {
  const errors = await boot(page);
  await importSkin(page);

  for (const format of ['osk', 'zip']) {
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 30000 }),
      page.evaluate((f) => exportSkin(f), format)
    ]);
    expect(download.suggestedFilename().toLowerCase().endsWith('.' + format)).toBe(true);
  }
  expect(errors).toEqual([]);
});

test('F7 导入和导出会移除不兼容的皮肤包条目', async ({ page }) => {
  const errors = await boot(page);
  await importSkin(page, unsafeSkinArchive);

  const importedKeys = await page.evaluate(() => Object.keys(currentSkinZip.files));
  expect(importedKeys).not.toContain('remove-me.exe');
  expect(importedKeys).not.toContain('broken\u0006name.png');
  expect(importedKeys).toContain('mania-note1.png');

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }),
    page.evaluate(() => exportSkin('osk'))
  ]);
  const downloadPath = await download.path();
  expect(downloadPath).toBeTruthy();

  const exported = await JSZip.loadAsync(fs.readFileSync(downloadPath));
  const exportedKeys = Object.keys(exported.files);
  expect(exportedKeys).not.toContain('remove-me.exe');
  expect(exportedKeys).not.toContain('broken\u0006name.png');
  expect(exportedKeys).toContain('mania-note1.png');
  expect(errors).toEqual([]);
});

// --------------------------------------------------------------------------
// G. 画布交互
// --------------------------------------------------------------------------

test('G1 拖拽编辑模式开关可切换', async ({ page }) => {
  const errors = await boot(page);
  await importSkin(page);

  const before = await page.evaluate(() => canvasEditMode);
  // 开关是 opacity:0 的样式化 checkbox，直接 click() 会被判为不可见
  await page.evaluate(() => document.getElementById('canvasEditModeToggle').click());
  await page.waitForTimeout(250);
  const after = await page.evaluate(() => canvasEditMode);
  expect(after).not.toBe(before);
  expect(errors).toEqual([]);
});

test('G2 画布点选元素会弹出选中卡片', async ({ page }) => {
  const errors = await boot(page);
  await importSkin(page);
  await page.evaluate(() => ensureManiaConfigForKeys(getActiveKeyCount()));
  await page.waitForTimeout(500);

  const box = await page.locator('#gameCanvas').boundingBox();
  const before = await page.evaluate(() => {
    const canvas = document.getElementById('gameCanvas');
    const wrapper = document.getElementById('canvasWrapper');
    return {
      canvasWidth: canvas.getBoundingClientRect().width,
      wrapperWidth: wrapper.getBoundingClientRect().width
    };
  });
  const targets = await page.evaluate(() =>
    canvasInteractiveElements
      .filter((e) => e && e.isTexture && e.w > 2 && e.h > 2)
      .map((e) => ({ x: e.x + e.w / 2, y: e.y + e.h / 2 }))
      .slice(0, 12)
  );
  expect(targets.length).toBeGreaterThan(0);

  // 依次尝试若干可交互元素中心，命中任意一个即视为通过（元素会随预览动画移动）
  let picked = null;
  for (const t of targets) {
    await page.mouse.click(box.x + t.x, box.y + t.y);
    await page.waitForTimeout(250);
    picked = await page.evaluate(() =>
      selectedCanvasElement ? (selectedCanvasElement.textureKey || selectedCanvasElement.paramKey || 'element') : null
    );
    if (picked) break;
  }
  expect(picked).not.toBeNull();
  expect(await page.evaluate(() => document.getElementById('canvasSelectedCard').style.display)).not.toBe('none');
  const after = await page.evaluate(() => {
    const canvas = document.getElementById('gameCanvas');
    const wrapper = document.getElementById('canvasWrapper');
    const card = document.getElementById('canvasSelectedCard');
    return {
      canvasWidth: canvas.getBoundingClientRect().width,
      wrapperWidth: wrapper.getBoundingClientRect().width,
      cardPosition: getComputedStyle(card).position,
      cardLeft: card.getBoundingClientRect().left,
      wrapperLeft: wrapper.getBoundingClientRect().left
    };
  });
  expect(after.canvasWidth).toBeCloseTo(before.canvasWidth, 1);
  expect(after.wrapperWidth).toBeCloseTo(before.wrapperWidth, 1);
  expect(after.cardPosition).toBe('absolute');
  expect(after.cardLeft).toBeGreaterThanOrEqual(after.wrapperLeft);
  expect(errors).toEqual([]);
});

test('G2b 连击选中卡片可直接预览并修改 Hold 变色与断连遮罩', async ({ page }) => {
  const errors = await boot(page);
  await importSkin(page);

  await page.evaluate(() => {
    ensureManiaConfigForKeys(getActiveKeyCount());
    const combo = canvasInteractiveElements.find((item) => item.id === 'combo');
    selectedCanvasElement = combo;
    syncCanvasSelectedCard(combo);
  });

  await expect(page.locator('#cardLocateComboTextureBtn')).toBeVisible();
  await expect(page.locator('#cardComboHoldRow')).toBeVisible();
  await expect(page.locator('#cardComboBreakRow')).toBeVisible();

  const result = await page.evaluate(() => {
    const holdPicker = document.getElementById('cardComboHoldPicker');
    holdPicker.value = '#12ab34';
    holdPicker.dispatchEvent(new Event('input', { bubbles: true }));

    const holdAlpha = document.getElementById('cardComboHoldAlpha');
    holdAlpha.value = '128';
    holdAlpha.dispatchEvent(new Event('input', { bubbles: true }));

    const breakPicker = document.getElementById('cardComboBreakPicker');
    breakPicker.value = '#112233';
    breakPicker.dispatchEvent(new Event('input', { bubbles: true }));

    const cfg = getManiaConfigForKeys(getActiveKeyCount());
    return {
      holdColour: cfg.ColourHold,
      breakColour: cfg.ComboBreakColour,
      holdPreviewActive: testHoldingUntil > performance.now() + 2000,
      breakPreviewActive: performance.now() - comboAnimState.breakStartTime < 500
    };
  });

  expect(result.holdColour).toEqual({ r: 18, g: 171, b: 52, a: 128 });
  expect(result.breakColour).toEqual({ r: 17, g: 34, b: 51, a: 255 });
  expect(result.holdPreviewActive).toBe(true);
  expect(result.breakPreviewActive).toBe(true);

  await page.click('#cardLocateComboTextureBtn');
  await page.waitForTimeout(450);
  const locateState = await page.evaluate(() => ({
    modalActive: document.getElementById('skinEditorModal').classList.contains('active'),
    fontsTabActive: document.querySelector('#skinEditorTabs [data-tab="fonts"]').classList.contains('active'),
    highlighted: !!document.querySelector('.combo-font-glyphs-block .hud-glyph-card.highlight-pulse, #param-card-ComboPrefix.highlight-pulse')
  }));
  expect(locateState.modalActive).toBe(true);
  expect(locateState.fontsTabActive).toBe(true);
  expect(locateState.highlighted).toBe(true);
  expect(errors).toEqual([]);
});

test('G3 贴图替换上传后写入 userReplacedTextures', async ({ page }) => {
  const errors = await boot(page);
  await importSkin(page);

  const file = path.join(tmpDir, 'replacement.png');
  fs.writeFileSync(
    file,
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64'
    )
  );

  // 走与画布「替换贴图」按钮完全相同的入口
  await page.evaluate(() => triggerTextureUpload('mania-note1', LML.NoteImage, 'NoteImage0', 0));
  await page.setInputFiles('#textureReplaceInput', file);
  await page.waitForFunction(() => document.getElementById('textureUploadModal').style.display === 'flex', null, {
    timeout: 15000
  });
  expect(await page.evaluate(() => document.getElementById('textureUploadTargetLabel').textContent.trim())).not.toBe('');

  await page.click('#textureUploadConfirmBtn');
  await page.waitForFunction(() => userReplacedTextures.size > 0, null, { timeout: 15000 });

  const applied = await page.evaluate(() => ({
    keys: Array.from(userReplacedTextures.keys()),
    count: userReplacedTextures.size
  }));
  expect(applied.count).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('G3a 详细设置已选规格后直接导入，不再询问导入类型', async ({ page }) => {
  const errors = await boot(page);
  await importSkin(page);

  const file = path.join(tmpDir, 'direct-import-2x.png');
  fs.writeFileSync(
    file,
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64'
    )
  );

  // 详细设置入口已明确选择 @2x，选完本地文件后应直接应用。
  await page.evaluate(() => triggerTextureUpload('mania-stage-light', LML.LightImage, 'StageLight', null, '2x'));
  await page.setInputFiles('#textureReplaceInput', file);
  await page.waitForFunction(
    () => userReplacedTextures.has('mania-stage-light@2x.png'),
    null,
    { timeout: 15000 }
  );

  const result = await page.evaluate(() => {
    const frames = getSkinAnimationFramesFromStore(skinImageStore, 'mania-stage-light');
    const image = frames ? frames[0] : null;
    return {
      modalDisplay: document.getElementById('textureUploadModal').style.display,
      exportKeys: Array.from(userReplacedTextures.keys()),
      is2x: !!(image && image._is2x)
    };
  });

  expect(result.modalDisplay).toBe('none');
  expect(result.exportKeys).toContain('mania-stage-light@2x.png');
  expect(result.is2x).toBe(true);
  expect(errors).toEqual([]);
});

test('G4 动画贴图编辑器可打开并列出帧', async ({ page }) => {
  const errors = await boot(page);
  await importSkin(page);

  const state = await page.evaluate(() => {
    if (typeof openAnimTextureEditor !== 'function') return { missing: true };
    openAnimTextureEditor('LightingL', LML.HoldNoteLightImage, 'LightingL', '1x');
    return {
      missing: false,
      display: document.getElementById('animTextureModal').style.display,
      title: document.getElementById('animTextureTitleText').textContent.trim()
    };
  });
  expect(state.missing).toBe(false);
  expect(state.display).toBe('flex');

  await page.evaluate(() => closeAnimTextureEditor());
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => document.getElementById('animTextureModal').style.display)).toBe('none');
  expect(errors).toEqual([]);
});

test('G5 不支持帧序列的贴图不提供动态上传入口', async ({ page }) => {
  const errors = await boot(page);
  await importSkin(page);
  await page.click('#openSkinEditorBtn');
  await page.click('#skinEditorTabs .tab-btn[data-tab="textures"]');
  await page.waitForTimeout(300);

  const state = await page.evaluate(() => {
    const supportCases = [
      ['KeyImage0', LML.KeyImage, 'mania-key1', false],
      ['KeyImage0D', LML.KeyImageDown, 'mania-key1D', false],
      ['StageLeft', LML.LeftStageImage, 'mania-stage-left', false],
      ['StageRight', LML.RightStageImage, 'mania-stage-right', false],
      ['StageHint', LML.HitTargetImage, 'mania-stage-hint', false],
      ['scorebar-bg', null, 'scorebar-bg', false],
      ['NoteImage0', LML.NoteImage, 'mania-note1', true],
      ['StageBottom', LML.BottomStageImage, 'mania-stage-bottom', true],
      ['StageLight', LML.LightImage, 'mania-stage-light', true],
      ['LightingL', LML.HoldNoteLightImage, 'lightingL', true],
      ['Hit300g', LML.Hit300g, 'mania-hit300g', true],
      ['scorebar-colour', null, 'scorebar-colour', true]
    ];

    return {
      supportCases: supportCases.map(([paramKey, targetKey, filename, expected]) => ({
        paramKey,
        expected,
        actual: isTextureAnimationSupported(paramKey, targetKey, filename)
      })),
      menu: {
        key: document.querySelectorAll('#param-card-KeyImage .texture-upload-menu-item.item-anim').length,
        stageHint: document.querySelectorAll('#param-card-StageHint .texture-upload-menu-item.item-anim').length,
        stageBottom: document.querySelectorAll('#param-card-StageBottom .texture-upload-menu-item.item-anim').length
      }
    };
  });

  for (const item of state.supportCases) {
    expect(item.actual, `${item.paramKey} animatable state`).toBe(item.expected);
  }
  expect(state.menu.key).toBe(0);
  expect(state.menu.stageHint).toBe(0);
  expect(state.menu.stageBottom).toBe(1);

  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  );
  await page.evaluate(() => triggerTextureUpload('mania-key1', LML.KeyImage, 'KeyImage0', 0));
  await page.setInputFiles('#textureReplaceInput', {
    name: 'replacement.png',
    mimeType: 'image/png',
    buffer: png
  });
  await page.waitForFunction(() => document.getElementById('textureUploadModal').style.display === 'flex');
  expect(await page.evaluate(() => document.getElementById('specCardAnim').style.display)).toBe('none');

  expect(errors).toEqual([]);
});

test('G6 按键发光直接框住贴图本体，判定线不再提供替换贴图', async ({ page }) => {
  const errors = await boot(page);
  // 这个皮肤自身不含 mania-stage-light，会回退到内置默认皮肤的真实光柱贴图，
  // 便于验证「有可见光柱时选中框直接框住贴图本体」。
  await importSkin(page, path.join(ROOT, 'samples', 'skins', "#MuTong233's Touhou Skin Refreshed - 副本.osk"));

  const info = await page.evaluate(() => {
    // 参数面板「预览发光」：强制所有轨道视为按下，让光柱真正画出来
    testLightUntil = performance.now() + 60000;
    drawFrame();

    const lp = canvasInteractiveElements.find((e) => e.id === 'lightPosition');
    const hp = canvasInteractiveElements.find((e) => e.id === 'hitPosition');
    if (!lp || !hp) return { missing: true };

    const countReplace = () => Array.from(document.querySelectorAll('#canvasSelectedCard button'))
      .filter((b) => b.offsetParent !== null && /替换贴图/.test(b.textContent)).length;

    selectedCanvasElement = lp;
    syncCanvasSelectedCard(lp);
    const lightReplaceCount = countReplace();

    selectedCanvasElement = hp;
    syncCanvasSelectedCard(hp);
    const hitReplaceCount = countReplace();

    // 在光柱本体上找一个不被更高优先级元素（判定线/连击数/判定评价/血条/HUD/音符）遮挡的点，
    // 保证这一次点击一定落到光柱本体上。
    const blockers = canvasInteractiveElements.filter((e) =>
      e.id === 'hitPosition' || e.id === 'combo' || e.id === 'judgement' || e.id === 'healthDisplay' ||
      e.id.startsWith('hud_') || e.id.startsWith('note_') || e.id.startsWith('hold_') ||
      e.dragType === 'lighting_width');
    const blocked = (x, y) => blockers.some((n) =>
      x >= n.x && x <= n.x + n.w && y >= n.y && y <= n.y + n.h);
    let clickPoint = null;
    for (let y = lp.y + 2; y < lp.y + lp.h - 2 && !clickPoint; y += 3) {
      for (const fx of [0.5, 0.25, 0.75, 0.1, 0.9]) {
        const x = lp.x + lp.w * fx;
        if (!blocked(x, y)) { clickPoint = { x, y }; break; }
      }
    }

    const rect = canvas.getBoundingClientRect();
    return {
      missing: false,
      box: { x: lp.x, y: lp.y, w: lp.w, h: lp.h },
      visible: { y: lp.visibleY, h: lp.visibleH },
      lightReplaceCount, hitReplaceCount, clickPoint,
      scaleX: canvas.width / rect.width, scaleY: canvas.height / rect.height,
      left: rect.left, top: rect.top
    };
  });
  expect(info.missing).toBe(false);

  // 选中框 = StageLight 贴图本体（而不是一条常驻细线）
  expect(info.visible.h).toBeGreaterThan(60);
  expect(info.box.y).toBeCloseTo(info.visible.y, 3);
  expect(info.box.h).toBeCloseTo(info.visible.h, 3);

  // 按键发光只提供 1 个「替换贴图」按钮；判定线不提供
  expect(info.lightReplaceCount).toBe(1);
  expect(info.hitReplaceCount).toBe(0);

  // 直接点击贴图本体即可选中按键发光
  expect(info.clickPoint).not.toBeNull();
  // 先清空选中并隐藏悬浮卡片：卡片会吸附在元素上方，可能正好盖住要点击的光柱本体
  await page.evaluate(() => {
    selectedCanvasElement = null;
    const card = document.getElementById('canvasSelectedCard');
    if (card) card.style.display = 'none';
  });
  await page.waitForTimeout(150);
  await page.mouse.move(info.left + info.clickPoint.x / info.scaleX, info.top + info.clickPoint.y / info.scaleY);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(80);
  expect(await page.evaluate(() => (selectedCanvasElement ? selectedCanvasElement.id : null))).toBe('lightPosition');

  expect(errors).toEqual([]);
});

// --------------------------------------------------------------------------
// H. 帮助弹窗与快捷键
// --------------------------------------------------------------------------

test('H1 帮助弹窗：打开 / 分类筛选 / 搜索 / 关闭', async ({ page }) => {
  const errors = await boot(page);
  await page.click('#topHelpBtn');
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => document.getElementById('helpModal').style.display)).toBe('flex');

  const total = await page.evaluate(() => document.querySelectorAll('#helpModalBody .help-rule-card').length);
  expect(total).toBeGreaterThanOrEqual(14);

  await page.click('#helpFilterTabs .help-tab-btn[data-cat="hud"]');
  await page.waitForTimeout(200);
  const hudVisible = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#helpModalBody .help-rule-card')).filter((c) => c.style.display !== 'none').length
  );
  expect(hudVisible).toBeGreaterThan(0);
  expect(hudVisible).toBeLessThan(total);

  await page.click('#helpFilterTabs .help-tab-btn[data-cat="all"]');
  await page.fill('#helpSearchInput', 'zzz-not-exist');
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => document.getElementById('helpEmptySearch').style.display)).toBe('block');

  await page.click('#helpModalCloseBtn');
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => document.getElementById('helpModal').style.display)).toBe('none');
  expect(errors).toEqual([]);
});

test('H2 快捷键：Esc 关闭面板、Ctrl+Z 撤销', async ({ page }) => {
  const errors = await boot(page);
  await importSkin(page);
  await page.click('#openSkinEditorBtn');
  await page.click('#skinEditorTabs .tab-btn[data-tab="mania"]');
  await page.waitForTimeout(300);

  const original = await page.evaluate(() => getManiaConfigForKeys(getActiveKeyCount()).HitPosition);
  await page.evaluate(() => {
    const card = document.getElementById('param-card-HitPosition');
    const input = card.querySelector('input[type="number"], .param-text-input, input');
    input.value = '355';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(300);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => getManiaConfigForKeys(getActiveKeyCount()).HitPosition)).toBe(original);

  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => document.getElementById('skinEditorModal').className)).not.toContain('active');
  expect(errors).toEqual([]);
});

// --------------------------------------------------------------------------
// I. 其余顶栏 / 卡片控件
// --------------------------------------------------------------------------

test('I1 判定演示开关驱动判定动画', async ({ page }) => {
  const errors = await boot(page);
  await importSkin(page);

  await page.evaluate(() => document.getElementById('previewJudgementToggle').click());
  await page.waitForTimeout(400);
  const on = await page.evaluate(() => ({
    flag: isPreviewJudgementActive,
    checked: document.getElementById('previewJudgementToggle').checked
  }));
  expect(on.flag).toBe(true);
  expect(on.checked).toBe(true);

  await page.evaluate(() => document.getElementById('previewJudgementToggle').click());
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => isPreviewJudgementActive)).toBe(false);
  expect(errors).toEqual([]);
});

test('I2 全屏按钮进入 / 退出全屏', async ({ page }) => {
  const errors = await boot(page);
  await importSkin(page);

  await page.click('#fullscreenBtn');
  await page.waitForTimeout(600);
  const entered = await page.evaluate(() => !!document.fullscreenElement);

  if (!entered) {
    // 无头环境可能拒绝 Fullscreen 请求，此时至少确认接口已接线且未抛错
    expect(await page.evaluate(() => typeof toggleFullscreen)).toBe('function');
  } else {
    await page.click('#fullscreenBtn');
    await page.waitForTimeout(600);
    expect(await page.evaluate(() => !!document.fullscreenElement)).toBe(false);
  }
  expect(errors).toEqual([]);
});

test('I3 「恢复靠右吸附位置」按钮复位编辑器窗口', async ({ page }) => {
  const errors = await boot(page);
  await importSkin(page);
  await page.click('#openSkinEditorBtn');
  await page.waitForTimeout(300);

  await page.evaluate(() => {
    const d = document.getElementById('skinEditorDialog');
    d.style.left = '20px';
    d.style.right = 'auto';
    d.style.top = '200px';
  });
  await page.click('#dockSkinEditorBtn');
  await page.waitForTimeout(300);

  const style = await page.evaluate(() => {
    const d = document.getElementById('skinEditorDialog');
    return { right: d.style.right, top: d.style.top, left: d.style.left };
  });
  expect(style.right).toBe('24px');
  expect(style.top).toBe('48px');
  expect(style.left).toBe('auto');
  expect(errors).toEqual([]);
});

test('I4 卡片「应用给所有轨道」统一全部列宽', async ({ page }) => {
  const errors = await boot(page);
  await importSkin(page);
  await page.evaluate(() => ensureManiaConfigForKeys(getActiveKeyCount()));
  await page.waitForTimeout(500);

  const result = await page.evaluate(() => {
    const keys = getActiveKeyCount();
    const cfg = getManiaConfigForKeys(keys);
    const track = canvasInteractiveElements.find((e) => e && String(e.id).startsWith('track_col_'));
    if (!track) return { ok: false, reason: 'no track element' };

    cfg.ColumnWidth[track.colIndex] = 42;
    cfg.ColumnSpacing[track.colIndex > 0 ? track.colIndex - 1 : 0] = 6;
    selectedCanvasElement = track;
    syncCanvasSelectedCard(track);
    document.getElementById('cardApplyAllTracksBtn').click();
    return { ok: true, widths: cfg.ColumnWidth.slice(), spacings: cfg.ColumnSpacing.slice() };
  });

  expect(result.ok).toBe(true);
  expect(result.widths.every((w) => w === 42)).toBe(true);
  expect(result.spacings).toEqual([6, 6, 6]);
  expect(errors).toEqual([]);
});

test('I5 raw skin.ini 文本生成与复制入口可用', async ({ page }) => {
  const errors = await boot(page);
  await importSkin(page);
  await page.click('#openSkinEditorBtn');
  await page.click('#skinEditorTabs .tab-btn[data-tab="raw"]');
  await page.waitForTimeout(400);

  const state = await page.evaluate(() => {
    const ini = generateSkinIniText();
    return {
      hasGeneral: /\[General\]/i.test(ini),
      hasMania: /\[Mania\]/i.test(ini),
      hasKeys: /Keys\s*:/i.test(ini),
      textareaMatches: (document.getElementById('rawIniTextarea').value || '').length > 0,
      copyBtn: !!document.getElementById('copyRawIniBtn')
    };
  });
  expect(state.hasGeneral).toBe(true);
  expect(state.hasMania).toBe(true);
  expect(state.hasKeys).toBe(true);
  expect(state.copyBtn).toBe(true);
  expect(errors).toEqual([]);
});

test('I6 动画贴图编辑器可以添加单帧', async ({ page }) => {
  const errors = await boot(page);
  await importSkin(page);

  const frame = path.join(tmpDir, 'frame0.png');
  fs.writeFileSync(
    frame,
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64'
    )
  );

  await page.evaluate(() => openAnimTextureEditor('LightingL', LML.HoldNoteLightImage, 'LightingL', '1x'));
  await page.waitForTimeout(300);
  await page.setInputFiles('#animSingleFrameInput', frame);
  await page.waitForFunction(
    () => document.querySelectorAll('#animFramesGrid > *').length >= 1,
    null,
    { timeout: 15000 }
  );
  expect(await page.evaluate(() => document.querySelectorAll('#animFramesGrid > *').length)).toBeGreaterThanOrEqual(1);
  expect(errors).toEqual([]);
});

test('I7 打击特效贴图使用 stable 全局键，不再按轨道展开', async ({ page }) => {
  const errors = await boot(page);
  await importSkin(page);

  const state = await page.evaluate(() => {
    parseSkinIniLazer([
      '[General]',
      'Version: latest',
      '[Mania]',
      'Keys: 4',
      'LightingN: global-n',
      'LightingN0: lane-0-n',
      'Lighting0N: lane-0-alt-n',
      'Lighting1: lane-1-generic',
      'LightingL: global-l',
      'LightingL0: lane-0-l',
      'Lighting0L: lane-0-alt-l'
    ].join('\n'));

    const outN = {};
    const outL = {};
    const ini = generateSkinIniText();
    return {
      resolvedN0: getManiaNoteTextureName(4, LML.ExplosionImage, 0, outN),
      resolvedN1: getManiaNoteTextureName(4, LML.ExplosionImage, 1),
      resolvedL0: getManiaNoteTextureName(4, LML.HoldNoteLightImage, 0, outL),
      matchedN: outN.matchedKey,
      matchedL: outL.matchedKey,
      columnKeysN: getTextureParamColumnKeys('LightingN', 4),
      columnKeysL: getTextureParamColumnKeys('LightingL', 4),
      hasPerTrackLightingKey: /Lighting(?:N\d|L\d|\d+N|\d+L|\d+)\s*:/i.test(ini)
    };
  });

  expect(state.resolvedN0).toBe('global-n');
  expect(state.resolvedN1).toBe('global-n');
  expect(state.resolvedL0).toBe('global-l');
  expect(state.matchedN).toBe('LightingN');
  expect(state.matchedL).toBe('LightingL');
  expect(state.columnKeysN).toEqual([]);
  expect(state.columnKeysL).toEqual([]);
  expect(state.hasPerTrackLightingKey).toBe(false);
  expect(errors).toEqual([]);
});

test('I8 ColourHold 透明度参与连击数字着色', async ({ page }) => {
  const errors = await boot(page);

  const result = await page.evaluate(() => {
    const source = document.createElement('canvas');
    source.width = 1;
    source.height = 1;
    const sourceCtx = source.getContext('2d');
    sourceCtx.fillStyle = '#ffffff';
    sourceCtx.fillRect(0, 0, 1, 1);

    const readTintedAlpha = (alpha) => {
      const tinted = getTintedDigitCanvas(source, { r: 255, g: 0, b: 0, a: alpha });
      return tinted.getContext('2d').getImageData(0, 0, 1, 1).data[3];
    };

    const keys = getActiveKeyCount();
    ensureManiaConfigForKeys(keys);
    getManiaConfigForKeys(keys).ColourHold = { r: 255, g: 0, b: 0, a: 0 };
    const ini = generateSkinIniText();

    return {
      full: readTintedAlpha(255),
      half: readTintedAlpha(128),
      zero: readTintedAlpha(0),
      exportsZeroAlpha: /ColourHold\s*:\s*255,0,0,0/.test(ini)
    };
  });

  expect(result.full).toBe(255);
  expect(result.half).toBeGreaterThanOrEqual(127);
  expect(result.half).toBeLessThanOrEqual(129);
  expect(result.zero).toBe(0);
  expect(result.exportsZeroAlpha).toBe(true);
  expect(errors).toEqual([]);
});

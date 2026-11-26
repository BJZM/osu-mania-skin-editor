const fs = require('node:fs');
const fsp = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { _electron: electron } = require('playwright');
const JSZip = require('../../vendor/jszip.min.js');
const { createStaticServer } = require('../../electron/static-server.cjs');

const ROOT = path.resolve(__dirname, '../..');
const AVI_FIXTURE = fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'avi-test.avi'));

function startTestServer(options = {}) {
  const server = createStaticServer(ROOT, options);
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve({
        server,
        port: server.address().port,
        baseUrl: `http://127.0.0.1:${server.address().port}`
      });
    });
  });
}

function stopTestServer(server) {
  return new Promise((resolve) => {
    if (!server) {
      resolve();
      return;
    }
    if (typeof server.closeAllConnections === 'function') {
      server.closeAllConnections();
    }
    server.close(() => resolve());
  });
}

function rawHttpRequest(port, method, reqPath, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        method,
        path: reqPath,
        headers
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks)
          });
        });
      }
    );
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

test('静态服务只暴露运行时必需资源并拦截越权方法与路径', async () => {
  const { server, port, baseUrl } = await startTestServer();
  try {
    for (const allowedPath of [
      '/',
      '/index.html',
      '/src/css/style.css',
      '/src/js/bundle.js',
      '/vendor/jszip.min.js',
      '/LICENSE',
      '/THIRD_PARTY_NOTICES.md',
      '/assets/favicon.svg'
    ]) {
      const res = await fetch(`${baseUrl}${allowedPath}`);
      expect(res.status, `expected 200 for ${allowedPath}`).toBe(200);
    }

    for (const blockedPath of [
      '/package.json',
      '/electron/main.cjs',
      '/tools/static-server.cjs',
      '/src/js/core/state.js',
      '/vendor/ffmpeg-lgpl-win64/bin/ffmpeg.exe',
      '/../package.json',
      '/%2e%2e/package.json'
    ]) {
      const res = await rawHttpRequest(port, 'GET', blockedPath, {
        Host: `127.0.0.1:${port}`
      });
      expect(res.statusCode, `expected 403 for ${blockedPath}`).toBe(403);
    }

    const postStatic = await rawHttpRequest(port, 'POST', '/index.html', {
      Host: `127.0.0.1:${port}`
    });
    expect(postStatic.statusCode).toBe(405);
    expect(postStatic.headers.allow).toBe('GET, HEAD');

    const headStatic = await rawHttpRequest(port, 'HEAD', '/index.html', {
      Host: `127.0.0.1:${port}`
    });
    expect(headStatic.statusCode).toBe(200);
    expect(headStatic.body.length).toBe(0);
  } finally {
    await stopTestServer(server);
  }
});

test('视频转码接口强制校验 Origin/Token、限制体积并在断开时清理临时目录', async () => {
  const token = 'phase6-test-session-token';
  const { server, port } = await startTestServer({
    videoTranscodeOptions: { token }
  });

  const beforeTempEntries = new Set(
    (await fsp.readdir(os.tmpdir())).filter((name) => name.startsWith('osu-skin-video-'))
  );

  try {
    const noTokenRes = await rawHttpRequest(
      port,
      'POST',
      '/__video-transcode?source=video.avi',
      {
        Host: `127.0.0.1:${port}`,
        Origin: `http://127.0.0.1:${port}`,
        'X-Osu-Video-Transcode': '1',
        'Content-Type': 'application/octet-stream'
      },
      AVI_FIXTURE
    );
    expect(noTokenRes.statusCode).toBe(403);

    const crossOriginRes = await rawHttpRequest(
      port,
      'POST',
      '/__video-transcode?source=video.avi',
      {
        Host: `127.0.0.1:${port}`,
        Origin: 'http://evil.example',
        'X-Osu-Video-Transcode': '1',
        'X-Osu-Video-Transcode-Token': token,
        'Content-Type': 'application/octet-stream'
      },
      AVI_FIXTURE
    );
    expect(crossOriginRes.statusCode).toBe(403);

    const oversizeRes = await rawHttpRequest(
      port,
      'POST',
      '/__video-transcode?source=video.avi',
      {
        Host: `127.0.0.1:${port}`,
        Origin: `http://127.0.0.1:${port}`,
        'X-Osu-Video-Transcode': '1',
        'X-Osu-Video-Transcode-Token': token,
        'Content-Length': String(600 * 1024 * 1024),
        'Content-Type': 'application/octet-stream'
      }
    );
    expect(oversizeRes.statusCode).toBe(413);

    const okRes = await rawHttpRequest(
      port,
      'POST',
      '/__video-transcode?source=video.avi',
      {
        Host: `127.0.0.1:${port}`,
        Origin: `http://127.0.0.1:${port}`,
        'X-Osu-Video-Transcode': '1',
        'X-Osu-Video-Transcode-Token': token,
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(AVI_FIXTURE.length)
      },
      AVI_FIXTURE
    );
    expect(okRes.statusCode).toBe(200);
    expect(okRes.headers['content-type']).toBe('video/webm');
    expect(okRes.body.length).toBeGreaterThan(100);

    await new Promise((resolve) => setTimeout(resolve, 150));
    const afterTempEntries = (await fsp.readdir(os.tmpdir())).filter(
      (name) => name.startsWith('osu-skin-video-') && !beforeTempEntries.has(name)
    );
    expect(afterTempEntries).toEqual([]);
  } finally {
    await stopTestServer(server);
  }
});

test('Electron 桌面端视频转码鉴权与切难度中止转码正常', async () => {
  test.setTimeout(60000);
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'osu-phase6-electron-'));
  const userDataDir = path.join(tmpDir, 'userData');
  const aviZip = new JSZip();
  const image = fs.readFileSync(path.join(ROOT, 'assets', 'app-icon.png'));
  aviZip.file('video.avi', AVI_FIXTURE);
  aviZip.file('bg.png', image);
  aviZip.file('Diff A.osu', [
    'osu file format v14',
    '[General]',
    'AudioFilename: audio.mp3',
    'Mode: 3',
    '[Metadata]',
    'Title:AVI Desktop Test',
    'Version:Diff A',
    '[Difficulty]',
    'CircleSize:4',
    '[Events]',
    '0,0,"bg.png",0,0',
    'Video,0,"video.avi",0,0',
    '[TimingPoints]',
    '0,500,4,2,0,100,1,0',
    '[HitObjects]',
    '64,192,0,1,0,0:0:0:0:'
  ].join('\n'));
  aviZip.file('Diff B.osu', [
    'osu file format v14',
    '[General]',
    'AudioFilename: audio.mp3',
    'Mode: 3',
    '[Metadata]',
    'Title:AVI Desktop Test',
    'Version:Diff B',
    '[Difficulty]',
    'CircleSize:4',
    '[Events]',
    '0,0,"bg.png",0,0',
    '[TimingPoints]',
    '0,500,4,2,0,100,1,0',
    '[HitObjects]',
    '64,192,0,1,0,0:0:0:0:'
  ].join('\n'));
  const oszPath = path.join(tmpDir, 'avi-desktop.osz');
  await fsp.writeFile(oszPath, await aviZip.generateAsync({ type: 'nodebuffer' }));

  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  let app = null;

  try {
    app = await electron.launch({
      args: [`--user-data-dir=${userDataDir}`, '.'],
      cwd: ROOT,
      env
    });
    const page = await app.firstWindow();
    await page.waitForFunction(() => (
      window.skinEditorDesktop &&
      typeof window.skinEditorDesktop.getVideoTranscodeToken === 'function' &&
      typeof resumeStoryboardPlayback === 'function'
    ), null, { timeout: 30000 });

    const desktopToken = await page.evaluate(() => window.skinEditorDesktop.getVideoTranscodeToken());
    expect(desktopToken.length).toBeGreaterThan(20);

    await page.setInputFiles('#oszInput', oszPath);
    await page.waitForFunction(() => Array.isArray(beatmaps) && beatmaps.length === 2, null, {
      timeout: 30000
    });

    // 切换到带视频的 Diff A，确认桌面端带 Token 转码成功
    await page.evaluate(async () => {
      const idx = beatmaps.findIndex((b) => b.data && b.data.metadata && b.data.metadata.version === 'Diff A');
      await loadBeatmapDifficulty(idx);
      resumeStoryboardPlayback();
    });

    await page.waitForFunction(
      () => storyboardPlaybackState &&
        storyboardPlaybackState.video &&
        storyboardPlaybackState.video.transcoded &&
        storyboardPlaybackState.video.ready,
      null,
      { timeout: 60000 }
    );

    // 再次加载带视频的 Diff A，并在转码请求发出后立即切到无视频的 Diff B，验证 AbortController 中止旧转码且无错误状态
    const abortVerified = await page.evaluate(async () => {
      const idxA = beatmaps.findIndex((b) => b.data && b.data.metadata && b.data.metadata.version === 'Diff A');
      const idxB = beatmaps.findIndex((b) => b.data && b.data.metadata && b.data.metadata.version === 'Diff B');
      await loadBeatmapDifficulty(idxA);
      resumeStoryboardPlayback();
      const firstState = storyboardPlaybackState;
      await new Promise((r) => setTimeout(r, 30));
      const controller = firstState && firstState.videoAbortController;
      await loadBeatmapDifficulty(idxB);
      return {
        aborted: controller ? controller.signal.aborted : true,
        currentVersion: currentBeatmap && currentBeatmap.metadata && currentBeatmap.metadata.version,
        hasVideo: !!(storyboardPlaybackState && storyboardPlaybackState.video)
      };
    });
    expect(abortVerified.aborted).toBe(true);
    expect(abortVerified.currentVersion).toBe('Diff B');
    expect(abortVerified.hasVideo).toBe(false);
  } finally {
    if (app) {
      await app.evaluate(({ BrowserWindow }) => {
        for (const win of BrowserWindow.getAllWindows()) win.destroy();
      }).catch(() => {});
      await app.close().catch(() => {});
    }
    await fsp.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }).catch(() => {});
  }
});

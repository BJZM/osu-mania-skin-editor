const { test, expect } = require('@playwright/test');
const { _electron: electron } = require('playwright');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const MINIMAL_BEATMAP = path.join(ROOT, 'samples', 'beatmaps', 'minimal-4k.osu');
const DISCOVERY_PATH = path.join(
  os.tmpdir(),
  'osu-mania-skin-editor-agent-bridge.json'
);

async function waitForDiscovery(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const text = await fs.readFile(DISCOVERY_PATH, 'utf8');
      return JSON.parse(text);
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error(`Timed out waiting for ${DISCOVERY_PATH}`);
}

async function invokeBridge(discovery, method, params = {}) {
  const response = await fetch(`${discovery.url}/invoke`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${discovery.token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ method, params })
  });
  const payload = await response.json();
  expect(response.ok, JSON.stringify(payload)).toBe(true);
  expect(payload.ok).toBe(true);
  return payload.result;
}

test('Electron Agent Bridge exposes the live renderer session over loopback', async () => {
  await fs.rm(DISCOVERY_PATH, { force: true });
  const userDataDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'osu-mania-skin-editor-electron-')
  );
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
    await page.waitForFunction(() => window.skinAgentSession);
    await page.setInputFiles('#oszInput', MINIMAL_BEATMAP);
    await page.waitForFunction(
      () => Array.isArray(beatmaps) && beatmaps.length > 0,
      null,
      { timeout: 30000 }
    );
    await page.evaluate(async () => {
      await skinAgentSession.openSkin({
        source: 'default',
        confirmReset: true,
        keyCount: 4
      });
    });

    const discovery = await waitForDiscovery();
    expect(discovery.protocolVersion).toBe(1);
    expect(discovery.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(discovery.token.length).toBeGreaterThan(20);

    const description = await invokeBridge(discovery, 'skin_describe');
    expect(description.ready).toBe(true);
    expect(description.keyCount).toBe(4);
    expect(description.revision).toBeGreaterThan(0);
    expect(description.textures.some((item) => item.paramKey === 'NoteImage0')).toBe(true);

    const preview = await invokeBridge(discovery, 'skin_preview', { state: 'idle' });
    expect(preview.mimeType).toBe('image/png');
    expect(preview.imageBase64.length).toBeGreaterThan(100);

    const invalidTokenResponse = await fetch(`${discovery.url}/invoke`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer invalid',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ method: 'skin_describe', params: {} })
    });
    expect(invalidTokenResponse.status).toBe(401);
  } finally {
    if (app) await app.close();
    await fs.rm(DISCOVERY_PATH, { force: true });
    await fs.rm(userDataDir, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100
    }).catch(() => {});
  }
});

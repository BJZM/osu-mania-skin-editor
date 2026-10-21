const { test, expect } = require('@playwright/test');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const MINIMAL_BEATMAP = path.join(ROOT, 'samples', 'beatmaps', 'minimal-4k.osu');
const RED_PIXEL_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z1S8AAAAASUVORK5CYII=';

async function bootDefaultWorkspace(page) {
  await page.goto('/index.html');
  await page.waitForFunction(
    () => window.skinAgentSession &&
      typeof skinAgentSession.applyOperations === 'function' &&
      typeof startFromDefaultSkin === 'function'
  );
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
}

test('Agent 批次只产生一条撤回记录，并可预览和导出', async ({ page }) => {
  await bootDefaultWorkspace(page);

  const before = await page.evaluate(() => skinAgentSession.getDebugState());
  expect(before.ready).toBe(true);
  expect(before.transactionActive).toBe(false);
  expect(before.undoDepth).toBe(0);

  const applied = await page.evaluate(async ({ png, revision }) => {
    return skinAgentSession.applyOperations([
      {
        type: 'texture.set',
        paramKey: 'NoteImage0',
        imageBase64: png,
        mimeType: 'image/png',
        spec: '1x',
        fileName: 'agent-note.png'
      },
      {
        type: 'config.set',
        key: 'HitPosition',
        value: 402
      }
    ], 'Agent: 制作测试皮肤', revision);
  }, { png: RED_PIXEL_PNG, revision: before.revision });

  expect(applied.revision).toBeGreaterThan(before.revision);
  expect(applied.applied).toHaveLength(2);
  expect(applied.applied[0].paths.length).toBeGreaterThan(0);

  const afterApply = await page.evaluate(() => ({
    debug: skinAgentSession.getDebugState(),
    replacementPaths: Array.from(userReplacedTextures.keys()),
    hitPosition: maniaSkinConfigurations.get(4).HitPosition
  }));
  expect(afterApply.debug.undoDepth).toBe(1);
  expect(afterApply.replacementPaths.length).toBeGreaterThan(0);
  expect(afterApply.hitPosition).toBe(402);

  const preview = await page.evaluate(() => skinAgentSession.capturePreview({ state: 'idle' }));
  expect(preview.mimeType).toBe('image/png');
  expect(preview.width).toBeGreaterThan(0);
  expect(preview.height).toBeGreaterThan(0);
  expect(preview.imageBase64.length).toBeGreaterThan(100);

  const exported = await page.evaluate(() => skinAgentSession.exportPackage({
    format: 'osk',
    mode: 'editable'
  }));
  expect(exported.fileName).toMatch(/_editable\.osk$/i);
  expect(exported.byteLength).toBeGreaterThan(100);
  expect(exported.archiveBase64.length).toBeGreaterThan(100);

  const undoState = await page.evaluate(() => {
    performSkinUndo();
    return {
      debug: skinAgentSession.getDebugState(),
      replacementPaths: Array.from(userReplacedTextures.keys())
    };
  });
  expect(undoState.debug.redoDepth).toBe(1);
  expect(undoState.replacementPaths).toHaveLength(0);
});

test('Agent 批次失败时整体回滚，不留下半成品或撤回记录', async ({ page }) => {
  await bootDefaultWorkspace(page);

  const result = await page.evaluate(async ({ png }) => {
    const before = skinAgentSession.getDebugState();
    let error = null;
    try {
      await skinAgentSession.applyOperations([
        {
          type: 'texture.set',
          paramKey: 'NoteImage1',
          imageBase64: png,
          mimeType: 'image/png',
          spec: '1x',
          fileName: 'rollback-note.png'
        },
        {
          type: 'unsupported.operation'
        }
      ], 'Agent: 回滚测试', before.revision);
    } catch (err) {
      error = { code: err.code, message: err.message };
    }
    return {
      error,
      after: skinAgentSession.getDebugState(),
      replacementPaths: Array.from(userReplacedTextures.keys())
    };
  }, { png: RED_PIXEL_PNG });

  expect(result.error && result.error.code).toBe('UNSUPPORTED_OPERATION');
  expect(result.after.undoDepth).toBe(0);
  expect(result.after.transactionActive).toBe(false);
  expect(result.replacementPaths).toHaveLength(0);
});

test('Agent 拒绝过期 revision', async ({ page }) => {
  await bootDefaultWorkspace(page);

  const result = await page.evaluate(async ({ png, revision }) => {
    try {
      await skinAgentSession.applyOperations([
        {
          type: 'texture.set',
          paramKey: 'NoteImage0',
          imageBase64: png,
          spec: '1x'
        }
      ], 'Agent: 过期 revision', revision - 1);
      return null;
    } catch (error) {
      return {
        code: error.code,
        details: error.details
      };
    }
  }, {
    png: RED_PIXEL_PNG,
    revision: await page.evaluate(() => skinAgentSession.getRevision())
  });

  expect(result && result.code).toBe('STALE_REVISION');
  expect(result.details.currentRevision).toBe(result.details.expectedRevision + 1);
});

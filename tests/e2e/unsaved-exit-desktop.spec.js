const { test, expect } = require('@playwright/test');
const { _electron: electron } = require('playwright');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');

test.setTimeout(60000);

async function launchApp() {
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osu-mania-skin-editor-exit-'));
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    args: [`--user-data-dir=${userDataDir}`, '.'],
    cwd: ROOT,
    env
  });
  const page = await app.firstWindow();
  await page.waitForFunction(() => (
    window.skinEditorDesktop &&
    window.skinWorkspaceRevision &&
    typeof recordSkinUndoBeforeChange === 'function' &&
    isDefaultSkinLoaded === true
  ), null, { timeout: 30000 });
  return { app, page, userDataDir };
}

async function closeFromMain(app, page) {
  const browserWindow = await app.browserWindow(page);
  await browserWindow.evaluate((win) => win.close());
  return browserWindow;
}

async function forceStop(app) {
  await app.evaluate(({ BrowserWindow }) => {
    for (const win of BrowserWindow.getAllWindows()) win.destroy();
  }).catch(() => {});
  await app.close().catch(() => {});
}

test('没有未导出操作时关闭便携版窗口不询问', async () => {
  const launched = await launchApp();
  try {
    let sawPrompt = false;
    await launched.page.exposeBinding('__unsavedExitSeen', () => {
      sawPrompt = true;
    });
    await launched.page.evaluate(() => {
      const modal = document.getElementById('unsavedExitModal');
      const observer = new MutationObserver(() => {
        if (modal && modal.style.display !== 'none') window.__unsavedExitSeen();
      });
      observer.observe(modal, { attributes: true, attributeFilter: ['style'] });
    });

    const closed = launched.page.waitForEvent('close');
    await closeFromMain(launched.app, launched.page);
    await closed;
    expect(sawPrompt).toBe(false);
  } finally {
    await forceStop(launched.app);
    await fs.rm(launched.userDataDir, { recursive: true, force: true });
  }
});

test('有未导出操作时关闭会询问，取消保留窗口，不导出则退出', async () => {
  const launched = await launchApp();
  try {
    await launched.page.evaluate(() => {
      recordSkinUndoBeforeChange('测试未导出操作', { force: true });
      currentSkinMetadata.general.Name = '未导出测试';
    });

    await closeFromMain(launched.app, launched.page);
    const modal = launched.page.locator('#unsavedExitModal');
    await expect(modal).toBeVisible();
    await expect(modal).toContainText('要导出皮肤吗？');
    await launched.page.evaluate(() => document.getElementById('unsavedExitCancelBtn').click());
    await expect(modal).toBeHidden();

    const browserWindow = await launched.app.browserWindow(launched.page);
    expect(await browserWindow.evaluate((win) => win.isDestroyed())).toBe(false);

    await closeFromMain(launched.app, launched.page);
    await expect(modal).toBeVisible();
    const closed = launched.page.waitForEvent('close');
    await launched.page.evaluate(() => document.getElementById('unsavedExitDiscardBtn').click());
    await closed;
  } finally {
    await forceStop(launched.app);
    await fs.rm(launched.userDataDir, { recursive: true, force: true });
  }
});

test('选择导出皮肤时先进入导出方式，取消导出后仍留在编辑器', async () => {
  const launched = await launchApp();
  try {
    await launched.page.evaluate(() => {
      recordSkinUndoBeforeChange('测试未导出操作', { force: true });
    });
    await closeFromMain(launched.app, launched.page);
    const exitModal = launched.page.locator('#unsavedExitModal');
    await expect(exitModal).toBeVisible({ timeout: 5000 });
    await launched.page.evaluate(() => document.getElementById('unsavedExitExportBtn').click());
    await expect(launched.page.locator('#textureExportModeModal')).toBeVisible({ timeout: 5000 });
    await launched.page.evaluate(() => document.getElementById('textureExportModeCancelBtn').click());
    await expect(launched.page.locator('#unsavedExitModal')).toBeHidden();
    await expect(launched.page.locator('#textureExportModeModal')).toBeHidden();
    const browserWindow = await launched.app.browserWindow(launched.page);
    expect(await browserWindow.evaluate((win) => win.isDestroyed())).toBe(false);
    expect(await launched.page.evaluate(() => window.skinWorkspaceRevision.hasUnexportedOperations())).toBe(true);
  } finally {
    await forceStop(launched.app);
    await fs.rm(launched.userDataDir, { recursive: true, force: true });
  }
});

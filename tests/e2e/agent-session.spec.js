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

function createMinimalWavBase64() {
  const buf = Buffer.alloc(46);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(38, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(8000, 24);
  buf.writeUInt32LE(16000, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(2, 40);
  return buf.toString('base64');
}

test('工作区未就绪时，同步转异步的 Agent 方法应等待并拒绝为 EDITOR_NOT_READY', async ({ page }) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => window.skinAgentSession && typeof skinAgentSession.dispatch === 'function');

  const results = await page.evaluate(async (wavBase64) => {
    const calls = [
      ['skin_undo', {}],
      ['skin_redo', {}],
      ['skin_revert', {}],
      ['skin_config_reset', { tab: 'mania' }],
      ['skin_ini_get', {}],
      ['skin_hitsound_list', {}],
      ['skin_hitsound_apply', { groupKey: 'normal-hitnormal', audioBase64: wavBase64 }],
      ['skin_hitsound_reset', {}]
    ];
    const settled = await Promise.allSettled(
      calls.map(([method, params]) => skinAgentSession.dispatch(method, params))
    );
    return settled.map((item, idx) => ({
      method: calls[idx][0],
      status: item.status,
      code: item.reason && item.reason.code
    }));
  }, createMinimalWavBase64());

  for (const item of results) {
    expect(item.status, item.method).toBe('rejected');
    expect(item.code, item.method).toBe('EDITOR_NOT_READY');
  }
});

test('Agent 各写入命令单次递增 revision、不泄漏 continuousActionActive，并正确处理重置与长条投皮错误', async ({ page }) => {
  await bootDefaultWorkspace(page);
  const wavBase64 = createMinimalWavBase64();

  const summary = await page.evaluate(async ({ wav }) => {
    const steps = [];
    const snapState = () => ({
      debug: skinAgentSession.getDebugState(),
      cfg: maniaSkinConfigurations.get(4)
    });

    let prev = snapState();
    const step = (name, result) => {
      const cur = snapState();
      steps.push({
        name,
        resultRevision: result && result.revision,
        revDelta: cur.debug.revision - prev.debug.revision,
        undoDelta: cur.debug.undoDepth - prev.debug.undoDepth,
        continuousActionActive: cur.debug.continuousActionActive,
        transactionActive: cur.debug.transactionActive
      });
      prev = cur;
    };

    // 1. 先通过 skin_config_patch 修改各类参数，再执行 skin_config_reset
    const patched = await skinAgentSession.dispatch('skin_config_patch', {
      parameters: [
        { key: 'ColumnWidth', value: [52, 52, 52, 52] },
        { key: 'ColumnSpacing', value: [6, 6, 6] },
        { key: 'ColumnLineWidth', value: [4, 4, 4, 4, 4] },
        { key: 'ColumnStart', value: 260 },
        { key: 'ColumnColour', value: { all: true, color: { r: 10, g: 20, b: 30, a: 180 } } },
        { key: 'ColourLight', value: { all: true, color: { r: 40, g: 50, b: 60, a: 200 } } }
      ]
    });
    step('skin_config_patch', patched);

    // 600ms 内紧接一次人工微调，不得被吞并进同一撤销快照
    onParamChange('ScorePosition', 250);
    const manualAfterPatch = snapState();
    const manualUndoDeltaAfterPatch = manualAfterPatch.debug.undoDepth - prev.debug.undoDepth;
    prev = manualAfterPatch;

    const resetCfg = await skinAgentSession.dispatch('skin_config_reset', { tab: 'mania' });
    step('skin_config_reset', resetCfg);
    const cfgAfterReset = maniaSkinConfigurations.get(4);
    const resetSnapshot = {
      ColumnStart: cfgAfterReset.ColumnStart,
      ColumnWidth: [...cfgAfterReset.ColumnWidth],
      ColumnSpacing: [...cfgAfterReset.ColumnSpacing],
      ColumnLineWidth: [...cfgAfterReset.ColumnLineWidth],
      ColumnColour: cfgAfterReset.ColumnColour.map((c) => ({ ...c })),
      ColourLight: cfgAfterReset.ColourLight.map((c) => ({ ...c }))
    };

    const reverted = await skinAgentSession.dispatch('skin_revert', {});
    step('skin_revert', reverted);

    // 2. 音效替换与重置（含无变更 no-op 与全部重置）
    const hsList = await skinAgentSession.dispatch('skin_hitsound_list', {});
    const targetKey = hsList.hitsounds[0].key;

    const hsApplied = await skinAgentSession.dispatch('skin_hitsound_apply', {
      groupKey: targetKey,
      audioBase64: wav,
      fileName: `${targetKey}.wav`
    });
    step('skin_hitsound_apply', hsApplied);

    const hsNoop = await skinAgentSession.dispatch('skin_hitsound_reset', {
      groupKey: '__nonexistent_hitsound__'
    });
    step('skin_hitsound_reset_noop', hsNoop);

    const hsResetAll = await skinAgentSession.dispatch('skin_hitsound_reset', {});
    step('skin_hitsound_reset_all', hsResetAll);

    const hsResetAllNoop = await skinAgentSession.dispatch('skin_hitsound_reset', {});
    step('skin_hitsound_reset_all_noop', hsResetAllNoop);

    // 3. 贴图创建、编辑、设白、重置、拉伸修复与长条投皮
    const created = await skinAgentSession.dispatch('texture_create', {
      name: 'agent_solid_box',
      width: 64,
      height: 64,
      shape: 'rectangle',
      paramKey: 'NoteImage0'
    });
    step('texture_create', created);

    const edited = await skinAgentSession.dispatch('texture_edit', {
      paramKey: 'NoteImage0',
      crop: { left: 2, right: 2, top: 2, bottom: 2 },
      transform: { stretchX: 16 }
    });
    step('texture_edit', edited);

    const stretchFixed = await skinAgentSession.dispatch('texture_stretch_fix', {
      paramKey: 'KeyImage0'
    });
    step('texture_stretch_fix', stretchFixed);

    const stretchNoop = await skinAgentSession.dispatch('texture_stretch_fix', {
      paramKey: 'NoteImage0'
    });
    step('texture_stretch_fix_noop', stretchNoop);

    const blanked = await skinAgentSession.dispatch('texture_set_blank', {
      paramKey: 'StageHint'
    });
    step('texture_set_blank', blanked);

    const resetTex = await skinAgentSession.dispatch('texture_reset', {
      paramKey: 'NoteImage0'
    });
    step('texture_reset', resetTex);

    const longbodyOk = await skinAgentSession.dispatch('texture_longbody_apply', {
      column: 0,
      targetHeight: 6000,
      tailPreset: 'sharp'
    });
    step('texture_longbody_apply', longbodyOk);

    // 为第 2 轨创建 6000px（>= 5000px 上限）的长条身体贴图，再尝试一键投皮应抛出 LONGBODY_NOT_ELIGIBLE 并干净回滚
    const tallBody = await skinAgentSession.dispatch('texture_create', {
      name: 'tall_hold_body_col1',
      width: 32,
      height: 6000,
      shape: 'rectangle',
      paramKey: 'HoldNoteBodyImage',
      column: 1
    });
    step('texture_create_tall_body', tallBody);

    let longbodyError = null;
    const beforeFailedLongbody = snapState();
    try {
      await skinAgentSession.dispatch('texture_longbody_apply', {
        column: 1,
        targetHeight: 6000
      });
    } catch (err) {
      longbodyError = { code: err.code, message: err.message };
    }
    const afterFailedLongbody = snapState();

    // 4. 撤回与重做各推进 1 次 revision
    const undone = await skinAgentSession.dispatch('skin_undo', {});
    step('skin_undo', undone);
    const redone = await skinAgentSession.dispatch('skin_redo', {});
    step('skin_redo', redone);

    return {
      steps,
      manualUndoDeltaAfterPatch,
      resetSnapshot,
      hsNoopChanged: hsNoop.changed,
      hsResetAllChanged: hsResetAll.changed,
      hsResetAllNoopChanged: hsResetAllNoop.changed,
      stretchFixed: stretchFixed.fixed,
      stretchNoopFixed: stretchNoop.fixed,
      longbodyError,
      longbodyRollbackClean:
        afterFailedLongbody.debug.revision === beforeFailedLongbody.debug.revision &&
        afterFailedLongbody.debug.undoDepth === beforeFailedLongbody.debug.undoDepth &&
        afterFailedLongbody.debug.transactionActive === false &&
        afterFailedLongbody.debug.continuousActionActive === false,
      openTextureTabsCount: textureImageEditorUi.getState().tabCount
    };
  }, { wav: wavBase64 });

  expect(summary.manualUndoDeltaAfterPatch).toBe(1);
  expect(summary.resetSnapshot.ColumnStart).toBe(136);
  expect(summary.resetSnapshot.ColumnWidth).toEqual([30, 30, 30, 30]);
  expect(summary.resetSnapshot.ColumnSpacing).toEqual([0, 0, 0]);
  expect(summary.resetSnapshot.ColumnLineWidth).toEqual([2, 2, 2, 2, 2]);
  for (const c of summary.resetSnapshot.ColumnColour) {
    expect(c).toEqual({ r: 0, g: 0, b: 0, a: 255 });
  }
  for (const c of summary.resetSnapshot.ColourLight) {
    expect(c).toEqual({ r: 255, g: 255, b: 255, a: 255 });
  }

  expect(summary.hsNoopChanged).toBe(false);
  expect(summary.hsResetAllChanged).toBe(true);
  expect(summary.hsResetAllNoopChanged).toBe(false);
  expect(summary.stretchFixed).toBe(true);
  expect(summary.stretchNoopFixed).toBe(false);
  expect(summary.longbodyError && summary.longbodyError.code).toBe('LONGBODY_NOT_ELIGIBLE');
  expect(summary.longbodyRollbackClean).toBe(true);
  expect(summary.openTextureTabsCount).toBe(2); // 仅保留 menu + texture-library 两个固定标签页

  const expectedOneRev = new Set([
    'skin_config_patch',
    'skin_config_reset',
    'skin_revert',
    'skin_hitsound_apply',
    'skin_hitsound_reset_all',
    'texture_create',
    'texture_edit',
    'texture_stretch_fix',
    'texture_set_blank',
    'texture_reset',
    'texture_longbody_apply',
    'texture_create_tall_body',
    'skin_undo',
    'skin_redo'
  ]);
  const expectedZeroRev = new Set([
    'skin_hitsound_reset_noop',
    'skin_hitsound_reset_all_noop',
    'texture_stretch_fix_noop'
  ]);

  for (const item of summary.steps) {
    expect(item.continuousActionActive, item.name).toBe(false);
    expect(item.transactionActive, item.name).toBe(false);
    if (expectedOneRev.has(item.name)) {
      expect(item.revDelta, `${item.name} revDelta`).toBe(1);
    } else if (expectedZeroRev.has(item.name)) {
      expect(item.revDelta, `${item.name} revDelta`).toBe(0);
      expect(item.undoDelta, `${item.name} undoDelta`).toBe(0);
    }
  }
});

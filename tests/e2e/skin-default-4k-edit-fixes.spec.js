const path = require('path');
const { test, expect } = require('@playwright/test');

const ROOT = path.resolve(__dirname, '../..');
const BEATMAP = path.join(ROOT, 'samples', 'beatmaps', '1790742 MIMI - Kuu ni Naru.osz');

async function bootDefaultSkin(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type === 'error') errors.push(`console: ${message.text()}`);
  });
  await page.goto('/index.html');
  await page.setInputFiles('#oszInput', BEATMAP);
  await page.waitForFunction(() => isStartupBeatmapReady() && beatmaps.length > 0, null, { timeout: 30000 });
  await page.click('#startupUseDefaultSkinBtn');
  await page.waitForFunction(() => isStartupWorkspaceReady(), null, { timeout: 30000 });
  await page.waitForTimeout(200);
  return errors;
}

test.describe('4K 默认皮肤编辑核心缺陷验证', () => {
  test('问题1：替换第1轨与第2轨Note贴图，对应长条头保持独立不被替换，且支持撤回重做', async ({ page }) => {
    const errors = await bootDefaultSkin(page);

    // 预注入一张自定义贴图到 skinImageStore
    await page.evaluate(() => {
      const frame = document.createElement('canvas');
      frame.width = 32;
      frame.height = 32;
      const ctx = frame.getContext('2d');
      ctx.fillStyle = '#ff2288';
      ctx.fillRect(0, 0, 32, 32);
      saveSkinAssetToStore(skinImageStore, 'custom-note-tex', frame, false, true, true);
      saveSkinAssetToStore(skinFallbackImageStore, 'custom-note-tex', frame, false, true, true);
    });

    await page.click('#openTextureImageEditorBtn');
    await page.waitForSelector('#textureImagePickerGrid');

    // 1. 在第 1 轨 (NoteImage0) 上通过已有贴图替换为 custom-note-tex
    const card0 = page.locator('#textureImagePickerGrid #param-card-NoteImage0');
    await card0.scrollIntoViewIfNeeded();
    await card0.locator('.texture-upload-dropdown').hover();
    const existingItem = card0.locator('.texture-upload-menu-item.item-existing');
    await expect(existingItem).toBeVisible();
    await existingItem.click({ force: true });

    await page.waitForSelector('#textureExistingPickerModal', { state: 'visible' });
    await page.fill('#textureExistingPickerSearch', 'custom-note-tex');
    const firstCard = page.locator('#textureExistingPickerGrid .texture-existing-card').first();
    await firstCard.click();
    await page.click('#textureExistingPickerConfirmBtn');
    await expect(page.locator('#textureExistingPickerModal')).toHaveCSS('display', 'none');

    // 验证 NoteImage0 已变成 custom-note-tex，而第 1 轨长条头仍然是默认头（mania-note1H），未被篡改
    const check0 = await page.evaluate(() => {
      const keys = getActiveKeyCount();
      const cfg = getManiaConfigForKeys(keys);
      const headImg = getManiaSkinImage(keys, LML.HoldNoteHeadImage, 0);
      return {
        noteVal: cfg['NoteImage0'],
        headVal: cfg['NoteImage0H'] || cfg['HoldNoteHeadImage0'],
        headName: getManiaNoteTextureName(keys, LML.HoldNoteHeadImage, 0),
        headHasImg: !!headImg
      };
    });
    expect(check0.noteVal).toBe('custom-note-tex');
    expect(check0.headName.toLowerCase()).toBe('mania-note1h');
    expect(check0.headHasImg).toBe(true);

    // 2. 验证撤回
    await page.evaluate(() => performSkinUndo());
    const undoCheck = await page.evaluate(() => {
      const keys = getActiveKeyCount();
      const cfg = getManiaConfigForKeys(keys);
      return {
        noteVal: cfg['NoteImage0'],
        headName: getManiaNoteTextureName(keys, LML.HoldNoteHeadImage, 0)
      };
    });
    expect(undoCheck.noteVal).toBeUndefined();
    expect(undoCheck.headName.toLowerCase()).toBe('mania-note1h');

    // 3. 验证重做
    await page.evaluate(() => performSkinRedo());
    const redoCheck = await page.evaluate(() => {
      const keys = getActiveKeyCount();
      const cfg = getManiaConfigForKeys(keys);
      return {
        noteVal: cfg['NoteImage0'],
        headName: getManiaNoteTextureName(keys, LML.HoldNoteHeadImage, 0)
      };
    });
    expect(redoCheck.noteVal).toBe('custom-note-tex');
    expect(redoCheck.headName.toLowerCase()).toBe('mania-note1h');

    expect(errors).toEqual([]);
  });

  test('问题2：长条身体分轨设为同一贴图后，在通用设置多次修改保存同步，不发生回退且持续生效', async ({ page }) => {
    const errors = await bootDefaultSkin(page);

    // 1. 先将 4 条轨道的长条身体贴图逐轨替换为同一贴图 'custom-body-base'
    await page.evaluate(() => {
      const keys = getActiveKeyCount();
      const cfg = getManiaConfigForKeys(keys);
      if (!cfg.ImageLookups) cfg.ImageLookups = new Map();

      const frame = document.createElement('canvas');
      frame.width = 30;
      frame.height = 80;
      const ctx = frame.getContext('2d');
      ctx.fillStyle = '#11aaff';
      ctx.fillRect(0, 0, 30, 80);
      saveSkinAssetToStore(skinImageStore, 'custom-body-base', frame, false, true, true);
      saveSkinAssetToStore(skinFallbackImageStore, 'custom-body-base', frame, false, true, true);

      for (let i = 0; i < keys; i++) {
        cfg[`NoteImage${i}L`] = 'custom-body-base';
        cfg.ImageLookups.set(`NoteImage${i}L`, 'custom-body-base');
      }
      drawFrame();
    });

    await page.click('#openTextureImageEditorBtn');
    await page.waitForSelector('#textureImagePickerGrid');

    // 打开编辑第 1 轨身体贴图
    const editBtn0L = page.locator('#textureImagePickerGrid #param-card-NoteImage0L .texture-edit-main-btn');
    await editBtn0L.click();
    await page.waitForTimeout(200);

    // 第一次修改：透明扩边右边 2px (原宽 30 -> 32)
    await page.fill('#textureImageCropRight', '2');
    await page.click('#textureImageApplyBtn');
    const scopeModal = page.locator('#textureImageApplyScopeModal');
    await page.waitForTimeout(100);
    if (await scopeModal.isVisible()) {
      await page.click('#textureImageApplyScopeAllBtn'); // 同步替换
      await page.waitForTimeout(300);
    }

    // 验证第一次修改后，所有轨道身体贴图均指向新生成的贴图（或覆盖更新）
    const afterFirst = await page.evaluate(() => {
      const keys = getActiveKeyCount();
      const cfg = getManiaConfigForKeys(keys);
      return Array.from({ length: keys }, (_, i) => getManiaNoteTextureName(keys, LML.HoldNoteBodyImage, i));
    });
    expect(afterFirst[0]).toBe('custom-body-base');
    expect(afterFirst[1]).toBe('custom-body-base');

    // 第二次修改：右边边界值改为 14px，即相对原图右扩 14px（30 + 14 -> 44px），再次保存同步替换
    await page.fill('#textureImageCropRight', '14');
    await page.click('#textureImageApplyBtn');
    await page.waitForTimeout(100);
    if (await scopeModal.isVisible()) {
      await page.click('#textureImageApplyScopeAllBtn');
      await page.waitForTimeout(300);
    }

    // 验证第二次保存后，贴图使用当前绝对扩边值(44px)，不会回退到第一次的 32px 或初始 30px
    const afterSecond = await page.evaluate(() => {
      const keys = getActiveKeyCount();
      const img = getManiaSkinImage(keys, LML.HoldNoteBodyImage, 0);
      return {
        width: img.width,
        height: img.height,
        name: getManiaNoteTextureName(keys, LML.HoldNoteBodyImage, 0)
      };
    });
    expect(afterSecond.width).toBe(44);
    expect(afterSecond.name).toBe('custom-body-base');

    // 验证撤回链条完整：撤回到第 1 次编辑状态（宽 32px）
    await page.evaluate(() => performSkinUndo());
    const afterUndo = await page.evaluate(() => {
      const keys = getActiveKeyCount();
      return getManiaSkinImage(keys, LML.HoldNoteBodyImage, 0).width;
    });
    expect(afterUndo).toBe(32);

    expect(errors).toEqual([]);
  });

  test('问题3：4K 模式下第 2、3 轨 KeyImage 以及 KeyImageDown 均可正常编辑保存', async ({ page }) => {
    const errors = await bootDefaultSkin(page);

    await page.click('#openTextureImageEditorBtn');
    await page.waitForSelector('#textureImagePickerGrid');

    // 1. 编辑第 2 轨 KeyImage (KeyImage1)
    const editBtn1 = page.locator('#textureImagePickerGrid #param-card-KeyImage1 .texture-edit-main-btn');
    expect(await editBtn1.isDisabled()).toBe(false);
    await editBtn1.click();
    await page.waitForTimeout(200);
    expect(await page.isVisible('#textureImageEditorView')).toBe(true);

    // 修改并保存
    await page.fill('#textureImageCropBottom', '4');
    await page.click('#textureImageApplyBtn');
    const scopeModal = page.locator('#textureImageApplyScopeModal');
    if (await scopeModal.isVisible()) {
      await page.click('#textureImageApplyScopeAllBtn');
      await page.waitForTimeout(300);
    }

    // 切回菜单标签
    await page.click('#textureImageTabList .texture-image-tab[data-tab-id="menu"]');
    await page.waitForTimeout(200);

    // 2. 编辑第 1 轨按下态 (KeyImage0D)
    const editBtn0D = page.locator('#textureImagePickerGrid #param-card-KeyImage0D .texture-edit-main-btn');
    expect(await editBtn0D.isDisabled()).toBe(false);
    await editBtn0D.click();
    await page.waitForTimeout(200);
    expect(await page.isVisible('#textureImageEditorView')).toBe(true);

    await page.fill('#textureImageCropTop', '2');
    await page.click('#textureImageApplyBtn');
    if (await scopeModal.isVisible()) {
      await page.click('#textureImageApplyScopeAllBtn');
      await page.waitForTimeout(300);
    }

    // 验证 KeyImage1 与 KeyImage0D 都成功写入了皮肤配置并且能够正常解析
    const cfgCheck = await page.evaluate(() => {
      const keys = getActiveKeyCount();
      return {
        key1: getManiaNoteTextureName(keys, LML.KeyImage, 1),
        key0D: getManiaNoteTextureName(keys, LML.KeyImageDown, 0),
        img1: !!getManiaSkinImage(keys, LML.KeyImage, 1),
        img0D: !!getManiaSkinImage(keys, LML.KeyImageDown, 0)
      };
    });
    expect(cfgCheck.img1).toBe(true);
    expect(cfgCheck.img0D).toBe(true);
    expect(errors).toEqual([]);
  });

  test('问题4：支持通过填名字（输入框直接输入 / 从已有贴图导入弹窗输入）导入已有贴图，并支持撤回重做与清空恢复默认', async ({ page }) => {
    const errors = await bootDefaultSkin(page);

    await page.click('#openTextureImageEditorBtn');
    await page.waitForSelector('#textureImagePickerGrid');

    const card0Input = page.locator('#textureImagePickerGrid #param-card-NoteImage0 .texture-path-input');
    await expect(card0Input).toBeVisible();

    // 1. 在参数卡片输入框直接填写已有贴图名 mania-note2
    await card0Input.fill('mania-note2');
    await card0Input.dispatchEvent('change');

    const directCheck = await page.evaluate(() => {
      const p = { key: 'NoteImage0', _trackLookup: LML.NoteImage, _trackCol: 0 };
      const res = resolveTextureParam(4, p);
      return {
        state: res.state,
        name: res.name,
        hasImg: !!res.img,
        cfgVal: maniaSkinConfigurations.get(4)['NoteImage0']
      };
    });
    expect(directCheck.state).toBe('ok');
    expect(directCheck.name).toBe('mania-note2');
    expect(directCheck.hasImg).toBe(true);
    expect(directCheck.cfgVal).toBe('mania-note2');

    // 2. 输入带 .png 的名字，应自动归一化
    await card0Input.fill('mania-note2.png');
    await card0Input.dispatchEvent('change');
    const normCheck = await page.evaluate(() => {
      const p = { key: 'NoteImage0', _trackLookup: LML.NoteImage, _trackCol: 0 };
      const res = resolveTextureParam(4, p);
      return {
        state: res.state,
        name: res.name,
        cfgVal: maniaSkinConfigurations.get(4)['NoteImage0']
      };
    });
    expect(normCheck.state).toBe('ok');
    expect(normCheck.name).toBe('mania-note2');
    expect(normCheck.cfgVal).toBe('mania-note2');

    // 3. 清空输入框，应恢复默认（mania-note1）且为 ok 态，而非 blank 态
    await card0Input.fill('');
    await card0Input.dispatchEvent('change');
    const emptyCheck = await page.evaluate(() => {
      const p = { key: 'NoteImage0', _trackLookup: LML.NoteImage, _trackCol: 0 };
      const res = resolveTextureParam(4, p);
      const cfg = maniaSkinConfigurations.get(4);
      return {
        state: res.state,
        name: res.name,
        hasImg: !!res.img,
        cfgVal: cfg['NoteImage0'],
        lookupVal: cfg.ImageLookups?.get('NoteImage0')
      };
    });
    expect(emptyCheck.state).toBe('ok');
    expect(emptyCheck.name.toLowerCase()).toBe('mania-note1');
    expect(emptyCheck.hasImg).toBe(true);
    expect(emptyCheck.cfgVal).toBeUndefined();
    expect(emptyCheck.lookupVal).toBeUndefined();

    // 4. 打开“从已有贴图导入”弹窗，直接在搜索框填名字按 Enter 导入
    const card0 = page.locator('#textureImagePickerGrid #param-card-NoteImage0');
    await card0.scrollIntoViewIfNeeded();
    await card0.locator('.texture-upload-dropdown').hover();
    const existingItem = card0.locator('.texture-upload-menu-item.item-existing');
    await expect(existingItem).toBeVisible();
    await existingItem.click({ force: true });
    await page.waitForSelector('#textureExistingPickerModal', { state: 'visible' });

    const searchInput = page.locator('#textureExistingPickerSearch');
    await searchInput.fill('mania-note2');

    // 验证搜索框填入已有贴图名后，确认按钮已解锁
    const confirmBtn = page.locator('#textureExistingPickerConfirmBtn');
    expect(await confirmBtn.isDisabled()).toBe(false);

    // 按 Enter 键确认导入
    await searchInput.press('Enter');
    await page.waitForTimeout(200);

    // 验证弹窗已关闭且第 1 轨贴图成功指向 mania-note2
    expect(await page.evaluate(() => textureExistingPickerUi.getState().open)).toBe(false);
    const modalCheck = await page.evaluate(() => {
      const p = { key: 'NoteImage0', _trackLookup: LML.NoteImage, _trackCol: 0 };
      const res = resolveTextureParam(4, p);
      return {
        cfgVal: maniaSkinConfigurations.get(4)['NoteImage0'],
        name: res.name,
        state: res.state
      };
    });
    expect(modalCheck.cfgVal).toBe('mania-note2');
    expect(modalCheck.name).toBe('mania-note2');
    expect(modalCheck.state).toBe('ok');

    // 5. 验证撤回与重做
    await page.evaluate(() => performSkinUndo());
    const undoCheck = await page.evaluate(() => {
      const p = { key: 'NoteImage0', _trackLookup: LML.NoteImage, _trackCol: 0 };
      const res = resolveTextureParam(4, p);
      return {
        cfgVal: maniaSkinConfigurations.get(4)['NoteImage0'],
        name: res.name
      };
    });
    expect(undoCheck.cfgVal).toBeUndefined();
    expect(undoCheck.name.toLowerCase()).toBe('mania-note1');

    await page.evaluate(() => performSkinRedo());
    const redoCheck = await page.evaluate(() => {
      const p = { key: 'NoteImage0', _trackLookup: LML.NoteImage, _trackCol: 0 };
      const res = resolveTextureParam(4, p);
      return {
        cfgVal: maniaSkinConfigurations.get(4)['NoteImage0'],
        name: res.name
      };
    });
    expect(redoCheck.cfgVal).toBe('mania-note2');
    expect(redoCheck.name).toBe('mania-note2');

    expect(errors).toEqual([]);
  });
});

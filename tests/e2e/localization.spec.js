const { test, expect } = require('@playwright/test');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const SKIN = path.join(ROOT, 'samples', 'skins', 'Kumakalerki.osk');
const BEATMAP = path.join(ROOT, 'samples', 'beatmaps', '1790742 MIMI - Kuu ni Naru.osz');

async function collectVisibleHan(page) {
  return page.evaluate(() => {
    const han = /[\u3400-\u9fff]/;
    const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const ignored = (element) => !element || element.closest(
      '[data-i18n-ignore], [translate="no"], script, style, textarea, option'
    );
    const visible = (element) => !!(
      element && (element.offsetWidth || element.offsetHeight || element.getClientRects().length)
    );
    const residual = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();

    while (node) {
      const text = clean(node.nodeValue);
      const parent = node.parentElement;
      if (han.test(text) && !ignored(parent) && visible(parent)) residual.push(text);
      node = walker.nextNode();
    }

    for (const element of document.querySelectorAll('[title], [placeholder], [aria-label]')) {
      if (ignored(element) || !visible(element)) continue;
      for (const attribute of ['title', 'placeholder', 'aria-label']) {
        const value = clean(element.getAttribute(attribute));
        if (han.test(value)) residual.push(`${attribute}: ${value}`);
      }
    }

    return [...new Set(residual)];
  });
}

test.describe('Chinese and English interface', () => {
  test('switches language immediately and restores the preference after reload', async ({ page }) => {
    await page.goto('/index.html');

    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
    await expect(page.locator('#openSkinEditorBtn')).toContainText('详细设置');

    await page.locator('#otherMenuBtn').click();
    await expect(page.locator('.language-select-wrap')).toBeVisible();
    await expect(page.locator('.language-select-chevron')).toBeVisible();
    await expect(page.locator('[data-language-select]')).toHaveCSS('appearance', 'none');
    await expect(page.locator('[data-language-select]')).toHaveCSS('border-top-style', 'none');
    await page.locator('[data-language-select]').selectOption('en');

    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('#openSkinEditorBtn')).toContainText('Detailed settings');
    await expect(page.locator('#openTextureImageEditorBtn')).toContainText('Texture import and editing');
    await expect.poll(() => page.title()).toBe('osu!mania Visual Skin Editor');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('osu-mania-skin-editor.language'))).toBe('en');

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('#openSkinEditorBtn')).toContainText('Detailed settings');

    await page.locator('#otherMenuBtn').click();
    await page.locator('[data-language-select]').selectOption('zh-CN');
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
    await expect(page.locator('#openSkinEditorBtn')).toContainText('详细设置');
    await page.click('#topHelpBtn');
    await expect(page.locator('#helpModalTitleText')).toHaveText('皮肤各贴图拉伸与尺寸规则指南');
    await expect(page.locator('#helpModalBody .desc-val').first()).toContainText('无视图片自身宽度');
  });

  test('English mode has no untranslated interface text in the static page', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('osu-mania-skin-editor.language', 'en');
    });
    await page.goto('/index.html');
    await page.waitForFunction(() => window.I18n && window.I18n.getLanguage() === 'en');
    await expect(page.locator('#openSkinEditorBtn')).toContainText('Detailed settings');
    await expect(page.getByText('Percy-style LN', { exact: true })).toHaveCount(1);

    const missing = await page.evaluate(() => window.I18n.getMissing());
    console.log(`Missing English entries (${missing.length}):\n${missing.join('\n')}`);
    expect(missing).toEqual([]);
  });

  test('dynamic editor views stay in English after importing a beatmap and skin', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('osu-mania-skin-editor.language', 'en');
    });
    await page.goto('/index.html');
    await page.setInputFiles('#oszInput', BEATMAP);
    await page.waitForFunction(() => isStartupBeatmapReady() && beatmaps.length > 0, null, { timeout: 60000 });
    await page.setInputFiles('#oskInput', SKIN);
    await page.waitForFunction(() => isStartupWorkspaceReady(), null, { timeout: 60000 });

    await page.evaluate(() => window.I18n.clearMissing());
    await page.click('#openSkinEditorBtn');
    await page.waitForSelector('#paramListContainer .param-card', { state: 'visible' });
    for (const tab of ['mania', 'fonts', 'general', 'raw']) {
      await page.click(`#skinEditorTabs .tab-btn[data-tab="${tab}"]`);
      await page.waitForTimeout(100);
    }
    await page.click('#closeSkinEditorBtn');

    await page.click('#openTextureImageEditorBtn');
    await page.waitForSelector('#textureImagePickerGrid .texture-image-picker-item');

    const missing = await page.evaluate(() => window.I18n.getMissing());
    console.log(`Missing dynamic English entries (${missing.length}):\n${missing.join('\n')}`);
    expect(missing).toEqual([]);
  });

  test('notifications and post-beatmap skin prompts are fully localized', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('osu-mania-skin-editor.language', 'en');
    });
    await page.goto('/index.html');
    await page.setInputFiles('#oszInput', BEATMAP);
    await page.waitForFunction(() => isStartupBeatmapReady() && beatmaps.length > 0, null, { timeout: 60000 });

    await expect(page.locator('.toast-title').filter({ hasText: 'Beatmap imported' })).toBeVisible();
    await expect(page.locator('.toast-msg').filter({ hasText: 'Automatically loaded difficulty 1' })).toBeVisible();
    expect(await collectVisibleHan(page)).toEqual([]);

    await page.click('#openSkinEditorBtn');
    await expect(page.locator('#skinEditorSkinRequired .skin-source-required-title')).toHaveText('Import a skin');
    expect(await collectVisibleHan(page)).toEqual([]);
  });

  test('texture editor states contain no visible Chinese interface text', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('osu-mania-skin-editor.language', 'en');
    });
    await page.goto('/index.html');
    await page.setInputFiles('#oskInput', SKIN);
    await page.waitForFunction(() => isStartupSkinReady(), null, { timeout: 60000 });
    await page.setInputFiles('#oszInput', BEATMAP);
    await page.waitForFunction(() => isStartupWorkspaceReady(), null, { timeout: 60000 });

    await page.click('#openTextureImageEditorBtn');
    await page.waitForSelector('#textureImagePickerGrid .texture-image-picker-item');
    await expect(page.locator('.texture-image-tab[data-tab-id="texture-library"] .texture-image-tab-label')).toHaveText('All textures');
    expect(await collectVisibleHan(page)).toEqual([]);

    await page.click('#textureImagePickerGrid [data-param-key="KeyImage0"]');
    await page.waitForFunction(() => textureImageEditorUi.getState().selectedKey === 'KeyImage0');
    await expect(page.locator('.texture-image-tab.is-active .texture-image-tab-label')).toHaveText(/Lane 1 key texture/);
    expect(await collectVisibleHan(page)).toEqual([]);

    await page.click('#textureImageApplyMenuBtn');
    expect(await collectVisibleHan(page)).toEqual([]);
    await page.click('#textureImageApplyMenuBtn');
    await page.fill('#textureImageCropLeft', '1');
    await page.click('#textureImageEditorCloseBtn');
    await expect(page.locator('#textureImageUnsavedText')).toContainText('has unsaved edits');
    expect(await collectVisibleHan(page)).toEqual([]);
    await page.click('#textureImageUnsavedCancelBtn');

    await page.click('.texture-image-tab[data-tab-id="menu"]');
    await page.click('#textureImagePickerGrid [data-param-key="NoteImage0L"]');
    await page.waitForFunction(() => textureImageEditorUi.getState().selectedKey === 'NoteImage0L');
    expect(await collectVisibleHan(page)).toEqual([]);

    await page.click('.texture-image-tab[data-tab-id="menu"]');
    await page.evaluate(() => {
      const target = getTextureTabParams().find((item) => item.key === 'NoteImage0');
      openTextureExistingPicker(target, getActiveKeyCount());
    });
    await expect(page.locator('#textureExistingPickerModal')).toBeVisible();
    await expect(page.locator('#textureExistingPickerTargetLabel')).toHaveText('Lane 1 normal-note texture');
    expect(await collectVisibleHan(page)).toEqual([]);
    await page.click('#textureExistingPickerCancelBtn');

    await page.click('#textureImageCreateOpenBtn');
    expect(await collectVisibleHan(page)).toEqual([]);

    await page.evaluate(() => {
      openAnimTextureEditor('StageLight', 'stagelight', 'mania-stage-light', '1x');
    });
    await expect(page.locator('#animTextureModal')).toBeVisible();
    expect(await collectVisibleHan(page)).toEqual([]);
  });

  test('notification catalog and texture action toasts remain fully English', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('osu-mania-skin-editor.language', 'en');
    });
    await page.goto('/index.html');
    await page.setInputFiles('#oskInput', SKIN);
    await page.waitForFunction(() => isStartupSkinReady(), null, { timeout: 60000 });
    await page.setInputFiles('#oszInput', BEATMAP);
    await page.waitForFunction(() => isStartupWorkspaceReady(), null, { timeout: 60000 });

    const notifications = [
      ['连击沿用数字贴图', '当前没有显式指定连击字体，正在定位 ComboPrefix 参数。'],
      ['不支持动态贴图', '该贴图在 osu!stable 中只支持静态图片。'],
      ['添加单帧成功', '已添加第 0 帧: frame.png'],
      ['添加失败', '图片文件无法解析'],
      ['批量添加完成', '已按文件名顺序添加 3 帧贴图'],
      ['无法应用', '请至少添加 1 张动画贴图帧'],
      ['动态贴图应用成功', '已成功配置 lightingL 共 3 帧 @2x 高清动画'],
      ['已清空', '所有动画帧贴图已清空'],
      ['已应用给所有轨道', '全部 4 轨列宽已统一为 70px，间距已统一为 2px'],
      ['已应用全轨同色', '全部 4 轨底色已统一为 RGBA(0, 0, 0, 200)'],
      ['无法定位判定贴图', '请先确认谱面和皮肤均已载入。'],
      ['已定位判定贴图', '参数面板已高亮全部判定贴图：Hit300g / Hit300'],
      ['无法定位按键贴图', '未找到 KeyImage0 或 KeyImage0D。'],
      ['已定位按键贴图', '参数面板已高亮 KeyImage0 与 KeyImage0D'],
      ['导出皮肤成功', '已下载生成文件: skin.osk'],
      ['复制成功', '已将生成的完整 skin.ini 内容复制到剪贴板'],
      ['请手动复制', '浏览器剪贴板权限受限，请在下方全选文本'],
      ['按键高度已调整', '已为第 1 轨创建独立贴图 “key_col1”'],
      ['按键高度已调整', '第 1 轨: +10px'],
      ['提示', '没有可撤回的操作'],
      ['已撤回 (Ctrl+Z)', '已撤回: 调整裁剪与扩边'],
      ['已重做 (Ctrl+Y)', '已重做: 调整裁剪与扩边'],
      ['已复原', '所有参数与贴图已恢复为导入时的初始状态 (可按 Ctrl+Z 撤回)'],
      ['已切换到默认皮肤', '当前工作区已重置为 osu!stable 默认皮肤'],
      ['已开启判定演示', '大部分为 300MAX 与 300，穿插 200/100/50，并在 Miss 时展示断连动画后恢复'],
      ['无法导入文件', '浏览器未能接收拖拽文件，请点击按钮选择。'],
      ['无法识别拖拽文件', '谱面请使用 .osz / .osu，皮肤请使用 .osk；.zip 会根据内容自动判断。'],
      ['文件类型不支持', '请选择 .osk 或 .zip 文件。'],
      ['皮肤加载成功', '已载入配置：4K, 6K, 7K'],
      ['皮肤加载完成', '未找到 skin.ini，已自动匹配默认图片命名规范'],
      ['错误', 'OSK 皮肤解析失败: invalid'],
      ['文件类型不支持', '请选择 .osz、.zip 或 .osu 文件。'],
      ['谱面导入成功', '已自动加载第 1 难度背景与谱面 (共 4 个难度)'],
      ['提示', '压缩包内未找到有效 Mania 模式谱面'],
      ['错误', '谱面文件解析失败: invalid'],
      ['该打击特效此刻未出现', '单键 / 长条打击特效只有在播放到命中那一刻才会出现在画布上，请先播放谱面再点定位。'],
      ['已引用已有贴图', '路径已指向 foo.png，未复制图片文件。'],
      ['引用失败', '无法修改贴图路径'],
      ['贴图已更新', 'foo.png 已作为独立贴图分配给当前轨道。'],
      ['已创建纯色贴图', 'foo.png 已生成到全部贴图。'],
      ['无需修复', '当前贴图没有可修复的单轴拉伸。'],
      ['无需修复', '当前尺寸已符合固定宽度目标。'],
      ['拉伸修复完成', '100 × 284px 已等比缩放为 112 × 318px'],
      ['提示', '视频背景无法播放，已回退到静态背景或故事板图片'],
      ['已撤回贴图编辑', '已撤回: 调整裁剪与扩边'],
      ['已重做贴图编辑', '已重做: 调整裁剪与扩边'],
      ['视频背景', '正在后台转换为 Chromium 可播放的 WebM（已优先呈现静态曲绘与谱面）'],
      ['无法开启', '当前长条身体高度为 40000px，需小于 5000px 才能开启一键投皮。'],
      ['尚未选择贴图', '请先点击“选择贴图”。'],
      ['贴图编辑成功', '已更新当前轨道的 KeyImage + KeyImageD，已直接覆盖原图。'],
      ['贴图编辑成功', '已更新当前轨道的 KeyImage + KeyImageD，已为当前轨道创建独立贴图。'],
      ['贴图编辑成功', '已创建独立副本 foo.png'],
      ['贴图编辑成功', '已直接覆盖 foo.png'],
      ['一键投皮应用成功', '已应用到当前轨道。'],
      ['贴图编辑成功', '已更新 foo.png，共 3 帧'],
      ['贴图副本已创建', 'foo.png（3 帧）'],
      ['贴图已删除', 'foo.png，已清除 2 个路径引用'],
      ['无法替换贴图', '「KeyImage」是数值 / 位置参数，不能写入贴图名，请改用对应的贴图参数卡片。'],
      ['第 1 轨已单独更新为 @2x 高清贴图: foo@2x.png', ''],
      ['已更新为 1x 普通贴图: foo.png', ''],
      ['替换贴图成功', '已更新为 @2x 高清贴图: foo@2x.png'],
      ['无法替换贴图', 'KeyImage 是数值 / 位置参数，不能写入贴图名'],
      ['读取贴图失败', '未知错误'],
      ['预览参数无效', '请检查裁剪与扩边数值'],
      ['无法保存贴图', '请检查贴图名称与各项参数'],
      ['无法生成要保存的贴图', ''],
      ['正在打包生成 OSK 皮肤文件...', '']
    ];
    const residual = await page.evaluate((items) => {
      const han = /[\u3400-\u9fff]/;
      return items.flatMap(([title, message]) => {
        const translatedTitle = window.I18n.t(title);
        const translatedMessage = window.I18n.t(message);
        return [translatedTitle, translatedMessage].filter((text) => han.test(text));
      });
    }, notifications);
    console.log(`Untranslated notification fragments (${residual.length}):\n${residual.join('\n')}`);
    expect(residual).toEqual([]);

    await page.click('#openTextureImageEditorBtn');
    await page.waitForSelector('#textureImagePickerGrid');
    await page.click('#textureImagePickerGrid [data-param-key="KeyImage0"]');
    await page.waitForFunction(() => textureImageEditorUi.getState().selectedKey === 'KeyImage0');
    await page.click('#textureImageApplyBtn');
    expect(await collectVisibleHan(page)).toEqual([]);
    await page.click('#textureImageStretchFixBtn');
    expect(await collectVisibleHan(page)).toEqual([]);
    await page.click('#textureImageResetBtn');
    expect(await collectVisibleHan(page)).toEqual([]);
    await page.click('#textureImageBlankBtn');
    expect(await collectVisibleHan(page)).toEqual([]);
  });
});

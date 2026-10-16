// ============================================================================
// texture-upload.js - 单张贴图上传、1x/@2x 规格选择与替换应用
// 依赖：parser/skin-assets.js、ui/history.js、ui/texture-controls.js
// ============================================================================

        function initTextureUploadUI() {
            // ===== 贴图上传规格选择弹窗管理系统 (1x 普通贴图 vs @2x 高清贴图) =====
            let pendingTextureUpload = null;
            let selectedTextureSpec = '1x';

            function updateTextureUploadSpecCards() {
                const card1x = document.getElementById('specCard1x');
                const card2x = document.getElementById('specCard2x');
                const cardAnim = document.getElementById('specCardAnim');
                if (card1x) card1x.classList.toggle('selected', selectedTextureSpec === '1x');
                if (card2x) card2x.classList.toggle('selected', selectedTextureSpec === '2x');
                if (cardAnim) cardAnim.classList.toggle('selected', selectedTextureSpec === 'anim');
            }

            function openTextureUploadModal() {
                if (!pendingTextureUpload) return;
                const modal = document.getElementById('textureUploadModal');
                if (!modal) return;

                const p = pendingTextureUpload;
                const previewImg = document.getElementById('textureUploadPreviewImg');
                if (previewImg) previewImg.src = p.blobUrl;

                const targetLabel = document.getElementById('textureUploadTargetLabel');
                if (targetLabel) {
                    let friendlyName = p.targetParamKey || p.targetKey || p.cleanRawBase;
                    const schemaItem = (typeof SKIN_INI_PARAM_SCHEMA !== 'undefined') && SKIN_INI_PARAM_SCHEMA.find(item => item.key === friendlyName);
                    if (schemaItem && schemaItem.zhName) {
                        targetLabel.textContent = `${schemaItem.zhName} (${p.cleanRawBase})`;
                    } else {
                        targetLabel.textContent = p.cleanRawBase;
                    }
                }

                const fileNameEl = document.getElementById('textureUploadFileName');
                if (fileNameEl) fileNameEl.textContent = p.file.name;

                const dimEl = document.getElementById('textureUploadFileSizeDim');
                if (dimEl) {
                    const kb = (p.file.size / 1024).toFixed(1);
                    dimEl.textContent = `${p.img.width} × ${p.img.height} px (${kb} KB)`;
                }

                const file1xEl = document.getElementById('specFileName1x');
                if (file1xEl) file1xEl.textContent = `导出文件名: ${p.cleanRawBase}.png`;

                const file2xEl = document.getElementById('specFileName2x');
                if (file2xEl) file2xEl.textContent = `导出文件名: ${p.cleanRawBase}@2x.png`;

                const fileAnimEl = document.getElementById('specFileNameAnim');
                if (fileAnimEl) fileAnimEl.textContent = `制作多帧序列: ${p.cleanRawBase}-0.png, ${p.cleanRawBase}-1.png...`;

                const animationSupported = isTextureAnimationSupported(
                    p.targetParamKey,
                    p.targetKey,
                    p.targetFilename || p.cleanRawBase
                );
                const animCard = document.getElementById('specCardAnim');
                if (animCard) {
                    animCard.style.display = animationSupported ? '' : 'none';
                    animCard.setAttribute('aria-hidden', animationSupported ? 'false' : 'true');
                }

                updateTextureUploadSpecCards();
                modal.style.display = 'flex';
            }

            function closeTextureUploadModal() {
                const modal = document.getElementById('textureUploadModal');
                if (modal) modal.style.display = 'none';
                if (pendingTextureUpload && pendingTextureUpload.blobUrl) {
                    try { URL.revokeObjectURL(pendingTextureUpload.blobUrl); } catch (_) { }
                }
                pendingTextureUpload = null;
                const input = document.getElementById('textureReplaceInput');
                if (input) input.value = '';
            }

            async function confirmTextureUpload() {
                if (!pendingTextureUpload) return;
                const p = pendingTextureUpload;
                const is2x = (selectedTextureSpec === '2x');
                closeTextureUploadModal();

                await applyUploadedTexture(
                    p.file,
                    p.arrayBuffer,
                    p.img,
                    is2x,
                    p.targetFilename,
                    p.targetKey,
                    p.targetParamKey,
                    p.targetColIndex
                );
            }

            async function applyUploadedTexture(file, arrayBuffer, img, is2x, targetFilename, targetKey, targetParamKey, targetColIndex, options = {}) {
                const shouldRecordUndo = options.recordUndo !== false;
                const shouldNotify = options.notify !== false;
                const shouldRefresh = options.refresh !== false;
                try {
                    img._is2x = is2x;

                    const curKeys = getActiveKeyCount();
                    let trackCol = (targetColIndex != null && !isNaN(targetColIndex)) ? parseInt(targetColIndex, 10) : null;
                    let isTrackNote = false;
                    let noteType = 'note'; // 'note' | 'head' | 'body' | 'tail' | 'key' | 'keydown'

                    const pKey = targetParamKey || targetKey || '';

                    // 防呆守卫：绝不允许把「贴图名」写进非贴图参数（如 LightPosition / HitPosition
                    // 这类数值、位置参数），否则会直接污染 skin.ini（历史上画布「替换贴图」传错
                    // paramKey 就会写出 `LightPosition: mylight` 这种脏数据，并让画布发光位置失效）。
                    // 例外：ScorePrefix / ComboPrefix 是「字体前缀」参数，字形贴图上传时会被显式传进来，
                    //       它们本就不写回 cfg，而是通过字形 ini 键 (score-0 等) 生效，故必须放行。
                    const schemaEntry = (typeof SKIN_INI_PARAM_SCHEMA !== 'undefined')
                        ? SKIN_INI_PARAM_SCHEMA.find(x => x.key === pKey)
                        : null;
                    const isFontPrefixParam = (pKey === 'ScorePrefix' || pKey === 'ComboPrefix' || pKey.startsWith('Font_'));
                    if (schemaEntry && schemaEntry.type !== 'texture' && !isFontPrefixParam) {
                        console.warn(`[替换贴图] 参数 ${pKey} 不是贴图参数，已拒绝写入，避免污染 skin.ini`);
                        showToast('无法替换贴图', `「${schemaEntry.zhName || pKey}」是数值 / 位置参数，不能写入贴图名，请改用对应的贴图参数卡片。`);
                        return false;
                    }

                    const mTrackNote = pKey.match(/^(NoteImage|HoldNoteHeadImage|HoldNoteBodyImage|HoldNoteTailImage|KeyImageDown|KeyImage)(\d+)([HLTD])?$/i);
                    if (mTrackNote) {
                        isTrackNote = true;
                        if (trackCol == null) trackCol = parseInt(mTrackNote[2], 10);
                        const prefixLow = mTrackNote[1].toLowerCase();
                        const suffix = (mTrackNote[3] || '').toUpperCase();
                        if (prefixLow.startsWith('holdnotehead') || suffix === 'H') noteType = 'head';
                        else if (prefixLow.startsWith('holdnotebody') || suffix === 'L') noteType = 'body';
                        else if (prefixLow.startsWith('holdnotetail') || suffix === 'T') noteType = 'tail';
                        else if (prefixLow.startsWith('keyimagedown') || suffix === 'D') noteType = 'keydown';
                        else if (prefixLow.startsWith('keyimage')) noteType = 'key';
                        else noteType = 'note';
                    } else if (trackCol != null) {
                        if (targetKey === LML.NoteImage || pKey.startsWith('NoteImage')) {
                            isTrackNote = true;
                            noteType = 'note';
                        } else if (targetKey === LML.HoldNoteHeadImage || pKey.startsWith('HoldNoteHeadImage')) {
                            isTrackNote = true;
                            noteType = 'head';
                        } else if (targetKey === LML.HoldNoteBodyImage || pKey.startsWith('HoldNoteBodyImage')) {
                            isTrackNote = true;
                            noteType = 'body';
                        } else if (targetKey === LML.HoldNoteTailImage || pKey.startsWith('HoldNoteTailImage')) {
                            isTrackNote = true;
                            noteType = 'tail';
                        } else if (targetKey === LML.KeyImage || pKey.startsWith('KeyImage')) {
                            isTrackNote = true;
                            noteType = 'key';
                        } else if (targetKey === LML.KeyImageDown || pKey.startsWith('KeyImageDown')) {
                            isTrackNote = true;
                            noteType = 'keydown';
                        }
                    }

                    let canonicalParamKey = pKey;
                    let paramAliases = [pKey];

                    if (isTrackNote && trackCol != null) {
                        if (noteType === 'note') {
                            canonicalParamKey = `NoteImage${trackCol}`;
                            paramAliases = [`NoteImage${trackCol}`];
                        } else if (noteType === 'head') {
                            canonicalParamKey = `NoteImage${trackCol}H`;
                            paramAliases = [`NoteImage${trackCol}H`, `HoldNoteHeadImage${trackCol}`];
                        } else if (noteType === 'body') {
                            canonicalParamKey = `NoteImage${trackCol}L`;
                            paramAliases = [`NoteImage${trackCol}L`, `HoldNoteBodyImage${trackCol}`];
                        } else if (noteType === 'tail') {
                            canonicalParamKey = `NoteImage${trackCol}T`;
                            paramAliases = [`NoteImage${trackCol}T`, `HoldNoteTailImage${trackCol}`];
                        } else if (noteType === 'key') {
                            canonicalParamKey = `KeyImage${trackCol}`;
                            paramAliases = [`KeyImage${trackCol}`];
                        } else if (noteType === 'keydown') {
                            canonicalParamKey = `KeyImage${trackCol}D`;
                            paramAliases = [`KeyImage${trackCol}D`, `KeyImageDown${trackCol}`, `KeyImage${trackCol}Down`];
                        }
                    }

                    const rawFileBase = file.name.replace(/\.[^/.]+$/, '').replace(/@2x/i, '');
                    let cleanRawBase;
                    let targetBase;

                    if (isTrackNote && trackCol != null) {
                        // 轨道贴图隔离核心逻辑:
                        // 必须确保该轨道的贴图名称独属于该轨道 (如 note_col1, note_col2 等)，
                        // 即使上传的文件名或者原有贴图与其他轨道重名 (如都叫 note.png 或 mania-note1)，
                        // 也绝不覆盖其他轨道正在引用的贴图或共享默认贴图！
                        const colRegex = new RegExp(`(?:col|track|轨)[-_]?${trackCol + 1}\\b`, 'i');
                        let base = rawFileBase;
                        if (!colRegex.test(base)) {
                            if (noteType === 'head' && !base.toLowerCase().endsWith('h')) {
                                base = `${base}_col${trackCol + 1}H`;
                            } else if (noteType === 'body' && !base.toLowerCase().endsWith('l')) {
                                base = `${base}_col${trackCol + 1}L`;
                            } else if (noteType === 'tail' && !base.toLowerCase().endsWith('t')) {
                                base = `${base}_col${trackCol + 1}T`;
                            } else if (noteType === 'keydown' && !base.toLowerCase().endsWith('d')) {
                                base = `${base}_col${trackCol + 1}D`;
                            } else {
                                base = `${base}_col${trackCol + 1}`;
                            }
                        }
                        cleanRawBase = base;
                        targetBase = base.toLowerCase();
                    } else {
                        const targetRawName = targetFilename || file.name;
                        cleanRawBase = targetRawName.replace(/\.[^/.]+$/, '').replace(/@2x/i, '');
                        targetBase = cleanRawBase.toLowerCase();
                    }

                    const exportFilename = is2x ? `${cleanRawBase}@2x.png` : `${cleanRawBase}.png`;
                    const exportFilenameLower = is2x ? `${targetBase}@2x.png` : `${targetBase}.png`;
                    const curExt = is2x ? '@2x.png' : '.png';
                    const oppExt = is2x ? '.png' : '@2x.png';

                    if (shouldRecordUndo) {
                        recordSkinUndoBeforeChange(`替换贴图: ${exportFilename}`);
                        continuousActionActive = false;
                    }

                    const keysToUpdate = new Set();
                    keysToUpdate.add(targetBase);

                    if (isTrackNote && trackCol != null) {
                        // 关键隔离: 仅更新属于当前轨道的别名，严禁添加全局/共享通用 key (如 'noteimage', 'mania-note1' 等)
                        for (const a of paramAliases) {
                            keysToUpdate.add(a.toLowerCase());
                        }
                    } else {
                        if (targetFilename) {
                            keysToUpdate.add(targetFilename.replace(/\.[^/.]+$/, '').replace(/@2x/i, '').toLowerCase());
                        }
                        if (targetKey) {
                            keysToUpdate.add(String(targetKey).toLowerCase());
                        }
                        if (targetParamKey) {
                            keysToUpdate.add(String(targetParamKey).toLowerCase());
                        }

                        // 特殊映射与别名 (StageLeft / StageRight / StageBottom / StageHint / StageLight 等)
                        if (pKey === 'StageLeft' || targetBase === 'mania-stage-left' || targetBase === 'stageleft') {
                            keysToUpdate.add('mania-stage-left');
                            keysToUpdate.add('stageleft');
                            keysToUpdate.add('stage_left');
                            for (let k = 0; k < 18; k++) keysToUpdate.add(`stageleft${k}`);
                        } else if (pKey === 'StageRight' || targetBase === 'mania-stage-right' || targetBase === 'stageright') {
                            keysToUpdate.add('mania-stage-right');
                            keysToUpdate.add('stageright');
                            keysToUpdate.add('stage_right');
                            for (let k = 0; k < 18; k++) keysToUpdate.add(`stageright${k}`);
                        } else if (pKey === 'StageBottom' || targetBase === 'mania-stage-bottom' || targetBase === 'stagebottom') {
                            keysToUpdate.add('mania-stage-bottom');
                            keysToUpdate.add('stagebottom');
                            keysToUpdate.add('stage_bottom');
                        } else if (pKey === 'StageHint' || targetBase === 'mania-stage-hint' || targetBase === 'stagehint') {
                            keysToUpdate.add('mania-stage-hint');
                            keysToUpdate.add('stagehint');
                            keysToUpdate.add('hittarget');
                        } else if (pKey === 'StageLight' || targetBase === 'mania-stage-light' || targetBase === 'stagelight') {
                            keysToUpdate.add('mania-stage-light');
                            keysToUpdate.add('stagelight');
                        } else if (targetBase.includes('-') && !targetBase.startsWith('scorebar-')) {
                            const parts = targetBase.split('-');
                            const suffix = parts.slice(1).join('-');
                            keysToUpdate.add(`score-${suffix}`);
                            keysToUpdate.add(`default-${suffix}`);
                        }

                        // 同步检查当前皮肤配置中的自定义映射别名
                        for (const [, cfgItem] of maniaSkinConfigurations) {
                            if (cfgItem && cfgItem.ImageLookups && pKey) {
                                const customLookup = cfgItem.ImageLookups.get(pKey) || cfgItem.ImageLookups.get(pKey.toLowerCase());
                                if (customLookup) keysToUpdate.add(String(customLookup).toLowerCase());
                            }
                        }
                    }

                    // 强制写入内存图片仓库 (force = true)
                    for (const k of keysToUpdate) {
                        saveSkinAssetToStore(skinImageStore, k, img, is2x, true, true);
                        if (skinFallbackImageStore) {
                            saveSkinAssetToStore(skinFallbackImageStore, k, img, is2x, true, true);
                        }
                    }

                    // 存入待导出打包文件列表
                    userReplacedTextures.set(exportFilename, arrayBuffer);
                    if (exportFilenameLower !== exportFilename) {
                        userReplacedTextures.set(exportFilenameLower, arrayBuffer);
                    }

                    // 清除冲突的相反规格贴图条目，避免在导出或解析时混淆
                    userReplacedTextures.delete(`${cleanRawBase}${oppExt}`);
                    userReplacedTextures.delete(`${targetBase}${oppExt}`);

                    if (!isTrackNote) {
                        if (pKey === 'StageLeft' || targetBase === 'mania-stage-left' || targetBase === 'stageleft') {
                            userReplacedTextures.set(`mania-stage-left${curExt}`, arrayBuffer);
                            userReplacedTextures.set(`StageLeft${curExt}`, arrayBuffer);
                            userReplacedTextures.delete(`mania-stage-left${oppExt}`);
                            userReplacedTextures.delete(`StageLeft${oppExt}`);
                        } else if (pKey === 'StageRight' || targetBase === 'mania-stage-right' || targetBase === 'stageright') {
                            userReplacedTextures.set(`mania-stage-right${curExt}`, arrayBuffer);
                            userReplacedTextures.set(`StageRight${curExt}`, arrayBuffer);
                            userReplacedTextures.delete(`mania-stage-right${oppExt}`);
                            userReplacedTextures.delete(`StageRight${oppExt}`);
                        } else if (pKey === 'StageBottom' || targetBase === 'mania-stage-bottom' || targetBase === 'stagebottom') {
                            userReplacedTextures.set(`stagebottom${curExt}`, arrayBuffer);
                            userReplacedTextures.delete(`stagebottom${oppExt}`);
                            userReplacedTextures.delete(`mania-stage-bottom${oppExt}`);
                            userReplacedTextures.delete(`StageBottom${oppExt}`);
                        } else if (pKey === 'StageHint' || targetBase === 'mania-stage-hint' || targetBase === 'stagehint') {
                            userReplacedTextures.set(`mania-stage-hint${curExt}`, arrayBuffer);
                            userReplacedTextures.set(`StageHint${curExt}`, arrayBuffer);
                            userReplacedTextures.delete(`mania-stage-hint${oppExt}`);
                            userReplacedTextures.delete(`StageHint${oppExt}`);
                        } else if (pKey === 'StageLight' || targetBase === 'mania-stage-light' || targetBase === 'stagelight') {
                            userReplacedTextures.set(`mania-stage-light${curExt}`, arrayBuffer);
                            userReplacedTextures.set(`StageLight${curExt}`, arrayBuffer);
                            userReplacedTextures.delete(`mania-stage-light${oppExt}`);
                            userReplacedTextures.delete(`StageLight${oppExt}`);
                        }
                    }

                    // 更新 ini 配置与 ImageLookups
                    if (isTrackNote && trackCol != null) {
                        let primaryCfg = maniaSkinConfigurations.get(curKeys);
                        if (!primaryCfg) {
                            primaryCfg = ensureManiaConfigForKeys(curKeys);
                            maniaSkinConfigurations.set(curKeys, primaryCfg);
                        }
                        if (!primaryCfg.ImageLookups) primaryCfg.ImageLookups = new Map();

                        for (const alias of paramAliases) {
                            primaryCfg[alias] = cleanRawBase;
                            primaryCfg.ImageLookups.set(alias, cleanRawBase);
                            primaryCfg.ImageLookups.set(alias.toLowerCase(), cleanRawBase);
                        }
                        syncParamInputValue(canonicalParamKey, cleanRawBase);
                    } else if (pKey &&
                        pKey !== 'ScorePrefix' &&
                        pKey !== 'ComboPrefix' &&
                        !pKey.startsWith('Font_') &&
                        !pKey.startsWith('scorebar-')
                    ) {
                        let primaryCfg = maniaSkinConfigurations.get(curKeys);
                        if (!primaryCfg) {
                            primaryCfg = ensureManiaConfigForKeys(curKeys);
                            maniaSkinConfigurations.set(curKeys, primaryCfg);
                        }
                        for (const [, cfgItem] of maniaSkinConfigurations) {
                            if (!cfgItem.ImageLookups) cfgItem.ImageLookups = new Map();
                            cfgItem[pKey] = targetBase;
                            cfgItem.ImageLookups.set(pKey, targetBase);
                            cfgItem.ImageLookups.set(pKey.toLowerCase(), targetBase);
                        }
                        if (globalSkinImageLookups) {
                            globalSkinImageLookups.set(pKey, targetBase);
                            globalSkinImageLookups.set(pKey.toLowerCase(), targetBase);
                        }
                        syncParamInputValue(pKey, targetBase);
                    }

                    if (shouldNotify) {
                        const toastMsg = (isTrackNote && trackCol != null)
                            ? `第 ${trackCol + 1} 轨已单独更新为 ${is2x ? '@2x 高清' : '1x 普通'}贴图: ${exportFilename}`
                            : `已更新为 ${is2x ? '@2x 高清' : '1x 普通'}贴图: ${exportFilename}`;
                        showToast('替换贴图成功', toastMsg);
                    }
                    if (shouldRefresh) {
                        drawFrame();
                        renderSkinEditorParams();
                        if (selectedCanvasElement) {
                            syncCanvasSelectedCard(selectedCanvasElement);
                        }
                    }
                    return true;
                } catch (err) {
                    console.error('替换贴图失败', err);
                    if (shouldNotify) showToast('替换失败', err.message || '未知错误');
                    return false;
                }
            }

            // 绑定贴图规格弹窗交互事件
            const specCard1x = document.getElementById('specCard1x');
            const specCard2x = document.getElementById('specCard2x');
            if (specCard1x) {
                specCard1x.onclick = () => {
                    selectedTextureSpec = '1x';
                    updateTextureUploadSpecCards();
                };
                specCard1x.ondblclick = () => {
                    selectedTextureSpec = '1x';
                    updateTextureUploadSpecCards();
                    confirmTextureUpload();
                };
            }
            if (specCard2x) {
                specCard2x.onclick = () => {
                    selectedTextureSpec = '2x';
                    updateTextureUploadSpecCards();
                };
                specCard2x.ondblclick = () => {
                    selectedTextureSpec = '2x';
                    updateTextureUploadSpecCards();
                    confirmTextureUpload();
                };
            }

            const specCardAnim = document.getElementById('specCardAnim');
            if (specCardAnim) {
                specCardAnim.onclick = () => {
                    const p = pendingTextureUpload;
                    const texName = p ? (p.targetFilename || p.cleanRawBase) : null;
                    const texKey = p ? p.targetKey : null;
                    const pKey = p ? p.targetParamKey : null;
                    if (!p || !isTextureAnimationSupported(pKey, texKey, texName)) {
                        showToast('不支持动态贴图', '该贴图在 osu!stable 中只支持静态图片，请选择 1x 或 @2x 规格。');
                        return;
                    }
                    const spec = (selectedTextureSpec === '2x') ? '2x' : '1x';
                    closeTextureUploadModal();
                    if (typeof openAnimTextureEditor === 'function') {
                        openAnimTextureEditor(texName, texKey, pKey, spec);
                    }
                };
            }

            const uploadCloseBtn = document.getElementById('textureUploadCloseBtn');
            const uploadCancelBtn = document.getElementById('textureUploadCancelBtn');
            const uploadBackdrop = document.getElementById('textureUploadBackdrop');
            const uploadConfirmBtn = document.getElementById('textureUploadConfirmBtn');
            if (uploadCloseBtn) uploadCloseBtn.onclick = closeTextureUploadModal;
            if (uploadCancelBtn) uploadCancelBtn.onclick = closeTextureUploadModal;
            if (uploadBackdrop) uploadBackdrop.onclick = closeTextureUploadModal;
            if (uploadConfirmBtn) uploadConfirmBtn.onclick = confirmTextureUpload;

            // 隐藏的贴图文件替换表单绑定
            const textureInput = document.getElementById('textureReplaceInput');
            if (textureInput) {
                textureInput.onchange = async (e) => {
                    const file = e.target.files && e.target.files[0];
                    if (!file) return;

                    try {
                        const arrayBuffer = await file.arrayBuffer();
                        const imgBlob = new Blob([arrayBuffer]);
                        const blobUrl = URL.createObjectURL(imgBlob);

                        const img = await new Promise((resolve, reject) => {
                            const tempImg = new Image();
                            tempImg.onload = () => resolve(tempImg);
                            tempImg.onerror = () => reject(new Error('无法解析该图片文件'));
                            tempImg.src = blobUrl;
                        });

                        const targetRawName = targetTextureUploadFilename || file.name;
                        let cleanRawBase = targetRawName.replace(/\.[^/.]+$/, '').replace(/@2x/i, '');
                        if (!cleanRawBase || isDummyBlankName(cleanRawBase)) {
                            cleanRawBase = (targetTextureUploadParamKey || targetTextureUploadKey || file.name).replace(/\.[^/.]+$/, '').replace(/@2x/i, '');
                        }
                        const targetBase = cleanRawBase.toLowerCase();

                        // 详细设置入口已明确选择 1x / @2x 时直接应用，不再二次询问；
                        // 只有画布入口未指定规格时，才打开规格确认弹窗。
                        const requestedSpec = preferredTextureUploadSpec;
                        preferredTextureUploadSpec = null;

                        if (requestedSpec === '1x' || requestedSpec === '2x') {
                            try {
                                URL.revokeObjectURL(blobUrl);
                                await applyUploadedTexture(
                                    file,
                                    arrayBuffer,
                                    img,
                                    requestedSpec === '2x',
                                    targetTextureUploadFilename,
                                    targetTextureUploadKey,
                                    targetTextureUploadParamKey,
                                    targetTextureUploadColIndex
                                );
                            } finally {
                                if (textureInput) textureInput.value = '';
                            }
                            return;
                        }

                        if (!requestedSpec) {
                            const autoIs2x = file.name.toLowerCase().includes('@2x');
                            selectedTextureSpec = autoIs2x ? '2x' : '1x';
                        }

                        pendingTextureUpload = {
                            file,
                            arrayBuffer,
                            img,
                            blobUrl,
                            targetFilename: targetTextureUploadFilename,
                            targetKey: targetTextureUploadKey,
                            targetParamKey: targetTextureUploadParamKey,
                            targetColIndex: targetTextureUploadColIndex,
                            targetBase,
                            cleanRawBase
                        };

                        openTextureUploadModal();
                    } catch (err) {
                        console.error('解析上传贴图失败', err);
                        showToast('读取贴图失败', err.message || '未知错误');
                    }
                };
            }

            textureUploadUi = {
                close: closeTextureUploadModal,
                confirm: confirmTextureUpload,
                applyEditedTexture: (file, arrayBuffer, img, is2x, targetFilename, targetKey, targetParamKey, targetColIndex, options) =>
                    applyUploadedTexture(file, arrayBuffer, img, is2x, targetFilename, targetKey, targetParamKey, targetColIndex, options),
                setSpec: (spec) => {
                    selectedTextureSpec = (spec === '2x') ? '2x' : '1x';
                    updateTextureUploadSpecCards();
                },
                toggleSpec: () => {
                    selectedTextureSpec = (selectedTextureSpec === '1x') ? '2x' : '1x';
                    updateTextureUploadSpecCards();
                },
                updateSpecCards: updateTextureUploadSpecCards
            };
        }

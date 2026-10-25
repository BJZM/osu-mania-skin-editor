// ============================================================================
// skin-import.js - .osk 导入、skin.ini 读取与贴图注册流程
// 依赖：parser/skin-assets.js、parser/tiff.js、skin/skin-ini.js、UI 提示层
// ============================================================================

        // ===== osu! 官方 Wiki 规范：字体与数字贴图读取辅助体系 =====
        // 根据 osu! wiki: 若前缀末尾不是 '-' 且不是 '/'，则游戏会自动追加 '-'
        ui.osk.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            if (!/\.(osk|zip)$/i.test(file.name)) {
                showToast('文件类型不支持', '请选择 .osk 或 .zip 文件。');
                e.target.value = '';
                return;
            }

            // 互斥锁定：开始加载皮肤时禁止操作谱面与进度条，并直接暂停播放
            isSkinLoading = true;
            if (isPlaying) {
                pauseAudioAndBeatmap();
            }
            if (ui.playerControls) ui.playerControls.classList.add('disabled');
            if (ui.progressRange) ui.progressRange.disabled = true;
            if (ui.playPauseBtn) ui.playPauseBtn.disabled = true;
            ui.oszWrapper.classList.add('disabled');

            ui.oskFileName.textContent = file.name;
            ui.oskFileName.classList.add('loaded');
            showProgress('正在读取并构建皮肤资源库...');

            let skinImportSucceeded = false;
            try {
                const oskZip = await JSZip.loadAsync(file);
                stripUnsafeSkinArchiveEntries(oskZip);
                clearTextureProjectImportState();
                if (typeof textureEditRecipes !== 'undefined' && textureEditRecipes instanceof Map) {
                    textureEditRecipes.clear();
                }
                if (typeof longBodyComposerSessions !== 'undefined' && longBodyComposerSessions instanceof Map) {
                    longBodyComposerSessions.clear();
                }
                deactivateEditableDefaultSkinWorkspace();
                currentSkinZip = oskZip;
                currentSkinFileName = file.name;
                if (typeof clearSkinHitsoundReplacements === 'function') {
                    clearSkinHitsoundReplacements();
                } else {
                    skinHitsoundReplacements.clear();
                }
                const hitsoundRead = readSkinHitsoundAssets(oskZip);
                skinHitsoundCatalog = hitsoundRead.groups;
                skinHitsoundSummary = {
                    groupCount: hitsoundRead.groupCount,
                    fileCount: hitsoundRead.fileCount,
                    selectedFileCount: hitsoundRead.selectedFileCount
                };
                if (typeof ensureDefaultSkinHitsoundsLoaded === 'function') {
                    await ensureDefaultSkinHitsoundsLoaded();
                }
                if (typeof refreshSkinHitsoundCatalogWithReplacements === 'function') {
                    refreshSkinHitsoundCatalogWithReplacements();
                }
                currentSkinMetadata = {
                    general: {
                        Name: file.name.replace(/\.(osk|zip)$/i, ''),
                        Author: 'Unknown',
                        Version: 'latest',
                        AnimationFramerate: 60,
                    },
                    colours: {},
                    fonts: {},
                    rawSections: {},
                    rawIniText: ''
                };
                userReplacedTextures.clear();
                deletedSkinTexturePaths.clear();
                createdSkinTextureParams.clear();
                scorePercentSourceImages.clear();
                for (const u of activeSkinBlobUrls) {
                    try { URL.revokeObjectURL(u); } catch (_) { }
                }
                activeSkinBlobUrls = [];

                skinImageStore.clear();
                skinFallbackImageStore.clear();
                maniaSkinConfigurations.clear();
                globalSkinImageLookups.clear();
                if (typeof clearComboburstRuntimeEffects === 'function') {
                    clearComboburstRuntimeEffects();
                }
                if (typeof keyImageHeightBaselineState !== 'undefined') {
                    keyImageHeightBaselineState.clear();
                }
                let iniText = "";
                const failedFiles = [];

                const fileEntries = Object.keys(oskZip.files);

                // 1. 优先定位并读取 skin.ini，重置字体配置
                skinFontsConfig = {
                    scorePrefix: 'score',
                    scoreOverlap: 0,
                    comboPrefix: 'combo',
                    comboOverlap: 0,
                    hitCirclePrefix: 'default',
                    hitCircleOverlap: -2,
                    hasExplicitScoreOverlap: false,
                    hasExplicitComboOverlap: false,
                    hasExplicitComboPrefix: false
                };
                let iniPath = fileEntries.find(p => !p.includes('/') && !p.includes('\\') && p.toLowerCase().endsWith('skin.ini'));
                if (!iniPath) {
                    iniPath = fileEntries.find(p => p.toLowerCase().endsWith('skin.ini'));
                }
                if (iniPath && oskZip.files[iniPath]) {
                    try {
                        iniText = await oskZip.files[iniPath].async("string");
                        parseSkinIniLazer(iniText);
                    } catch (iniErr) {
                        console.error("解析 skin.ini 失败", iniErr);
                    }
                }

                // 2. 收集 skin.ini 中引用的贴图标识
                const iniReferencedKeys = new Set();
                const tailMaskImageKeys = new Set();
                const addImageKeyWithBasename = (targetSet, value) => {
                    if (typeof value !== 'string' || !value.trim()) return;
                    const clean = normalizeSkinKey(value);
                    targetSet.add(clean);
                    const base = clean.split('/').pop();
                    if (base) targetSet.add(base);
                };
                if (maniaSkinConfigurations.size > 0) {
                    for (const config of maniaSkinConfigurations.values()) {
                        if (config.ImageLookups) {
                            for (const [key, val] of config.ImageLookups.entries()) {
                                addImageKeyWithBasename(iniReferencedKeys, val);
                                // NoteImage*T 指向的文件名不一定包含 T/tail，必须按实际槽位保护其黑色遮罩。
                                if (/^(?:noteimage\d*t|holdnotetailimage\d*)$/i.test(key)) {
                                    addImageKeyWithBasename(tailMaskImageKeys, val);
                                }
                            }
                        }
                    }
                }
                if (globalSkinImageLookups.size > 0) {
                    for (const [key, val] of globalSkinImageLookups.entries()) {
                        addImageKeyWithBasename(iniReferencedKeys, val);
                        if (/^(?:noteimage\d*t|holdnotetailimage\d*)$/i.test(key)) {
                            addImageKeyWithBasename(tailMaskImageKeys, val);
                        }
                    }
                }

                // 收集数字贴图（分数、连击数、准度、打击圈等）的前缀与候选文件名，加入优先贴图集合
                const fontPrefixes = new Set([
                    skinFontsConfig.scorePrefix || 'score',
                    skinFontsConfig.comboPrefix || skinFontsConfig.scorePrefix || 'score',
                    skinFontsConfig.hitCirclePrefix || 'default',
                    'score', 'combo', 'default'
                ]);
                for (const cfg of maniaSkinConfigurations.values()) {
                    if (cfg.FontCombo) fontPrefixes.add(cfg.FontCombo);
                    if (cfg.FontScore) fontPrefixes.add(cfg.FontScore);
                }

                const sampleChars = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'percent', 'dot', 'comma', 'period', 'x', 'X'];
                for (const pfx of fontPrefixes) {
                    if (!pfx) continue;
                    const cleanPfx = normalizeSkinKey(pfx);
                    iniReferencedKeys.add(cleanPfx);
                    const basePfx = cleanPfx.split('/').pop();
                    if (basePfx) iniReferencedKeys.add(basePfx);

                    for (const ch of sampleChars) {
                        const candidates = getFontCharacterCandidates(pfx, ch);
                        for (const cand of candidates) {
                            const cleanCand = normalizeSkinKey(cand);
                            iniReferencedKeys.add(cleanCand);
                            const baseCand = cleanCand.split('/').pop();
                            if (baseCand) iniReferencedKeys.add(baseCand);
                        }
                    }
                }

                if (iniText) {
                    const lines = iniText.split(/\r?\n/);
                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#')) continue;
                        const colonIdx = trimmed.indexOf(':');
                        if (colonIdx > 0) {
                            const val = trimmed.substring(colonIdx + 1).trim();
                            if (val && !val.includes(',') && !/^\d+$/.test(val)) {
                                const clean = normalizeSkinKey(val);
                                iniReferencedKeys.add(clean);
                                const base = clean.split('/').pop();
                                if (base) iniReferencedKeys.add(base);
                            }
                        }
                    }
                }

                // 3. 过滤出所有图片条目，并分组成：优先贴图组 (skin.ini 涉及) 与 其他贴图组
                const imageEntries = fileEntries.filter(p =>
                    p.toLowerCase().match(/\.(png|jpg|jpeg)$/i) &&
                    !isTextureProjectInternalPath(p)
                );
                const priorityImages = [];
                const otherImages = [];

                for (const p of imageEntries) {
                    const normalized = normalizeSkinKey(p).replace(/@2x/g, '');
                    const base = normalized.split('/').pop();
                    if (iniReferencedKeys.has(normalized) || (base && iniReferencedKeys.has(base)) || (base && base.startsWith('scorebar'))) {
                        priorityImages.push(p);
                    } else {
                        otherImages.push(p);
                    }
                }

                // 先读取优先贴图，再读取其他贴图
                const orderedImages = [...priorityImages, ...otherImages];
                const totalFiles = orderedImages.length;
                let processed = 0;

                for (const relativePath of orderedImages) {
                    processed++;
                    updateProgress(processed, totalFiles, relativePath);

                    let blobUrl = null;
                    try {
                        const arrayBuffer = await oskZip.files[relativePath].async("arraybuffer");
                        let img = null;

                        // 检测是否为伪装成 PNG/JPG 的 TIFF 格式文件 (文件头魔数 0x49492A00 或 0x4D4D002A)
                        if (arrayBuffer.byteLength >= 4) {
                            const view = new DataView(arrayBuffer, 0, 4);
                            const isTiff = (
                                (view.getUint8(0) === 0x49 && view.getUint8(1) === 0x49 && view.getUint8(2) === 0x2A && view.getUint8(3) === 0x00) ||
                                (view.getUint8(0) === 0x4D && view.getUint8(1) === 0x4D && view.getUint8(2) === 0x00 && view.getUint8(3) === 0x2A)
                            );
                            if (isTiff) {
                                img = await decodeTiffToImageOrCanvas(arrayBuffer);
                            }
                        }

                        if (!img) {
                            const imgBlob = new Blob([arrayBuffer]);
                            blobUrl = URL.createObjectURL(imgBlob);
                            activeSkinBlobUrls.push(blobUrl);

                            img = await new Promise((resolve, reject) => {
                                const tempImg = new Image();
                                tempImg.onload = () => resolve(tempImg);
                                tempImg.onerror = () => reject(new Error('浏览器无法解码此图片或格式不支持'));
                                tempImg.src = blobUrl;
                            });
                        }

                        let finalImg = img;
                        try {
                            if (img.width > 0 && img.height > 0 && img.width <= 4096 && img.height <= 4096) {
                                const imageKey = normalizeSkinKey(relativePath).replace(/@2x/g, '');
                                const imageBase = imageKey.split('/').pop();
                                const preserveBlack = tailMaskImageKeys.has(imageKey) ||
                                    (imageBase && tailMaskImageKeys.has(imageBase));
                                const processedImg = processSkinImage(img, relativePath, preserveBlack);
                                if (processedImg !== img) {
                                    await new Promise((resolve) => {
                                        processedImg.onload = resolve;
                                        processedImg.onerror = resolve;
                                    });
                                    if (processedImg.width && processedImg.height) {
                                        finalImg = processedImg;
                                    }
                                }
                            }
                        } catch (pErr) {
                            console.warn("processSkinImage 处理异常，使用原图:", relativePath, pErr);
                            finalImg = img;
                        }

                        const nk = normalizeSkinKey(relativePath);
                        registerSkinImage(nk, finalImg);
                    } catch (err) {
                        console.warn(`[跳过无法加载的贴图] ${relativePath}:`, err);
                        failedFiles.push(relativePath);
                        if (blobUrl) {
                            try { URL.revokeObjectURL(blobUrl); } catch (_) { }
                        }
                    }
                }

                const textureProjectRestore = await readTextureProjectFromArchive(oskZip);
                if (textureProjectRestore) {
                    showToast(
                        '可续编工程已恢复',
                        `自建贴图 ${textureProjectRestore.createdCount}，普通贴图配方 ${textureProjectRestore.recipeCount}，投皮 ${textureProjectRestore.longBodyCount}`
                    );
                }

                if (typeof prepareManiaHitsoundPlayback === 'function' && currentBeatmap && activeNotes.length > 0) {
                    await prepareManiaHitsoundPlayback();
                }

                // 4. 提示皮肤配置解析结果
                if (iniText) {
                    const supportedKeys = [...maniaSkinConfigurations.keys()].sort((a, b) => a - b);
                    const keyCountStr = supportedKeys.length > 0 ? supportedKeys.map(k => `${k}K`).join(', ') : '无独立Mania按键定义';
                    showToast('皮肤加载成功', `已载入配置：${keyCountStr}`);
                } else {
                    showToast('皮肤加载完成', '未找到 skin.ini，已自动匹配默认图片命名规范');
                }

                // 5. 如果有无法读取的文件，给出必须手动关闭的提示，列出具体文件路径
                if (failedFiles.length > 0) {
                    const fileListHtml = failedFiles.map(f => `• ${f}`).join('\n');
                    const warningMsg = `
                        <div>部分文件不能加载可能出现问题（共 ${failedFiles.length} 个文件）：</div>
                        <div class="toast-file-list">${fileListHtml}</div>
                    `;
                    showToast('提示', warningMsg, 0, true);
                }
                skinImportSucceeded = true;
            } catch (err) {
                console.error(err);
                showToast('错误', 'OSK 皮肤解析失败: ' + err.message);
            } finally {
                // 解锁状态
                isSkinLoading = false;
                ui.oszWrapper.classList.remove('disabled');
                if (skinImportSucceeded && typeof markStartupSkinReady === 'function') {
                    markStartupSkinReady(file.name);
                }
                if (typeof syncStartupPlayerControls === 'function') {
                    syncStartupPlayerControls();
                }
                // 皮肤加载完成后自动刷新右侧画布中的贴图
                if (currentBeatmap) {
                    const currentTimeMs = (audio && !isNaN(audio.currentTime)) ? audio.currentTime * 1000 : 0;
                    syncNotesStateWithTime(currentTimeMs);
                }
                drawFrame();
                updateSkinInfoDisplay();
                if (typeof refreshSkinCursor === 'function') refreshSkinCursor();
                // 保存导入时的完整皮肤初始快照（包括所有参数、按键配置与贴图），以便随时复原
                saveInitialSkinSnapshot();
                if (typeof refreshSkinEditorAfterSkinImport === 'function') {
                    refreshSkinEditorAfterSkinImport();
                }
                setTimeout(() => {
                    hideProgress();
                    drawFrame();
                }, 300);
            }
        });

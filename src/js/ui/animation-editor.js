// ============================================================================
// animation-editor.js - 多帧动态贴图制作、预览、排序与应用
// 依赖：parser/skin-assets.js、ui/history.js、ui/texture-controls.js
// ============================================================================

        function initAnimationTextureEditorUI() {
            // ===== 动态贴图序列制作 / 上传系统 (多帧动画) =====
            let animEditorState = {
                targetParamKey: null,
                targetKey: null,
                targetFilename: null,
                cleanRawBase: '',
                targetBase: '',
                spec: '1x',
                frames: [],
                fps: 30,
                isPlaying: true,
                currentPreviewFrameIdx: 0,
                previewTimer: null
            };

            function getTextureKeyAliases(targetBase, pKey) {
                const aliases = new Set();
                const tb = String(targetBase || '').toLowerCase().trim();
                const pk = String(pKey || '').toLowerCase().trim();
                if (tb) aliases.add(tb);
                if (pk) aliases.add(pk);

                if (pk === 'stagehint' || tb === 'stagehint' || tb === 'mania-stage-hint') {
                    aliases.add('mania-stage-hint');
                    aliases.add('stagehint');
                    aliases.add('hittarget');
                }
                if (pk === 'stagelight' || tb === 'stagelight' || tb === 'mania-stage-light') {
                    aliases.add('mania-stage-light');
                    aliases.add('stagelight');
                }
                if (pk === 'stagebottom' || tb === 'stagebottom' || tb === 'mania-stage-bottom' || tb === 'stage_bottom') {
                    aliases.add('mania-stage-bottom');
                    aliases.add('stagebottom');
                    aliases.add('stage_bottom');
                }
                if (pk === 'stageleft' || tb === 'stageleft' || tb === 'mania-stage-left' || tb === 'stage_left') {
                    aliases.add('mania-stage-left');
                    aliases.add('stageleft');
                    aliases.add('stage_left');
                }
                if (pk === 'stageright' || tb === 'stageright' || tb === 'mania-stage-right' || tb === 'stage_right') {
                    aliases.add('mania-stage-right');
                    aliases.add('stageright');
                    aliases.add('stage_right');
                }
                if (pk === 'lightingn' || (tb === 'lightingn' && pk !== 'lightingl')) {
                    aliases.add('lightingn');
                }
                if (pk === 'lightingl' || (tb === 'lightingl' && pk !== 'lightingn')) {
                    aliases.add('lightingl');
                }
                if (pk === 'hit0' || tb === 'hit0' || tb === 'mania-hit0') {
                    aliases.add('mania-hit0');
                    aliases.add('hit0');
                }
                if (pk === 'hit50' || tb === 'hit50' || tb === 'mania-hit50') {
                    aliases.add('mania-hit50');
                    aliases.add('hit50');
                }
                if (pk === 'hit100' || tb === 'hit100' || tb === 'mania-hit100') {
                    aliases.add('mania-hit100');
                    aliases.add('hit100');
                }
                if (pk === 'hit200' || tb === 'hit200' || tb === 'mania-hit200') {
                    aliases.add('mania-hit200');
                    aliases.add('hit200');
                }
                if (pk === 'hit300' || tb === 'hit300' || tb === 'mania-hit300') {
                    aliases.add('mania-hit300');
                    aliases.add('hit300');
                }
                if (pk === 'hit300g' || tb === 'hit300g' || tb === 'mania-hit300g' || tb === 'hit300k') {
                    aliases.add('mania-hit300g');
                    aliases.add('hit300g');
                    aliases.add('hit300k');
                }
                return Array.from(aliases);
            }

            function drawAnimPreviewFrame() {
                const canvas = document.getElementById('animPreviewCanvas');
                if (!canvas) return;
                const ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                const frames = animEditorState.frames;
                const countBadge = document.getElementById('animPreviewFrameCount');

                if (!frames || frames.length === 0) {
                    if (countBadge) countBadge.textContent = '0 帧';
                    ctx.save();
                    ctx.fillStyle = '#64748b';
                    ctx.font = '12px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText('等待添加帧贴图...', canvas.width / 2, canvas.height / 2);
                    ctx.restore();
                    return;
                }

                if (animEditorState.currentPreviewFrameIdx >= frames.length) {
                    animEditorState.currentPreviewFrameIdx = 0;
                }
                const curIdx = animEditorState.currentPreviewFrameIdx;
                const curFrame = frames[curIdx];
                if (curFrame && curFrame.img) {
                    const img = curFrame.img;
                    const scale = Math.min((canvas.width - 16) / img.width, (canvas.height - 16) / img.height, 1);
                    const dw = img.width * scale;
                    const dh = img.height * scale;
                    const dx = (canvas.width - dw) / 2;
                    const dy = (canvas.height - dh) / 2;
                    ctx.drawImage(img, dx, dy, dw, dh);
                }
                if (countBadge) {
                    countBadge.textContent = `${curIdx + 1} / ${frames.length} 帧`;
                }
            }

            function startAnimPreview() {
                stopAnimPreview();
                animEditorState.previewTimer = setInterval(() => {
                    if (!animEditorState.isPlaying) return;
                    if (animEditorState.frames && animEditorState.frames.length > 0) {
                        animEditorState.currentPreviewFrameIdx = (animEditorState.currentPreviewFrameIdx + 1) % animEditorState.frames.length;
                        drawAnimPreviewFrame();
                    }
                }, 1000 / Math.max(1, animEditorState.fps));
                drawAnimPreviewFrame();
            }

            function stopAnimPreview() {
                if (animEditorState.previewTimer) {
                    clearInterval(animEditorState.previewTimer);
                    animEditorState.previewTimer = null;
                }
            }

            function updateAnimSpecButtons() {
                const btn1x = document.getElementById('animSpec1xBtn');
                const btn2x = document.getElementById('animSpec2xBtn');
                if (btn1x) btn1x.classList.toggle('active', animEditorState.spec === '1x');
                if (btn2x) btn2x.classList.toggle('active', animEditorState.spec === '2x');
                renderAnimFramesGrid();
            }

            function renderAnimFramesGrid() {
                const emptyState = document.getElementById('animEmptyState');
                const grid = document.getElementById('animFramesGrid');
                const previewPanel = document.getElementById('animPreviewPanel');
                const confirmBtn = document.getElementById('animConfirmBtn');
                const clearAllBtn = document.getElementById('animClearAllBtn');
                const countBadge = document.getElementById('animPreviewFrameCount');

                const frames = animEditorState.frames;
                const totalFrames = frames ? frames.length : 0;

                if (confirmBtn) {
                    confirmBtn.disabled = (totalFrames === 0);
                    confirmBtn.textContent = totalFrames > 0 ? `确认应用动态贴图 (${totalFrames} 帧)` : '确认应用动态贴图 (0 帧)';
                }
                if (clearAllBtn) {
                    clearAllBtn.style.display = totalFrames > 0 ? 'inline-flex' : 'none';
                }
                if (countBadge) {
                    countBadge.textContent = `${totalFrames} 帧`;
                }

                if (!frames || totalFrames === 0) {
                    if (emptyState) emptyState.style.display = 'flex';
                    if (grid) {
                        grid.style.display = 'none';
                        grid.innerHTML = '';
                    }
                    if (previewPanel) previewPanel.style.display = 'none';
                    drawAnimPreviewFrame();
                    return;
                }

                if (emptyState) emptyState.style.display = 'none';
                if (grid) grid.style.display = 'grid';
                if (previewPanel) previewPanel.style.display = 'flex';
                grid.innerHTML = '';

                const cleanRawBase = animEditorState.cleanRawBase;
                const is2x = (animEditorState.spec === '2x');
                const suffix = is2x ? '@2x.png' : '.png';

                frames.forEach((frame, idx) => {
                    const card = document.createElement('div');
                    card.className = 'anim-frame-card';

                    const exportName = `${cleanRawBase}-${idx}${suffix}`;
                    const kb = (frame.size / 1024).toFixed(1);

                    card.innerHTML = `
                        <div class="anim-frame-header">
                            <span class="anim-frame-badge">第 ${idx} 帧</span>
                            <span class="anim-frame-export-name" title="${exportName}">${exportName}</span>
                            <button type="button" class="anim-frame-delete-btn" title="删除此帧">✕</button>
                        </div>
                        <div class="anim-frame-thumb-box">
                            <img src="${frame.blobUrl}" alt="Frame ${idx}">
                        </div>
                        <div class="anim-frame-meta">
                            <span class="anim-frame-name" title="${frame.name}">${frame.name}</span>
                            <span class="anim-frame-dim">${frame.width}×${frame.height} (${kb} KB)</span>
                        </div>
                        <div class="anim-frame-move-btns">
                            <button type="button" class="anim-move-btn anim-move-left" title="向前移动一帧" ${idx === 0 ? 'disabled' : ''}>◀ 前移</button>
                            <button type="button" class="anim-move-btn anim-move-right" title="向后移动一帧" ${idx === frames.length - 1 ? 'disabled' : ''}>后移 ▶</button>
                        </div>
                    `;

                    const moveLeftBtn = card.querySelector('.anim-move-left');
                    const moveRightBtn = card.querySelector('.anim-move-right');
                    const deleteBtn = card.querySelector('.anim-frame-delete-btn');

                    if (moveLeftBtn && idx > 0) {
                        moveLeftBtn.onclick = () => {
                            const temp = frames[idx];
                            frames[idx] = frames[idx - 1];
                            frames[idx - 1] = temp;
                            renderAnimFramesGrid();
                        };
                    }
                    if (moveRightBtn && idx < frames.length - 1) {
                        moveRightBtn.onclick = () => {
                            const temp = frames[idx];
                            frames[idx] = frames[idx + 1];
                            frames[idx + 1] = temp;
                            renderAnimFramesGrid();
                        };
                    }
                    if (deleteBtn) {
                        deleteBtn.onclick = () => {
                            if (frame.blobUrl) {
                                try { URL.revokeObjectURL(frame.blobUrl); } catch (_) {}
                            }
                            frames.splice(idx, 1);
                            renderAnimFramesGrid();
                        };
                    }

                    grid.appendChild(card);
                });

                drawAnimPreviewFrame();
            }

            openAnimTextureEditor = function(param1, param2 = null, param3 = null, defaultSpec = '1x') {
                stopAnimPreview();

                if (animEditorState.frames && animEditorState.frames.length > 0) {
                    animEditorState.frames.forEach(f => {
                        if (f.blobUrl) {
                            try { URL.revokeObjectURL(f.blobUrl); } catch (_) {}
                        }
                    });
                }

                let targetFilename = (typeof param1 === 'string' && param1.includes('.')) ? param1 : (param3 || param1);
                let targetParamKey = param3 || (param1 && !param1.includes('.') ? param1 : null) || param2;
                let targetKey = param2 || targetParamKey;

                if (!isTextureAnimationSupported(targetParamKey, targetKey, targetFilename)) {
                    showToast('不支持动态贴图', '该贴图在 osu!stable 中只支持静态图片。');
                    return;
                }

                let rawName = targetFilename;
                if (!rawName || isDummyBlankName(rawName)) {
                    rawName = targetParamKey || targetKey || 'texture';
                }
                let cleanBase = String(rawName).replace(/\.[^/.]+$/, '').replace(/@2x/i, '').replace(/-\d+$/, '');
                if (!cleanBase || isDummyBlankName(cleanBase)) {
                    cleanBase = targetParamKey || targetKey || 'texture';
                }

                // 需求重点：打开窗口时初始状态为空
                animEditorState = {
                    targetParamKey: targetParamKey || null,
                    targetKey: targetKey || null,
                    targetFilename: targetFilename || null,
                    cleanRawBase: cleanBase,
                    targetBase: cleanBase.toLowerCase(),
                    spec: (defaultSpec === '2x') ? '2x' : '1x',
                    frames: [],
                    fps: 30,
                    isPlaying: true,
                    currentPreviewFrameIdx: 0,
                    previewTimer: null
                };

                const titleTextEl = document.getElementById('animTextureTitleText');
                const targetLabelEl = document.getElementById('animTextureTargetLabel');
                let friendlyName = targetParamKey || targetKey || cleanBase;
                const schemaItem = (typeof SKIN_INI_PARAM_SCHEMA !== 'undefined') && SKIN_INI_PARAM_SCHEMA.find(item => item.key === friendlyName);
                const displayName = (schemaItem && schemaItem.zhName) ? `${schemaItem.zhName} (${cleanBase})` : cleanBase;
                if (titleTextEl) {
                    titleTextEl.textContent = `动态贴图序列管理 - ${displayName}`;
                }
                if (targetLabelEl) {
                    targetLabelEl.textContent = `目标贴图: ${cleanBase}`;
                }

                const fpsRange = document.getElementById('animFpsRange');
                const fpsVal = document.getElementById('animFpsVal');
                if (fpsRange) fpsRange.value = 30;
                if (fpsVal) fpsVal.textContent = '30';

                const playBtn = document.getElementById('animPlayToggleBtn');
                if (playBtn) playBtn.textContent = '⏸ 暂停';

                updateAnimSpecButtons();
                renderAnimFramesGrid();

                const modal = document.getElementById('animTextureModal');
                if (modal) modal.style.display = 'flex';

                startAnimPreview();
            };

            closeAnimTextureEditor = function() {
                stopAnimPreview();
                if (animEditorState.frames && animEditorState.frames.length > 0) {
                    animEditorState.frames.forEach(f => {
                        if (f.blobUrl) {
                            try { URL.revokeObjectURL(f.blobUrl); } catch (_) {}
                        }
                    });
                }
                animEditorState.frames = [];
                const singleInput = document.getElementById('animSingleFrameInput');
                const batchInput = document.getElementById('animBatchFrameInput');
                if (singleInput) singleInput.value = '';
                if (batchInput) batchInput.value = '';

                const modal = document.getElementById('animTextureModal');
                if (modal) modal.style.display = 'none';
            };

            async function handleAnimSingleAdd(file) {
                if (!file) return;
                try {
                    const arrayBuffer = await file.arrayBuffer();
                    const blob = new Blob([arrayBuffer]);
                    const blobUrl = URL.createObjectURL(blob);
                    const img = await new Promise((resolve, reject) => {
                        const i = new Image();
                        i.onload = () => resolve(i);
                        i.onerror = () => reject(new Error('图片加载失败'));
                        i.src = blobUrl;
                    });

                    animEditorState.frames.push({
                        file,
                        arrayBuffer,
                        img,
                        blobUrl,
                        name: file.name,
                        width: img.width,
                        height: img.height,
                        size: file.size
                    });

                    renderAnimFramesGrid();
                    showToast('添加单帧成功', `已添加第 ${animEditorState.frames.length - 1} 帧: ${file.name}`);
                } catch (err) {
                    console.error('单帧添加失败', err);
                    showToast('添加失败', err.message || '图片文件无法解析');
                }
            }

            async function handleAnimBatchAdd(fileList) {
                if (!fileList || fileList.length === 0) return;
                try {
                    const sortedFiles = Array.from(fileList);
                    // 需求重点：贴图顺序由上传的所有贴图的名称顺序决定（自然数/字母升序，如 -0, -1, -2 或 1, 2, 10）
                    sortedFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

                    let addedCount = 0;
                    for (const file of sortedFiles) {
                        try {
                            const arrayBuffer = await file.arrayBuffer();
                            const blob = new Blob([arrayBuffer]);
                            const blobUrl = URL.createObjectURL(blob);
                            const img = await new Promise((resolve, reject) => {
                                const i = new Image();
                                i.onload = () => resolve(i);
                                i.onerror = () => reject(new Error('图片加载失败'));
                                i.src = blobUrl;
                            });

                            animEditorState.frames.push({
                                file,
                                arrayBuffer,
                                img,
                                blobUrl,
                                name: file.name,
                                width: img.width,
                                height: img.height,
                                size: file.size
                            });
                            addedCount++;
                        } catch (frameErr) {
                            console.warn(`跳过无法解析的图片: ${file.name}`, frameErr);
                        }
                    }

                    renderAnimFramesGrid();
                    showToast('批量添加完成', `已按文件名顺序添加 ${addedCount} 帧贴图`);
                } catch (err) {
                    console.error('批量添加失败', err);
                    showToast('批量添加失败', err.message || '未知错误');
                }
            }

            async function confirmApplyAnimTexture() {
                if (!animEditorState.frames || animEditorState.frames.length === 0) {
                    showToast('无法应用', '请至少添加 1 张动画贴图帧');
                    return;
                }

                const is2x = (animEditorState.spec === '2x');
                const cleanRawBase = animEditorState.cleanRawBase;
                const targetBase = animEditorState.targetBase;
                const pKey = animEditorState.targetParamKey || animEditorState.targetKey;
                const appliedCount = animEditorState.frames.length;

                recordSkinUndoBeforeChange(`替换动态贴图: ${cleanRawBase} (${appliedCount} 帧)`);
                continuousActionActive = false;

                const curExt = is2x ? '@2x.png' : '.png';
                const oppExt = is2x ? '.png' : '@2x.png';

                // 获取该贴图参数的所有标准 osu! mania 别名与变体
                const allAliases = getTextureKeyAliases(targetBase, pKey);

                // 1. 对所有别名统一重置与注入贴图资产表
                for (const alias of allAliases) {
                    const animEntry = getOrCreateSkinAssetEntry(skinImageStore, alias);
                    const fallbackEntry = getOrCreateSkinAssetEntry(skinFallbackImageStore, alias);
                    if (is2x) {
                        animEntry.anim2x = [];
                        fallbackEntry.anim2x = [];
                    } else {
                        animEntry.anim1x = [];
                        fallbackEntry.anim1x = [];
                        // 若上传 1x 动画，清除可能导致冲突的旧 2x 帧与静态图
                        animEntry.anim2x = [];
                        fallbackEntry.anim2x = [];
                        animEntry.static2x = null;
                        fallbackEntry.static2x = null;
                    }

                    animEditorState.frames.forEach((frame, idx) => {
                        frame.img._is2x = is2x;
                        frame.img._isRootLevel = true;

                        if (is2x) {
                            animEntry.anim2x[idx] = frame.img;
                            fallbackEntry.anim2x[idx] = frame.img;
                        } else {
                            animEntry.anim1x[idx] = frame.img;
                            fallbackEntry.anim1x[idx] = frame.img;
                        }

                        const frameKey = `${alias}-${idx}`;
                        saveSkinAssetToStore(skinImageStore, frameKey, frame.img, is2x, true, true);
                        saveSkinAssetToStore(skinFallbackImageStore, frameKey, frame.img, is2x, true, true);

                        userReplacedTextures.set(`${alias}-${idx}${curExt}`, frame.arrayBuffer);
                        userReplacedTextures.delete(`${alias}-${idx}${oppExt}`);
                    });

                    if (animEditorState.frames[0] && animEditorState.frames[0].img) {
                        const frame0Img = animEditorState.frames[0].img;
                        if (is2x) {
                            animEntry.static2x = frame0Img;
                            fallbackEntry.static2x = frame0Img;
                        } else {
                            animEntry.static1x = frame0Img;
                            fallbackEntry.static1x = frame0Img;
                        }
                    }
                }

                // 2. 将主原始命名也写入用户替换字典
                animEditorState.frames.forEach((frame, idx) => {
                    const exportFilename = `${cleanRawBase}-${idx}${curExt}`;
                    userReplacedTextures.set(exportFilename, frame.arrayBuffer);
                    userReplacedTextures.delete(`${cleanRawBase}-${idx}${oppExt}`);
                });

                // 3. 清理超出新帧数的多余旧帧缓存 (防止旧帧多于新帧产生幽灵遗留)
                for (let i = animEditorState.frames.length; i < 64; i++) {
                    for (const alias of allAliases) {
                        skinImageStore.delete(`${alias}-${i}`);
                        skinFallbackImageStore.delete(`${alias}-${i}`);
                        userReplacedTextures.delete(`${alias}-${i}.png`);
                        userReplacedTextures.delete(`${alias}-${i}@2x.png`);
                        if (currentSkinZip) {
                            currentSkinZip.remove(`${alias}-${i}.png`);
                            currentSkinZip.remove(`${alias}-${i}@2x.png`);
                        }
                    }
                    userReplacedTextures.delete(`${cleanRawBase}-${i}.png`);
                    userReplacedTextures.delete(`${cleanRawBase}-${i}@2x.png`);
                    if (currentSkinZip) {
                        currentSkinZip.remove(`${cleanRawBase}-${i}.png`);
                        currentSkinZip.remove(`${cleanRawBase}-${i}@2x.png`);
                    }
                }

                // 4. 更新 skin.ini 配置
                if (pKey) {
                    const finalBase = cleanRawBase || targetBase;
                    const curKeys = getActiveKeyCount();
                    let primaryCfg = maniaSkinConfigurations.get(curKeys);
                    if (!primaryCfg) {
                        primaryCfg = ensureManiaConfigForKeys(curKeys);
                        maniaSkinConfigurations.set(curKeys, primaryCfg);
                    }
                    const isTrackNoteParam = /^(NoteImage|HoldNoteHeadImage|HoldNoteBodyImage|HoldNoteTailImage|KeyImageDown|KeyImage)(\d+)/i.test(pKey);
                    if (isTrackNoteParam) {
                        if (!primaryCfg.ImageLookups) primaryCfg.ImageLookups = new Map();
                        primaryCfg[pKey] = finalBase;
                        primaryCfg.ImageLookups.set(pKey, finalBase);
                        primaryCfg.ImageLookups.set(pKey.toLowerCase(), finalBase);
                    } else {
                        for (const [, cfgItem] of maniaSkinConfigurations) {
                            if (!cfgItem.ImageLookups) cfgItem.ImageLookups = new Map();
                            cfgItem[pKey] = finalBase;
                            cfgItem.ImageLookups.set(pKey, finalBase);
                            cfgItem.ImageLookups.set(pKey.toLowerCase(), finalBase);
                        }
                        if (globalSkinImageLookups) {
                            globalSkinImageLookups.set(pKey, finalBase);
                            globalSkinImageLookups.set(pKey.toLowerCase(), finalBase);
                        }
                    }
                    syncParamInputValue(pKey, finalBase);
                }

                closeAnimTextureEditor();
                showToast('动态贴图应用成功', `已成功配置 ${cleanRawBase} 共 ${appliedCount} 帧 ${is2x ? '@2x 高清' : '1x 普通'}动画`);
                drawFrame();
                renderSkinEditorParams();
            }

            // 绑定动态贴图弹窗交互事件
            const animSingleInput = document.getElementById('animSingleFrameInput');
            const animBatchInput = document.getElementById('animBatchFrameInput');

            const animAddSingleBtn = document.getElementById('animAddSingleBtn');
            const animBatchBtn = document.getElementById('animBatchBtn');
            const animEmptyAddBtn = document.getElementById('animEmptyAddBtn');
            const animEmptyBatchBtn = document.getElementById('animEmptyBatchBtn');

            if (animAddSingleBtn && animSingleInput) {
                animAddSingleBtn.onclick = () => {
                    animSingleInput.value = '';
                    animSingleInput.click();
                };
            }
            if (animEmptyAddBtn && animSingleInput) {
                animEmptyAddBtn.onclick = () => {
                    animSingleInput.value = '';
                    animSingleInput.click();
                };
            }
            if (animSingleInput) {
                animSingleInput.onchange = (e) => {
                    const file = e.target.files && e.target.files[0];
                    e.target.value = '';
                    if (file) handleAnimSingleAdd(file);
                };
            }

            if (animBatchBtn && animBatchInput) {
                animBatchBtn.onclick = () => {
                    animBatchInput.value = '';
                    animBatchInput.click();
                };
            }
            if (animEmptyBatchBtn && animBatchInput) {
                animEmptyBatchBtn.onclick = () => {
                    animBatchInput.value = '';
                    animBatchInput.click();
                };
            }
            if (animBatchInput) {
                animBatchInput.onchange = (e) => {
                    if (e.target.files && e.target.files.length > 0) {
                        const files = Array.from(e.target.files);
                        e.target.value = '';
                        handleAnimBatchAdd(files);
                    } else {
                        e.target.value = '';
                    }
                };
            }

            const animSpec1xBtn = document.getElementById('animSpec1xBtn');
            const animSpec2xBtn = document.getElementById('animSpec2xBtn');
            if (animSpec1xBtn) {
                animSpec1xBtn.onclick = () => {
                    animEditorState.spec = '1x';
                    updateAnimSpecButtons();
                };
            }
            if (animSpec2xBtn) {
                animSpec2xBtn.onclick = () => {
                    animEditorState.spec = '2x';
                    updateAnimSpecButtons();
                };
            }

            const animClearAllBtn = document.getElementById('animClearAllBtn');
            if (animClearAllBtn) {
                animClearAllBtn.onclick = () => {
                    if (animEditorState.frames && animEditorState.frames.length > 0) {
                        animEditorState.frames.forEach(f => {
                            if (f.blobUrl) {
                                try { URL.revokeObjectURL(f.blobUrl); } catch (_) {}
                            }
                        });
                        animEditorState.frames = [];
                        renderAnimFramesGrid();
                        showToast('已清空', '所有动画帧贴图已清空');
                    }
                };
            }

            const animCloseBtn = document.getElementById('animTextureCloseBtn');
            const animCancelBtn = document.getElementById('animCancelBtn');
            const animBackdrop = document.getElementById('animTextureBackdrop');
            if (animCloseBtn) animCloseBtn.onclick = closeAnimTextureEditor;
            if (animCancelBtn) animCancelBtn.onclick = closeAnimTextureEditor;
            if (animBackdrop) animBackdrop.onclick = closeAnimTextureEditor;

            const animConfirmBtn = document.getElementById('animConfirmBtn');
            if (animConfirmBtn) animConfirmBtn.onclick = confirmApplyAnimTexture;

            const animPlayToggleBtn = document.getElementById('animPlayToggleBtn');
            if (animPlayToggleBtn) {
                animPlayToggleBtn.onclick = () => {
                    animEditorState.isPlaying = !animEditorState.isPlaying;
                    animPlayToggleBtn.textContent = animEditorState.isPlaying ? '⏸ 暂停' : '▶ 播放';
                };
            }

            const animFpsRange = document.getElementById('animFpsRange');
            const animFpsVal = document.getElementById('animFpsVal');
            if (animFpsRange) {
                const updateFpsFill = (v) => {
                    const min = parseFloat(animFpsRange.min) || 5;
                    const max = parseFloat(animFpsRange.max) || 60;
                    const vf = parseFloat(v) || min;
                    const pct = ((vf - min) / (max - min)) * 100;
                    animFpsRange.style.setProperty('--slider-pct', `${pct}%`);
                };
                updateFpsFill(animFpsRange.value);
                animFpsRange.oninput = (e) => {
                    updateFpsFill(e.target.value);
                    const fps = parseInt(e.target.value, 10) || 30;
                    animEditorState.fps = fps;
                    if (animFpsVal) animFpsVal.textContent = `${fps} fps`;
                    if (animEditorState.isPlaying) {
                        startAnimPreview();
                    }
                };
            }

        }

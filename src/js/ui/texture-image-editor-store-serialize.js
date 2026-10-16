// ============================================================================
// texture-image-editor-store-serialize.js - 贴图仓库写入、Blob 序列化与空白贴图
// 由 texture-image-editor.js 按职责拆分；所有脚本共享既有经典脚本作用域。
// ============================================================================

        function installFramesToStores(frames, selected, options = {}) {
            if (!selected || !frames || frames.length === 0) return null;
            const p = selected.p;
            const is2x = !!frames[0]._is2x;
            const base = stripTextureName(selected.base) || 'texture';
            const fallbackBase = base.split('/').pop();
            const { aliases, isPerTrack } = getSelectedAliases(selected);

            if (options.persist) {
                recordSkinUndoBeforeChange(`编辑贴图: ${base} (${frames.length} 帧)`);
                continuousActionActive = false;
            }

            for (const alias of aliases) {
                const entry = getOrCreateSkinAssetEntry(skinImageStore, alias);
                const fallbackEntry = getOrCreateSkinAssetEntry(skinFallbackImageStore, alias);
                entry.anim1x = [];
                entry.anim2x = [];
                fallbackEntry.anim1x = [];
                fallbackEntry.anim2x = [];
                entry.static1x = null;
                entry.static2x = null;
                fallbackEntry.static1x = null;
                fallbackEntry.static2x = null;
            }

            if (frames.length === 1) {
                const frame = frames[0];
                frame._is2x = is2x;
                frame._isRootLevel = true;
                saveSkinAssetToStore(skinImageStore, base, frame, is2x, true, true);
                saveSkinAssetToStore(skinFallbackImageStore, fallbackBase || base, frame, is2x, true, true);
            } else {
                frames.forEach((frame, index) => {
                    frame._is2x = is2x;
                    frame._isRootLevel = true;
                    const frameKey = `${base}-${index}`;
                    saveSkinAssetToStore(skinImageStore, frameKey, frame, is2x, true, true);
                    saveSkinAssetToStore(skinFallbackImageStore, frameKey, frame, is2x, true, true);
                    if (fallbackBase && fallbackBase !== base) {
                        saveSkinAssetToStore(skinFallbackImageStore, `${fallbackBase}-${index}`, frame, is2x, true, true);
                    }
                });
            }

            const baseEntry = getOrCreateSkinAssetEntry(skinImageStore, base);
            const fallbackEntry = getOrCreateSkinAssetEntry(skinFallbackImageStore, fallbackBase || base);
            if (frames.length === 1) {
                if (is2x) {
                    baseEntry.static2x = frames[0];
                    fallbackEntry.static2x = frames[0];
                } else {
                    baseEntry.static1x = frames[0];
                    fallbackEntry.static1x = frames[0];
                }
            } else if (is2x) {
                baseEntry.anim2x = frames.slice();
                fallbackEntry.anim2x = frames.slice();
            } else {
                baseEntry.anim1x = frames.slice();
                fallbackEntry.anim1x = frames.slice();
            }

            const keys = selected.keys || getActiveKeyCount();
            let primaryCfg = maniaSkinConfigurations.get(keys);
            if (!primaryCfg) {
                primaryCfg = ensureManiaConfigForKeys(keys);
                maniaSkinConfigurations.set(keys, primaryCfg);
            }
            if (!primaryCfg.ImageLookups) primaryCfg.ImageLookups = new Map();

            if (isPerTrack) {
                for (const alias of aliases) {
                    primaryCfg[alias] = base;
                    primaryCfg.ImageLookups.set(alias, base);
                    primaryCfg.ImageLookups.set(alias.toLowerCase(), base);
                }
            } else {
                for (const [, cfg] of maniaSkinConfigurations) {
                    if (!cfg.ImageLookups) cfg.ImageLookups = new Map();
                    for (const alias of aliases) {
                        cfg[alias] = base;
                        cfg.ImageLookups.set(alias, base);
                        cfg.ImageLookups.set(alias.toLowerCase(), base);
                    }
                }
                if (globalSkinImageLookups) {
                    for (const alias of aliases) {
                        globalSkinImageLookups.set(alias, base);
                        globalSkinImageLookups.set(alias.toLowerCase(), base);
                    }
                }
            }

            if (options.persist) {
                syncParamInputValue(p.key, base);
            }
            if (options.draw !== false) drawFrame();
            return base;
        }

        function refreshLivePreview(options = {}) {
            if (!state.selected || state.workingFrames.length === 0) return false;
            try {
                state.previewFrames = buildPreviewFrames();
                installFramesToStores(state.previewFrames, state.selected, {
                    persist: false,
                    draw: options.draw !== false
                });
                updateMeta();
                return true;
            } catch (err) {
                if (options.showError) showToast('预览参数无效', err.message || '请检查裁剪与扩边数值');
                return false;
            }
        }

        function scheduleLivePreview() {
            if (state.livePreviewTimer) clearTimeout(state.livePreviewTimer);
            state.livePreviewTimer = setTimeout(() => {
                state.livePreviewTimer = null;
                refreshLivePreview();
            }, 120);
        }

        function canvasToBlob(canvas) {
            return new Promise((resolve, reject) => {
                canvas.toBlob((blob) => {
                    if (blob) resolve(blob);
                    else reject(new Error('无法生成 PNG 数据'));
                }, 'image/png');
            });
        }

        async function loadImageFromBlob(blob) {
            const url = URL.createObjectURL(blob);
            try {
                return await new Promise((resolve, reject) => {
                    const img = new Image();
                    img.onload = () => resolve(img);
                    img.onerror = () => reject(new Error('无法读取编辑后的贴图'));
                    img.src = url;
                });
            } finally {
                setTimeout(() => URL.revokeObjectURL(url), 1000);
            }
        }

        async function serializeFrames(baseName, sourceFrames = null) {
            const serialized = [];
            const frames = (sourceFrames && sourceFrames.length > 0)
                ? sourceFrames
                : (state.previewFrames.length > 0 ? state.previewFrames : state.workingFrames);
            for (let i = 0; i < frames.length; i++) {
                const canvas = frames[i];
                const blob = await canvasToBlob(canvas);
                const arrayBuffer = await blob.arrayBuffer();
                const img = await loadImageFromBlob(blob);
                img._is2x = !!canvas._is2x;
                img._keyImageHeightOffset1x = Number(canvas._keyImageHeightOffset1x) || 0;
                img._keyImageHeightPadding1x = Number(canvas._keyImageHeightPadding1x) || 0;
                const plainName = String(baseName || 'texture').split('/').pop();
                const fileName = frames.length > 1 ? `${plainName}-${i}.png` : `${plainName}.png`;
                serialized.push({
                    file: new File([blob], fileName, { type: 'image/png' }),
                    arrayBuffer,
                    img,
                    blob
                });
            }
            return serialized;
        }

        async function serializeLongBodyFrame(canvas) {
            const blob = typeof canvas.convertToBlob === 'function'
                ? await canvas.convertToBlob({ type: 'image/png' })
                : await canvasToBlob(canvas);
            const arrayBuffer = await blob.arrayBuffer();
            const img = await loadImageFromBlob(blob);
            img._is2x = !!canvas._is2x;
            img._keyImageHeightOffset1x = Number(canvas._keyImageHeightOffset1x) || 0;
            img._keyImageHeightPadding1x = Number(canvas._keyImageHeightPadding1x) || 0;
            return {
                file: new File([blob], 'longbody-body.png', { type: 'image/png' }),
                arrayBuffer,
                img,
                blob
            };
        }

        function persistEditedSequence(serialized, selected) {
            const p = selected.p;
            const is2x = !!(serialized[0] && serialized[0].img._is2x);
            const currentSuffix = is2x ? '@2x.png' : '.png';
            const oppositeSuffix = is2x ? '.png' : '@2x.png';
            const base = stripTextureName(selected.base) || 'texture';
            const imageFrames = serialized.map((frame) => frame.img);
            installFramesToStores(imageFrames, selected, { persist: true, draw: false });

            serialized.forEach((frame, index) => {
                const frameKey = `${base}-${index}`;
                userReplacedTextures.set(`${frameKey}${currentSuffix}`, frame.arrayBuffer);
                userReplacedTextures.delete(`${frameKey}${oppositeSuffix}`);
            });

            for (let i = serialized.length; i < 64; i++) {
                const frameKey = `${base}-${i}`;
                skinImageStore.delete(frameKey);
                skinFallbackImageStore.delete(frameKey);
                userReplacedTextures.delete(`${frameKey}.png`);
                userReplacedTextures.delete(`${frameKey}@2x.png`);
                if (currentSkinZip) {
                    currentSkinZip.remove(`${frameKey}.png`);
                    currentSkinZip.remove(`${frameKey}@2x.png`);
                }
            }

            showToast('贴图编辑成功', `已更新 ${p.zhName}，共 ${serialized.length} 帧`);
            drawFrame();
            renderSkinEditorParams();
        }

        function createBlankTextureFrame() {
            const frame = document.createElement('canvas');
            frame.width = 1;
            frame.height = 1;
            frame._is2x = false;
            frame._isRootLevel = true;
            frame._isTransparent1x1 = true;
            frame._isBlankPlaceholder = true;
            return frame;
        }

        async function setCurrentTextureBlank() {
            const blankTab = getActiveTab();
            if (!state.selected || !blankTab || blankTab.kind !== 'texture') return false;
            if (!textureUploadUi || typeof textureUploadUi.applyEditedTexture !== 'function') {
                showToast('无法设为空白', '贴图替换模块尚未初始化');
                return false;
            }

            const blankBtn = byId('textureImageBlankBtn');
            if (blankBtn) {
                blankBtn.disabled = true;
                blankBtn.textContent = '正在设为空白...';
            }

            try {
                commitActiveTabState();
                if (state.longBodyComposer.active) {
                    const sessionKey = getLongBodySessionKey();
                    if (sessionKey) longBodyComposerSessions.delete(sessionKey);
                    disableLongBodyComposer();
                }

                const serialized = await serializeFrames(
                    state.selected.base,
                    [createBlankTextureFrame()]
                );
                const frame = serialized[0];
                frame.img._is2x = false;
                frame.img._isRootLevel = true;
                frame.img._isTransparent1x1 = true;
                frame.img._isBlankPlaceholder = true;

                const applied = await textureUploadUi.applyEditedTexture(
                    frame.file,
                    frame.arrayBuffer,
                    frame.img,
                    false,
                    state.selected.base,
                    state.selected.p.key,
                    state.selected.p.key,
                    state.selected.p._trackCol,
                    { notify: false }
                );
                if (!applied) throw new Error('贴图未能写入皮肤');

                state.originalFrames = [createBlankTextureFrame()];
                state.workingFrames = [createBlankTextureFrame()];
                state.previewFrames = [createBlankTextureFrame()];
                state.contentBoundsCache = null;
                state.previewBaseViewport = null;
                state.previewViewport = null;
                state.snapGuides = null;
                state.savedLongBodyComposer = null;
                resetTransformInputs();
                updateLongBodyComposerUI();
                updateMeta();
                completeSavedTab();
                showToast('已设为空白', '当前贴图已替换为 1×1 全透明 PNG。');
                return true;
            } catch (err) {
                console.error('设为空白失败', err);
                showToast('设为空白失败', err.message || '未知错误');
                return false;
            } finally {
                if (blankBtn) blankBtn.textContent = '设为空白';
                updateSelectionSummary();
                updateImageTransformControlAvailability();
            }
        }

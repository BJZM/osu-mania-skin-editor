// ============================================================================
// history.js - 皮肤快照、撤销、重做与初始状态复原
// 依赖：parser/skin-assets.js、ui/param-core.js
// ============================================================================

        // ===== 皮肤快照与复原系统 (Skin Snapshot & Restore System) =====
        function cloneSkinAssetEntry(entry) {
            if (!entry) return null;
            return {
                anim2x: Array.isArray(entry.anim2x) ? [...entry.anim2x] : [],
                anim1x: Array.isArray(entry.anim1x) ? [...entry.anim1x] : [],
                static2x: entry.static2x,
                static1x: entry.static1x
            };
        }

        function cloneSkinImageStore(store) {
            const cloned = new Map();
            if (!store) return cloned;
            for (const [key, entry] of store.entries()) {
                cloned.set(key, cloneSkinAssetEntry(entry));
            }
            return cloned;
        }

        function cloneManiaSkinConfig(cfg) {
            if (!cfg) return null;
            const cloned = { ...cfg };
            if (cfg.ImageLookups instanceof Map) {
                cloned.ImageLookups = new Map(cfg.ImageLookups);
            }
            if (cfg.FlipSettings instanceof Map) {
                cloned.FlipSettings = new Map(cfg.FlipSettings);
            }
            if (Array.isArray(cfg.ColumnLineWidth)) cloned.ColumnLineWidth = [...cfg.ColumnLineWidth];
            if (Array.isArray(cfg.ColumnSpacing)) cloned.ColumnSpacing = [...cfg.ColumnSpacing];
            if (Array.isArray(cfg.ColumnWidth)) cloned.ColumnWidth = [...cfg.ColumnWidth];
            if (Array.isArray(cfg.ExplosionWidth)) cloned.ExplosionWidth = [...cfg.ExplosionWidth];
            if (Array.isArray(cfg.HoldNoteLightWidth)) cloned.HoldNoteLightWidth = [...cfg.HoldNoteLightWidth];
            if (Array.isArray(cfg.NoteBodyStyles)) cloned.NoteBodyStyles = [...cfg.NoteBodyStyles];
            if (Array.isArray(cfg.ColumnColour)) cloned.ColumnColour = cfg.ColumnColour.map(c => (c ? { ...c } : c));
            if (Array.isArray(cfg.ColourLight)) cloned.ColourLight = cfg.ColourLight.map(c => (c ? { ...c } : c));
            if (cfg.CustomColours) {
                try {
                    cloned.CustomColours = JSON.parse(JSON.stringify(cfg.CustomColours));
                } catch (_) {
                    cloned.CustomColours = { ...cfg.CustomColours };
                }
            }
            if (cfg.ComboBreakColour) cloned.ComboBreakColour = { ...cfg.ComboBreakColour };
            if (cfg.ColourHold) cloned.ColourHold = { ...cfg.ColourHold };
            if (cfg.ColourBarline) cloned.ColourBarline = { ...cfg.ColourBarline };
            if (cfg.GlobalColourLight) cloned.GlobalColourLight = { ...cfg.GlobalColourLight };
            return cloned;
        }

        function copyNonTextureManiaProperties(sourceCfg, targetCfg) {
            if (!sourceCfg || !targetCfg) return;
            const nonTextureKeys = [
                'Keys', 'SkinVersion', 'WidthForNoteHeightScale',
                'ColumnLineWidth', 'ColumnSpacing', 'ColumnWidth',
                'ColumnStart', 'ColumnRight',
                'HitPosition', 'LightPosition', 'ScorePosition', 'ComboPosition',
                'BarLineHeight', 'ShowJudgementLine', 'JudgementLine',
                'KeysUnderNotes', 'LightFramePerSecond',
                'ExplosionWidth', 'HoldNoteLightWidth',
                'ColumnColour', 'ColourLight', 'GlobalColourLight',
                'ColourHold', 'ColourBarline', 'ComboBreakColour', 'CustomColours',
                'FlipSettings', 'FontCombo', 'ComboOverlap', 'FontScore', 'ScoreOverlap',
                'UpsideDown', 'SplitStages', 'StageSeparation',
                'SpecialStyle',
                '_isDefaultFallback'
            ];
            if (typeof SKIN_INI_PARAM_SCHEMA_MANIA !== 'undefined' && Array.isArray(SKIN_INI_PARAM_SCHEMA_MANIA)) {
                for (const p of SKIN_INI_PARAM_SCHEMA_MANIA) {
                    if (p && p.key && !nonTextureKeys.includes(p.key)) {
                        nonTextureKeys.push(p.key);
                    }
                }
            }
            for (const key of nonTextureKeys) {
                if (key in sourceCfg) {
                    const val = sourceCfg[key];
                    if (Array.isArray(val)) {
                        targetCfg[key] = val.map(item => (item && typeof item === 'object') ? { ...item } : item);
                    } else if (val instanceof Map) {
                        targetCfg[key] = new Map(val);
                    } else if (val && typeof val === 'object') {
                        try {
                            targetCfg[key] = JSON.parse(JSON.stringify(val));
                        } catch (_) {
                            targetCfg[key] = { ...val };
                        }
                    } else {
                        targetCfg[key] = val;
                    }
                }
            }
        }

        function cloneManiaSkinConfigs(map) {
            const newMap = new Map();
            if (!map) return newMap;
            for (const [k, v] of map.entries()) {
                newMap.set(k, cloneManiaSkinConfig(v));
            }
            return newMap;
        }

        const undoStack = [];
        const redoStack = [];
        const MAX_UNDO_STACK = 40;
        let isPerformingUndoRedo = false;
        let continuousActionActive = false;
        let continuousActionTimer = null;

        function updateUndoButtonState() {
            const redoBtn = document.getElementById('canvasRedoBtn');
            const undoBtn = document.getElementById('canvasUndoBtn');
            const modalUndoBtn = document.getElementById('modalUndoBtn');
            const count = undoStack.length;
            const redoCount = redoStack.length;
            const redoTitle = redoCount > 0
                ? `重做: ${redoStack[redoStack.length - 1].desc || '已撤回的操作'} (Ctrl+Y / Ctrl+Shift+Z)`
                : '暂无可重做的操作 (Ctrl+Y / Ctrl+Shift+Z)';
            const title = count > 0 ? `撤回: ${undoStack[undoStack.length - 1].desc || '上一步操作'} (Ctrl+Z)` : '暂无可撤回操作 (Ctrl+Z)';

            if (redoBtn) {
                redoBtn.disabled = (redoCount === 0);
                redoBtn.style.opacity = (redoCount === 0) ? '0.45' : '1';
                redoBtn.style.cursor = (redoCount === 0) ? 'not-allowed' : 'pointer';
                redoBtn.title = redoTitle;
            }
            if (undoBtn) {
                undoBtn.disabled = (count === 0);
                undoBtn.style.opacity = (count === 0) ? '0.45' : '1';
                undoBtn.style.cursor = (count === 0) ? 'not-allowed' : 'pointer';
                undoBtn.title = title;
            }
            if (modalUndoBtn) {
                modalUndoBtn.disabled = (count === 0);
                modalUndoBtn.style.opacity = (count === 0) ? '0.45' : '1';
                modalUndoBtn.style.cursor = (count === 0) ? 'not-allowed' : 'pointer';
                modalUndoBtn.title = title;
            }
            const textureEditorModal = document.getElementById('textureImageEditorModal');
            if (textureEditorModal && textureEditorModal.classList.contains('active') &&
                typeof updateEditorHistoryButtons === 'function') {
                updateEditorHistoryButtons();
            }
        }

        function createSkinSnapshot(desc = '操作') {
            return {
                desc,
                timestamp: Date.now(),
                maniaSkinConfigurations: cloneManiaSkinConfigs(maniaSkinConfigurations),
                currentSkinMetadata: JSON.parse(JSON.stringify(currentSkinMetadata)),
                skinFontsConfig: { ...skinFontsConfig },
                globalSkinImageLookups: new Map(globalSkinImageLookups),
                skinImageStore: cloneSkinImageStore(skinImageStore),
                skinFallbackImageStore: cloneSkinImageStore(skinFallbackImageStore),
                userReplacedTextures: new Map(userReplacedTextures),
                deletedSkinTexturePaths: new Set(deletedSkinTexturePaths),
                createdSkinTextureParams: new Map(Array.from(createdSkinTextureParams.entries(), ([k, v]) => [k, { ...v }])),
                textureEditRecipes: (typeof textureEditRecipes !== 'undefined' && textureEditRecipes instanceof Map)
                    ? new Map(Array.from(textureEditRecipes.entries(), ([k, v]) => [k, {
                        sourceFrames: (v.sourceFrames || []).map((f) => cloneFrame(f)),
                        originalReference: v.originalReference,
                        keyImageOriginalSources: typeof cloneKeyImageEditSources === 'function'
                            ? cloneKeyImageEditSources(v.keyImageOriginalSources)
                            : {},
                        params: v.params ? {
                            ...v.params,
                            imageTransform: typeof cloneImageTransform === 'function'
                                ? cloneImageTransform(v.params.imageTransform)
                                : (v.params.imageTransform ? { ...v.params.imageTransform } : null),
                            rgbAdjustment: typeof cloneRgbAdjustment === 'function'
                                ? cloneRgbAdjustment(v.params.rgbAdjustment)
                                : (v.params.rgbAdjustment ? { ...v.params.rgbAdjustment } : null)
                        } : null,
                        outputFrames: (v.outputFrames || []).map((f) => cloneFrame(f))
                    }]))
                    : null,
                activeEditorKeyCount: activeEditorKeyCount
            };
        }

        function recordSkinUndoBeforeChange(desc = '修改参数', options = {}) {
            if (isPerformingUndoRedo) return;
            if (typeof invalidateKeyImageHeightPersistence === 'function') {
                invalidateKeyImageHeightPersistence();
            }
            if (options.force || !continuousActionActive) {
                const snap = createSkinSnapshot(desc);
                undoStack.push(snap);
                if (undoStack.length > MAX_UNDO_STACK) undoStack.shift();
                redoStack.length = 0;
                continuousActionActive = true;
                updateUndoButtonState();
            }
            syncTextureEditorNonTextureSettings();
            if (continuousActionTimer) clearTimeout(continuousActionTimer);
            continuousActionTimer = setTimeout(() => {
                continuousActionActive = false;
            }, 600);
        }

        function syncTextureEditorNonTextureSettings() {
            const modal = document.getElementById('textureImageEditorModal');
            if (!modal || (!modal.classList.contains('active') && modal.style.display === 'none')) {
                return;
            }
            if (typeof syncTextureEditorSnapshotsWithCurrentManiaConfigs === 'function') {
                syncTextureEditorSnapshotsWithCurrentManiaConfigs();
            }
        }

        function applySkinSnapshot(snap, options = {}) {
            if (!snap) return;
            if (typeof invalidateKeyImageHeightPersistence === 'function') {
                invalidateKeyImageHeightPersistence();
            }
            const preserveNonTexture = !!options.preserveNonTextureSettings;
            const currentNonTextureConfigs = preserveNonTexture
                ? cloneManiaSkinConfigs(maniaSkinConfigurations)
                : null;
            isPerformingUndoRedo = true;
            try {
                // 1. 还原 userReplacedTextures
                userReplacedTextures.clear();
                if (snap.userReplacedTextures) {
                    for (const [k, v] of snap.userReplacedTextures.entries()) {
                        userReplacedTextures.set(k, v);
                    }
                }
                deletedSkinTexturePaths.clear();
                if (snap.deletedSkinTexturePaths) {
                    for (const name of snap.deletedSkinTexturePaths) {
                        deletedSkinTexturePaths.add(name);
                    }
                }
                createdSkinTextureParams.clear();
                if (snap.createdSkinTextureParams) {
                    for (const [k, v] of snap.createdSkinTextureParams.entries()) {
                        createdSkinTextureParams.set(k, { ...v });
                    }
                }
                if (typeof textureEditRecipes !== 'undefined' && textureEditRecipes instanceof Map) {
                    textureEditRecipes.clear();
                    if (snap.textureEditRecipes) {
                        for (const [k, v] of snap.textureEditRecipes.entries()) {
                            textureEditRecipes.set(k, {
                                sourceFrames: (v.sourceFrames || []).map((f) => cloneFrame(f)),
                                originalReference: v.originalReference,
                                keyImageOriginalSources: typeof cloneKeyImageEditSources === 'function'
                                    ? cloneKeyImageEditSources(v.keyImageOriginalSources)
                                    : {},
                                params: v.params ? {
                                    ...v.params,
                                    imageTransform: typeof cloneImageTransform === 'function'
                                        ? cloneImageTransform(v.params.imageTransform)
                                        : (v.params.imageTransform ? { ...v.params.imageTransform } : null),
                                    rgbAdjustment: typeof cloneRgbAdjustment === 'function'
                                        ? cloneRgbAdjustment(v.params.rgbAdjustment)
                                        : (v.params.rgbAdjustment ? { ...v.params.rgbAdjustment } : null)
                                } : null,
                                outputFrames: (v.outputFrames || []).map((f) => cloneFrame(f))
                            });
                        }
                    }
                }

                // 2. 还原 maniaSkinConfigurations
                maniaSkinConfigurations.clear();
                if (snap.maniaSkinConfigurations) {
                    for (const [k, v] of snap.maniaSkinConfigurations.entries()) {
                        const cloned = cloneManiaSkinConfig(v);
                        if (preserveNonTexture && currentNonTextureConfigs && currentNonTextureConfigs.has(k)) {
                            copyNonTextureManiaProperties(currentNonTextureConfigs.get(k), cloned);
                        }
                        maniaSkinConfigurations.set(k, cloned);
                    }
                }
                if (preserveNonTexture && currentNonTextureConfigs) {
                    for (const [k, v] of currentNonTextureConfigs.entries()) {
                        if (!maniaSkinConfigurations.has(k)) {
                            maniaSkinConfigurations.set(k, cloneManiaSkinConfig(v));
                        }
                    }
                }

                // 3. 还原 currentSkinMetadata & skinFontsConfig & globalSkinImageLookups
                if (!preserveNonTexture) {
                    if (snap.currentSkinMetadata) {
                        currentSkinMetadata = JSON.parse(JSON.stringify(snap.currentSkinMetadata));
                    }
                    if (snap.skinFontsConfig) {
                        skinFontsConfig = { ...snap.skinFontsConfig };
                    }
                }
                globalSkinImageLookups.clear();
                if (snap.globalSkinImageLookups) {
                    for (const [k, v] of snap.globalSkinImageLookups.entries()) {
                        globalSkinImageLookups.set(k, v);
                    }
                }

                // 4. 还原 skinImageStore 与 skinFallbackImageStore
                skinImageStore.clear();
                if (snap.skinImageStore) {
                    for (const [k, v] of snap.skinImageStore.entries()) {
                        skinImageStore.set(k, cloneSkinAssetEntry(v));
                    }
                }
                skinFallbackImageStore.clear();
                if (snap.skinFallbackImageStore) {
                    for (const [k, v] of snap.skinFallbackImageStore.entries()) {
                        skinFallbackImageStore.set(k, cloneSkinAssetEntry(v));
                    }
                }
                if (typeof refreshSkinCursor === 'function') refreshSkinCursor();

                // 5. 还原活动键位
                if (!preserveNonTexture && snap.activeEditorKeyCount) {
                    activeEditorKeyCount = snap.activeEditorKeyCount;
                }

                // 6. 重新渲染参数编辑器界面与 ini 预览
                updateSkinEditorKeyPills();
                renderSkinEditorParams();
                const rawTextarea = document.getElementById('rawIniTextarea');
                if (rawTextarea) {
                    rawTextarea.value = generateSkinIniText();
                }

                // 7. 重新同步音符状态与重绘游戏画面
                if (currentBeatmap) {
                    const currentTimeMs = (audio && !isNaN(audio.currentTime)) ? audio.currentTime * 1000 : 0;
                    syncNotesStateWithTime(currentTimeMs);
                }
                drawFrame();
                if (typeof textureLibraryUi !== 'undefined' && textureLibraryUi) {
                    textureLibraryUi.refresh();
                }
                updateSkinInfoDisplay();
                if (selectedCanvasElement) {
                    const liveElem = canvasInteractiveElements.find(e => {
                        if (selectedCanvasElement.noteInstanceKey && e.noteInstanceKey) {
                            return e.noteInstanceKey === selectedCanvasElement.noteInstanceKey;
                        }
                        return e.id === selectedCanvasElement.id;
                    }) || selectedCanvasElement;
                    syncCanvasSelectedCard(liveElem);
                }
            } catch (err) {
                console.error('[Undo/Redo] 还原皮肤快照失败:', err);
            } finally {
                isPerformingUndoRedo = false;
                updateUndoButtonState();
            }
        }

        function syncTextureEditorBaseAfterSkinHistory() {
            const modal = document.getElementById('textureImageEditorModal');
            if (!modal || (!modal.classList.contains('active') && modal.style.display === 'none')) {
                return;
            }
            if (typeof updateEditorBaseAfterSave === 'function') {
                updateEditorBaseAfterSave();
            }
        }

        function performSkinUndo() {
            if (continuousActionTimer) {
                clearTimeout(continuousActionTimer);
                continuousActionActive = false;
            }
            if (undoStack.length === 0) {
                showToast('提示', '没有可撤回的操作');
                return;
            }
            const currentState = createSkinSnapshot('当前状态');
            redoStack.push(currentState);
            if (redoStack.length > MAX_UNDO_STACK) redoStack.shift();

            const previousState = undoStack.pop();
            applySkinSnapshot(previousState);
            syncTextureEditorBaseAfterSkinHistory();
            showToast('已撤回 (Ctrl+Z)', previousState.desc ? `已撤回: ${previousState.desc}` : '已恢复上一状态');
        }

        function performSkinRedo() {
            if (continuousActionTimer) {
                clearTimeout(continuousActionTimer);
                continuousActionActive = false;
            }
            if (redoStack.length === 0) {
                showToast('提示', '没有可重做的操作');
                return;
            }
            const currentState = createSkinSnapshot('当前状态');
            undoStack.push(currentState);
            if (undoStack.length > MAX_UNDO_STACK) undoStack.shift();

            const nextState = redoStack.pop();
            applySkinSnapshot(nextState);
            syncTextureEditorBaseAfterSkinHistory();
            showToast('已重做 (Ctrl+Y)', nextState.desc ? `已重做: ${nextState.desc}` : '已恢复操作');
        }

        function saveInitialSkinSnapshot() {
            try {
                initialSkinSnapshot = {
                    maniaSkinConfigurations: cloneManiaSkinConfigs(maniaSkinConfigurations),
                    currentSkinMetadata: JSON.parse(JSON.stringify(currentSkinMetadata)),
                    skinFontsConfig: { ...skinFontsConfig },
                    globalSkinImageLookups: new Map(globalSkinImageLookups),
                    skinImageStore: cloneSkinImageStore(skinImageStore),
                    skinFallbackImageStore: cloneSkinImageStore(skinFallbackImageStore),
                    deletedSkinTexturePaths: new Set(deletedSkinTexturePaths)
                };
                undoStack.length = 0;
                redoStack.length = 0;
                continuousActionActive = false;
                updateUndoButtonState();
            } catch (err) {
                console.error('[Snapshot] 保存皮肤初始快照失败:', err);
            }
        }

        function revertSkinToInitial() {
            if (!initialSkinSnapshot) {
                showToast('提示', '暂无已保存的初始皮肤快照');
                return;
            }

            if (!confirm('确定要将所有参数和贴图复原为皮肤导入时的初始状态吗？未导出的修改将被丢弃。')) {
                return;
            }

            recordSkinUndoBeforeChange('复原初始皮肤');
            continuousActionActive = false;

            // 清理画布选中与交互状态
            selectedCanvasElement = null;
            const card = document.getElementById('canvasSelectedCard');
            if (card) card.style.display = 'none';

            applySkinSnapshot(initialSkinSnapshot);
            syncTextureEditorBaseAfterSkinHistory();
            showToast('已复原', '所有参数与贴图已恢复为导入时的初始状态 (可按 Ctrl+Z 撤回)');
        }

        async function startFromDefaultSkin(options = {}) {
            const skipConfirm = options && options.skipConfirm === true;
            if (!skipConfirm && !confirm('确定要清空当前皮肤，并从 osu!stable 默认皮肤重新开始吗？未导出的修改将被丢弃。')) {
                return false;
            }

            if (isPlaying) {
                pauseAudioAndBeatmap();
            }

            const keyCount = getActiveKeyCount();
            currentSkinZip = null;
            currentSkinFileName = '默认皮肤';
            deactivateEditableDefaultSkinWorkspace();

            userReplacedTextures.clear();
            deletedSkinTexturePaths.clear();
            createdSkinTextureParams.clear();
            scorePercentSourceImages.clear();
            for (const url of activeSkinBlobUrls) {
                try { URL.revokeObjectURL(url); } catch (_) {}
            }
            activeSkinBlobUrls = [];

            skinImageStore.clear();
            skinFallbackImageStore.clear();
            maniaSkinConfigurations.clear();
            globalSkinImageLookups.clear();
            if (typeof keyImageHeightBaselineState !== 'undefined') {
                keyImageHeightBaselineState.clear();
            }

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
            currentSkinMetadata = createEditableDefaultSkinMetadata();

            if (ui.osk) ui.osk.value = '';
            await loadDefaultSkin();
            activateEditableDefaultSkinWorkspace(keyCount);

            selectedCanvasElement = null;
            const card = document.getElementById('canvasSelectedCard');
            if (card) card.style.display = 'none';

            updateSkinInfoDisplay();
            updateSkinEditorKeyPills();
            renderSkinEditorParams();
            if (typeof refreshSkinEditorAfterSkinImport === 'function') {
                refreshSkinEditorAfterSkinImport();
            }
            if (typeof refreshSkinCursor === 'function') refreshSkinCursor();
            if (currentBeatmap) {
                const currentTimeMs = (audio && !isNaN(audio.currentTime)) ? audio.currentTime * 1000 : 0;
                syncNotesStateWithTime(currentTimeMs);
            }
            drawFrame();
            saveInitialSkinSnapshot();
            if (typeof markStartupSkinReady === 'function') {
                markStartupSkinReady('默认皮肤');
            }
            showToast('已切换到默认皮肤', '当前工作区已重置为 osu!stable 默认皮肤');
            return true;
        }
